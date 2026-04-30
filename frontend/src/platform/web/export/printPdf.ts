// ============================================================
// 웹에서 PDF 추출 — 인쇄 다이얼로그를 띄워 사용자가 "PDF로 저장" 선택
// ============================================================
// hidden iframe을 사용한다(window.open은 popup blocker에 차단되기 쉬움).
// iframe.contentWindow.print() 호출 후 onafterprint로 정리.
// ============================================================

export function printHtmlInIframe(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        iframe.parentNode?.removeChild(iframe);
      } catch {
        /* ignore */
      }
      resolve();
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      win.addEventListener('afterprint', cleanup, { once: true });
      // afterprint를 fire하지 않는 브라우저 대비 — 60초 후 강제 정리
      setTimeout(cleanup, 60_000);
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
    };

    document.body.appendChild(iframe);

    // srcdoc 설정 — about:blank 후 document.write하는 방식보다 호환성 좋음
    iframe.srcdoc = html;
  });
}
