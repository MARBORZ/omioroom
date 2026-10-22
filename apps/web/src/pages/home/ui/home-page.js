import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { Plus, LogIn, Edit2, Check, Tv, Lock, Globe } from "lucide-react";
import { useSocketContext } from "../../../app/providers/socket-provider.js";
import { Button } from "../../../shared/ui/button/button.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { StatusIndicator } from "../../../shared/ui/status-indicator/status-indicator.js";
import { emitCommand } from "../../../shared/api/socket.js";
import { ClientCommand, } from "@omioroom/contracts";
import styles from "./home-page.module.scss";
export const HomePage = ({ onRoomJoined, onNavigateMyRooms, }) => {
    const { socket, connectionStatus, user, updateDisplayName } = useSocketContext();
    // Nickname edit state
    const [isEditingName, setIsEditingName] = useState(false);
    const [nameInput, setNameInput] = useState("");
    const [nameLoading, setNameLoading] = useState(false);
    // Create room state
    const [roomTitle, setRoomTitle] = useState("");
    const [visibility, setVisibility] = useState("private");
    const [createLoading, setCreateLoading] = useState(false);
    const [createError, setCreateError] = useState(null);
    // Join room state
    const [joinCode, setJoinCode] = useState("");
    const [joinPrivateCode, setJoinPrivateCode] = useState("");
    const [joinLoading, setJoinLoading] = useState(false);
    const [joinError, setJoinError] = useState(null);
    const handleSaveName = async () => {
        if (!nameInput.trim())
            return;
        try {
            setNameLoading(true);
            await updateDisplayName(nameInput.trim());
            setIsEditingName(false);
        }
        catch {
            // Ignored
        }
        finally {
            setNameLoading(false);
        }
    };
    const handleCreateRoom = async (e) => {
        e.preventDefault();
        setCreateError(null);
        setCreateLoading(true);
        try {
            const payload = {
                title: roomTitle.trim() || "Watch Room",
                visibility,
            };
            const result = await emitCommand(socket, ClientCommand.ROOM_CREATE, payload);
            onRoomJoined(result.snapshot, result.ownerAccess?.privateCode ?? null);
        }
        catch (err) {
            setCreateError(err.message || "Failed to create room");
        }
        finally {
            setCreateLoading(false);
        }
    };
    const handleJoinRoom = async (e) => {
        e.preventDefault();
        setJoinError(null);
        setJoinLoading(true);
        try {
            const payload = {
                globalId: joinCode.trim(),
                privateCode: joinPrivateCode.trim() || undefined,
            };
            const snapshot = await emitCommand(socket, ClientCommand.ROOM_JOIN, payload);
            onRoomJoined(snapshot, joinPrivateCode.trim() || null);
        }
        catch (err) {
            if (err.code === "PRIVATE_CODE_REQUIRED") {
                setJoinError("This room is private. Please enter the private access key.");
            }
            else if (err.code === "INVALID_PRIVATE_CODE") {
                setJoinError("Invalid private key. Please check the invite link.");
            }
            else if (err.code === "ROOM_FULL") {
                setJoinError("This room is full (maximum 2 participants).");
            }
            else if (err.code === "ROOM_NOT_FOUND") {
                setJoinError("Room not found. Check the 6-digit code.");
            }
            else {
                setJoinError(err.message || "Failed to join room");
            }
        }
        finally {
            setJoinLoading(false);
        }
    };
    return (_jsxs("div", { className: styles.homeContainer, children: [_jsxs("div", { className: styles.hero, children: [_jsxs("div", { className: styles.brand, children: [_jsx("span", { style: { width: 10, height: 10, backgroundColor: "var(--color-accent)", borderRadius: 2 } }), "OMIOROOM"] }), _jsx("p", { className: styles.tagline, children: "Minimalist anonymous watch party for two." }), _jsx(StatusIndicator, { status: connectionStatus, style: { marginTop: 4 } })] }), _jsx("div", { className: styles.userCard, children: isEditingName ? (_jsxs("div", { style: { display: "flex", gap: 8, width: "100%", alignItems: "center" }, children: [_jsx(TextField, { value: nameInput, onChange: (e) => setNameInput(e.target.value), placeholder: "Your nickname...", disabled: nameLoading, autoFocus: true }), _jsx(Button, { variant: "primary", size: "sm", onClick: handleSaveName, loading: nameLoading, icon: _jsx(Check, { size: 14 }), children: "Save" })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }, children: "Watching as" }), _jsx("div", { style: { fontWeight: 600, fontSize: "15px" }, children: user?.displayName || "Loading..." })] }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(Edit2, { size: 13 }), onClick: () => {
                                        setNameInput(user?.displayName || "");
                                        setIsEditingName(true);
                                    }, children: "Change" }), _jsx(Button, { variant: "secondary", size: "sm", icon: _jsx(Tv, { size: 13 }), onClick: onNavigateMyRooms, children: "My Rooms" })] })] })) }), _jsxs("div", { className: styles.card, children: [_jsx("div", { className: styles.cardTitle, children: "Create a Watch Room" }), _jsxs("form", { onSubmit: handleCreateRoom, style: { display: "flex", flexDirection: "column", gap: 12 }, children: [_jsx(TextField, { label: "Room Title", placeholder: "e.g. Saturday Movie Night", value: roomTitle, onChange: (e) => setRoomTitle(e.target.value) }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx(Button, { type: "button", variant: visibility === "private" ? "primary" : "secondary", size: "sm", onClick: () => setVisibility("private"), icon: _jsx(Lock, { size: 14 }), style: { flex: 1 }, children: "Private (Key Required)" }), _jsx(Button, { type: "button", variant: visibility === "public" ? "primary" : "secondary", size: "sm", onClick: () => setVisibility("public"), icon: _jsx(Globe, { size: 14 }), style: { flex: 1 }, children: "Public (Code Only)" })] }), createError && (_jsx("div", { style: { fontSize: "13px", color: "var(--color-danger)" }, children: createError })), _jsx(Button, { type: "submit", variant: "primary", loading: createLoading, disabled: connectionStatus !== "connected", icon: _jsx(Plus, { size: 16 }), children: "Create Room" })] })] }), _jsx("div", { className: styles.divider, children: "OR" }), _jsxs("div", { className: styles.card, children: [_jsx("div", { className: styles.cardTitle, children: "Join Existing Room" }), _jsxs("form", { onSubmit: handleJoinRoom, style: { display: "flex", flexDirection: "column", gap: 12 }, children: [_jsx(TextField, { label: "Global Room ID (6 Digits)", placeholder: "482731", mono: true, maxLength: 6, value: joinCode, onChange: (e) => setJoinCode(e.target.value.replace(/\D/g, "")), required: true }), _jsx(TextField, { label: "Private Invite Key (If room is private)", placeholder: "Paste private key here if required...", mono: true, value: joinPrivateCode, onChange: (e) => setJoinPrivateCode(e.target.value) }), joinError && (_jsx("div", { style: { fontSize: "13px", color: "var(--color-danger)" }, children: joinError })), _jsx(Button, { type: "submit", variant: "secondary", loading: joinLoading, disabled: connectionStatus !== "connected" || joinCode.length !== 6, icon: _jsx(LogIn, { size: 16 }), children: "Join Room" })] })] })] }));
};
