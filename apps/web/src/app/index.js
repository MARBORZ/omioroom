import { jsx as _jsx } from "react/jsx-runtime";
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { SocketProvider, useSocketContext } from "./providers/socket-provider.js";
import { HomePage } from "../pages/home/ui/home-page.js";
import { MyRoomsPage } from "../pages/my-rooms/ui/my-rooms-page.js";
import { RoomPage } from "../pages/room/ui/room-page.js";
import { emitCommand } from "../shared/api/socket.js";
import { ClientCommand, } from "@omioroom/contracts";
import "./styles/global.scss";
const MainApp = () => {
    const { socket, connectionStatus } = useSocketContext();
    const [screen, setScreen] = useState("home");
    const [activeRoomSnapshot, setActiveRoomSnapshot] = useState(null);
    const [ownerKey, setOwnerKey] = useState(null);
    // Auto-join from URL hash if present (e.g. #room=482731&code=XYZ)
    useEffect(() => {
        if (connectionStatus !== "connected")
            return;
        const hash = window.location.hash;
        if (hash.startsWith("#room=")) {
            const params = new URLSearchParams(hash.slice(1));
            const roomCode = params.get("room");
            const privateCode = params.get("code");
            if (roomCode && /^\d{6}$/.test(roomCode)) {
                emitCommand(socket, ClientCommand.ROOM_JOIN, {
                    globalId: roomCode,
                    privateCode: privateCode || undefined,
                })
                    .then((snapshot) => {
                    setActiveRoomSnapshot(snapshot);
                    setOwnerKey(privateCode || null);
                    setScreen("room");
                })
                    .catch((err) => {
                    console.error("Auto-join failed:", err);
                });
            }
        }
    }, [connectionStatus, socket]);
    const handleRoomJoined = (snapshot, key) => {
        setActiveRoomSnapshot(snapshot);
        setOwnerKey(key ?? null);
        setScreen("room");
        window.location.hash = `room=${snapshot.room.globalId}${key ? `&code=${key}` : ""}`;
    };
    const handleLeaveRoom = () => {
        setActiveRoomSnapshot(null);
        setOwnerKey(null);
        setScreen("home");
        window.location.hash = "";
    };
    if (screen === "room" && activeRoomSnapshot) {
        return (_jsx(RoomPage, { initialSnapshot: activeRoomSnapshot, ownerAccessKey: ownerKey, onLeave: handleLeaveRoom, onNavigateHome: handleLeaveRoom, onNavigateMyRooms: () => setScreen("my-rooms") }));
    }
    if (screen === "my-rooms") {
        return (_jsx(MyRoomsPage, { onBack: () => setScreen("home"), onOpenRoom: (snapshot) => handleRoomJoined(snapshot) }));
    }
    return (_jsx(HomePage, { onRoomJoined: handleRoomJoined, onNavigateMyRooms: () => setScreen("my-rooms") }));
};
export const App = () => {
    return (_jsx(SocketProvider, { children: _jsx(MainApp, {}) }));
};
const rootEl = document.getElementById("root");
if (rootEl) {
    ReactDOM.createRoot(rootEl).render(_jsx(React.StrictMode, { children: _jsx(App, {}) }));
}
