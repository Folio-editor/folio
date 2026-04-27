import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  fetchDownloadManifest,
  formatBytes,
  osLabel,
  type DownloadFile,
  type DownloadManifest,
} from '../../lib/downloads';

interface DownloadPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}

/**
 * 메인 CTA "앱 다운로드" 클릭 시 노출되는 popover.
 * OS별 설치 파일 목록을 보여주고, 각 row 클릭으로 다운로드.
 * url null 인 row는 disabled + "준비 중" 배지 (인프라 후속 plan 완료 전).
 */
export function DownloadPopover({ anchorRef, open, onClose }: DownloadPopoverProps) {
  const [manifest, setManifest] = useState<DownloadManifest | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // 1회만 fetch (placeholder는 즉시 반환되지만 추후 백엔드 fetch 대비)
  useEffect(() => {
    if (!open || manifest) return;
    let cancelled = false;
    void fetchDownloadManifest().then((m) => {
      if (!cancelled) setManifest(m);
    });
    return () => {
      cancelled = true;
    };
  }, [open, manifest]);

  // 외부 클릭 + ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, anchorRef, onClose]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="데스크탑 앱 다운로드"
      className="cta-download-popover"
    >
      <div className="cta-download-popover-header">
        <span className="cta-download-popover-title">Folio 데스크탑 앱</span>
        <span className="cta-download-popover-version">{manifest?.version ?? '…'}</span>
      </div>
      <ul className="cta-download-popover-list">
        {(manifest?.files ?? []).map((file, idx) => (
          <DownloadRow key={`${file.os}-${file.arch}-${idx}`} file={file} />
        ))}
      </ul>
    </div>
  );
}

function DownloadRow({ file }: { file: DownloadFile }) {
  const disabled = file.url == null;
  const sizeText = formatBytes(file.size);
  const label = file.label ?? `${osLabel(file.os)} (${file.arch})`;

  if (disabled) {
    return (
      <li className="cta-download-popover-row" data-disabled="true" aria-disabled="true">
        <span className="cta-download-popover-row-label">{label}</span>
        <span className="cta-download-popover-row-format">.{file.format}</span>
        <span className="cta-download-popover-row-pending">준비 중</span>
      </li>
    );
  }

  return (
    <li className="cta-download-popover-row">
      <a href={file.url!} download className="cta-download-popover-row-link">
        <span className="cta-download-popover-row-label">{label}</span>
        <span className="cta-download-popover-row-format">.{file.format}</span>
        {sizeText && <span className="cta-download-popover-row-size">{sizeText}</span>}
      </a>
    </li>
  );
}
