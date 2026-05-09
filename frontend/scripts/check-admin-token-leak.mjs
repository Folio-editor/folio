#!/usr/bin/env node
/**
 * 빌드 산출물에 VITE_ADMIN_API_TOKEN 값이 평문으로 박혀있는지 검증.
 *
 * 일반 사용자에게 배포되는 빌드(웹 정식 빌드, electron 사용자 빌드)에는
 * 토큰이 들어가서는 안 된다. 운영자 PC 의 dev 모드 (pnpm dev / pnpm dev:web) 에서만
 * 환경변수가 실제로 주입되어야 한다.
 *
 * Vite 는 VITE_* 환경변수를 빌드 시점에 정적 치환하므로, 산출물 JS 파일에
 * 토큰 문자열이 그대로 박힌다 (= 누구나 추출 가능).
 *
 * 사용:
 *   node scripts/check-admin-token-leak.mjs <build-dir>
 *
 * 예:
 *   node scripts/check-admin-token-leak.mjs dist-web
 *   node scripts/check-admin-token-leak.mjs out
 *
 * exit code:
 *   0 — 누출 없음 (또는 환경변수 미설정 — 이 경우 검증 스킵)
 *   1 — 누출 감지
 *   2 — 인자 오류 / 빌드 디렉터리 없음
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import process from 'node:process';

const TOKEN_ENV = 'VITE_ADMIN_API_TOKEN';
const SCAN_EXTS = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.json', '.map']);

function red(s) {
  return process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s;
}
function green(s) {
  return process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s;
}
function yellow(s) {
  return process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) yield* walk(full);
    else if (s.isFile()) yield full;
  }
}

const buildDir = process.argv[2];
if (!buildDir) {
  console.error('Usage: node check-admin-token-leak.mjs <build-dir>');
  process.exit(2);
}

const root = resolve(buildDir);
try {
  if (!statSync(root).isDirectory()) throw new Error('not a dir');
} catch {
  console.error(`[admin-token-leak] build dir not found: ${root}`);
  process.exit(2);
}

const token = (process.env[TOKEN_ENV] ?? '').trim();
if (!token) {
  // 토큰 미설정 = 일반 사용자 빌드 / CI 빌드. 검증할 토큰 없음 = 누출 불가능.
  // 정상 케이스 — 메뉴는 자동으로 숨겨진다.
  console.log(green(`[admin-token-leak] ✓ ${TOKEN_ENV} not set — token cannot leak (general build).`));
  process.exit(0);
}
if (token.length < 16) {
  // 짧은 토큰은 false-positive 위험 (다른 문자열에 우연히 일치).
  // 운영자 토큰은 32+ 자라 실수 가능성 차단.
  console.error(red(`[admin-token-leak] ✗ ${TOKEN_ENV} too short (len=${token.length}). 32+ bytes 권장.`));
  process.exit(2);
}

console.log(`[admin-token-leak] scanning ${root} for ${TOKEN_ENV} (len=${token.length})...`);
const matches = [];
for (const file of walk(root)) {
  const ext = extname(file).toLowerCase();
  if (!SCAN_EXTS.has(ext)) continue;
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue; // 바이너리 등
  }
  if (content.includes(token)) {
    matches.push(file.replace(root, '<build>'));
  }
}

if (matches.length === 0) {
  console.log(green('[admin-token-leak] ✓ no leak detected.'));
  process.exit(0);
}

console.error(red(`[admin-token-leak] ✗ TOKEN LEAK DETECTED in ${matches.length} file(s):`));
for (const m of matches) console.error(red('  - ' + m));
console.error('');
console.error(yellow('이 빌드는 일반 사용자에게 배포하면 안 됩니다. 다음 중 하나로 처리하세요:'));
console.error(yellow('  1) 운영자 본인 PC 에서만 사용 (배포 X) — pnpm dev / pnpm dev:web'));
console.error(yellow('  2) 빌드 환경에서 ' + TOKEN_ENV + ' 환경변수를 unset 하고 재빌드'));
console.error(yellow('  3) Phase B (Writer.role JWT) 완성 후엔 이 변수 자체를 삭제'));
process.exit(1);
