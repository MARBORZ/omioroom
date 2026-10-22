import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { Copy, Check, RotateCw, Lock, Globe } from "lucide-react";
import { Button } from "../../../shared/ui/button/button.js";
import { Pill } from "../../../shared/ui/pill/pill.js";
import styles from "./invite-panel.module.scss";
export const InvitePanel = ({ globalRoomId, isOwner, visibility, privateCode, onRotateCode, onToggleVisibility, }) => {
    const [copied, setCopied] = useState(false);
    const [rotating, setRotating] = useState(false);
    const [toggling, setToggling] = useState(false);
    const getInviteUrl = () => {
        const origin = window.location.origin;
        if (visibility === "private" && privateCode) {
            return `${origin}/#room=${globalRoomId}&code=${privateCode}`;
        }
        return `${origin}/#room=${globalRoomId}`;
    };
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(getInviteUrl());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch {
            // Fallback
            setCopied(false);
        }
    };
    const handleRotate = async () => {
        if (!onRotateCode)
            return;
        if (!window.confirm("Rotate private code? The old link/code will stop working for new connections.")) {
            return;
        }
        try {
            setRotating(true);
            await onRotateCode();
        }
        finally {
            setRotating(false);
        }
    };
    const handleToggle = async () => {
        if (!onToggleVisibility)
            return;
        const nextVis = visibility === "public" ? "private" : "public";
        try {
            setToggling(true);
            await onToggleVisibility(nextVis);
        }
        finally {
            setToggling(false);
        }
    };
    return (_jsxs("div", { className: styles.invitePanel, children: [_jsxs("div", { className: styles.sectionTitle, children: [_jsx("span", { children: "Invite Companion" }), _jsxs(Pill, { variant: visibility === "private" ? "accent" : "default", children: [visibility === "private" ? _jsx(Lock, { size: 10, style: { marginRight: 2 } }) : _jsx(Globe, { size: 10, style: { marginRight: 2 } }), visibility.toUpperCase()] })] }), _jsx("div", { className: styles.copyRow, children: _jsx(Button, { variant: "primary", onClick: handleCopy, icon: copied ? _jsx(Check, { size: 16 }) : _jsx(Copy, { size: 16 }), style: { width: "100%" }, children: copied ? "Link Copied!" : "Copy Invite Link" }) }), isOwner && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }, children: [visibility === "private" && privateCode && (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: "12px", color: "var(--color-text-muted)" }, children: "Private Invite Key (Visible to owner only):" }), _jsxs("div", { className: styles.privateCodeBox, children: [_jsx("span", { children: privateCode }), _jsx(Button, { variant: "ghost", size: "sm", onClick: handleRotate, loading: rotating, icon: _jsx(RotateCw, { size: 14 }), title: "Rotate invite key", children: "Rotate" })] })] })), _jsx("div", { className: styles.actionRow, children: _jsxs(Button, { variant: "secondary", size: "sm", onClick: handleToggle, loading: toggling, style: { width: "100%", fontSize: "12px" }, children: ["Switch to ", visibility === "public" ? "Private Room" : "Public Room"] }) })] }))] }));
};
