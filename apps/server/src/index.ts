import http from "node:http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config/env.js";
import { createSocketServer } from "./realtime/socket-server.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin:
        config.nodeEnv === "development"
          ? true
          : config.corsOrigins.includes("*")
          ? "*"
          : config.corsOrigins,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      serverTime: Date.now(),
      env: config.nodeEnv,
    });
  });

  return app;
}

export function startServer() {
  const app = createApp();
  const httpServer = http.createServer(app);
  const { io } = createSocketServer(httpServer, config);

  // In Node.js on macOS, listening on config.port without "0.0.0.0" binds to both IPv4 and IPv6 (::),
  // which prevents ECONNREFUSED when Chrome resolves localhost to ::1.
  const server = httpServer.listen(config.port, () => {
    console.log(
      `[omioroom-server] listening on port ${config.port} (${config.nodeEnv})`
    );
  });

  const shutdown = () => {
    console.log("[omioroom-server] shutting down...");
    io.close(() => {
      server.close(() => {
        process.exit(0);
      });
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return { app, httpServer, io, server };
}

// Auto-start if directly executed
if (process.env.NODE_ENV !== "test") {
  startServer();
}
