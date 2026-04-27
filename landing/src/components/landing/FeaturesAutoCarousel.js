import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { EXTRA_TOOLS } from '../../data/landing-content';
const INTERVAL_MS = 4500;
const CARDS_PER_PAGE = 3;
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
    return out;
}
export function FeaturesAutoCarousel() {
    const pages = chunk(EXTRA_TOOLS, CARDS_PER_PAGE);
    const totalPages = pages.length;
    const viewportRef = useRef(null);
    const pausedRef = useRef(false);
    const [page, setPage] = useState(0);
    useEffect(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced)
            return;
        let timer = null;
        const stop = () => {
            if (timer !== null) {
                window.clearInterval(timer);
                timer = null;
            }
        };
        const start = () => {
            stop();
            timer = window.setInterval(() => {
                if (!pausedRef.current) {
                    setPage((p) => (p + 1) % totalPages);
                }
            }, INTERVAL_MS);
        };
        const onVisibility = () => {
            if (document.hidden)
                stop();
            else
                start();
        };
        document.addEventListener('visibilitychange', onVisibility);
        const el = viewportRef.current;
        let io = null;
        if (el && 'IntersectionObserver' in window) {
            io = new IntersectionObserver((entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())), { threshold: 0.3 });
            io.observe(el);
        }
        else {
            start();
        }
        return () => {
            stop();
            document.removeEventListener('visibilitychange', onVisibility);
            io?.disconnect();
        };
    }, [totalPages]);
    const goTo = (p) => {
        const next = ((p % totalPages) + totalPages) % totalPages;
        setPage(next);
    };
    return (_jsxs("div", { className: "carousel-wrap", children: [_jsxs("div", { className: "carousel-head", children: [_jsxs("div", { children: [_jsx("div", { className: "carousel-label sans", children: "\uADF8 \uC678 \uAE30\uB2A5" }), _jsx("h3", { className: "carousel-heading", children: "\uC791\uAC00\uB97C \uB3D5\uB294 \uB3C4\uAD6C \uBA87 \uAC00\uC9C0 \uB354." })] }), _jsx("div", { className: "carousel-dots", role: "tablist", children: pages.map((_, i) => (_jsx("button", { type: "button", className: `carousel-dot${i === page ? ' active' : ''}`, "aria-label": `${i + 1}페이지`, "aria-selected": i === page, role: "tab", onClick: () => goTo(i) }, i))) })] }), _jsx("div", { className: "carousel-viewport", ref: viewportRef, onMouseEnter: () => {
                    pausedRef.current = true;
                }, onMouseLeave: () => {
                    pausedRef.current = false;
                }, children: _jsx("div", { className: "carousel-track", style: { transform: `translateX(-${page * 100}%)` }, children: pages.map((pageItems, pIdx) => (_jsx("div", { className: "carousel-page", children: pageItems.map((item) => (_jsxs("article", { className: "carousel-card", children: [_jsx("div", { className: "carousel-card-num sans", children: item.num }), _jsx("h4", { className: "carousel-card-title", children: item.title }), _jsx("p", { className: "carousel-card-desc", children: item.desc }), _jsx("div", { className: "carousel-card-meta", children: item.meta })] }, item.num))) }, pIdx))) }) })] }));
}
