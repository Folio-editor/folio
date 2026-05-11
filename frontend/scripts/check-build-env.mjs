#!/usr/bin/env node
// 데스크탑/웹 production 빌드 시점 필수 VITE_* env 사전 검증.
//
// electron-vite/vite 는 import.meta.env.VITE_* 를 ★빌드 명령 실행 시점★ 의
// process.env 에서 inline 한다. Doppler 없이 `pnpm build:win` 만 돌리면
// PortOne 변수가 빈 문자열로 inline 되어 production 데스크탑 앱에서 결제가 깨진다.
//
// 이 스크립트는 build 직전에 필수 변수를 점검해 명시적 실패시킨다.

const REQUIRED = [
  'VITE_API_URL',
  'VITE_GOOGLE_DESKTOP_CLIENT_ID',
  'VITE_PORTONE_STORE_ID',
  'VITE_PORTONE_CHANNEL_KEY_ONETIME',
  'VITE_PORTONE_CHANNEL_KEY_BILLING',
];

const missing = REQUIRED.filter((k) => !process.env[k] || !String(process.env[k]).trim());
if (missing.length === 0) {
  console.log('[check-build-env] OK — 필수 VITE_* 모두 주입됨');
  process.exit(0);
}

console.error('\n[check-build-env] ❌ 빌드 차단 — 필수 VITE_* 변수 누락:');
for (const k of missing) console.error(`    - ${k}`);
console.error('\n원인: 빌드를 Doppler 없이 실행하면 환경변수가 inline 안 된다.');
console.error('해결: 빌드 명령을 Doppler 래핑 — 예시:');
console.error('    doppler run -- pnpm build:win');
console.error('    doppler run -- pnpm build:web');
console.error('또는 위 변수들을 셸 환경에 직접 export 후 재시도.\n');
process.exit(1);
