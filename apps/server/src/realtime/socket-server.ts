import type { Server as HttpServer } from "node:http";
import { Server as SocketIoServer } from "socket.io";
import type { ServerConfig } from "../config/env.js";
import { defaultClock } from "../infrastructure/clock/system-clock.js";
import { InMemoryUserRepository } from "../infrastructure/repositories/user-repository.js";
import { InMemorySessionRepository } from "../infrastructure/repositories/session-repository.js";
import { InMemoryRoomRepository } from "../infrastructure/repositories/room-repository.js";
import { InMemoryRoomAccessRepository } from "../infrastructure/repositories/room-access-repository.js";
import { InMemoryMembershipRepository } from "../infrastructure/repositories/membership-repository.js";
import { InMemoryPlaybackRepository } from "../infrastructure/repositories/playback-repository.js";
import { UserService } from "../application/user-service.js";
import { SessionService } from "../application/session-service.js";
import { RoomAccessService } from "../application/room-access-service.js";
import { PlaybackService } from "../application/playback-service.js";
import { RoomService } from "../application/room-service.js";
import { createAuthMiddleware, type AuthenticatedSocketData } from "./middleware/auth-middleware.js";
import { registerSessionHandlers } from "./handlers/session-handler.js";
import { registerTimeHandlers } from "./handlers/time-handler.js";
import { registerAccessHandlers } from "./handlers/access-handler.js";
import { registerPlayerHandlers } from "./handlers/player-handler.js";
import { registerRoomHandlers } from "./handlers/room-handler.js";

export function createSocketServer(httpServer: HttpServer, config: ServerConfig) {
  const io = new SocketIoServer<any, any, any, AuthenticatedSocketData>(httpServer, {
    cors: {
      origin:
        config.nodeEnv === "development"
          ? true
          : config.corsOrigins.includes("*")
          ? "*"
          : config.corsOrigins,
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Repositories
  const clock = defaultClock;
  const userRepo = new InMemoryUserRepository();
  const sessionRepo = new InMemorySessionRepository();
  const roomRepo = new InMemoryRoomRepository();
  const accessRepo = new InMemoryRoomAccessRepository();
  const membershipRepo = new InMemoryMembershipRepository();
  const playbackRepo = new InMemoryPlaybackRepository();

  // Application services
  const userService = new UserService(userRepo, clock);
  const sessionService = new SessionService(sessionRepo, userRepo, clock, config.sessionTtlMs);
  const accessService = new RoomAccessService(accessRepo, clock);
  const playbackService = new PlaybackService(playbackRepo, clock);
  const roomService = new RoomService(
    roomRepo,
    membershipRepo,
    userRepo,
    accessService,
    playbackService,
    clock
  );

  // Authentication middleware
  io.use(createAuthMiddleware(sessionService, userService));

  // Connection listener
  io.on("connection", (socket) => {
    registerSessionHandlers(io, socket, userService, sessionService);
    registerTimeHandlers(socket, clock);
    registerAccessHandlers(io, socket, roomService);
    registerPlayerHandlers(io, socket, playbackService, roomService);
    registerRoomHandlers(io, socket, roomService);
  });

  // Periodic cleanup of inactive empty rooms (runs every 60 seconds)
  const cleanupTimer = setInterval(() => {
    roomService.cleanupInactiveRooms().catch(() => {});
  }, 60_000);

  return {
    io,
    cleanupTimer,
    userService,
    sessionService,
    accessService,
    playbackService,
    roomService,
  };
}
