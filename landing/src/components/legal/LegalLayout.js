import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TopNav } from '../landing/TopNav';
import { FinFooter } from '../landing/FinFooter';
import '../../styles/landing.css';
import '../../styles/legal.css';
export function LegalLayout({ title, effectiveDate, children, }) {
    useEffect(() => {
        const prev = document.title;
        document.title = `${title} · Folio`;
        window.scrollTo(0, 0);
        return () => {
            document.title = prev;
        };
    }, [title]);
    return (_jsxs("div", { className: "folio-landing legal-page", children: [_jsx(TopNav, {}), _jsx("main", { className: "legal-main", children: _jsxs("div", { className: "legal-container", children: [_jsx(Link, { to: "/", className: "legal-back sans", children: "\u2190 Folio \uD648\uC73C\uB85C" }), _jsxs("header", { className: "legal-header", children: [_jsx("h1", { className: "legal-title", children: title }), effectiveDate && (_jsxs("p", { className: "legal-effective sans", children: ["\uC2DC\uD589\uC77C \u00B7 ", effectiveDate] }))] }), _jsx("article", { className: "legal-content", children: children })] }) }), _jsx(FinFooter, {})] }));
}
