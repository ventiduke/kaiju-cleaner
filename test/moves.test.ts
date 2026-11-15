import { describe, expect, it } from 'vitest';
import { steerByScreen } from '../src/core/input';
import { applyStyle, makeTuning, STYLES } from '../src/core/tuning';
import { ChunkState } from '../src/city/destruction';
import { Stage } from '../src/core/states';
import { makeGame } from './helpers';

/** A game on one of the movement styles (the tests' usual reference feel is none of them). */
const styled = (scene: 'plane' | 'yard', index: number, extra: Record<string, unknown> = {}) =>
  makeGame(scene, { feel: STYLES[index].feel, move: STYLES[index].move, ...extra });

describe('movement styles', () => {
  it('each is quicker off the mark and faster than the one before', async () => {
    const times: number[] = [];
    const tops: number[] = [];
    for (let i = 0; i < STYLES.length; i++) {
      const g = await styled('plane', i);
      g.sim.players[0].thrust = 1;
      // How long until it is properly moving (half the old top speed)?
      times.push(g.sim.stepUntil(() => g.kaiju.speed > 16, 6).seconds);
      g.sim.run(60 * 5);
      tops.push(g.kaiju.speed);
      expect(g.kaiju.falls, STYLES[i].name).toBe(0);
    }
    expect(times[1]).toBeLessThan(times[0] * 0.6);
    expect(times[2]).toBeLessThan(times[1]);
    expect(tops[1]).toBeGreaterThan(tops[0] * 1.15);
    expect(tops[2]).toBeGreaterThan(tops[1] * 1.25);
    // "Sluggish" was the complaint: the steady one answers in well under a second.
    expect(times[1]).toBeLessThan(0.6);
  });

  it('choosing a style writes its numbers; the shipped default starts from one and may have been tuned since', () => {
    const t = makeTuning();
    expect(STYLES[t.move.style]).toBeDefined();
    applyStyle(t, 2);
    expect(t.move.style).toBe(2);
    expect(t.feel.speed).toBe(STYLES[2].feel.speed);
    expect(t.kaiju.maxSpeed).toBe(STYLES[2].feel.speed);
    expect(t.move.jump).toBeGreaterThan(0);
    applyStyle(t, 0);
    expect(t.move.jump).toBe(0);
    expect(t.move.relative).toBe(0);
  });

  it('every style stays up through a tapped turn at full speed', async () => {
    for (let i = 0; i < STYLES.length; i++) {
      const g = await styled('plane', i);
      g.sim.players[0].thrust = 1;
      g.sim.run(60 * 4);
      g.sim.players[0].turn = 1;
      g.sim.run(18);
      g.sim.players[0].turn = 0;
      g.sim.run(60 * 3);
      expect(g.kaiju.falls, STYLES[i].name).toBe(0);
    }
  });
});

describe('the leap', () => {
  it('goes up, comes down in about two seconds, and carries its speed across the gap', async () => {
    const g = await styled('plane', 2);
    const k = g.kaiju;
    g.sim.players[0].thrust = 1;
    g.sim.run(60 * 3);
    const ride = k.position().y;
    const from = k.position().clone();
    let jumps = 0;
    let landed = 0;
    g.sim.on('kaijuJump', () => jumps++);
    g.sim.on('kaijuLand', (e) => (landed = e.speed));
    g.sim.players[0].jump = true;
    g.sim.step();
    g.sim.players[0].jump = false;
    expect(k.airborne).toBe(true);
    let peak = 0;
    const air = g.sim.stepUntil(() => !k.airborne, 6, () => (peak = Math.max(peak, k.position().y - ride)));
    expect(jumps).toBe(1);
    expect(air.met).toBe(true);
    expect(air.seconds).toBeGreaterThan(0.8);
    expect(air.seconds).toBeLessThan(2.6);
    // About as high as the setting says, and a long way down the road.
    expect(peak).toBeGreaterThan(g.sim.tuning.move.jump * 0.7);
    expect(peak).toBeLessThan(g.sim.tuning.move.jump * 1.4);
    expect(k.position().distanceTo(from)).toBeGreaterThan(40);
    expect(landed).toBeGreaterThan(8);
    // It lands on its feet and carries on.
    g.sim.run(120);
    expect(k.state).toBe('walk');
    expect(k.falls).toBe(0);
    expect(Math.abs(k.position().y - ride)).toBeLessThan(3.5);
  });

  it('is not for kaiju that cannot: the other styles stay on the ground', async () => {
    const g = await styled('plane', 1);
    g.sim.players[0].jump = true;
    g.sim.run(30);
    expect(g.kaiju.airborne).toBe(false);
    expect(g.kaiju.jumps).toBe(0);
  });

  it('comes down hard: landing beside a building shakes it loose', async () => {
    const g = await styled('yard', 2);
    const tower = g.chunks.buildings[1];
    const broken = () => g.chunks.chunks.slice(tower.first, tower.first + tower.count).filter((c) => c.state !== ChunkState.Fixed).length;
    // Stand right beside the slim tower and jump on the spot.
    const k = g.kaiju;
    new Stage(g.sim).moveTo(0, -60 + 8 + 12, 1);
    expect(k.state).toBe('walk');
    expect(broken()).toBe(0);
    g.sim.players[0].jump = true;
    g.sim.step();
    g.sim.players[0].jump = false;
    expect(k.airborne).toBe(true);
    let landed = 0;
    g.sim.on('kaijuLand', () => landed++);
    g.sim.stepUntil(() => !k.airborne, 6);
    expect(landed).toBe(1);
    g.sim.run(30);
    expect(broken()).toBeGreaterThan(0);
  });
});

describe('the belly-slide', () => {
  it('keeps most of a run going while flat on its front, then is down to a crawl', async () => {
    const g = await styled('plane', 2);
    const k = g.kaiju;
    g.sim.players[0].thrust = 1;
    g.sim.run(60 * 3);
    const running = k.speed;
    let slides = 0;
    g.sim.on('kaijuSlide', () => slides++);
    g.sim.players[0].crouch = true;
    g.sim.run(36);
    expect(slides).toBe(1);
    expect(k.sliding).toBeGreaterThan(0);
    // Down low within a fraction of a second, and still going at a good lick.
    expect(k.crawl).toBeGreaterThan(0.9);
    expect(k.speed).toBeGreaterThan(running * 0.7);
    g.sim.run(60 * 3);
    // The slide runs out; held, the key leaves it crawling.
    expect(k.sliding).toBeLessThanOrEqual(0);
    expect(k.mode).toBe('crawl');
    expect(k.speed).toBeLessThan(running * 0.5);
    expect(k.falls).toBe(0);
  });

  it('from a standstill, or in a style without it, the key just crawls', async () => {
    const still = await styled('plane', 2);
    still.sim.players[0].crouch = true;
    still.sim.run(60);
    expect(still.kaiju.slides).toBe(0);
    expect(still.kaiju.mode).toBe('crawl');
    const steady = await styled('plane', 1);
    steady.sim.players[0].thrust = 1;
    steady.sim.run(60 * 3);
    steady.sim.players[0].crouch = true;
    steady.sim.run(30);
    expect(steady.kaiju.slides).toBe(0);
  });
});

describe('steering by the screen', () => {
  const view = (camera: number, kaiju: number) => ({ camera, kaiju });
  it('with no view it is tank controls, untouched', () => {
    expect(steerByScreen(1, -1, null)).toEqual({ thrust: 1, turn: -1 });
  });
  it('"up" drives straight ahead when the kaiju already faces away from the camera', () => {
    const s = steerByScreen(1, 0, view(Math.PI, Math.PI));
    expect(s.thrust).toBeCloseTo(1, 5);
    expect(s.turn).toBeCloseTo(0, 5);
  });
  it('"left" turns it left, and holds back the drive until it has come round', () => {
    const s = steerByScreen(0, 1, view(0, 0));
    expect(s.turn).toBe(1);
    expect(s.thrust).toBeLessThan(0.2);
    const nearly = steerByScreen(0, 1, view(0, Math.PI / 2 - 0.1));
    expect(nearly.turn).toBeGreaterThan(0);
    expect(nearly.thrust).toBeGreaterThan(0.9);
  });
  it('"down" alone backs up; it does not spin round to walk at the camera', () => {
    expect(steerByScreen(-1, 0, view(0, 0))).toEqual({ thrust: -1, turn: 0 });
  });
  it('letting go stops', () => {
    expect(steerByScreen(0, 0, view(1, 2))).toEqual({ thrust: 0, turn: 0 });
  });
});
