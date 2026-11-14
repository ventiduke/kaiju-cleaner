// npm run feel [-- path/to/session-or-settings.json]
import { spawnSync } from 'node:child_process';

const file = process.argv[2];
const r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.feel.config.ts', '--disable-console-intercept', '--reporter=dot'], {
  stdio: 'inherit',
  env: { ...process.env, ...(file ? { FEEL_FILE: file } : {}) },
});
process.exit(r.status ?? 1);
