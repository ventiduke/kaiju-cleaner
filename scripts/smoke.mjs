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

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
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

  // The mouse. The Runner captures it, which hides the pointer, so the game must give it back:
  // on Esc, on Tab, when the dials are opened, and when a run ends and its results card needs
  // clicking. (A playtester was left with no pointer and a card of buttons he could not press.)
  {
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${PORT}/?scene=run`);
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 30000 });
    const held = () => page.evaluate(() => !!document.pointerLockElement);
    const says = () => page.evaluate(() => document.getElementById('mousechip').textContent);
    const wrong = [];
    const expect = async (what, want) => {
      try {
        await page.waitForFunction((w) => !!document.pointerLockElement === w, want, { timeout: 15000 });
      } catch {
        wrong.push(`${what}: the mouse should be ${want ? 'captured' : 'free'}`);
      }
    };
    const click = () => page.mouse.click(300, 250);
    await click();
    await expect('a click on the game', true);
    await page.waitForFunction(() => /free it/.test(document.getElementById('mousechip').textContent), null, { timeout: 15000 }).catch(() => wrong.push('captured, the screen should say how to free it'));
    await page.keyboard.press('Escape');
    await expect('Esc', false);
    await click();
    await expect('a second click', true);
    // (A click while it is captured is an ordinary click, and used to throw an error.)
    await click();
    await page.keyboard.press('Tab');
    await expect('Tab', false);
    await page.keyboard.press('Tab');
    await expect('Tab again', true);
    await page.keyboard.press('Backquote');
    await expect('opening the dials', false);
    await page.keyboard.press('Backquote');
    await click();
    await expect('a click after the dials', true);
    // Finish the run by carrying the kaiju through each gate in turn.
    await page.evaluate(async () => {
      const g = window.__game;
      const course = g.sim.parts.course;
      for (let n = 0; n < 40 && course.state !== 'done'; n++) {
        const gate = course.next();
        if (!gate) break;
        const p = g.kaiju.position();
        for (const b of [g.kaiju.body, ...g.kaiju.tail.segments]) {
          const q = b.translation();
          b.setTranslation({ x: q.x + gate.x - p.x, y: q.y, z: q.z + gate.z - p.z }, true);
        }
        await new Promise((r) => setTimeout(r, 700));
      }
    });
    await expect('the end of the run', false);
    await page.waitForSelector('.ch-card', { timeout: 15000 }).catch(() => wrong.push('no results card at the end of the run'));
    await click();
    await page.waitForTimeout(800);
    if (await held()) wrong.push('a click beside the results card took the mouse again');
    const problems = [...wrong, ...errors];
    console.log('mouse', JSON.stringify({ held: await held(), says: await says() }), problems.length ? 'PROBLEMS: ' + problems.join(' | ') : 'ok');
    if (problems.length) failed = true;
    await page.close();
  }
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {}
}
process.exit(failed ? 1 : 0);
