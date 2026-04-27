import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { fetchDownloadManifest, formatBytes, osLabel, } from '../../lib/downloads';
/**
 * 메인 CTA "앱 다운로드" 클릭 시 노출되는 popover.
 * OS별 설치 파일 목록을 보여주고, 각 row 클릭으로 다운로드.
 * url null 인 row는 disabled + "준비 중" 배지 (인프라 후속 plan 완료 전).
 */
export function DownloadPopover({ anchorRef, open, onClose }) {
    const [manifest, setManifest] = useState(null);
    const popoverRef = useRef(null);
    // 1회만 fetch (placeholder는 즉시 반환되지만 추후 백엔드 fetch 대비)
    useEffect(() => {
        if (!open || manifest)
            return;
        let cancelled = false;
        void fetchDownloadManifest().then((m) => {
            if (!cancelled)
                setManifest(m);
        });
        return () => {
            cancelled = true;
        };
    }, [open, manifest]);
    // 외부 클릭 + ESC로 닫기
    useEffect(() => {
        if (!open)
            return;
        const onPointerDown = (e) => {
            const target = e.target;
            if (popoverRef.current?.contains(target))
                return;
            if (anchorRef.current?.contains(target))
                return;
            onClose();
        };
        const onKey = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, anchorRef, onClose]);
    if (!open)
        return null;
    return (_jsxs("div", { ref: popoverRef, role: "dialog", "aria-label": "\uB370\uC2A4\uD06C\uD0D1 \uC571 \uB2E4\uC6B4\uB85C\uB4DC", className: "cta-download-popover", children: [_jsxs("div", { className: "cta-download-popover-header", children: [_jsx("span", { className: "cta-download-popover-title", children: "Folio \uB370\uC2A4\uD06C\uD0D1 \uC571" }), _jsx("span", { className: "cta-download-popover-version", children: manifest?.version ?? '…' })] }), _jsx("ul", { className: "cta-download-popover-list", children: (manifest?.files ?? []).map((file, idx) => (_jsx(DownloadRow, { file: file }, `${file.os}-${file.arch}-${idx}`))) })] }));
}
function DownloadRow({ file }) {
    const disabled = file.url == null;
    const sizeText = formatBytes(file.size);
    const label = file.label ?? `${osLabel(file.os)} (${file.arch})`;
    if (disabled) {
        return (_jsxs("li", { className: "cta-download-popover-row", "data-disabled": "true", "aria-disabled": "true", children: [_jsx("span", { className: "cta-download-popover-row-label", children: label }), _jsxs("span", { className: "cta-download-popover-row-format", children: [".", file.format] }), _jsx("span", { className: "cta-download-popover-row-pending", children: "\uC900\uBE44 \uC911" })] }));
    }
    return (_jsx("li", { className: "cta-download-popover-row", children: _jsxs("a", { href: file.url, download: true, className: "cta-download-popover-row-link", children: [_jsx("span", { className: "cta-download-popover-row-label", children: label }), _jsxs("span", { className: "cta-download-popover-row-format", children: [".", file.format] }), sizeText && _jsx("span", { className: "cta-download-popover-row-size", children: sizeText })] }) }));
}
