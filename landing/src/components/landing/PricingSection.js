import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { PRICING } from '../../data/landing-content';
import { ChapterHead } from './ChapterHead';
export function PricingSection() {
    return (_jsxs(_Fragment, { children: [_jsx(ChapterHead, { label: "Chapter III \u00B7 \uAC00\uACA9", heading: "\uC4F4 \uB9CC\uD07C\uB9CC.", id: "pricing" }), _jsx("section", { className: "chapter", children: _jsx("div", { className: "pricing-grid", children: PRICING.map((p) => (_jsxs("div", { className: `price-cell${p.featured ? ' featured' : ''}`, children: [_jsx("div", { className: "price-name sans", children: p.name }), _jsx("div", { className: "price-num sans", children: p.price }), _jsxs("div", { className: "price-period sans", children: [p.period ? `${p.period} · ` : '', p.sub] }), _jsx("a", { href: "#", className: `price-cta ${p.ctaVariant} sans`, children: p.cta }), _jsx("ul", { className: "price-list", children: p.features.map((f) => (_jsx("li", { children: f }, f))) })] }, p.name))) }) })] }));
}
