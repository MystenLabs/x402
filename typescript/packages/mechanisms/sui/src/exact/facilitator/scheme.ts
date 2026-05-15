import { Transaction } from "@mysten/sui/transactions";
import { verifyTransactionSignature } from "@mysten/sui/verify";
import type {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { isSupportedSuiNetwork } from "../../constants";
import type { FacilitatorSuiSigner } from "../../signer";
import type { ExactSuiPayload } from "../../types";
import { createSuiClient, decodeBase64 } from "../../utils";
import { SettlementCache } from "./settlement-cache";

/**
 * Optional configuration for the Sui facilitator scheme.
 */
export type ExactSuiFacilitatorConfig = {
  /**
   * Whether the facilitator offers to sponsor gas for clients. When true the
   * `getExtra` method advertises a `gasStation` URL via the `extra` field of
   * `SupportedPaymentKinds`. Defaults to false; sponsorship requires an
   * out-of-band gas station endpoint and is not implemented in this reference
   * facilitator.
   */
  sponsorTransactions?: boolean;

  /**
   * URL of the gas station endpoint to advertise when sponsorship is enabled.
   */
  gasStationUrl?: string;

  /**
   * Optional replacement for the default in-memory settlement cache.
   */
  settlementCache?: SettlementCache;
};

/**
 * Sui facilitator implementation for the `exact` payment scheme.
 *
 * Implements verification and settlement per the
 * [exact Sui scheme spec](../../../../../../specs/schemes/exact/scheme_exact_sui.md):
 *
 * 1. Network and scheme agreement checks.
 * 2. Signature validation over the supplied transaction bytes.
 * 3. Dry-run simulation, with replay protection via digest lookup and a short
 *    in-memory `SettlementCache`.
 * 4. Verification that the `payTo` address sees a net balance change of
 *    `+amount` in the agreed asset.
 *
 * Settlement broadcasts the user-signed transaction (optionally co-signing as
 * sponsor) and waits for execution.
 */
export class ExactSuiScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "sui:*";

  private readonly settlementCache: SettlementCache;

  /**
   * Create a new ExactSuiScheme facilitator instance.
   *
   * @param signer - The Sui facilitator signer used for sponsorship and submission.
   * @param config - Optional configuration; see `ExactSuiFacilitatorConfig`.
   */
  constructor(
    private readonly signer: FacilitatorSuiSigner,
    private readonly config: ExactSuiFacilitatorConfig = {},
  ) {
    this.settlementCache = config.settlementCache ?? new SettlementCache();
  }

  /**
   * Get mechanism-specific extra data exposed on the `/supported` endpoint.
   *
   * @param _ - The network identifier (unused).
   * @returns The `extra` payload, or undefined when no extra data is needed.
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    if (this.config.sponsorTransactions && this.config.gasStationUrl) {
      return { gasStation: this.config.gasStationUrl };
    }
    return undefined;
  }

  /**
   * Get the addresses this facilitator manages.
   *
   * @param _ - The network identifier (unused).
   * @returns An array of facilitator addresses.
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()];
  }

  /**
   * Verify a Sui payment payload against the supplied requirements.
   *
   * @param payload - The payment payload to verify.
   * @param requirements - The payment requirements the client agreed to.
   * @returns A verification response.
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    try {
      const suiPayload = payload.payload as ExactSuiPayload;

      if (payload.x402Version !== 2) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_sui_payload_unsupported_version",
          payer: "",
        };
      }

      if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
        return { isValid: false, invalidReason: "unsupported_scheme", payer: "" };
      }

      if (payload.accepted.network !== requirements.network) {
        return { isValid: false, invalidReason: "network_mismatch", payer: "" };
      }

      if (!isSupportedSuiNetwork(requirements.network)) {
        return {
          isValid: false,
          invalidReason: `unsupported_sui_network: ${requirements.network}`,
          payer: "",
        };
      }

      if (!suiPayload?.transaction || !suiPayload?.signature) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_sui_payload_missing_fields",
          payer: "",
        };
      }

      const transactionBytes = decodeBase64(suiPayload.transaction);

      // Step 2: verify the signature over the transaction bytes. The Sui SDK
      // returns the recovered public key on success and throws on failure.
      let publicKey;
      try {
        publicKey = await verifyTransactionSignature(transactionBytes, suiPayload.signature);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isValid: false,
          invalidReason: `invalid_exact_sui_payload_bad_signature: ${msg}`,
          payer: "",
        };
      }
      const senderAddress = publicKey.toSuiAddress();

      // Cross-check the recovered signer matches the transaction sender.
      const tx = Transaction.from(transactionBytes);
      const txData = await tx.toJSON();
      // The serialized form exposes the sender on the top-level object.
      const txSender = (JSON.parse(txData) as { sender?: string }).sender;
      if (txSender && txSender !== senderAddress) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_sui_payload_sender_signature_mismatch",
          payer: senderAddress,
        };
      }

      const client = createSuiClient(requirements.network);

      // Step 3 (replay): ensure the digest has not already been settled and is
      // not already on-chain.
      const digest = await tx.getDigest({ client });
      if (this.settlementCache.has(digest)) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_sui_payload_duplicate_settlement",
          payer: senderAddress,
        };
      }
      try {
        const existing = await client.getTransactionBlock({ digest });
        if (existing) {
          return {
            isValid: false,
            invalidReason: "invalid_exact_sui_payload_already_executed",
            payer: senderAddress,
          };
        }
      } catch {
        // Expected for not-yet-broadcast transactions.
      }

      // Step 3 (simulation): dry-run the transaction and ensure it would succeed.
      const dryRun = await client.dryRunTransactionBlock({ transactionBlock: transactionBytes });
      if (dryRun.effects.status.status !== "success") {
        return {
          isValid: false,
          invalidReason: `invalid_exact_sui_payload_simulation_failed: ${dryRun.effects.status.error ?? "unknown"}`,
          payer: senderAddress,
        };
      }

      // Step 4: verify balance changes credit the resource server.
      const expectedAmount = BigInt(requirements.amount);
      const matchingCredit = dryRun.balanceChanges.find(change => {
        const ownerAddress =
          typeof change.owner === "object" && change.owner !== null && "AddressOwner" in change.owner
            ? (change.owner as { AddressOwner: string }).AddressOwner
            : undefined;
        return (
          ownerAddress === requirements.payTo &&
          change.coinType === requirements.asset &&
          BigInt(change.amount) === expectedAmount
        );
      });
      if (!matchingCredit) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_sui_payload_balance_change_mismatch",
          payer: senderAddress,
        };
      }

      return { isValid: true, invalidReason: undefined, payer: senderAddress };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isValid: false,
        invalidReason: `invalid_exact_sui_payload_verification_error: ${errorMessage}`,
        payer: "",
      };
    }
  }

  /**
   * Settle a previously-verified Sui payment.
   *
   * @param payload - The payment payload to settle.
   * @param requirements - The payment requirements that were verified.
   * @returns A settlement response indicating success or failure.
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const valid = await this.verify(payload, requirements);
    if (!valid.isValid) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: valid.invalidReason ?? "verification_failed",
        payer: valid.payer || "",
      };
    }

    try {
      const suiPayload = payload.payload as ExactSuiPayload;
      const transactionBytes = decodeBase64(suiPayload.transaction);

      const signatures: string[] = [suiPayload.signature];

      // If sponsorship was negotiated, co-sign as gas owner before broadcast.
      if (typeof requirements.extra?.gasStation === "string" && this.config.sponsorTransactions) {
        const sponsorSig = await this.signer.signAsSponsor(transactionBytes, requirements.network);
        signatures.push(sponsorSig);
      }

      const tx = Transaction.from(transactionBytes);
      const client = createSuiClient(requirements.network);
      const digest = await tx.getDigest({ client });

      // Record before broadcast so concurrent /settle calls short-circuit.
      this.settlementCache.record(digest);

      const response = await this.signer.submitTransaction(
        transactionBytes,
        signatures,
        requirements.network,
      );

      if (response.effects?.status.status !== "success") {
        return {
          success: false,
          network: payload.accepted.network,
          transaction: response.digest ?? "",
          errorReason: `transaction_failed: ${response.effects?.status.error ?? "unknown"}`,
          payer: valid.payer || "",
        };
      }

      return {
        success: true,
        transaction: response.digest,
        network: payload.accepted.network,
        payer: valid.payer || "",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errorReason: `transaction_failed: ${errorMessage}`,
        transaction: "",
        network: payload.accepted.network,
        payer: valid.payer || "",
      };
    }
  }
}
