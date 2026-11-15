import { defineConfig } from 'vitest/config';

// Runs the playtest bot report (see test/play/report.ts). Kept out of the normal test run.
export default defineConfig({
  define: { __BUILD__: JSON.stringify('dev') },
  test: { environment: 'node', include: ['test/play/report.ts'], testTimeout: 1800000 },
});
