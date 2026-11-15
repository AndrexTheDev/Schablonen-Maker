import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Basis-Pfad ist relativ ("file://" in Electron, Proxy-Preview im Browser).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Der Live-Preview-Host der Sandbox ist ein fremder Hostname -> erlauben.
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          jspdf: ['jspdf'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as any);
