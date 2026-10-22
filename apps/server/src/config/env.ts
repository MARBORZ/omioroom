export interface ServerConfig {
  port: number;
  host: string;
  nodeEnv: "development" | "production" | "test";
  corsOrigins: string[];
  sessionTtlMs: number;
  roomInactivityTimeoutMs: number;
}

export function loadConfig(): ServerConfig {
  const nodeEnv = (process.env.NODE_ENV as "development" | "production" | "test") || "development";
  const port = parseInt(process.env.PORT || "4000", 10);
  const host = process.env.HOST || "0.0.0.0";

  const rawOrigins = process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174";
  const corsOrigins = rawOrigins.split(",").map((o) => o.trim()).filter(Boolean);

  const sessionTtlMs = parseInt(
    process.env.SESSION_TTL_MS || `${7 * 24 * 60 * 60 * 1000}`,
    10
  );
  const roomInactivityTimeoutMs = parseInt(
    process.env.ROOM_INACTIVITY_TIMEOUT_MS || `${15 * 60 * 1000}`,
    10
  );

  return {
    port,
    host,
    nodeEnv,
    corsOrigins,
    sessionTtlMs,
    roomInactivityTimeoutMs,
  };
}

export const config = loadConfig();
