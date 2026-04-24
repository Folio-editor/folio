import { defineConfig } from 'vite';

// https://vitejs.dev/config
// Main 프로세스는 import.meta.env 자동 치환이 안 되므로
// process.env.VITE_* 를 빌드 시점에 define으로 주입한다.
export default defineConfig({
  define: {
    'process.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL),
    'process.env.VITE_GOOGLE_DESKTOP_CLIENT_ID': JSON.stringify(
      process.env.VITE_GOOGLE_DESKTOP_CLIENT_ID,
    ),
  },
});
