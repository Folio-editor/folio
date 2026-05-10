// 외부 링크 — 설문/버그 리포트 Google Form. TitleBar / AboutSettings 양쪽에서 공유.
export const FEEDBACK_LINKS = {
  survey:
    'https://docs.google.com/forms/d/e/1FAIpQLSf04M_0EtvE6YwcBEFMywwHbeD7-D-bVogYFFFL6mz1dYZnuA/viewform',
  bug:
    'https://docs.google.com/forms/d/e/1FAIpQLSfcgHC4kKn6zw7mPHu-CNSS_LnpBtgvdoabhTrcDodKaY-_Gg/viewform',
} as const;

/**
 * 안전하게 외부 링크 열기 — Electron / Web 양쪽에서 동작.
 *
 * 우선순위:
 *   1) window.folio.window.openExternal (Electron preload IPC → main shell.openExternal)
 *   2) window.open(url, '_blank') — main 의 setWindowOpenHandler 가 가로채 shell.openExternal 위임
 *      (Electron preload 가 아직 새 함수 안 보일 때 — dev 재시작 전 — 폴백)
 */
export function openExternalLink(url: string): void {
  const folioOpen = window.folio?.window?.openExternal;
  if (typeof folioOpen === 'function') {
    void folioOpen(url).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('[openExternalLink] folio IPC failed, falling back to window.open', e);
      window.open(url, '_blank', 'noopener,noreferrer');
    });
    return;
  }
  // preload 에 openExternal 가 아직 없는 환경 (앱 재시작 필요한 dev) — window.open 폴백.
  // main 의 setWindowOpenHandler 가 http/https 를 shell.openExternal 로 위임.
  // eslint-disable-next-line no-console
  console.warn(
    '[openExternalLink] window.folio.window.openExternal 누락 — Electron 재시작 후 IPC 경로 사용 권장. window.open 폴백 시도.',
  );
  window.open(url, '_blank', 'noopener,noreferrer');
}
