import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Users, Tv } from "lucide-react";
import { Pill } from "../../../shared/ui/pill/pill.js";
import { StatusIndicator } from "../../../shared/ui/status-indicator/status-indicator.js";
import styles from "./room-header.module.scss";
export const RoomHeader = ({ globalRoomId, participantCount = 1, connectionStatus, onNavigateHome, onNavigateMyRooms, title, }) => {
    return (_jsxs("header", { className: styles.header, children: [_jsxs("div", { className: styles.leftSection, children: [_jsxs("div", { className: styles.brand, onClick: onNavigateHome, style: { cursor: onNavigateHome ? "pointer" : "default" }, role: onNavigateHome ? "button" : undefined, tabIndex: onNavigateHome ? 0 : undefined, children: [_jsx("span", { className: styles.brandDot }), "OMIOROOM"] }), globalRoomId && (_jsxs(Pill, { variant: "accent", children: ["ROOM ", globalRoomId] })), title && (_jsx("span", { style: { fontSize: "13px", color: "var(--color-text-muted)" }, children: title }))] }), _jsxs("div", { className: styles.rightSection, children: [_jsx(StatusIndicator, { status: connectionStatus }), globalRoomId && (_jsxs(Pill, { variant: participantCount >= 2 ? "success" : "default", children: [_jsx(Users, { size: 12, style: { marginRight: 2 } }), participantCount, " / 2"] })), onNavigateMyRooms && (_jsxs("button", { type: "button", onClick: onNavigateMyRooms, style: {
                            background: "none",
                            border: "none",
                            color: "var(--color-text-muted)",
                            fontSize: "13px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                        }, children: [_jsx(Tv, { size: 14 }), "My Rooms"] }))] })] }));
};
