import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SessionFile } from '../src/core/session';
import { REF, rig } from './feel/maneuvers';
import { replaySession } from './feel/replay';

/** Runs flat out, then holds a hard left until it is going over. */
async function tipItOver() {
  const r = await rig(REF);
  r.sim.players[0].thrust = 1;
  r.sim.run(60 * 5);
  r.sim.players[0].turn = 1;
  for (let i = 0; i < 60 * 4 && r.k.state !== 'falling'; i++) r.sim.step();
  expect(r.k.state).toBe('falling');
  return r;
}

describe('saving a fall', () => {
  it('goes down if you keep holding the turn', async () => {
    const { sim, k } = await tipItOver();
    sim.run(60 * 2);
    expect(k.falls).toBe(1);
    expect(k.saves).toBe(0);
  });

  it('is caught by steering into the fall', async () => {
    const { sim, k } = await tipItOver();
    // It was turning left, so it is toppling to the right: steer right.
    sim.players[0].turn = -1;
    for (let i = 0; i < 120 && k.saves === 0 && k.falls === 0; i++) sim.step();
    expect(k.saves).toBe(1);
    expect(k.falls).toBe(0);
    // Ease off once it is caught (hold the counter-steer and it goes over the other way).
    sim.players[0].turn = 0;
    sim.players[0].thrust = 0;
    sim.run(60 * 4);
    expect(k.falls).toBe(0);
    expect(k.state).toBe('walk');
  });

  it('gets up sooner if you are mashing to get up', async () => {
    const time = async (eager: boolean) => {
      // Knocked over at a sprint, so it goes down sliding.
      const { sim, k } = await rig(REF);
      sim.players[0].thrust = 1;
      sim.run(60 * 4);
      k.knockDown();
      sim.players[0].thrust = eager ? 1 : 0;
      let t = 0;
      while (k.state === 'fallen' && t < 600) {
        sim.step();
        t++;
      }
      return t / 60;
    };
    const lazy = await time(false);
    const eager = await time(true);
    expect(eager).toBeLessThan(lazy - 0.3);
  });
});

describe('tiptoe and crouch', () => {
  it('tiptoe is slow, narrow and runs out', async () => {
    const { sim, k } = await rig(REF);
    const t = sim.tuning;
    sim.players[0].thrust = 1;
    sim.players[0].tiptoe = true;
    sim.run(60 * 4);
    expect(k.mode).toBe('tiptoe');
    expect(k.speed).toBeLessThan(t.kaiju.maxSpeed * t.modes.tiptoeSpeed * 1.1);
    expect(k.speed).toBeGreaterThan(t.kaiju.maxSpeed * t.modes.tiptoeSpeed * 0.7);
    const feet = k.legs.feet;
    const apart = Math.hypot(feet[0].pos.x - feet[1].pos.x, feet[0].pos.z - feet[1].pos.z);
    expect(k.position().y).toBeGreaterThan(k.rideHeight + t.modes.tiptoeRise * 0.6);
    expect(k.toeMeter).toBeLessThan(0.6);
    // Hold it past the limit: the calves give out with a stumble, and it has to rest.
    sim.run(60 * 3.5);
    expect(k.stumbles).toBe(1);
    expect(k.mode).toBe('normal');
    sim.run(60 * 1);
    expect(k.mode).toBe('normal');
    sim.players[0].tiptoe = false;
    sim.run(60 * 5);
    expect(k.toeMeter).toBe(1);
    // Compare the stance with a normal walk at the same speed.
    const n = await rig(REF);
    n.sim.players[0].thrust = t.modes.tiptoeSpeed;
    n.sim.run(60 * 4);
    const nf = n.k.legs.feet;
    const normalApart = Math.hypot(nf[0].pos.x - nf[1].pos.x, nf[0].pos.z - nf[1].pos.z);
    expect(apart).toBeLessThan(normalApart * 0.85);
  });

  it('crawling gets right down on all fours: slow, low, and all but impossible to tip', async () => {
    const { sim, k } = await rig(REF);
    const t = sim.tuning;
    const inp = sim.players[0];
    sim.run(30);
    inp.crouch = true;
    sim.run(60 * 3);
    expect(k.mode).toBe('crawl');
    expect(k.crawl).toBe(1);
    // Belly a couple of metres off the ground, spine pitched right forward, and still "balanced".
    expect(k.position().y).toBeCloseTo(t.kaiju.bodyRadius + t.modes.crawlClearance, 0);
    expect(k.tilt).toBeLessThan(0.2);
    expect(k.stumbles + k.falls).toBe(0);
    // The tail trails behind, not up in the air.
    const tip = k.tail.tip();
    const p = k.position();
    expect((tip.x - p.x) * k.forward.x + (tip.z - p.z) * k.forward.z).toBeLessThan(-10);
    expect(tip.y).toBeLessThan(18);
    // It crawls, turns hard, and takes a shove, without a wobble.
    inp.thrust = 1;
    sim.run(60 * 4);
    expect(k.speed).toBeLessThan(t.kaiju.maxSpeed * t.modes.crawlSpeed * 1.1);
    expect(k.speed).toBeGreaterThan(t.kaiju.maxSpeed * t.modes.crawlSpeed * 0.8);
    const yaw0 = k.yaw;
    inp.turn = 1;
    sim.run(60 * 2);
    expect(Math.abs(k.yaw - yaw0)).toBeGreaterThan(0.8);
    inp.turn = 0;
    const av = k.body.angvel();
    k.body.setAngvel({ x: av.x + 2, y: av.y, z: av.z + 2 }, true);
    sim.run(60 * 2);
    expect(k.stumbles + k.falls).toBe(0);
    // Standing back up is not a stumble either.
    inp.thrust = 0;
    sim.run(60);
    inp.crouch = false;
    sim.run(60 * 3);
    expect(k.mode).toBe('normal');
    expect(k.stumbles + k.falls).toBe(0);
    expect(k.position().y).toBeCloseTo(k.rideHeight, 0);
    expect(k.tilt).toBeLessThan(0.2);
  });
});

describe('playtest regressions', () => {
  it('never launches a standing kaiju (session of Nov 14: a chunk pinched by a foot threw it 25 m up)', async () => {
    const f: SessionFile = JSON.parse(readFileSync('feedback/kaiju-session-2026-11-14-23-04.json', 'utf8'));
    let highest = 0;
    let ride = 0;
    await replaySession(f, (_sim, k) => {
      ride = k.rideHeight;
      if (k.state === 'walk' || k.state === 'stumble') highest = Math.max(highest, k.position().y);
    });
    // (The bug threw it 25 m up. A few metres of hop, climbing out of the river, is fine.)
    expect(highest).toBeLessThan(ride + 9);
  }, 120000);
});
