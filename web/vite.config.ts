import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    // Smart TVs run old Chromium: Tizen 2020 is Chromium 76, webOS 5 is 68 and
    // webOS 4 is 53. Targeting these keeps the bundle free of syntax that would
    // throw a blank screen on a television.
    target: ['chrome61', 'safari11.1', 'firefox60', 'edge79'],
    cssTarget: ['chrome61', 'safari11.1'],
    modulePreload: { polyfill: true },
    assetsInlineLimit: 2048,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
});
