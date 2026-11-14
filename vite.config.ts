import { defineConfig } from 'vitest/config';

// Relative base so the build works under any GitHub Pages repo path.
export default defineConfig({
  base: './',
  // Short commit id, so feedback can be matched to the build it was given on.
  define: { __BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)) },
  build: { target: 'es2022', chunkSizeWarningLimit: 8000 },
  test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 60000 },
});
