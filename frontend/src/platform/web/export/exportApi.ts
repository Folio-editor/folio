// ============================================================
// Web FolioExportApi 구현
// ============================================================
// 변환은 브라우저 메모리에서 수행하고, 결과는 Blob 다운로드 또는
// hidden iframe + window.print()으로 사용자에게 전달한다.
//
// 사용자 제스처 컨텍스트 보장:
//   호출처(ExportDialog)는 모달의 "내보내기" 버튼 onClick 직속에서
//   run()을 await 없이 호출해 Safari의 다운로드 차단을 피한다.
// ============================================================

import { Packer } from 'docx';
import {
  renderToFormat,
  sanitizeFileName,
} from '../../../shared/export';
import type {
  ExportProgress,
  ExportRequest,
  ExportResult,
  FolioExportApi,
} from '../../../shared/types/export';
import { downloadBlob, downloadString } from './blobDownload';
import { printHtmlInIframe } from './printPdf';

export function createWebExportApi(): FolioExportApi {
  return {
    run: async (req: ExportRequest): Promise<ExportResult> => {
      try {
        const baseName = sanitizeFileName(req.options.defaultFileName);
        const result = renderToFormat(req);

        switch (result.format) {
          case 'txt':
            downloadString(result.text, `${baseName}.txt`, 'text/plain');
            return { ok: true };
          case 'docx': {
            const blob = await Packer.toBlob(result.document);
            downloadBlob(blob, `${baseName}.docx`);
            return { ok: true };
          }
          case 'pdf':
            await printHtmlInIframe(result.html);
            return { ok: true };
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : '알 수 없는 오류';
        console.error('[web/export] 추출 실패:', e);
        return { ok: false, error: `내보내기에 실패했습니다: ${message}` };
      }
    },

    onProgress: (_callback: (p: ExportProgress) => void) => {
      // 웹은 동기 변환이라 진행률 푸시 안 함. 1차에선 stub.
      return () => {};
    },

    openInFolder: async (_path: string) => {
      // 웹은 사용자가 다운로드 위치를 알 수 없음. no-op.
    },
  };
}
