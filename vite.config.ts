import { defineConfig } from 'vitest/config';

// Relative base so the build works under any GitHub Pages repo path.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 8000 },
  test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 60000 },
});
