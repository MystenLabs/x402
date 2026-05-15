import type {
  AssetAmount,
  Money,
  MoneyParser,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
} from "@x402/core/types";
import {
  SUI_TESTNET_CAIP2,
  SUI_TYPE_TAG_REGEX,
  USDC_MAINNET_COIN_TYPE,
  USDC_TESTNET_COIN_TYPE,
} from "../../constants";

/**
 * Sui server-side implementation for the `exact` payment scheme.
 *
 * The server scheme is responsible for converting a price (typically a USD
 * amount) into a concrete `AssetAmount` and for enhancing the payment
 * requirements with mechanism-specific extras returned by the facilitator
 * (e.g. a gas station URL).
 */
export class ExactSuiScheme implements SchemeNetworkServer {
  readonly scheme = "exact";

  private moneyParsers: MoneyParser[] = [];

  /**
   * Register a custom money parser in the parser chain.
   *
   * @param parser - The parser to register; return null to defer to the next parser.
   * @returns The scheme instance, to allow chaining.
   */
  registerMoneyParser(parser: MoneyParser): ExactSuiScheme {
    this.moneyParsers.push(parser);
    return this;
  }

  /**
   * Parse a `Price` into a concrete `AssetAmount` for this scheme/network.
   *
   * @param price - The price to parse; either a Money value or an explicit AssetAmount.
   * @param network - The CAIP-2 network identifier.
   * @returns The parsed AssetAmount.
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!price.asset) {
        throw new Error(`Asset type tag must be specified for AssetAmount on network ${network}`);
      }
      if (!SUI_TYPE_TAG_REGEX.test(price.asset)) {
        throw new Error(`Invalid Sui asset type tag: ${price.asset}`);
      }
      return { amount: price.amount, asset: price.asset, extra: price.extra || {} };
    }

    const amount = this.parseMoneyToDecimal(price as Money);

    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network);
      if (result !== null) {
        return result;
      }
    }

    return this.defaultMoneyConversion(amount, network);
  }

  /**
   * Enhance payment requirements with mechanism-specific extras.
   *
   * @param paymentRequirements - The base requirements assembled by the server.
   * @param supportedKind - The advertised support kind from the facilitator.
   * @param supportedKind.x402Version - The x402 protocol version.
   * @param supportedKind.scheme - The payment scheme identifier.
   * @param supportedKind.network - The CAIP-2 network identifier.
   * @param supportedKind.extra - Optional extra metadata (e.g. gasStation URL).
   * @param extensionKeys - The set of extensions enabled on the facilitator.
   * @returns The enhanced payment requirements.
   */
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    void extensionKeys;

    const extra: Record<string, unknown> = { ...paymentRequirements.extra };
    if (typeof supportedKind.extra?.gasStation === "string") {
      extra.gasStation = supportedKind.extra.gasStation;
    }

    return Promise.resolve({ ...paymentRequirements, extra });
  }

  /**
   * Parse a `Money` value into a plain decimal number.
   *
   * @param money - The money value (e.g. "$1.50" or 1.5).
   * @returns The decimal amount.
   */
  private parseMoneyToDecimal(money: string | number): number {
    if (typeof money === "number") {
      return money;
    }
    const cleanMoney = money.replace(/^\$/, "").trim();
    const amount = parseFloat(cleanMoney);
    if (isNaN(amount)) {
      throw new Error(`Invalid money format: ${money}`);
    }
    return amount;
  }

  /**
   * Default conversion that prices in USDC.
   *
   * @param amount - The decimal USD amount.
   * @param network - The target Sui CAIP-2 network.
   * @returns An AssetAmount denominated in USDC for the network.
   */
  private defaultMoneyConversion(amount: number, network: Network): AssetAmount {
    const decimals = 6;
    const tokenAmount = this.convertToTokenAmount(amount.toString(), decimals);
    const asset = network === SUI_TESTNET_CAIP2 ? USDC_TESTNET_COIN_TYPE : USDC_MAINNET_COIN_TYPE;
    return { amount: tokenAmount, asset, extra: {} };
  }

  /**
   * Convert a decimal amount string to a token amount string in atomic units.
   *
   * @param amount - The decimal amount string.
   * @param decimals - Number of decimals for the token.
   * @returns The amount in atomic units as a string.
   */
  private convertToTokenAmount(amount: string, decimals: number): string {
    const parts = amount.split(".");
    const wholePart = parts[0] || "0";
    const fractionalPart = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
    return BigInt(wholePart + fractionalPart).toString();
  }
}
