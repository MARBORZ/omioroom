import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { ArrowLeft, Play, Trash2, Users, Copy, Check, Lock, Globe } from "lucide-react";
import { useSocketContext } from "../../../app/providers/socket-provider.js";
import { Button } from "../../../shared/ui/button/button.js";
import { Pill } from "../../../shared/ui/pill/pill.js";
import { emitCommand } from "../../../shared/api/socket.js";
import { ClientCommand, } from "@omioroom/contracts";
import styles from "./my-rooms-page.module.scss";
export const MyRoomsPage = ({ onBack, onOpenRoom, }) => {
    const { socket } = useSocketContext();
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState(null);
    const fetchRooms = async () => {
        try {
            setLoading(true);
            const list = await emitCommand(socket, ClientCommand.ROOM_LIST_MINE, undefined);
            setRooms(list);
        }
        catch (err) {
            console.error("Failed to load rooms:", err);
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        fetchRooms();
    }, []);
    const handleOpen = async (globalId) => {
        try {
            const snapshot = await emitCommand(socket, ClientCommand.ROOM_JOIN, { globalId });
            onOpenRoom(snapshot);
        }
        catch (err) {
            alert(`Could not open room: ${err.message}`);
        }
    };
    const handleClose = async (roomId) => {
        if (!window.confirm("Are you sure you want to close this room? Active viewers will be disconnected.")) {
            return;
        }
        try {
            await emitCommand(socket, ClientCommand.ROOM_CLOSE, { roomId });
            setRooms((prev) => prev.filter((r) => r.id !== roomId));
        }
        catch (err) {
            alert(`Failed to close room: ${err.message}`);
        }
    };
    const handleCopyLink = (globalId) => {
        const url = `${window.location.origin}/#room=${globalId}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopiedId(globalId);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };
    return (_jsxs("div", { className: styles.container, children: [_jsxs("div", { className: styles.headerRow, children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: onBack, icon: _jsx(ArrowLeft, { size: 16 }), children: "Back" }), _jsx("h1", { className: styles.pageTitle, children: "MY WATCH ROOMS" }), _jsx("div", { style: { width: 70 } })] }), loading ? (_jsx("div", { style: { textAlign: "center", padding: 40, color: "var(--color-text-muted)" }, children: "Loading your rooms..." })) : rooms.length === 0 ? (_jsxs("div", { className: styles.emptyState, children: [_jsx("p", { children: "You haven't created any rooms yet." }), _jsx(Button, { variant: "primary", size: "sm", onClick: onBack, children: "Create One Now" })] })) : (_jsx("div", { className: styles.roomList, children: rooms.map((room) => (_jsxs("div", { className: styles.roomCard, children: [_jsxs("div", { className: styles.roomHeader, children: [_jsx("span", { className: styles.roomTitle, children: room.title }), _jsxs("div", { className: styles.metaRow, children: [_jsxs(Pill, { variant: "accent", children: ["ROOM ", room.globalId] }), _jsxs(Pill, { variant: room.visibility === "private" ? "accent" : "default", children: [room.visibility === "private" ? _jsx(Lock, { size: 10, style: { marginRight: 2 } }) : _jsx(Globe, { size: 10, style: { marginRight: 2 } }), room.visibility.toUpperCase()] }), _jsxs(Pill, { variant: room.participantCount >= 2 ? "success" : "default", children: [_jsx(Users, { size: 10, style: { marginRight: 2 } }), room.participantCount, " / 2"] })] })] }), _jsxs("div", { className: styles.actionsRow, children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: () => handleCopyLink(room.globalId), icon: copiedId === room.globalId ? _jsx(Check, { size: 14 }) : _jsx(Copy, { size: 14 }), children: copiedId === room.globalId ? "Copied" : "Copy Link" }), _jsx(Button, { variant: "danger", size: "sm", onClick: () => handleClose(room.id), icon: _jsx(Trash2, { size: 14 }), children: "Close" }), _jsx(Button, { variant: "primary", size: "sm", onClick: () => handleOpen(room.globalId), icon: _jsx(Play, { size: 14 }), children: "Enter Room" })] })] }, room.id))) }))] }));
};
