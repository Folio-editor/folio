import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ChapterHead({ label, heading, id }) {
    return (_jsx("div", { className: "chapter-head", id: id, children: _jsxs("div", { className: "chapter-head-inner", children: [_jsx("div", { className: "chapter-label", children: label }), _jsx("h2", { className: "chapter-heading", children: heading })] }) }));
}
