// npm run course [-- <style 0|1|2> <careful|flatout>]   or   npm run course -- settings.json
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.course.config.ts', '--disable-console-intercept', '--reporter=dot'], {
  stdio: 'inherit',
  env: { ...process.env, COURSE: process.argv.slice(2).join(' ') },
});
process.exit(r.status ?? 1);
