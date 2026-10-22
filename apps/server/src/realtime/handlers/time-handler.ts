import type { Socket } from "socket.io";
import {
  ClientCommand,
  ServerEvent,
  timePingPayloadSchema,
  type TimePingPayload,
  type TimePongPayload,
} from "@omioroom/contracts";
import type { Clock } from "../../infrastructure/clock/system-clock.js";

export function registerTimeHandlers(
  socket: Socket,
  clock: Clock
) {
  socket.on(ClientCommand.TIME_PING, (payload: TimePingPayload, ack?: (res: TimePongPayload) => void) => {
    const serverReceiveTime = clock.now();
    const parsed = timePingPayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    const response: TimePongPayload = {
      clientSendTime: parsed.data.clientSendTime,
      serverReceiveTime,
      serverSendTime: clock.now(),
    };

    if (ack) {
      ack(response);
    } else {
      socket.emit(ServerEvent.TIME_PONG, response);
    }
  });
}
