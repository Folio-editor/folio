// ============================================================
// Export IPC 핸들러 (Electron Main)
// ============================================================
// 채널:
//   export:run        — ExportRequest → ExportResult (저장 다이얼로그 + 변환 + fs.writeFile)
//   export:openInFolder — 저장된 파일이 있는 폴더 열기 (shell.openPath)
//
// 진행률 푸시는 1차에선 stage 단위 단순 알림(P1: 비율 % 푸시).
// ============================================================

import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Packer } from 'docx';
import { renderToFormat, sanitizeFileName } from '../../shared/export';
import type {
  ExportFormat,
  ExportRequest,
  ExportResult,
} from '../../shared/types/export';
import { htmlToPdfBuffer } from './pdfRenderer';

const FILTERS: Record<ExportFormat, Electron.FileFilter[]> = {
  txt: [{ name: 'Text Document (*.txt)', extensions: ['txt'] }],
  docx: [{ name: 'Word Document (*.docx)', extensions: ['docx'] }],
  pdf: [{ name: 'PDF Document (*.pdf)', extensions: ['pdf'] }],
};

function sendProgress(event: Electron.IpcMainInvokeEvent, stage: string) {
  event.sender.send('export:progress', { stage });
}

async function handleExportRun(
  event: Electron.IpcMainInvokeEvent,
  req: ExportRequest,
): Promise<ExportResult> {
  try {
    sendProgress(event, 'preparing');

    const baseName = sanitizeFileName(req.options.defaultFileName);
    const ext = req.format;
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;

    const saveResult = await dialog.showSaveDialog(win!, {
      title: '내보내기',
      defaultPath: `${baseName}.${ext}`,
      filters: FILTERS[req.format],
    });
    if (saveResult.canceled || !saveResult.filePath) {
      return { ok: false, cancelled: true };
    }

    sendProgress(event, 'rendering');
    const result = renderToFormat(req);

    sendProgress(event, 'writing');
    let outputPath = saveResult.filePath;
    if (!outputPath.toLowerCase().endsWith(`.${ext}`)) {
      outputPath += `.${ext}`;
    }

    switch (result.format) {
      case 'txt':
        await fs.writeFile(outputPath, result.text, 'utf8');
        break;
      case 'docx': {
        const buf = await Packer.toBuffer(result.document);
        await fs.writeFile(outputPath, buf);
        break;
      }
      case 'pdf': {
        const buf = await htmlToPdfBuffer(result.html, {
          pageSize: req.options.pageSize,
        });
        await fs.writeFile(outputPath, buf);
        break;
      }
    }

    sendProgress(event, 'done');
    return { ok: true, path: outputPath };
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류';
    console.error('[main/export] 추출 실패:', e);
    return { ok: false, error: `내보내기에 실패했습니다: ${message}` };
  }
}

export function registerExportHandlers(): void {
  ipcMain.handle('export:run', (event, req: ExportRequest) =>
    handleExportRun(event, req),
  );
  ipcMain.handle('export:openInFolder', async (_event, filePath: string) => {
    if (!filePath) return;
    const dir = path.dirname(filePath);
    await shell.openPath(dir);
  });
}
