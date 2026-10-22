import { ClientCommand, } from "@omioroom/contracts";
export class TimeSyncClient {
    socket;
    offsetMs = 0;
    syncInterval = null;
    constructor(socket) {
        this.socket = socket;
    }
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
    ping() {
        if (!this.socket.connected)
            return;
        const clientSendTime = Date.now();
        const payload = { clientSendTime };
        this.socket.emit(ClientCommand.TIME_PING, payload, (pong) => {
            const clientReceiveTime = Date.now();
            const roundTrip = clientReceiveTime - pong.clientSendTime;
            // Ignore samples with extreme network jitter (> 500ms round trip)
            if (roundTrip > 500)
                return;
            const offset = (pong.serverReceiveTime - pong.clientSendTime + (pong.serverSendTime - clientReceiveTime)) /
                2;
            // Smooth moving average
            this.offsetMs = this.offsetMs === 0 ? offset : this.offsetMs * 0.7 + offset * 0.3;
        });
    }
    getEstimatedServerNow() {
        return Date.now() + this.offsetMs;
    }
    getClockOffset() {
        return this.offsetMs;
    }
}
