import { defineConfig } from 'vitest/config';

// Runs the test-course report (see test/play/course.ts). Kept out of the normal test run.
export default defineConfig({
  define: { __BUILD__: JSON.stringify('dev') },
  test: { environment: 'node', include: ['test/play/course.ts'], testTimeout: 1800000 },
});
