import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, ExternalLink } from 'lucide-react';
import { clearLandingAuth } from '../../lib/auth';
import { editorUrl, apiBase } from '../../lib/loginUrl';
/**
 * 우측 상단 로그인 버튼 자리에 인증 시 노출되는 프로필 메뉴.
 * - 트리거: avatar(이미지 또는 이니셜) + 닉네임
 * - dropdown: 에디터 열기 / 로그아웃
 */
export function UserProfileMenu({ writer }) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const onPointerDown = (e) => {
            const target = e.target;
            if (triggerRef.current?.contains(target))
                return;
            if (menuRef.current?.contains(target))
                return;
            setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape')
                setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);
    const handleEditor = () => {
        window.location.href = editorUrl('/');
    };
    const handleLogout = async () => {
        setOpen(false);
        // 백엔드에 로그아웃 알림 (RT 무효화) — 실패해도 로컬 정리는 진행
        try {
            const rt = localStorage.getItem('folio:web:rt');
            if (rt) {
                await fetch(`${apiBase()}/auth/web/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: rt }),
                });
            }
        }
        catch {
            /* 네트워크 실패 무시 */
        }
        clearLandingAuth();
        window.location.reload();
    };
    const initial = (writer.nickname ?? writer.email ?? '?').trim().charAt(0).toUpperCase();
    const displayName = writer.nickname ?? writer.email;
    return (_jsxs("div", { className: "user-profile-menu", children: [_jsxs("button", { ref: triggerRef, type: "button", onClick: () => setOpen((v) => !v), className: "user-profile-trigger", "aria-haspopup": "menu", "aria-expanded": open, children: [writer.profileImageUrl ? (_jsx("img", { src: writer.profileImageUrl, alt: "", className: "user-profile-avatar", referrerPolicy: "no-referrer" })) : (_jsx("span", { className: "user-profile-avatar user-profile-avatar-initial", children: initial })), _jsx("span", { className: "user-profile-name", children: displayName }), _jsx(ChevronDown, { size: 14, strokeWidth: 1.8 })] }), open && (_jsxs("div", { ref: menuRef, role: "menu", className: "user-profile-dropdown", children: [_jsxs("button", { type: "button", role: "menuitem", onClick: handleEditor, className: "user-profile-item", children: [_jsx(ExternalLink, { size: 14, strokeWidth: 1.8 }), _jsx("span", { children: "\uC5D0\uB514\uD130 \uC5F4\uAE30" })] }), _jsx("div", { className: "user-profile-divider" }), _jsxs("button", { type: "button", role: "menuitem", onClick: () => void handleLogout(), className: "user-profile-item user-profile-item-danger", children: [_jsx(LogOut, { size: 14, strokeWidth: 1.8 }), _jsx("span", { children: "\uB85C\uADF8\uC544\uC6C3" })] })] }))] }));
}
