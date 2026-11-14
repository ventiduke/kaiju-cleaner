// Dev helper: boot a scene headless, run a snippet against window.__game, save a screenshot.
// Usage: node scripts/shot.mjs <scene> <out.png> '<js body using g>' [width] [height]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [scene = 'city', out = 'scripts/out/shot.png', code = '', w = '1280', h = '720'] = process.argv.slice(2);
mkdirSync(dirname(out), { recursive: true });
const PORT = 4180 + Math.floor(Math.random() * 500);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  setTimeout(() => reject(new Error('preview server did not start')), 20000);
});
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
  await page.goto(`http://localhost:${PORT}/?scene=${scene}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 30000 });
  const result = await page.evaluate((body) => {
    const g = window.__game;
    g.loop.paused = true;
    return new Function('g', 'THREE', body)(g, g.THREE);
  }, code);
  if (result !== undefined) console.log(JSON.stringify(result));
  process.stdout.write('');
  await page.waitForTimeout(700);
  await page.screenshot({ path: out });
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {}
}
