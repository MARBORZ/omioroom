/**
 * In-memory sliding window rate limiter.
 * Protects against brute-force guessing of 6-digit Global Room IDs.
 */
export class RateLimiter {
  private attempts = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number = 60_000,
    private readonly maxAttempts: number = 15
  ) {}

  /**
   * Checks if an identifier is rate-limited.
   * If not limited, registers the attempt.
   * @returns true if allowed, false if rate limit exceeded.
   */
  checkAndRecord(key: string): boolean {
    const now = Date.now();
    const timestamps = this.attempts.get(key) || [];

    // Filter out timestamps outside the sliding window
    const validTimestamps = timestamps.filter((t) => now - t < this.windowMs);

    if (validTimestamps.length >= this.maxAttempts) {
      this.attempts.set(key, validTimestamps);
      return false;
    }

    validTimestamps.push(now);
    this.attempts.set(key, validTimestamps);
    return true;
  }

  /**
   * Resets rate limit for a key (e.g. after a successful action).
   */
  reset(key: string): void {
    this.attempts.delete(key);
  }
}
