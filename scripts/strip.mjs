// Dev helper: a filmstrip of the built game. One page, the simulation stepped a few ticks between
// pictures, all of them on one sheet, so that a movement (a stride, a turn, a slide) can be read
// frame by frame. A single screenshot cannot show whether something moves well.
//
//   npm run build && node scripts/strip.mjs <name> <scene> '<setup>' [frames=9] [ticks between=5] [view=1.4]
//
//   name    written to scripts/out/<name>.png; the state at each frame is printed
//   scene   plane | run | course | city | yard   (on plane, the kaiju is made the Runner)
//   setup   body of a function (g, hold, run): g is window.__game, hold('thrust', 1) keeps an input
//           held, run(seconds) steps the simulation. Runs once, before the first frame.
//   view    where the camera sits: an angle round from behind the kaiju in radians (1.4 is side on),
//           or "behind" to leave the camera where the player would have it
//
//   node scripts/strip.mjs turn plane "hold('look',g.kaiju.yaw); hold('thrust',1); hold('sprint',true); run(2); hold('thrust',0); hold('strafe',1)" 9 5 behind
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [name, scene = 'plane', setup = '', framesArg, gapArg, viewArg] = process.argv.slice(2);
if (!name) {
  console.error("usage: node scripts/strip.mjs <name> <scene> '<setup>' [frames] [ticks between] [view angle | behind]");
  process.exit(2);
}
const frames = Number(framesArg ?? 9);
const gap = Number(gapArg ?? 5);
mkdirSync('scripts/out', { recursive: true });

const PORT = 5300 + Math.floor(Math.random() * 500);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  setTimeout(() => reject(new Error('preview server did not start (did you run npm run build?)')), 20000);
});
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = 480;
const H = 270;
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => ((failed = true), console.log('PAGEERROR', String(e))));
  await page.goto(`http://localhost:${PORT}/?scene=${scene}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  await page.evaluate(
    ({ setup, scene }) => {
      const g = window.__game;
      g.loop.paused = true;
      document.body.classList.add('dev-off');
      for (const sel of ['.gh', '.ch', '#approval', '#hint', '#toast', '.lil-gui']) document.querySelectorAll(sel).forEach((e) => (e.style.display = 'none'));
      if (scene === 'plane') Object.assign(g.tuning.move, { style: 3, jump: 0, slide: 0, relative: 0, controller: 1 });
      const input = g.sim.players[0];
      window.__hold = (field, value = true) => Object.defineProperty(input, field, { get: () => value, set: () => {}, configurable: true });
      new Function('g', 'hold', 'run', setup)(g, window.__hold, (s) => g.sim.run(Math.round(s * 60)));
    },
    { setup, scene },
  );
  const shots = [];
  for (let f = 0; f < frames; f++) {
    const info = await page.evaluate(
      ({ gap, viewArg, first }) => {
        const g = window.__game;
        const k = g.kaiju;
        const input = g.sim.players[0];
        if (!first) g.sim.run(gap);
        // Move the camera without changing what the kaiju is being asked to do: the runner's keys
        // are read against the view, so the same wish has to be re-expressed for the new view.
        const saved = { look: input.look, thrust: input.thrust, strafe: input.strafe };
        if (viewArg !== 'behind') {
          const wish = saved.look + Math.atan2(saved.strafe, saved.thrust);
          const push = Math.hypot(saved.thrust, saved.strafe);
          const look = k.yaw + Number(viewArg ?? 1.4);
          window.__hold('look', look);
          window.__hold('thrust', push * Math.cos(wish - look));
          window.__hold('strafe', push * Math.sin(wish - look));
        }
        window.__restore = () => {
          for (const key of ['look', 'thrust', 'strafe']) window.__hold(key, saved[key]);
        };
        const r = (n) => Math.round(n * 100) / 100;
        return {
          speed: r(k.speed),
          height: r(k.position().y),
          bank: r(k.bank),
          nod: r(k.nod),
          turning: r(k.yawRate),
          skid: r(k.skid),
          stride: r(k.legs.cycle),
          feet: k.legs.feet.map((foot) => (foot.swinging ? 'up' : 'down')).join('/'),
          air: k.airborne,
          sliding: k.sliding > 0,
        };
      },
      { gap, viewArg, first: f === 0 },
    );
    console.log(f, JSON.stringify(info));
    // (Software rendering is slow: give it time to draw the frame, and the drawn-only motion time to settle.)
    await page.waitForTimeout(2500);
    shots.push((await page.screenshot()).toString('base64'));
    await page.evaluate(() => window.__restore());
  }
  const cols = Math.min(3, frames);
  const sheet = await browser.newPage({ viewport: { width: W * cols, height: H * Math.ceil(frames / cols) } });
  const cell = (b, i) => `<div style="position:relative"><img src="data:image/png;base64,${b}" width="${W}" height="${H}" style="display:block"><b style="position:absolute;left:6px;top:4px;color:#fff;font:bold 14px sans-serif;text-shadow:0 0 3px #000">${i}</b></div>`;
  await sheet.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${W}px)">${shots.map(cell).join('')}</body>`);
  await sheet.waitForTimeout(300);
  await sheet.screenshot({ path: `scripts/out/${name}.png` });
  console.log(`wrote scripts/out/${name}.png  (${frames} frames, ${gap} ticks apart)`);
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {}
}
process.exit(failed ? 1 : 0);
