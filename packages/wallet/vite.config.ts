import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '',   // relative asset paths — required for Chrome extensions
  define: {
    global: 'globalThis',   // Taquito + Beacon SDK expect Node global
  },
  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@':    path.resolve(__dirname, './src'),
      buffer: 'buffer/',
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
  optimizeDeps: {
    include: ['buffer'],
    esbuildOptions: {
      define: {
        global: 'globalThis',  // same as top-level define but applied to pre-bundled deps
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup:   path.resolve(__dirname, 'popup.html'),
        approve: path.resolve(__dirname, 'approve.html'),
      },
    },
  },
});
