import { io, Socket } from "socket.io-client";
import {
  PROTOCOL_VERSION,
  ErrorCode,
  createProtocolError,
  type CommandEnvelope,
  type CommandResult,
} from "@omioroom/contracts";

const SESSION_STORAGE_KEY = "omioroom_session_token";

export function getStoredSessionToken(): string | null {
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

export function setStoredSessionToken(token: string): void {
  localStorage.setItem(SESSION_STORAGE_KEY, token);
}

function getBackendUrl(): string {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (import.meta.env.DEV) {
    const host = window.location.hostname || "localhost";
    return `http://${host}:4000`;
  }
  return window.location.origin;
}

/**
 * Module-level singleton socket instance.
 * Prevents React StrictMode double-mount from creating duplicate connections
 * that race and destroy each other's polling handshakes.
 */
let singletonSocket: Socket | null = null;

export function createSocketClient(): Socket {
  if (singletonSocket && !singletonSocket.disconnected) {
    return singletonSocket;
  }

  const token = getStoredSessionToken();
  const url = getBackendUrl();

  singletonSocket = io(url, {
    auth: {
      token: token || undefined,
    },
    transports: ["polling", "websocket"],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    autoConnect: true,
  });

  return singletonSocket;
}

/**
 * Get the existing socket instance without creating a new one.
 */
export function getSocketClient(): Socket | null {
  return singletonSocket;
}

export function generateClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function emitCommand<TPayload, TData>(
  socket: Socket,
  event: string,
  payload: TPayload
): Promise<TData> {
  return new Promise((resolve, reject) => {
    const send = () => {
      const requestId = generateClientRequestId();
      const envelope: CommandEnvelope<TPayload> = {
        requestId,
        protocolVersion: PROTOCOL_VERSION,
        payload,
      };

      const timeout = setTimeout(() => {
        reject(
          createProtocolError(
            ErrorCode.INTERNAL_ERROR,
            "Request timed out waiting for server response",
            true
          )
        );
      }, 10000);

      socket.emit(event, envelope, (result: CommandResult<TData>) => {
        clearTimeout(timeout);
        if (result && typeof result === "object" && "ok" in result) {
          if (result.ok) {
            resolve(result.data);
          } else {
            reject(result.error);
          }
        } else {
          resolve(result as any);
        }
      });
    };

    if (socket.connected) {
      send();
    } else {
      const onConnect = () => {
        clearTimeout(connectTimeout);
        send();
      };

      const connectTimeout = setTimeout(() => {
        socket.off("connect", onConnect);
        reject(
          createProtocolError(
            ErrorCode.INTERNAL_ERROR,
            "Socket connection timed out",
            true
          )
        );
      }, 8000);

      socket.once("connect", onConnect);
    }
  });
}
