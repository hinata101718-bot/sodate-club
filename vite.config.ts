import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync } from 'fs';

/* 組み立てた時刻を版の印にする。公開ページに version.json を置き、遊んでいる画面が古いと気づけるようにする（感想25） */
const BUILD = new Date().toISOString();
export default defineConfig({
  base: '/sodate-club/',
  define: { __BUILD__: JSON.stringify(BUILD) },
  build: { target: 'es2020', outDir: 'dist' },
  plugins: [{ name: 'version-json', closeBundle() { mkdirSync('dist', { recursive: true }); writeFileSync('dist/version.json', JSON.stringify({ build: BUILD })); } }],
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as any);
