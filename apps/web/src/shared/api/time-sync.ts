import type { Socket } from "socket.io-client";
import {
  ClientCommand,
  type TimePingPayload,
  type TimePongPayload,
} from "@omioroom/contracts";

export class TimeSyncClient {
  private offsetMs = 0;
  private syncInterval: any = null;

  constructor(private readonly socket: Socket) {}

  startSync(intervalMs = 15000) {
    this.ping();
    this.syncInterval = setInterval(() => {
      this.ping();
    }, intervalMs);
  }

  stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private ping() {
    if (!this.socket.connected) return;

    const clientSendTime = Date.now();
    const payload: TimePingPayload = { clientSendTime };

    this.socket.emit(ClientCommand.TIME_PING, payload, (pong: TimePongPayload) => {
      const clientReceiveTime = Date.now();
      const roundTrip = clientReceiveTime - pong.clientSendTime;

      // Ignore samples with extreme network jitter (> 500ms round trip)
      if (roundTrip > 500) return;

      const offset =
        (pong.serverReceiveTime - pong.clientSendTime + (pong.serverSendTime - clientReceiveTime)) /
        2;

      // Smooth moving average
      this.offsetMs = this.offsetMs === 0 ? offset : this.offsetMs * 0.7 + offset * 0.3;
    });
  }

  getEstimatedServerNow(): number {
    return Date.now() + this.offsetMs;
  }

  getClockOffset(): number {
    return this.offsetMs;
  }
}
