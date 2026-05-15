import type { Keypair } from "@mysten/sui/cryptography";
import type { SuiTransactionBlockResponse } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { createSuiClient } from "./utils";

/**
 * Client-side signer for creating and signing Sui transactions.
 *
 * Any `@mysten/sui` `Keypair` (Ed25519, Secp256k1, Secp256r1) is accepted.
 */
export type ClientSuiSigner = Keypair;

/**
 * Optional client configuration.
 */
export type ClientSuiConfig = {
  /** Optional custom RPC URL for the client to use. */
  rpcUrl?: string;
};

/**
 * Minimal facilitator-side signer interface for Sui operations.
 *
 * For non-sponsored payments the facilitator only needs to broadcast a
 * fully-signed transaction. Sponsorship is exposed through
 * `signAsSponsor` and reuses the same address set as `getAddresses`.
 */
export type FacilitatorSuiSigner = {
  /** Get all addresses this facilitator can use as gas sponsor. */
  getAddresses(): readonly string[];

  /**
   * Sign the given `TransactionData` bytes as the sponsor (gas owner).
   *
   * @param transactionBytes - The raw `TransactionData` BCS bytes that the
   *   user has already signed.
   * @param network - The CAIP-2 network identifier.
   * @returns The base64 encoded sponsor signature.
   */
  signAsSponsor(transactionBytes: Uint8Array, network: string): Promise<string>;

  /**
   * Submit a transaction with the provided signatures.
   *
   * @param transactionBytes - The raw `TransactionData` BCS bytes.
   * @param signatures - One or more base64 encoded signatures (user, and
   *   optionally sponsor).
   * @param network - The CAIP-2 network identifier.
   * @returns The Sui transaction block response.
   */
  submitTransaction(
    transactionBytes: Uint8Array,
    signatures: string[],
    network: string,
  ): Promise<SuiTransactionBlockResponse>;
};

/**
 * Create a `ClientSuiSigner` from a Sui-format private key string.
 *
 * Accepts either the canonical bech32 form (`suiprivkey...`) or a 32-byte
 * Ed25519 secret encoded as base64.
 *
 * @param privateKey - The encoded secret key.
 * @returns A keypair suitable for use as a `ClientSuiSigner`.
 */
export function createClientSigner(privateKey: string): ClientSuiSigner {
  if (privateKey.startsWith("suiprivkey")) {
    const { schema, secretKey } = decodeSuiPrivateKey(privateKey);
    if (schema !== "ED25519") {
      throw new Error(`Unsupported Sui key schema for client signer: ${schema}`);
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  // Fall back to interpreting the value as a base64 encoded 32 byte secret.
  const secret = Buffer.from(privateKey, "base64");
  if (secret.length !== 32) {
    throw new Error(
      "Sui Ed25519 secret key must be 32 bytes (base64 encoded) or a suiprivkey bech32 string",
    );
  }
  return Ed25519Keypair.fromSecretKey(new Uint8Array(secret));
}

/**
 * Build a `FacilitatorSuiSigner` backed by an in-memory keypair.
 *
 * This is the minimal reference implementation; production deployments would
 * typically swap this for a KMS or HSM backed signer.
 *
 * @param keypair - The sponsor keypair.
 * @param rpcConfig - Optional per-network RPC overrides.
 * @returns A `FacilitatorSuiSigner` instance.
 */
export function toFacilitatorSuiSigner(
  keypair: Keypair,
  rpcConfig?: { defaultRpcUrl?: string } | Record<string, string>,
): FacilitatorSuiSigner {
  const resolveRpcUrl = (network: string): string | undefined => {
    if (!rpcConfig) {
      return undefined;
    }
    if ("defaultRpcUrl" in rpcConfig && rpcConfig.defaultRpcUrl) {
      return rpcConfig.defaultRpcUrl;
    }
    return (rpcConfig as Record<string, string>)[network];
  };

  const address = keypair.toSuiAddress();

  return {
    getAddresses: () => [address],

    signAsSponsor: async (transactionBytes, _network) => {
      void _network;
      const { signature } = await keypair.signTransaction(transactionBytes);
      return signature;
    },

    submitTransaction: async (transactionBytes, signatures, network) => {
      const client = createSuiClient(network, resolveRpcUrl(network));
      return client.executeTransactionBlock({
        transactionBlock: transactionBytes,
        signature: signatures,
        options: {
          showEffects: true,
          showBalanceChanges: true,
        },
      });
    },
  };
}
