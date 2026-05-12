import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, '../shared-src'),
  publicDir: path.resolve(__dirname, '../shared-src/public'),
  plugins: [react()],
  server: {
    port: 3002,
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/App.tsx',
        './src/components/*.tsx',
        './src/pages/*.tsx',
      ],
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
  cacheDir: path.resolve(__dirname, 'node_modules/.vite'),
});
