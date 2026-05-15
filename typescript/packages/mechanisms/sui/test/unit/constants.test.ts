import { describe, expect, it } from "vitest";
import {
  SUI_ADDRESS_REGEX,
  SUI_COIN_TYPE,
  SUI_MAINNET_CAIP2,
  SUI_TESTNET_CAIP2,
  SUI_TYPE_TAG_REGEX,
  USDC_MAINNET_COIN_TYPE,
  USDC_TESTNET_COIN_TYPE,
  getSuiRpcUrl,
  isSupportedSuiNetwork,
} from "../../src/constants";

describe("constants", () => {
  describe("network identifiers", () => {
    it("uses the sui:mainnet and sui:testnet CAIP-2 forms", () => {
      expect(SUI_MAINNET_CAIP2).toBe("sui:mainnet");
      expect(SUI_TESTNET_CAIP2).toBe("sui:testnet");
    });

    it("treats mainnet and testnet as supported", () => {
      expect(isSupportedSuiNetwork(SUI_MAINNET_CAIP2)).toBe(true);
      expect(isSupportedSuiNetwork(SUI_TESTNET_CAIP2)).toBe(true);
    });

    it("rejects other networks", () => {
      expect(isSupportedSuiNetwork("eip155:1")).toBe(false);
      expect(isSupportedSuiNetwork("aptos:1")).toBe(false);
      expect(isSupportedSuiNetwork("sui:devnet")).toBe(false);
      expect(isSupportedSuiNetwork("")).toBe(false);
    });

    it("returns default fullnode URLs for supported networks", () => {
      expect(getSuiRpcUrl(SUI_MAINNET_CAIP2)).toMatch(/mainnet\.sui\.io/);
      expect(getSuiRpcUrl(SUI_TESTNET_CAIP2)).toMatch(/testnet\.sui\.io/);
    });

    it("throws for unsupported networks", () => {
      expect(() => getSuiRpcUrl("sui:devnet")).toThrow(/Unsupported Sui network/);
    });
  });

  describe("SUI_ADDRESS_REGEX", () => {
    it("accepts a 32-byte hex address with 0x prefix", () => {
      expect(SUI_ADDRESS_REGEX.test("0x" + "a".repeat(64))).toBe(true);
      expect(SUI_ADDRESS_REGEX.test("0x" + "0".repeat(64))).toBe(true);
    });

    it("rejects malformed addresses", () => {
      expect(SUI_ADDRESS_REGEX.test("0x" + "a".repeat(63))).toBe(false);
      expect(SUI_ADDRESS_REGEX.test("0x" + "g".repeat(64))).toBe(false);
      expect(SUI_ADDRESS_REGEX.test("a".repeat(64))).toBe(false);
      expect(SUI_ADDRESS_REGEX.test("")).toBe(false);
    });
  });

  describe("SUI_TYPE_TAG_REGEX", () => {
    it("accepts plain and generic type tags", () => {
      expect(SUI_TYPE_TAG_REGEX.test(SUI_COIN_TYPE)).toBe(true);
      expect(SUI_TYPE_TAG_REGEX.test(USDC_MAINNET_COIN_TYPE)).toBe(true);
      expect(SUI_TYPE_TAG_REGEX.test(USDC_TESTNET_COIN_TYPE)).toBe(true);
      expect(SUI_TYPE_TAG_REGEX.test("0x2::coin::Coin<0x2::sui::SUI>")).toBe(true);
    });

    it("rejects clearly malformed type tags", () => {
      expect(SUI_TYPE_TAG_REGEX.test("not_a_type")).toBe(false);
      expect(SUI_TYPE_TAG_REGEX.test("0x2::sui")).toBe(false);
      expect(SUI_TYPE_TAG_REGEX.test("::coin::Coin")).toBe(false);
    });
  });
});
