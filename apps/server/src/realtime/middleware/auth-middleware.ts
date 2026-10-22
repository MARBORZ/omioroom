import type { Socket } from "socket.io";
import type { Session, User } from "@omioroom/contracts";
import { OMIOROOM_SESSION_HEADER, OMIOROOM_SESSION_COOKIE } from "@omioroom/contracts";
import type { SessionService } from "../../application/session-service.js";
import type { UserService } from "../../application/user-service.js";

export interface AuthenticatedSocketData {
  session: Session;
  user: User;
  activeRoomId?: string;
}

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx !== -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

export function createAuthMiddleware(
  sessionService: SessionService,
  userService: UserService
) {
  return async (
    socket: Socket<any, any, any, AuthenticatedSocketData>,
    next: (err?: Error) => void
  ) => {
    try {
      // 1. Try to extract existing session token
      const auth = socket.handshake.auth as { token?: string } | undefined;
      let token = auth?.token;

      if (!token && socket.handshake.headers) {
        const headerToken = socket.handshake.headers[OMIOROOM_SESSION_HEADER];
        if (typeof headerToken === "string") {
          token = headerToken;
        } else if (Array.isArray(headerToken) && headerToken[0]) {
          token = headerToken[0];
        }
      }

      if (!token && socket.handshake.headers.cookie) {
        const cookies = parseCookieHeader(socket.handshake.headers.cookie);
        token = cookies[OMIOROOM_SESSION_COOKIE];
      }

      if (token) {
        const validated = await sessionService.validateSession(token);
        if (validated) {
          socket.data.session = validated.session;
          socket.data.user = validated.user;
          await userService.touchLastSeen(validated.user.id);
          return next();
        }
      }

      // 2. No valid session: create an anonymous User and Session
      const user = await userService.createAnonymousUser();
      const session = await sessionService.createSession(user.id);

      socket.data.session = session;
      socket.data.user = user;

      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("AUTHENTICATION_FAILED"));
    }
  };
}
