import { io } from "socket.io-client";
import { PROTOCOL_VERSION, ErrorCode, createProtocolError, } from "@omioroom/contracts";
const SESSION_STORAGE_KEY = "omioroom_session_token";
export function getStoredSessionToken() {
    return localStorage.getItem(SESSION_STORAGE_KEY);
}
export function setStoredSessionToken(token) {
    localStorage.setItem(SESSION_STORAGE_KEY, token);
}
function getBackendUrl() {
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }
    return window.location.origin;
}
export function createSocketClient() {
    const token = getStoredSessionToken();
    const url = getBackendUrl();
    const socket = io(url, {
        auth: {
            token: token || undefined,
        },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
    });
    return socket;
}
export function generateClientRequestId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
export function emitCommand(socket, event, payload) {
    return new Promise((resolve, reject) => {
        const requestId = generateClientRequestId();
        const envelope = {
            requestId,
            protocolVersion: PROTOCOL_VERSION,
            payload,
        };
        const timeout = setTimeout(() => {
            reject(createProtocolError(ErrorCode.INTERNAL_ERROR, "Request timed out waiting for server response", true));
        }, 10000);
        socket.emit(event, envelope, (result) => {
            clearTimeout(timeout);
            if (result.ok) {
                resolve(result.data);
            }
            else {
                reject(result.error);
            }
        });
    });
}
