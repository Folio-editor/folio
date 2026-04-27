import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ToolSection({ number, keyword, oneline, features, mockup, }) {
    return (_jsx("section", { className: "tool-section reveal-on-scroll", children: _jsxs("div", { className: "tool-inner", children: [_jsx("div", { className: "tool-mockup", children: mockup }), _jsxs("div", { className: "tool-text", children: [_jsx("div", { className: "tool-num sans", children: number }), _jsx("h3", { className: "tool-keyword", children: keyword }), _jsx("p", { className: "tool-oneline", children: oneline }), _jsx("ul", { className: "tool-features", children: features.map((f, i) => (_jsx("li", { children: f }, i))) })] })] }) }));
}
