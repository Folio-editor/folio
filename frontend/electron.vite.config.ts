import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// electron-vite는 envPrefix 기본값이 'VITE_'이며 main/preload/renderer 모두에
// import.meta.env.VITE_* 자동 치환을 제공한다. 추가로 main에서는
// process.env.VITE_* 도 빌드 시점에 정적으로 주입해 기존 코드(googleOAuth 등)가
// 그대로 동작하도록 호환을 유지한다. Doppler에서 export 된 process.env가
// 빌드 타임에 들어와 그대로 박힌다.
const mainDefine = {
  'process.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL),
  'process.env.VITE_GOOGLE_DESKTOP_CLIENT_ID': JSON.stringify(
    process.env.VITE_GOOGLE_DESKTOP_CLIENT_ID,
  ),
};

export default defineConfig({
  main: {
    define: mainDefine,
    build: {
      lib: {
        entry: 'src/main/index.ts',
      },
    },
  },
  preload: {
    build: {
      lib: {
        entry: 'src/main/preload.ts',
      },
    },
  },
  // renderer root는 frontend/ — index.html이 여기에 있고 src/renderer/index.tsx 를 import.
  // electron-vite 기본값(src/renderer)을 덮어쓰는 명시적 설정.
  renderer: {
    root: '.',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@platform': path.resolve(__dirname, 'src/platform'),
      },
    },
    optimizeDeps: {
      exclude: ['@powersync/web'],
    },
    worker: {
      format: 'es',
    },
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
      },
    },
  },
});
