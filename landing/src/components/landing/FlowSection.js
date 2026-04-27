import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { STEPS } from '../../data/landing-content';
import { ChapterHead } from './ChapterHead';
export function FlowSection() {
    return (_jsxs(_Fragment, { children: [_jsx(ChapterHead, { label: "Chapter II \u00B7 \uD750\uB984", heading: "1\uD654\uBD80\uD130 \uD568\uAED8 \uC313\uC2B5\uB2C8\uB2E4." }), _jsx("section", { className: "chapter", children: _jsx("div", { className: "flow", children: STEPS.map((s) => (_jsxs("div", { className: "flow-row", children: [_jsx("div", { className: "flow-num sans", children: s.num }), _jsx("div", { className: "flow-key", children: s.label }), _jsx("div", { className: "flow-desc", children: s.body })] }, s.num))) }) })] }));
}
