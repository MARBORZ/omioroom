import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { parseMediaUrl } from "@omioroom/contracts";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { Button } from "../../../shared/ui/button/button.js";
import { Link2 } from "lucide-react";
export const ChangeMediaInput = ({ onMediaSelect, loading = false, disabled = false, }) => {
    const [url, setUrl] = useState("");
    const [error, setError] = useState(null);
    const handleSubmit = (e) => {
        e.preventDefault();
        setError(null);
        const parsed = parseMediaUrl(url);
        if (!parsed) {
            setError("Please enter a valid YouTube link or a direct .mp4/.webm video URL");
            return;
        }
        onMediaSelect(parsed);
        setUrl("");
    };
    return (_jsx("form", { onSubmit: handleSubmit, style: { width: "100%", display: "flex", flexDirection: "column", gap: "8px" }, children: _jsxs("div", { style: { display: "flex", gap: "8px", alignItems: "flex-end" }, children: [_jsx(TextField, { label: "Video Source", placeholder: "Paste YouTube or direct MP4/WebM URL...", value: url, onChange: (e) => {
                        setUrl(e.target.value);
                        if (error)
                            setError(null);
                    }, disabled: disabled || loading, error: error || undefined, style: { flex: 1 } }), _jsx(Button, { type: "submit", variant: "primary", disabled: disabled || loading || !url.trim(), loading: loading, icon: _jsx(Link2, { size: 16 }), children: "Add" })] }) }));
};
