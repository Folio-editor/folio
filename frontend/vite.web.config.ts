import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/web',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@platform': path.resolve(__dirname, 'src/platform'),
    },
  },
  // PowerSync(@powersync/web)는 SharedWorker를 사용하며 code-splitting과 함께 쓰려면
  // worker.format='es' 필수 (UMD/IIFE는 split 빌드 미지원).
  worker: {
    format: 'es',
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
