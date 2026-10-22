/**
 * Some embedded players report their position only about once a second. This clock keeps the last
 * report and extrapolates from it while the video plays, so drift can be judged at finer resolution.
 */
export class PositionClock {
  private base = 0;
  private reportedAt = 0;
  private playing = false;
  private rate = 1;

  /** A fresh position report from the player. */
  report(seconds: number): void {
    this.base = seconds;
    this.reportedAt = Date.now();
  }

  /** A position we set ourselves (seek). */
  jump(seconds: number): void {
    this.report(seconds);
  }

  setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.base = this.now();
    this.reportedAt = Date.now();
    this.playing = playing;
  }

  setRate(rate: number): void {
    this.base = this.now();
    this.reportedAt = Date.now();
    this.rate = rate;
  }

  now(): number {
    if (!this.playing) return this.base;
    return this.base + ((Date.now() - this.reportedAt) / 1000) * this.rate;
  }
}
