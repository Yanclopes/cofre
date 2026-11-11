import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // amazon-cognito-identity-js referencia "global" (herança do Node).
  define: { global: 'globalThis' },
  build: { sourcemap: false, outDir: 'dist' },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
