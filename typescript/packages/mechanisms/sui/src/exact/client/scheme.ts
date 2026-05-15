import { Transaction } from "@mysten/sui/transactions";
import type { PaymentPayload, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import {
  SUI_ADDRESS_REGEX,
  SUI_COIN_TYPE,
  SUI_TYPE_TAG_REGEX,
  isSupportedSuiNetwork,
} from "../../constants";
import type { ClientSuiSigner, ClientSuiConfig } from "../../signer";
import type { ExactSuiPayload } from "../../types";
import { createSuiClient, encodeBase64 } from "../../utils";

/**
 * Sui client implementation for the `exact` payment scheme.
 *
 * Builds a Programmable Transaction Block that transfers exactly
 * `PaymentRequirements.amount` of `PaymentRequirements.asset` from the
 * configured signer to `PaymentRequirements.payTo`, then signs and returns
 * the payload defined in the
 * [exact Sui scheme spec](../../../../../../specs/schemes/exact/scheme_exact_sui.md).
 */
export class ExactSuiScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  /**
   * Create a new Sui client scheme instance.
   *
   * @param signer - A `@mysten/sui` Keypair used to sign the transaction.
   * @param config - Optional configuration with a custom RPC URL.
   */
  constructor(
    private readonly signer: ClientSuiSigner,
    private readonly config?: ClientSuiConfig,
  ) {}

  /**
   * Build, sign, and encode a Sui payment payload.
   *
   * @param x402Version - The x402 protocol version.
   * @param paymentRequirements - The payment requirements selected by the client.
   * @returns The encoded payment payload (transaction + signature).
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<Pick<PaymentPayload, "x402Version" | "payload">> {
    this.validateRequirements(paymentRequirements);

    const sender = this.signer.toSuiAddress();
    const amount = BigInt(paymentRequirements.amount);
    const recipient = paymentRequirements.payTo;
    const asset = paymentRequirements.asset ?? SUI_COIN_TYPE;
    const client = createSuiClient(paymentRequirements.network, this.config?.rpcUrl);

    const tx = new Transaction();
    tx.setSender(sender);

    const paymentCoin = await this.buildPaymentCoin(client, tx, sender, asset, amount);
    tx.transferObjects([paymentCoin], recipient);

    const transactionBytes = await tx.build({ client });
    const { signature } = await this.signer.signTransaction(transactionBytes);

    const payload: ExactSuiPayload = {
      transaction: encodeBase64(transactionBytes),
      signature,
    };

    return {
      x402Version,
      payload,
    };
  }

  /**
   * Validate that the supplied payment requirements are well-formed for Sui.
   *
   * @param requirements - The payment requirements to validate.
   */
  private validateRequirements(requirements: PaymentRequirements): void {
    if (!isSupportedSuiNetwork(requirements.network)) {
      throw new Error(`Unsupported Sui network: ${requirements.network}`);
    }
    if (!requirements.payTo) {
      throw new Error("Pay-to address is required");
    }
    if (!SUI_ADDRESS_REGEX.test(requirements.payTo)) {
      throw new Error(`Invalid Sui pay-to address: ${requirements.payTo}`);
    }
    if (!requirements.amount) {
      throw new Error("Amount is required");
    }
    if (!/^[0-9]+$/.test(requirements.amount)) {
      throw new Error("Amount must be a non-negative integer string");
    }
    if (requirements.amount === "0") {
      throw new Error("Amount must be greater than zero");
    }
    if (requirements.asset && !SUI_TYPE_TAG_REGEX.test(requirements.asset)) {
      throw new Error(`Invalid Sui asset type tag: ${requirements.asset}`);
    }
  }

  /**
   * Locate (and if necessary merge) sender-owned coins of the given type, then
   * split off a coin object holding exactly `amount` units to be transferred.
   *
   * For the native SUI coin type this uses the gas coin (`tx.gas`) as the
   * source; gas is automatically allocated from the same coin pool by the SDK.
   * For all other coin types we paginate `getCoins`, merge into a primary coin
   * when no single coin is large enough, and split from the primary coin.
   *
   * @param client - The SuiClient used to query owned coins.
   * @param tx - The transaction block being constructed.
   * @param sender - The sender's Sui address.
   * @param coinType - The fully qualified coin type tag.
   * @param amount - The amount to split, in atomic units.
   * @returns The transaction result reference for the split coin.
   */
  private async buildPaymentCoin(
    client: ReturnType<typeof createSuiClient>,
    tx: Transaction,
    sender: string,
    coinType: string,
    amount: bigint,
  ): ReturnType<Transaction["splitCoins"]> extends infer R ? Promise<R> : never {
    if (coinType === SUI_COIN_TYPE) {
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
      return coin as never;
    }

    const owned: { coinObjectId: string; balance: string }[] = [];
    let cursor: string | null | undefined = undefined;
    do {
      const page = await client.getCoins({ owner: sender, coinType, cursor });
      owned.push(...page.data.map(c => ({ coinObjectId: c.coinObjectId, balance: c.balance })));
      cursor = page.hasNextPage ? page.nextCursor : null;
    } while (cursor);

    if (owned.length === 0) {
      throw new Error(`No coins of type ${coinType} owned by ${sender}`);
    }

    const totalBalance = owned.reduce((acc, c) => acc + BigInt(c.balance), 0n);
    if (totalBalance < amount) {
      throw new Error(
        `Insufficient balance for ${coinType}: required ${amount}, have ${totalBalance}`,
      );
    }

    const sufficient = owned.find(c => BigInt(c.balance) >= amount);
    let primaryId: string;
    if (sufficient) {
      primaryId = sufficient.coinObjectId;
    } else {
      primaryId = owned[0].coinObjectId;
      const rest = owned.slice(1).map(c => tx.object(c.coinObjectId));
      tx.mergeCoins(tx.object(primaryId), rest);
    }

    const [coin] = tx.splitCoins(tx.object(primaryId), [tx.pure.u64(amount)]);
    return coin as never;
  }
}
