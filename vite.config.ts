import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Electron 빌드는 dist/(file:// 로드), 웹 미리보기는 dist-web/ 단일 HTML.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'web' ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === 'web' ? 'dist-web' : 'dist', emptyOutDir: true },
}));
