// Dev helper: several screenshots of the built game from one headless browser.
//
//   npm run build && node scripts/shots.mjs '<json>'      (or a path to a .json file)
//
// The JSON is a list of shots: { out, scene?, query?, code?, wait?, dpr?, clean? }
//   out    name of the PNG, written to scripts/out/<out>.png
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
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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
      ({ body, clean }) => {
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
        if (clean) for (const sel of ['.gh', '#approval', '#hint', '#toast']) document.querySelector(sel)?.setAttribute('style', 'display:none');
        return new Function('g', 'THREE', 'h', body)(g, g.THREE, h);
      },
      { body: shot.code ?? '', clean: !!shot.clean },
    );
    if (result !== undefined) console.log(shot.out, JSON.stringify(result));
    await page.waitForTimeout(shot.wait ?? 900);
    await page.screenshot({ path: `scripts/out/${shot.out}.png` });
    console.log(`wrote scripts/out/${shot.out}.png`);
    await page.close();
  }
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {}
}
process.exit(failed ? 1 : 0);
