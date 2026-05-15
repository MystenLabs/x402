/**
 * Default time-to-live for cache entries, in milliseconds.
 *
 * Sui transactions become invalid after their expiration epoch / checkpoint,
 * but for x402 settlement we only need a short window long enough to catch
 * back-to-back duplicate `/settle` calls from a misbehaving or retrying
 * client. Two minutes is plenty.
 */
const DEFAULT_TTL_MS = 120_000;

/**
 * Short-lived in-memory cache that detects duplicate settlement attempts for
 * the same Sui transaction digest.
 *
 * This is the Sui analog of the cache used by the SVM mechanism to prevent a
 * malicious client from replaying a single signed transaction against the
 * facilitator to gain access to multiple resources. Sui transaction digests
 * are deterministic from the transaction bytes, so caching by digest is safe.
 *
 * The cache is intentionally process-local. Operators running multiple
 * facilitator replicas behind a load balancer should either (a) pin clients to
 * a replica or (b) swap this for a shared-store implementation.
 */
export class SettlementCache {
  private readonly entries = new Map<string, number>();

  /**
   * Create a new SettlementCache.
   *
   * @param ttlMs - Optional time-to-live override, in milliseconds.
   */
  constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {}

  /**
   * Check whether a digest is currently cached as in-flight or recently settled.
   *
   * @param digest - The Sui transaction digest.
   * @returns True if the digest has been recorded within the TTL window.
   */
  has(digest: string): boolean {
    this.evictExpired();
    return this.entries.has(digest);
  }

  /**
   * Record a digest as in-flight or recently settled.
   *
   * @param digest - The Sui transaction digest to record.
   */
  record(digest: string): void {
    this.entries.set(digest, Date.now());
  }

  /**
   * Remove all expired entries from the cache.
   */
  private evictExpired(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [digest, recordedAt] of this.entries) {
      if (recordedAt < cutoff) {
        this.entries.delete(digest);
      }
    }
  }
}
