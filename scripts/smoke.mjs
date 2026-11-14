// Boots the built game in headless Chromium, checks it starts without errors,
// and saves a screenshot per scene to scripts/out/. Usage: npm run build && npm run smoke
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Install it (npm i -D playwright) or run in an environment that has it.');
  process.exit(2);
}

const PORT = 4179;
const scenes = (process.argv[2] ?? 'yard,city').split(',');
const settleSteps = Number(process.argv[3] ?? 240);
mkdirSync('scripts/out', { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  server.on('exit', (code) => reject(new Error('preview server exited: ' + code)));
  setTimeout(() => reject(new Error('preview server did not start')), 20000);
});

let failed = false;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const scene of scenes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`http://localhost:${PORT}/?scene=${scene}`);
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 30000 });
    // Software GL is slow, so drive the sim directly instead of waiting on wall-clock time.
    const info = await page.evaluate((n) => {
      const g = window.__game;
      g.loop.paused = true;
      g.sim.run(n);
      return { tick: g.sim.tick, stepMs: g.sim.lastStepMs, ...g.sim.counts() };
    }, settleSteps);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `scripts/out/${scene}.png` });
    console.log(scene, JSON.stringify(info), errors.length ? 'ERRORS: ' + errors.join(' | ') : 'ok');
    if (errors.length) failed = true;
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
