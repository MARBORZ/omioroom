export interface Clock {
  now(): number;
  isoNow(): string;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  isoNow(): string {
    return new Date().toISOString();
  }
}

export const defaultClock: Clock = new SystemClock();
