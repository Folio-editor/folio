import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { buildLoginUrl } from '../../lib/loginUrl';
/**
 * 비인증 상태에서 에디터 진입 시도 시 노출되는 모달.
 * Google OAuth start로 보내며, returnPath에 fromLanding=1을 박아
 * 로그인 성공 후 에디터가 랜딩으로 다시 bounce하도록 한다.
 */
export function LoginRequiredModal({ open, onClose }) {
    useEffect(() => {
        if (!open)
            return;
        const onKey = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        document.addEventListener('keydown', onKey);
        // body scroll lock
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);
    if (!open)
        return null;
    const handleLogin = () => {
        window.location.href = buildLoginUrl('/?fromLanding=1');
    };
    return (_jsx("div", { className: "login-modal-backdrop", role: "dialog", "aria-modal": "true", "aria-label": "\uB85C\uADF8\uC778 \uD544\uC694", onClick: onClose, children: _jsxs("div", { className: "login-modal-card", onClick: (e) => e.stopPropagation(), children: [_jsx("h2", { className: "login-modal-title", children: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4" }), _jsx("p", { className: "login-modal-body", children: "Folio \uC5D0\uB514\uD130\uB97C \uC0AC\uC6A9\uD558\uB824\uBA74 Google \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778\uD574\uC8FC\uC138\uC694." }), _jsx("button", { type: "button", className: "login-modal-google-btn", onClick: handleLogin, children: "Google \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778" }), _jsx("button", { type: "button", className: "login-modal-cancel", onClick: onClose, children: "\uCDE8\uC18C" })] }) }));
}
