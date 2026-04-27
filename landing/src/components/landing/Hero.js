import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import { editorUrl } from '../../lib/loginUrl';
import { useLandingAuth } from '../../lib/auth';
import { DownloadPopover } from './DownloadPopover';
export function Hero({ onRequestLogin }) {
    const [popoverOpen, setPopoverOpen] = useState(false);
    const downloadBtnRef = useRef(null);
    const { isAuthenticated } = useLandingAuth();
    const handleSecondaryClick = () => {
        if (isAuthenticated) {
            window.location.href = editorUrl('/');
        }
        else {
            onRequestLogin();
        }
    };
    return (_jsxs("section", { className: "hero", id: "signup", children: [_jsx("div", { className: "hero-rule" }), _jsx("p", { className: "hero-hook", children: "\uC774\uC81C, \uD63C\uC790 \uC4F0\uC9C0 \uB9C8\uC138\uC694." }), _jsx("img", { src: "/hero-title.png", alt: "Folio \u2014 Where your stories come to life.", className: "hero-image" }), _jsxs("div", { className: "cta-download-group", children: [_jsxs("div", { className: "cta-download-anchor", children: [_jsx("button", { ref: downloadBtnRef, type: "button", onClick: () => setPopoverOpen((v) => !v), className: "cta-download", "aria-haspopup": "dialog", "aria-expanded": popoverOpen, children: _jsx("span", { className: "cta-download-inner", children: "\uC571 \uB2E4\uC6B4\uB85C\uB4DC" }) }), _jsx(DownloadPopover, { anchorRef: downloadBtnRef, open: popoverOpen, onClose: () => setPopoverOpen(false) })] }), _jsx("button", { type: "button", className: "cta-secondary", onClick: handleSecondaryClick, children: "\u2192 \uC6F9\uC5D0\uC11C \uC774\uC6A9\uD558\uAE30" })] })] }));
}
