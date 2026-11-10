import { defineConfig } from 'vite';

export default defineConfig({
  base: '/sodate-club/',
  build: { target: 'es2020', outDir: 'dist' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as any);
