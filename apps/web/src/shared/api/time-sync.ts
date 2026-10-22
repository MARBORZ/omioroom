/**
 * Estimates the offset between this device's clock and the database clock, so the
 * expected playback position can be computed without trusting device clocks.
 */
export class TimeSyncClient {
  private offsetMs = 0;
  private hasSample = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly fetchServerTimeMs: () => Promise<number>) {}

  startSync(intervalMs = 15000) {
    this.stopSync();
    void this.sample();
    this.syncInterval = setInterval(() => void this.sample(), intervalMs);
  }

  stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private async sample() {
    const sentAt = Date.now();
    try {
      const serverMs = await this.fetchServerTimeMs();
      const receivedAt = Date.now();
      const roundTrip = receivedAt - sentAt;
      // Ignore samples with extreme network jitter
      if (roundTrip > 800) return;

      const offset = serverMs - (sentAt + receivedAt) / 2;
      this.offsetMs = this.hasSample ? this.offsetMs * 0.7 + offset * 0.3 : offset;
      this.hasSample = true;
    } catch {
      // Keep the previous estimate; the next tick retries
    }
  }

  getEstimatedServerNow(): number {
    return Date.now() + this.offsetMs;
  }

  getClockOffset(): number {
    return this.offsetMs;
  }
}
