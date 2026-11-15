// npm run playbot [-- <scene> <careful|reckless|idle> <how many seeds>]
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.play.config.ts', '--disable-console-intercept', '--reporter=dot'], {
  stdio: 'inherit',
  env: { ...process.env, PLAYBOT: process.argv.slice(2).join(' ') },
});
process.exit(r.status ?? 1);
