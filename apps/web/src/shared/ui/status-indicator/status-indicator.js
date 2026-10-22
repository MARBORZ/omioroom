import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import styles from "./status-indicator.module.scss";
const DEFAULT_LABELS = {
    connected: "Connected",
    connecting: "Connecting",
    reconnecting: "Reconnecting",
    disconnected: "Disconnected",
    buffering: "Buffering",
    error: "Error",
    "in-sync": "In Sync",
};
export const StatusIndicator = ({ status, customLabel, className, style, }) => {
    const label = customLabel || DEFAULT_LABELS[status];
    const statusClassKey = status === "in-sync" ? "inSync" : status;
    const statusClass = styles[statusClassKey] || "";
    return (_jsxs("div", { className: `${styles.statusIndicator} ${className || ""}`, style: style, role: "status", "aria-label": `Status: ${label}`, children: [_jsx("span", { className: `${styles.dot} ${statusClass}`, "aria-hidden": "true" }), _jsx("span", { className: `${styles.label} ${statusClass}`, children: label })] }));
};
