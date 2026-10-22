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
      origin: config.corsOrigins.includes("*") ? "*" : config.corsOrigins,
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

  const server = httpServer.listen(config.port, config.host, () => {
    console.log(
      `[omioroom-server] listening on http://${config.host}:${config.port} (${config.nodeEnv})`
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
