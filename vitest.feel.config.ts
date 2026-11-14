import { defineConfig } from 'vitest/config';

// Runs the feel report (see test/feel/report.ts). Kept out of the normal test run.
export default defineConfig({
  define: { __BUILD__: JSON.stringify('dev') },
  test: { environment: 'node', include: ['test/feel/report.ts'], testTimeout: 600000 },
});
