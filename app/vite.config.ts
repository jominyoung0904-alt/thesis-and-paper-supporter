import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Renderer build config. Main process is compiled separately via tsc
// (see tsconfig.main.json / npm run build:main).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
});
