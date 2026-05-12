import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  root: 'src/web',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@platform': path.resolve(__dirname, 'src/platform'),
    },
    // React/Zustand 단일 인스턴스 강제 — @powersync/react 등 sub-dep가 별도 React를
    // 로드해 "Invalid hook call (more than one copy of React)" 발생 차단.
    // ProseMirror (TipTap): selection class 가 전역 JSON ID 레지스트리에 자기 자신을
    // 등록하므로 같은 패키지가 두 번 로드되면 "Duplicate use of selection JSON ID gapcursor"
    // RangeError. dedupe 로 단일 인스턴스 보장.
    dedupe: [
      'react', 'react-dom', 'zustand',
      'prosemirror-state', 'prosemirror-view', 'prosemirror-model',
      'prosemirror-transform', 'prosemirror-commands', 'prosemirror-keymap',
      'prosemirror-gapcursor', 'prosemirror-dropcursor', 'prosemirror-history',
      'prosemirror-schema-list', 'prosemirror-inputrules',
      '@tiptap/core', '@tiptap/pm', '@tiptap/react',
    ],
  },
  // 운영 nginx는 /editor path에 에디터를 배치 (nginx.conf:94).
  // dev는 localhost:5173 root → '/'.
  base: mode === 'production' ? '/editor/' : '/',
  // PowerSync 공식 vite 가이드:
  // - @powersync/web과 @journeyapps/wa-sqlite만 exclude (SharedWorker + WASM이라 vite optimize 불가)
  // - @powersync/react는 exclude하지 않음 (React를 vite가 dedupe해야 hook 호출 성공)
  // - js-logger는 nested include로 명시 (powersync 의존성 안의 deep ESM 처리)
  optimizeDeps: {
    exclude: ['@powersync/web', '@journeyapps/wa-sqlite'],
    include: [
      '@powersync/web > js-logger',
      // 같은 prebundle 청크로 묶어 단일 인스턴스 유도.
      // ⚠ @tiptap/pm 은 namespace-only 패키지 (subpath 만, 루트 entry 없음) — include 불가.
      // dedupe 만으로 단일 인스턴스 보장 충분.
      'prosemirror-state',
      'prosemirror-view',
      'prosemirror-model',
      'prosemirror-gapcursor',
      '@tiptap/core',
      '@tiptap/react',
      '@tiptap/starter-kit',
    ],
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // 5173 점유 시 자동 fallback (5174→5175→...) 차단.
    // 다른 포트 = 다른 origin = 다른 IndexedDB → KEK material/게스트ID/SQLite 가
    // origin 별로 분리되어 "두 계정 공존" 처럼 보이는 문제 방지.
    strictPort: true,
  },
}));
