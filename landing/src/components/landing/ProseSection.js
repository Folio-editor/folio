import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { DEDICATION, PROSE } from '../../data/landing-content';
export function ProseSection() {
    return (_jsxs("section", { className: "prose", children: [PROSE.map((paragraph, pIdx) => (_jsx("p", { children: paragraph.map((line, lIdx) => (_jsx("span", { className: "fill-line", children: line }, lIdx))) }, pIdx))), _jsx("p", { className: "prose-dedication", children: DEDICATION.map((line, lIdx) => (_jsx("span", { className: "fill-line", children: line }, lIdx))) })] }));
}
