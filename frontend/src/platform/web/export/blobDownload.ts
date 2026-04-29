// ============================================================
// Blob → 다운로드 트리거 (브라우저 전용)
// ============================================================
// Safari가 Object URL 다운로드를 사용자 제스처 컨텍스트(클릭 핸들러 직속)에서만
// 허용하므로, 호출처가 클릭 핸들러 안에서 await 없이 즉시 호출하도록 한다.
// ============================================================

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  // Safari/Firefox에서 일부 케이스에 a.click()이 무시되는 것을 막기 위해 DOM에 잠깐 붙임
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // revoke는 다음 tick에 — Chrome 일부 버전에서 즉시 revoke하면 다운로드가 끊김
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadString(text: string, fileName: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  downloadBlob(blob, fileName);
}
