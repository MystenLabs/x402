/**
 * CAIP-2 network identifier for Sui Mainnet.
 *
 * The Sui x402 spec uses the chain alias rather than the numeric chain id for
 * readability; see specs/schemes/exact/scheme_exact_sui.md.
 */
export const SUI_MAINNET_CAIP2 = "sui:mainnet";

/**
 * CAIP-2 network identifier for Sui Testnet.
 */
export const SUI_TESTNET_CAIP2 = "sui:testnet";

/**
 * Regex pattern for validating Sui addresses.
 * Sui addresses are 32 byte values represented as 64 hex characters with a 0x prefix.
 */
export const SUI_ADDRESS_REGEX = /^0x[a-fA-F0-9]{64}$/;

/**
 * Regex pattern for validating Sui Move type tags of the form
 * `<package>::<module>::<name>`, optionally followed by generic parameters in
 * angle brackets (e.g. `0x2::coin::Coin<0x2::sui::SUI>`).
 *
 * Used as a lightweight check for `PaymentRequirements.asset` values such as
 * `0xdba3...::usdc::USDC`.
 */
export const SUI_TYPE_TAG_REGEX = /^0x[a-fA-F0-9]+::[A-Za-z_][\w]*::[A-Za-z_][\w]*(?:<[^>]+>)?$/;

/**
 * Native SUI coin type, used when `PaymentRequirements.asset` is omitted or
 * explicitly set to SUI.
 */
export const SUI_COIN_TYPE = "0x2::sui::SUI";

/**
 * USDC coin type on Sui Mainnet.
 */
export const USDC_MAINNET_COIN_TYPE =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

/**
 * USDC coin type on Sui Testnet.
 */
export const USDC_TESTNET_COIN_TYPE =
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

/**
 * Default public RPC URLs per supported Sui network.
 */
const DEFAULT_RPC_URLS: Record<string, string> = {
  [SUI_MAINNET_CAIP2]: "https://fullnode.mainnet.sui.io:443",
  [SUI_TESTNET_CAIP2]: "https://fullnode.testnet.sui.io:443",
};

/**
 * Resolve the default public RPC URL for a supported Sui network.
 *
 * @param network - The CAIP-2 network identifier (e.g. `sui:mainnet`).
 * @returns The default RPC URL.
 */
export function getSuiRpcUrl(network: string): string {
  const url = DEFAULT_RPC_URLS[network];
  if (!url) {
    throw new Error(`Unsupported Sui network: ${network}`);
  }
  return url;
}

/**
 * Validate that a network identifier is a supported Sui network.
 *
 * @param network - The CAIP-2 network identifier to validate.
 * @returns True if the network is a supported Sui network.
 */
export function isSupportedSuiNetwork(network: string): boolean {
  return network === SUI_MAINNET_CAIP2 || network === SUI_TESTNET_CAIP2;
}
