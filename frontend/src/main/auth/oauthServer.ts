import http from 'node:http';
import { AddressInfo } from 'node:net';

const TIMEOUT_MS = 5 * 60 * 1000; // 5분

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
          respondHtml(res, `로그인이 취소되었습니다: ${error}`);
          rejectCode?.(new Error(error));
          return;
        }
        if (!code || !state) {
          respondHtml(res, '필수 파라미터가 누락되었습니다.');
          rejectCode?.(new Error('missing code or state'));
          return;
        }

        // state 검증은 waitForCode 호출자가 담당
        respondHtml(res, '로그인 성공! 이 창을 닫고 앱으로 돌아가세요.');
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
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!doctype html>
    <html lang="ko">
      <head><meta charset="utf-8"><title>Folio</title></head>
      <body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;">
        <div style="text-align:center;">
          <h2>${message}</h2>
        </div>
      </body>
    </html>
  `);
}
