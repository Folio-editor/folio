// ============================================================
// HTML → PDF Buffer (Electron Main 전용)
// ============================================================
// 숨긴 BrowserWindow에 인쇄용 HTML을 로드하고 webContents.printToPDF로 변환.
// 5MB 미만 HTML은 data URL, 그 이상은 임시 파일 경로 사용.
// ============================================================

import { BrowserWindow, app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA_URL_LIMIT_BYTES = 5 * 1024 * 1024;

export interface PrintToPdfOptions {
  pageSize: 'A4' | 'Letter';
}

export async function htmlToPdfBuffer(
  html: string,
  options: PrintToPdfOptions,
): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      javascript: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  let tempFile: string | null = null;
  try {
    const sizeBytes = Buffer.byteLength(html, 'utf8');
    if (sizeBytes < DATA_URL_LIMIT_BYTES) {
      const dataUrl =
        'data:text/html;charset=utf-8;base64,' +
        Buffer.from(html, 'utf8').toString('base64');
      await win.loadURL(dataUrl);
    } else {
      tempFile = path.join(app.getPath('temp'), `folio-export-${randomUUID()}.html`);
      await fs.writeFile(tempFile, html, 'utf8');
      await win.loadFile(tempFile);
    }

    // 외부 이미지/폰트가 있더라도 결정론적 변환을 위해 짧게 대기
    await delay(150);

    const pdfBuf = await win.webContents.printToPDF({
      pageSize: options.pageSize,
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:9px;width:100%;text-align:center;color:#666;">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      printBackground: false,
      landscape: false,
    });
    return pdfBuf;
  } finally {
    if (!win.isDestroyed()) win.destroy();
    if (tempFile) {
      try {
        await fs.unlink(tempFile);
      } catch {
        /* ignore */
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
