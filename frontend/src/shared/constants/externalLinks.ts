// 외부 링크 — 설문/버그 리포트 Google Form. TitleBar / AboutSettings 양쪽에서 공유.
export const FEEDBACK_LINKS = {
  survey:
    'https://docs.google.com/forms/d/e/1FAIpQLSf04M_0EtvE6YwcBEFMywwHbeD7-D-bVogYFFFL6mz1dYZnuA/viewform',
  bug:
    'https://docs.google.com/forms/d/e/1FAIpQLSfcgHC4kKn6zw7mPHu-CNSS_LnpBtgvdoabhTrcDodKaY-_Gg/viewform',
} as const;

/** 안전하게 외부 링크 열기 — Electron / Web 양쪽에서 동작. */
export function openExternalLink(url: string): void {
  void window.folio?.window.openExternal(url);
}
