import http from 'node:http';
import { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT_MS = 5 * 60 * 1000; // 5분
let logoDataUri: string | null | undefined;
let inkShadowDataUri: string | null | undefined;
let quillShadowDataUri: string | null | undefined;

export interface OAuthServer {
  port: number;
  redirectUri: string;
  waitForCode: (expectedState: string) => Promise<string>;
  close: () => void;
}

/**
 * OAuth redirect를 받기 위한 임시 로컬 HTTP 서버.
 *
 * <p>Google은 Desktop 클라이언트에서 {@code http://localhost:{임의포트}}
 * 리다이렉트 URI를 모두 허용한다. 랜덤 포트로 기동 → code 수신 즉시 종료.
 */
export function startOAuthServer(): Promise<OAuthServer> {
  return new Promise((resolve, reject) => {
    let resolveCode: ((code: string) => void) | null = null;
    let rejectCode: ((err: Error) => void) | null = null;

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname !== '/callback') {
          res.writeHead(404).end();
          return;
        }
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          respondFailureHtml(
            res,
            '로그인 실패',
            error === 'access_denied'
              ? '로그인이 취소되었습니다'
              : '인증을 완료하지 못했습니다',
          );
          rejectCode?.(new Error(error));
          return;
        }
        if (!code || !state) {
          respondFailureHtml(res, '로그인 실패', '필수 인증 정보가 누락되었습니다');
          rejectCode?.(new Error('missing code or state'));
          return;
        }

        // state 검증은 waitForCode 호출자가 담당
        respondSuccessHtml(res);
        resolveCode?.(JSON.stringify({ code, state }));
      } catch (e) {
        rejectCode?.(e as Error);
      }
    });

    server.on('error', reject);

    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
      const redirectUri = `http://localhost:${port}/callback`;
      let timeout: NodeJS.Timeout | null = null;

      const waitForCode = (expectedState: string): Promise<string> =>
        new Promise((res, rej) => {
          resolveCode = (raw) => {
            const parsed = JSON.parse(raw) as { code: string; state: string };
            if (parsed.state !== expectedState) {
              rej(new Error('state mismatch'));
              close();
              return;
            }
            res(parsed.code);
            close();
          };
          rejectCode = (err) => {
            rej(err);
            close();
          };
          timeout = setTimeout(() => {
            rej(new Error('OAuth timeout'));
            close();
          }, TIMEOUT_MS);
        });

      const close = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        server.close();
      };

      resolve({ port, redirectUri, waitForCode, close });
    });
  });
}

function respondHtml(res: http.ServerResponse, message: string) {
  respondStatusHtml(res, {
    title: '로그인 실패',
    message,
    mark: '!',
    tone: 'failure',
  });
}

function respondSuccessHtml(res: http.ServerResponse) {
  respondStatusHtml(res, {
    title: '로그인 성공',
    message: '다시 작업 화면으로 돌아갑니다',
    mark: '✓',
    tone: 'success',
  });
}

function respondFailureHtml(res: http.ServerResponse, title: string, message: string) {
  respondStatusHtml(res, {
    title,
    message,
    mark: '!',
    tone: 'failure',
  });
}

function respondStatusHtml(
  res: http.ServerResponse,
  status: {
    title: string;
    message: string;
    mark: string;
    tone: 'success' | 'failure';
  },
) {
  const logo = getLogoDataUri();
  const inkShadow = getInkShadowDataUri();
  const quillShadow = getQuillShadowDataUri();
  const toneColor = status.tone === 'success' ? '#a01818' : '#8f6a48';
  const markColor =
    status.tone === 'success'
      ? 'rgba(160, 24, 24, 0.58)'
      : 'rgba(120, 89, 64, 0.68)';
  const markBorder =
    status.tone === 'success'
      ? 'rgba(160, 24, 24, 0.24)'
      : 'rgba(120, 89, 64, 0.28)';

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Folio</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            background:
              radial-gradient(circle at 50% 46%, rgba(199, 157, 121, 0.16), transparent 31%),
              radial-gradient(circle at 50% 55%, rgba(255, 255, 255, 0.86), transparent 42%),
              linear-gradient(180deg, #ffffff 0%, #fbfaf8 100%);
            color: #111111;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
            -webkit-font-smoothing: antialiased;
          }
          body::before {
            content: "";
            position: fixed;
            inset: 10px;
            z-index: 0;
            border-radius: 28px;
            background:
              radial-gradient(circle at 50% 44%, rgba(255, 255, 255, 0.72), transparent 34%),
              rgba(255, 255, 255, 0.38);
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.95),
              inset 0 -26px 70px rgba(80, 62, 48, 0.035),
              0 34px 110px rgba(48, 38, 30, 0.045);
            pointer-events: none;
            animation: panelIn 720ms ease-out both;
          }
          .decor-shadow {
            position: fixed;
            z-index: 0;
            pointer-events: none;
            user-select: none;
          }
          .quill-shadow {
            right: clamp(-84px, -5vw, -28px);
            bottom: clamp(-80px, -5vw, -32px);
            width: min(480px, 38vw);
            height: auto;
            opacity: 0.34;
            filter: blur(0.6px) saturate(0.72);
            mix-blend-mode: multiply;
            transform: rotate(-7deg);
          }
          .ink-shadow {
            left: clamp(8px, 5vw, 76px);
            bottom: clamp(-34px, 1vw, 18px);
            width: min(250px, 22vw);
            height: auto;
            opacity: 0.32;
            filter: blur(0.7px) saturate(0.7);
            mix-blend-mode: multiply;
            transform: rotate(4deg);
          }
          main {
            position: relative;
            z-index: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 18px;
            padding: 48px 24px;
            text-align: center;
            animation: windowIn 520ms cubic-bezier(0.16, 1, 0.3, 1) 40ms both;
          }
          .brand-glow {
            position: absolute;
            top: 50%;
            left: 50%;
            z-index: -1;
            width: min(760px, 98vw);
            height: auto;
            opacity: 0.055;
            filter: blur(10px);
            transform: translate(-50%, -58%);
            user-select: none;
          }
          .brand {
            width: min(460px, 76vw);
          }
          .brand-logo {
            display: block;
            width: 100%;
            height: auto;
            object-fit: contain;
            filter: drop-shadow(0 16px 24px rgba(17, 17, 17, 0.06));
          }
          .rule {
            position: relative;
            width: 118px;
            height: 1px;
            margin: 10px 0 2px;
            background: linear-gradient(90deg, transparent, ${toneColor} 18%, ${toneColor} 82%, transparent);
            opacity: 0.5;
          }
          .rule::after {
            content: "";
            position: absolute;
            top: -3px;
            right: 8px;
            width: 4px;
            height: 7px;
            border-radius: 999px;
            background: ${toneColor};
            opacity: 0.8;
          }
          .success-mark {
            display: grid;
            place-items: center;
            width: 38px;
            height: 38px;
            margin: 0 0 -2px;
            border: 1px solid ${markBorder};
            border-radius: 50%;
            color: ${markColor};
            font-size: 22px;
            line-height: 1;
          }
          .status {
            margin: 0;
            color: #141414;
            font-family: 'Noto Serif KR', 'Nanum Myeongjo', Georgia, serif;
            font-size: clamp(21px, 2.4vw, 28px);
            font-weight: 600;
            line-height: 1.2;
            letter-spacing: 0;
          }
          .message {
            margin: -7px 0 0;
            color: #6b6b6b;
            font-size: clamp(16px, 1.8vw, 18px);
            font-weight: 400;
            line-height: 1.6;
            letter-spacing: 0;
          }
          .fallback-logo {
            color: #343331;
            font-family: Georgia, "Times New Roman", serif;
            font-size: clamp(64px, 10vw, 118px);
            font-weight: 700;
            line-height: 0.9;
            letter-spacing: 0;
          }
          @keyframes windowIn {
            from {
              opacity: 0;
              transform: translateY(6px) scale(0.965);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes panelIn {
            from {
              opacity: 0;
              transform: scale(0.992);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        </style>
      </head>
      <body>
        ${quillShadow ? `<img class="decor-shadow quill-shadow" src="${quillShadow}" alt="" aria-hidden="true">` : ''}
        ${inkShadow ? `<img class="decor-shadow ink-shadow" src="${inkShadow}" alt="" aria-hidden="true">` : ''}
        <main>
          ${
            logo
              ? `<img class="brand-glow" src="${logo}" alt=""><div class="brand"><img class="brand-logo" src="${logo}" alt="Folio"></div>`
              : '<div class="fallback-logo" aria-label="Folio">Folio</div>'
          }
          <div class="rule" aria-hidden="true"></div>
          <div class="success-mark" aria-hidden="true">${status.mark}</div>
          <h1 class="status">${escapeHtml(status.title)}</h1>
          <p class="message">${escapeHtml(status.message)}</p>
        </main>
      </body>
    </html>
  `);
}

function getLogoDataUri(): string | null {
  if (logoDataUri !== undefined) return logoDataUri;

  const candidates = [
    path.join(__dirname, '../../resources/hero-title.png'),
    path.join(process.cwd(), 'resources/hero-title.png'),
    path.join(process.resourcesPath ?? '', 'resources/hero-title.png'),
    path.join(__dirname, '../../../landing/public/hero-title.png'),
    path.join(process.cwd(), '../landing/public/hero-title.png'),
    path.join(process.cwd(), 'landing/public/hero-title.png'),
    path.join(__dirname, '../../resources/folio.png'),
    path.join(process.cwd(), 'resources/folio.png'),
    path.join(process.resourcesPath ?? '', 'resources/folio.png'),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const data = fs.readFileSync(candidate).toString('base64');
      logoDataUri = `data:image/png;base64,${data}`;
      return logoDataUri;
    } catch {
      // Try the next known resource location.
    }
  }

  logoDataUri = null;
  return logoDataUri;
}

function getInkShadowDataUri(): string | null {
  if (inkShadowDataUri !== undefined) return inkShadowDataUri;

  inkShadowDataUri = getResourceDataUri('ink-shadow.png');
  return inkShadowDataUri;
}

function getQuillShadowDataUri(): string | null {
  if (quillShadowDataUri !== undefined) return quillShadowDataUri;

  quillShadowDataUri = getResourceDataUri('quill-shadow.png');
  return quillShadowDataUri;
}

function getResourceDataUri(filename: string): string | null {
  const candidates = [
    path.join(__dirname, '../../resources', filename),
    path.join(process.cwd(), 'resources', filename),
    path.join(process.resourcesPath ?? '', 'resources', filename),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const data = fs.readFileSync(candidate).toString('base64');
      return `data:image/png;base64,${data}`;
    } catch {
      // Try the next known resource location.
    }
  }

  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
