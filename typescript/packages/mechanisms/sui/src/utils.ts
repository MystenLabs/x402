import { SuiClient } from "@mysten/sui/client";
import { fromB64, toB64 } from "@mysten/sui/utils";
import { getSuiRpcUrl } from "./constants";

/**
 * Create a Sui RPC client for the given network.
 *
 * @param network - CAIP-2 network identifier (e.g. `sui:mainnet`).
 * @param rpcUrl - Optional custom RPC URL; falls back to the default for the network.
 * @returns A SuiClient instance.
 */
export function createSuiClient(network: string, rpcUrl?: string): SuiClient {
  return new SuiClient({ url: rpcUrl ?? getSuiRpcUrl(network) });
}

/**
 * Decode a base64 string into raw bytes.
 *
 * @param value - The base64 encoded value.
 * @returns The decoded bytes.
 */
export function decodeBase64(value: string): Uint8Array {
  return fromB64(value);
}

/**
 * Encode raw bytes as base64.
 *
 * @param bytes - The raw bytes to encode.
 * @returns The base64 encoded string.
 */
export function encodeBase64(bytes: Uint8Array): string {
  return toB64(bytes);
}
