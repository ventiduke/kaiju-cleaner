import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTuning, STYLES } from '../src/core/tuning';
import { makeGame } from './helpers';

interface Pin {
  said: string;
  when: string;
  values?: Record<string, number>;
  outcome?: string;
}
const pins = JSON.parse(readFileSync('feedback/pins.json', 'utf8')) as { keep: Pin[] };
const shipped = makeTuning() as unknown as Record<string, Record<string, number>>;
/** The feel the game ships with, for checks of how it behaves (not of what its numbers are). */
const SHIPPED_FEEL = { feel: { ...shipped.feel } };

/** What a pinned outcome means, as something that can be run. */
const OUTCOMES: Record<string, () => Promise<void>> = {
  'three-styles-to-switch-between': async () => {
    expect(STYLES.map((s) => s.name)).toEqual(['Lumbering', 'Steady', 'Wild']);
    // One wobbles, one is steady, one can leap and slide.
    expect(STYLES[0].feel.wobble).toBeGreaterThan(STYLES[1].feel.wobble + 0.3);
    expect(STYLES[2].move.jump).toBeGreaterThan(0);
    expect(STYLES[2].move.slide).toBe(1);
  },
  'hard-turn-at-speed-falls': async () => {
    const g = await makeGame('plane', SHIPPED_FEEL);
    g.sim.players[0].thrust = 1;
    g.sim.run(60 * 4);
    g.sim.players[0].turn = 1;
    g.sim.run(60 * 3);
    expect(g.kaiju.falls, 'holding a full turn at full speed should still put it on the floor').toBeGreaterThanOrEqual(1);
  },
  'tapped-turn-stays-up': async () => {
    const g = await makeGame('plane', SHIPPED_FEEL);
    g.sim.players[0].thrust = 1;
    g.sim.run(60 * 4);
    g.sim.players[0].turn = 1;
    g.sim.run(18);
    g.sim.players[0].turn = 0;
    g.sim.run(60 * 3);
    expect(g.kaiju.falls, 'a tap of the turn at full speed should wobble it, not floor it').toBe(0);
    expect(g.kaiju.tilt).toBeLessThan(0.3);
  },
};

describe('keep-pins: what the playtester said they like', () => {
  for (const pin of pins.keep) {
    it(`"${pin.said}" (${pin.when})`, async () => {
      for (const [path, value] of Object.entries(pin.values ?? {})) {
        const [group, key] = path.split('.');
        const now = shipped[group]?.[key];
        expect(now, `${path} is pinned at ${value} and is now ${now === undefined ? 'gone' : now}. Ask before moving it, then update feedback/pins.json.`).toBe(value);
      }
      if (pin.outcome) {
        expect(OUTCOMES[pin.outcome], `no check written for outcome '${pin.outcome}'`).toBeDefined();
        await OUTCOMES[pin.outcome]();
      }
    });
  }
});

describe('the simulation stays repeatable', () => {
  /**
   * Files allowed to use chance or the clock, and why. Anything else that reaches for them would
   * make recorded sessions stop replaying and the tests stop meaning anything.
   */
  const ALLOWED: Record<string, string> = {
    'src/core/audio.ts': 'sound only: pitch variation and rate limits',
    'src/core/debug.ts': 'the frame-rate readout',
    'src/core/freeCamera.ts': 'telling a click from a drag',
    'src/core/loop.ts': 'the browser frame clock',
    'src/sim.ts': 'timing a step, for the readout: never fed back into the step',
  };
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts')) files.push(path);
    }
  };
  walk('src');

  it('nothing outside a short, explained list uses Math.random, Date.now or performance.now', () => {
    const offenders = files.filter((f) => !ALLOWED[f] && /Math\.random|Date\.now|performance\.now/.test(readFileSync(f, 'utf8')));
    expect(offenders, 'use the seeded Rng (src/core/rng.ts) and sim.time instead, or add the file to ALLOWED with a reason').toEqual([]);
  });

  it('the simulation never reaches for the page: no document or window outside the shell', () => {
    const shell = ['src/main.ts', 'src/core/debug.ts', 'src/core/input.ts', 'src/core/audio.ts', 'src/core/freeCamera.ts', 'src/core/loop.ts', 'src/core/tuning.ts', 'src/core/session.ts', 'src/ui/gameHud.ts', 'src/ui/courseHud.ts', 'src/gfx/post.ts'];
    const offenders = files.filter((f) => !shell.includes(f) && /\b(document|window)\./.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
