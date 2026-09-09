import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

export default defineConfig({
  root: here,
  plugins: [react()],

  // The .env files live at the repo root, not inside apps/web.
  envDir: repoRoot,

  resolve: {
    alias: {
      // Lets the UI import the same validation and cadence rules the API uses.
      '@shared': resolve(repoRoot, 'shared'),
    },
  },

  server: {
    port: 5173,
    fs: {
      // shared/ sits outside apps/web, so Vite needs permission to read it.
      allow: [repoRoot],
    },
    proxy: {
      // In development the API runs separately on port 3001. This proxy makes
      // it reachable at /api, exactly as it will be in production on Vercel --
      // so the frontend code is identical in both places, and there is no CORS
      // to configure.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
