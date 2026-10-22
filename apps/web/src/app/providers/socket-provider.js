import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState, useMemo } from "react";
import { ClientCommand, } from "@omioroom/contracts";
import { createSocketClient, emitCommand, setStoredSessionToken, } from "../../shared/api/socket.js";
import { TimeSyncClient } from "../../shared/api/time-sync.js";
const SocketContext = createContext(null);
export const SocketProvider = ({ children }) => {
    const socket = useMemo(() => createSocketClient(), []);
    const timeSync = useMemo(() => new TimeSyncClient(socket), [socket]);
    const [connectionStatus, setConnectionStatus] = useState("connecting");
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    useEffect(() => {
        const handleConnect = async () => {
            setConnectionStatus("connected");
            timeSync.startSync();
            try {
                const info = await emitCommand(socket, ClientCommand.SESSION_ME, undefined);
                setUser(info.user);
                setSession(info.session);
                setStoredSessionToken(info.session.id);
            }
            catch (err) {
                console.error("Failed to fetch session:", err);
            }
        };
        const handleDisconnect = (reason) => {
            timeSync.stopSync();
            if (reason === "io server disconnect") {
                setConnectionStatus("disconnected");
            }
            else {
                setConnectionStatus("reconnecting");
            }
        };
        const handleConnectError = () => {
            setConnectionStatus("disconnected");
        };
        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);
        socket.on("connect_error", handleConnectError);
        return () => {
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
            socket.off("connect_error", handleConnectError);
            timeSync.stopSync();
            socket.disconnect();
        };
    }, [socket, timeSync]);
    const updateDisplayName = async (name) => {
        const updated = await emitCommand(socket, ClientCommand.USER_UPDATE_DISPLAY_NAME, { displayName: name });
        setUser(updated);
        return updated;
    };
    return (_jsx(SocketContext.Provider, { value: {
            socket,
            timeSync,
            connectionStatus,
            user,
            session,
            updateDisplayName,
        }, children: children }));
};
export function useSocketContext() {
    const ctx = useContext(SocketContext);
    if (!ctx) {
        throw new Error("useSocketContext must be used within a SocketProvider");
    }
    return ctx;
}
