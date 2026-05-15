import { describe, expect, it, vi } from "vitest";
import { SettlementCache } from "../../src/exact/facilitator/settlement-cache";

describe("SettlementCache", () => {
  it("returns false for digests it has not seen", () => {
    const cache = new SettlementCache();
    expect(cache.has("digest-a")).toBe(false);
  });

  it("returns true after a digest is recorded", () => {
    const cache = new SettlementCache();
    cache.record("digest-a");
    expect(cache.has("digest-a")).toBe(true);
  });

  it("only matches the specific digest that was recorded", () => {
    const cache = new SettlementCache();
    cache.record("digest-a");
    expect(cache.has("digest-b")).toBe(false);
  });

  it("evicts entries after the TTL elapses", () => {
    vi.useFakeTimers();
    try {
      const cache = new SettlementCache(1_000);
      cache.record("digest-a");
      expect(cache.has("digest-a")).toBe(true);
      vi.advanceTimersByTime(1_500);
      expect(cache.has("digest-a")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
