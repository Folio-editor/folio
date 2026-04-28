import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { buildLoginUrl } from '../../lib/loginUrl';
import { useLandingAuth } from '../../lib/auth';
import { UserProfileMenu } from './UserProfileMenu';
export function TopNav() {
    const { isAuthenticated, writer } = useLandingAuth();
    // returnPath에 fromLanding=1 — 에디터가 auth_code 교환 후 랜딩으로 다시 bounce
    const loginUrl = buildLoginUrl('/?fromLanding=1');
    return (_jsx("nav", { className: "nav", children: _jsxs("div", { className: "nav-inner", children: [_jsx(Link, { to: "/", className: "nav-brand", "aria-label": "Folio \uD648\uC73C\uB85C", children: _jsx("img", { src: "/nav-logo.png", alt: "Folio", className: "nav-logo" }) }), _jsxs("div", { className: "nav-links", children: [_jsx("a", { href: "/#features", className: "nav-link", children: "\uAE30\uB2A5" }), _jsx("a", { href: "/#pricing", className: "nav-link", children: "\uAC00\uACA9" }), _jsx("a", { href: "/#faq", className: "nav-link", children: "\uBB38\uB2F5" }), isAuthenticated && writer ? (_jsx(UserProfileMenu, { writer: writer })) : (_jsx("a", { href: loginUrl, className: "nav-cta sans", children: "\uB85C\uADF8\uC778" }))] })] }) }));
}
