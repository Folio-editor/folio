import type { AuxDocType } from '../types/workspace';

/**
 * 좌측 사이드바 → 우측 패널 전송을 위한 native drag 설정.
 *
 * `document.body`에 임시 요소를 붙여 `setDragImage()`로 지정하므로
 * 부모의 overflow 컨테이너에 의해 고스트가 클리핑되지 않는다.
 */
export function setupDragTransfer(
  e: React.DragEvent,
  docType: AuxDocType,
  docId: string,
  title: string,
) {
  e.dataTransfer.setData(
    'application/folio-doc',
    JSON.stringify({ docType, docId, title }),
  );
  e.dataTransfer.effectAllowed = 'copy';

  // 커스텀 드래그 이미지 — body에 붙여서 overflow 클리핑 회피
  const ghost = document.createElement('div');
  ghost.textContent = title || '(제목 없음)';
  ghost.style.cssText =
    'position:fixed;top:-9999px;left:-9999px;padding:4px 10px;border-radius:6px;font-size:12px;' +
    'background:var(--color-primary,#6366f1);color:white;white-space:nowrap;pointer-events:none;';
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 10, 10);
  requestAnimationFrame(() => document.body.removeChild(ghost));
}
