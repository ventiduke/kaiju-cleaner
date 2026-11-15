// Loads the deployed game in a headless browser and says what it found.
//
//   node scripts/live.mjs                 checks the live site against the local HEAD commit
//   node scripts/live.mjs --any           accepts whatever build is live
//   node scripts/live.mjs <url>           a different URL
//
// Exit code 0 only if the page loads with no failed requests, the game boots, and (unless
// --any) the build it reports is the commit checked out here. GitHub Pages serves the old
// page for up to ten minutes; the URL gets a throwaway parameter so that this does not.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const any = args.includes('--any');
const url = args.find((a) => a.startsWith('http')) ?? 'https://ventiduke.github.io/kaiju-cleaner/';
const want = any ? null : execSync('git rev-parse --short=7 HEAD').toString().trim();

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let ok = true;
try {
  const page = await browser.newPage();
  page.on('response', (r) => {
    if (r.status() >= 400) {
      ok = false;
      console.log(`FAILED REQUEST ${r.status()} ${r.url()}`);
    }
  });
  page.on('requestfailed', (r) => ((ok = false), console.log(`FAILED REQUEST ${r.url()} ${r.failure()?.errorText ?? ''}`)));
  page.on('pageerror', (e) => ((ok = false), console.log('PAGE ERROR', String(e))));
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}nointro&v=${Date.now()}`, { timeout: 60000 });
  try {
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  } catch {
    ok = false;
    console.log('NOT READY. The page says:', JSON.stringify(await page.evaluate(() => document.getElementById('boot')?.textContent ?? '(no boot message)')));
  }
  if (ok) {
    const info = await page.evaluate(() => {
      const g = window.__game;
      return { build: document.getElementById('hud')?.textContent?.match(/build (\w+)/)?.[1] ?? '?', jobs: g.sim.parts.jobs?.total ?? 0, bodies: g.sim.counts().bodies };
    });
    console.log(`live: build ${info.build}, ${info.jobs} jobs, ${info.bodies} bodies`);
    if (want && info.build !== want) {
      ok = false;
      console.log(`STALE: the live build is ${info.build}, but HEAD here is ${want}. The deploy may still be running, or may have failed.`);
    }
  }
} finally {
  await browser.close();
}
console.log(ok ? 'OK' : 'NOT OK');
process.exit(ok ? 0 : 1);
