// Dev helper: several screenshots of the built game from one headless browser.
//
//   npm run build && node scripts/shots.mjs '<json>'      (or a path to a .json file)
//
// The JSON is a list of shots: { out, scene?, state?, query?, code?, wait?, dpr?, clean? }
//   out    name of the PNG, written to scripts/out/<out>.png (and <out>.json: the game's state)
//   state  a named state from src/core/states.ts (e.g. "carrying"), applied before `code`.
//          The shot fails if the game does not report back that very name.
//   scene  city (default) | yard | plane
//   query  extra URL parameters, e.g. "&intro=1"
//   code   body of a function (g, THREE, h) run in the page with the loop paused.
//          g is window.__game; h has helpers:
//            h.moveTo(x, z)         slide the kaiju (and tail) there and let it settle
//            h.face(yaw)            turn it on the spot (0 faces +z, Math.PI faces -z)
//            h.hold('crouch')       keep an input held however the page polls (thrust: h.hold('thrust', 1))
//            h.run(seconds)         step the sim
//            h.hour(17.4)           set the time of day
//            h.view(orbit, pitch, zoom)  move the follow camera
//          Whatever the code returns is printed.
//   wait   ms to let frames draw before the shot (default 900; software rendering is slow)
//   dpr    device scale factor (default 1: use 2 only for pictures a person will look at)
//   clean  true hides the HUD
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = process.argv[2];
if (!arg) {
  console.error('usage: node scripts/shots.mjs \'[{"out":"name","code":"h.run(2)"}]\'  (or a .json file)');
  process.exit(2);
}
const shots = JSON.parse(existsSync(arg) ? readFileSync(arg, 'utf8') : arg);
mkdirSync('scripts/out', { recursive: true });

const PORT = 5300 + Math.floor(Math.random() * 500);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  setTimeout(() => reject(new Error('preview server did not start (did you run npm run build?)')), 20000);
});
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: shot.width ?? 1280, height: shot.height ?? 720 }, deviceScaleFactor: shot.dpr ?? 1 });
    page.on('pageerror', (e) => ((failed = true), console.log('PAGEERROR', String(e))));
    page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
    await page.goto(`http://localhost:${PORT}/?scene=${shot.scene ?? 'city'}${shot.query ?? ''}`);
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
    const result = await page.evaluate(
      ({ body, clean, state }) => {
        const g = window.__game;
        g.loop.paused = true;
        const k = g.kaiju;
        const input = g.sim.players[0];
        const h = {
          run: (seconds) => g.sim.run(Math.round(seconds * 60)),
          moveTo: (x, z) => {
            const p = k.position();
            for (const b of [k.body, ...k.tail.segments]) {
              const q = b.translation();
              b.setTranslation({ x: q.x + x - p.x, y: q.y, z: q.z + z - p.z }, true);
            }
            g.sim.run(40);
          },
          face: (yaw) => {
            const c = k.position();
            const turn = yaw - k.yaw;
            const cos = Math.cos(turn);
            const sin = Math.sin(turn);
            const q = new g.THREE.Quaternion().setFromAxisAngle(new g.THREE.Vector3(0, 1, 0), yaw);
            for (const b of [k.body, ...k.tail.segments]) {
              const t = b.translation();
              const dx = t.x - c.x;
              const dz = t.z - c.z;
              b.setTranslation({ x: c.x + dx * cos + dz * sin, y: t.y, z: c.z - dx * sin + dz * cos }, true);
              b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
            }
            g.sim.run(30);
          },
          hold: (field, value = true) => Object.defineProperty(input, field, { get: () => value, set: () => {}, configurable: true }),
          hour: (hour) => (g.tuning.gfx.hour = hour),
          view: (orbit = 0, pitch = 0, zoom = 1) => Object.assign(g.followCam, { orbit, pitch, zoom }),
        };
        const applied = state ? g.setState(state) : null;
        if (state && applied !== state) throw new Error(`asked for state '${state}', got '${applied}'`);
        if (clean) for (const sel of ['.gh', '#approval', '#hint', '#toast']) document.querySelector(sel)?.setAttribute('style', 'display:none');
        return new Function('g', 'THREE', 'h', body)(g, g.THREE, h);
      },
      { body: shot.code ?? '', clean: !!shot.clean, state: shot.state ?? null },
    );
    if (result !== undefined) console.log(shot.out, JSON.stringify(result));
    await page.waitForTimeout(shot.wait ?? 900);
    const png = await page.screenshot({ path: `scripts/out/${shot.out}.png` });
    // What the game says is going on, beside the picture: read this first.
    const info = await page.evaluate(() => {
      const gl = document.querySelector('canvas')?.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return { ...window.__game.state(), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown' };
    });
    // And a crude look at the picture itself, so that a black or washed-out frame fails without anyone opening it.
    const stats = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 54;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, 96, 54);
      const d = ctx.getImageData(0, 0, 96, 54).data;
      const bins = new Array(32).fill(0);
      let sum = 0;
      let sq = 0;
      const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += l;
        sq += l * l;
        bins[Math.min(31, l >> 3)]++;
      }
      const mean = sum / n;
      const entropy = -bins.reduce((e, k) => (k ? e + (k / n) * Math.log2(k / n) : e), 0);
      return { mean: Math.round(mean), contrast: Math.round(Math.sqrt(sq / n - mean * mean)), entropy: Math.round(entropy * 10) / 10 };
    }, png.toString('base64'));
    const problems = [];
    if (stats.mean < 12) problems.push('nearly black');
    if (stats.mean > 242) problems.push('nearly white');
    if (stats.contrast < 6 || stats.entropy < 1.5) problems.push('almost no detail (blank, or all fog?)');
    info.picture = { ...stats, software: /swiftshader|llvmpipe|software/i.test(info.renderer), problems };
    writeFileSync(`scripts/out/${shot.out}.json`, JSON.stringify(info, null, 1));
    console.log(`wrote scripts/out/${shot.out}.png  brightness ${stats.mean}  contrast ${stats.contrast}  detail ${stats.entropy}` + (problems.length ? `  PROBLEM: ${problems.join('; ')}` : ''));
    if (problems.length && !shot.allowBlank) failed = true;
    await page.close();
  }
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {}
}
process.exit(failed ? 1 : 0);
