import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@ds': fileURLToPath(new URL('../../design-system', import.meta.url)),
    },
  },
  server: { fs: { allow: ['../..'] } },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
  },
} as any);
