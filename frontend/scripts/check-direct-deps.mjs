#!/usr/bin/env node
// ============================================================
// 직접 의존성 누락 사전 검사
// ============================================================
// 코드에서 import되는 외부 패키지가 모두 package.json의 dependencies/
// devDependencies에 직접 등록되었는지 확인.
//
// 동기: pnpm은 transitive 의존성을 hoist하지 않아 (--frozen-lockfile + Docker
// 빌드 환경) 직접 등록 안 된 패키지 import는 빌드 시점에 실패한다.
// 로컬 dev에선 dependency tree 구조 우연으로 동작할 수 있어 사람 눈으론 못 잡음.
//
// 사용:
//   node scripts/check-direct-deps.mjs
//   exit 0: OK / exit 1: 누락 발견
//
// CI에서는 build:web/build:win 전에 이 스크립트를 실행해 사전 차단.
// ============================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);

const SRC_DIRS = [join(ROOT, 'src')];
const PACKAGE_JSON = join(ROOT, 'package.json');

// 빌드러너 빌트인 / 노드 빌트인 / TypeScript types만 등은 검사 제외
const BUILTIN_PREFIXES = ['node:', 'electron'];
const ALLOWED_TYPE_ONLY = new Set([
  // type-only import이지만 런타임에서도 안 쓰는 패턴이면 추가
]);

// 상대/절대 경로 import는 외부 패키지 아님
function isExternalSpec(spec) {
  if (!spec || typeof spec !== 'string') return false;
  if (spec.startsWith('.') || spec.startsWith('/')) return false;
  if (spec.startsWith('virtual:')) return false;
  return true;
}

// "@scope/pkg/sub/path" → "@scope/pkg"
// "pkg/sub/path" → "pkg"
function rootPackageName(spec) {
  const parts = spec.split('/');
  if (spec.startsWith('@')) {
    return parts.slice(0, 2).join('/');
  }
  return parts[0];
}

const importRegex = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function collectImports(file, set) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(importRegex)) {
    const spec = match[1] ?? match[2];
    if (!isExternalSpec(spec)) continue;
    const root = rootPackageName(spec);
    if (BUILTIN_PREFIXES.some((p) => root.startsWith(p))) continue;
    if (ALLOWED_TYPE_ONLY.has(root)) continue;
    set.add(root);
  }
}

function walk(dir, set) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) {
      walk(path, set);
    } else if (/\.(ts|tsx|mts|js|jsx|mjs)$/.test(entry)) {
      collectImports(path, set);
    }
  }
}

const used = new Set();
for (const dir of SRC_DIRS) walk(dir, used);

const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
]);

const missing = [...used].filter((p) => !declared.has(p)).sort();

if (missing.length > 0) {
  console.error(
    '\n[check-direct-deps] 다음 패키지가 코드에서 import되지만 package.json에 직접 등록되지 않았습니다:',
  );
  for (const m of missing) console.error(`  - ${m}`);
  console.error(
    '\n  → 빌드 환경(pnpm --frozen-lockfile + Docker)에서 unresolved 오류로 빌드 실패합니다.',
  );
  console.error('  → 다음으로 추가:');
  console.error(`     pnpm add ${missing.join(' ')}\n`);
  process.exit(1);
}

console.log(
  `[check-direct-deps] OK — 사용 중인 외부 패키지 ${used.size}개 모두 package.json에 등록됨.`,
);
