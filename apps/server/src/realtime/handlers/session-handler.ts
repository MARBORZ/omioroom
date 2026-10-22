import type { Socket, Server } from "socket.io";
import {
  ClientCommand,
  ServerEvent,
  updateDisplayNamePayloadSchema,
  registerUserPayloadSchema,
  loginUserPayloadSchema,
  commandResultSuccess,
  commandResultError,
  createProtocolError,
  ErrorCode,
  type CommandEnvelope,
  type UpdateDisplayNamePayload,
  type RegisterUserPayload,
  type LoginUserPayload,
  type SessionInfoDto,
} from "@omioroom/contracts";
import type { AuthenticatedSocketData } from "../middleware/auth-middleware.js";
import type { UserService } from "../../application/user-service.js";
import { RateLimiter } from "../../infrastructure/security/rate-limiter.js";
import { toProtocolError } from "../errors.js";
import type { SessionService } from "../../application/session-service.js";

export function registerSessionHandlers(
  io: Server,
  socket: Socket<any, any, any, AuthenticatedSocketData>,
  userService: UserService,
  sessionService: SessionService
) {
  // Brute-force protection for credential endpoints (per user and per submitted username)
  const authLimiter = new RateLimiter(60_000, 8);
  // session:me
  socket.on(
    ClientCommand.SESSION_ME,
    (envelope: CommandEnvelope<void>, ack?: (res: any) => void) => {
      const { user, session } = socket.data;
      const data: SessionInfoDto = {
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
        },
        user,
      };

      const result = commandResultSuccess(envelope?.requestId || "sync", data);
      if (ack) {
        ack(result);
      } else {
        socket.emit(ServerEvent.CONNECTION_READY, result);
      }
    }
  );

  // user:update-display-name
  socket.on(
    ClientCommand.USER_UPDATE_DISPLAY_NAME,
    async (
      envelope: CommandEnvelope<UpdateDisplayNamePayload>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "update-name";
      try {
        const parsed = updateDisplayNamePayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) {
          const err = createProtocolError(
            ErrorCode.INVALID_PAYLOAD,
            parsed.error.errors[0]?.message || "Invalid display name"
          );
          return ack?.(commandResultError(requestId, err));
        }

        const updatedUser = await userService.updateDisplayName(
          socket.data.user.id,
          parsed.data.displayName
        );
        socket.data.user = updatedUser;

        const result = commandResultSuccess(requestId, updatedUser);
        ack?.(result);

        // If in a room, notify participants of name change
        if (socket.data.activeRoomId) {
          io.to(`room:${socket.data.activeRoomId}`).emit(ServerEvent.ROOM_UPDATED, {
            roomId: socket.data.activeRoomId,
          });
        }
      } catch (err) {
        ack?.(commandResultError(requestId, toProtocolError(err, "user:update-display-name")));
      }
    }
  );

  // user:register
  socket.on(
    ClientCommand.USER_REGISTER,
    async (
      envelope: CommandEnvelope<RegisterUserPayload>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "register";
      try {
        const parsed = registerUserPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) {
          const err = createProtocolError(
            ErrorCode.INVALID_PAYLOAD,
            parsed.error.errors[0]?.message || "Invalid registration data"
          );
          return ack?.(commandResultError(requestId, err));
        }

        if (
          !authLimiter.checkAndRecord(`u:${socket.data.user.id}`) ||
          !authLimiter.checkAndRecord(`n:${parsed.data.username.toLowerCase()}`)
        ) {
          throw new Error("RATE_LIMITED");
        }

        const registeredUser = await userService.registerUser(
          socket.data.user.id,
          parsed.data.username,
          parsed.data.password
        );
        socket.data.user = registeredUser;

        const result = commandResultSuccess(requestId, {
          user: registeredUser,
          session: socket.data.session,
        });
        ack?.(result);
      } catch (err) {
        if (err instanceof Error && err.message === "USERNAME_TAKEN") {
          return ack?.(
            commandResultError(
              requestId,
              createProtocolError(ErrorCode.INVALID_PAYLOAD, "Username is already taken")
            )
          );
        }
        ack?.(commandResultError(requestId, toProtocolError(err, "user:register")));
      }
    }
  );

  // user:login
  socket.on(
    ClientCommand.USER_LOGIN,
    async (
      envelope: CommandEnvelope<LoginUserPayload>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "login";
      try {
        const parsed = loginUserPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) {
          const err = createProtocolError(
            ErrorCode.INVALID_PAYLOAD,
            parsed.error.errors[0]?.message || "Invalid credentials"
          );
          return ack?.(commandResultError(requestId, err));
        }

        if (
          !authLimiter.checkAndRecord(`u:${socket.data.user.id}`) ||
          !authLimiter.checkAndRecord(`n:${parsed.data.username.toLowerCase()}`)
        ) {
          throw new Error("RATE_LIMITED");
        }

        const user = await userService.authenticateUser(
          parsed.data.username,
          parsed.data.password
        );

        // Create new session for this user
        const session = await sessionService.createSession(user.id);
        socket.data.user = user;
        socket.data.session = session;

        const result = commandResultSuccess(requestId, {
          user,
          session,
        });
        ack?.(result);
      } catch (err) {
        if (err instanceof Error && err.message === "RATE_LIMITED") {
          return ack?.(commandResultError(requestId, toProtocolError(err, "user:login")));
        }
        // Same answer for unknown user and wrong password
        ack?.(
          commandResultError(
            requestId,
            createProtocolError(ErrorCode.UNAUTHENTICATED, "Invalid username or password")
          )
        );
      }
    }
  );
}
