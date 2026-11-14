import { describe, expect, it } from 'vitest';
import type { Kaiju } from '../src/kaiju/kaiju';
import type { Sim } from '../src/sim';
import { makeGame } from './helpers';

async function plane(): Promise<{ sim: Sim; k: Kaiju }> {
  const g = await makeGame('plane');
  return { sim: g.sim, k: g.sim.parts.kaiju as Kaiju };
}

/** Steps until `done()` is true; returns the seconds it took, or Infinity past the limit. */
function secondsUntil(sim: Sim, done: () => boolean, limit: number): number {
  const start = sim.time;
  while (sim.time - start < limit) {
    sim.step();
    if (done()) return sim.time - start;
  }
  return Infinity;
}

describe('M2 kaiju movement', () => {
  it('stands still without drifting, stumbling or falling', async () => {
    const { sim, k } = await plane();
    sim.run(60 * 10);
    const p = k.position();
    expect(Math.hypot(p.x, p.z)).toBeLessThan(0.5);
    expect(p.y).toBeCloseTo(k.rideHeight, 0);
    expect(k.tilt).toBeLessThan(0.12);
    expect(k.stumbles + k.falls).toBe(0);
  });

  it('walks a long straight line without ever stumbling', async () => {
    const { sim, k } = await plane();
    sim.players[0].thrust = 1;
    let maxTilt = 0;
    for (let i = 0; i < 60 * 25; i++) {
      sim.step();
      maxTilt = Math.max(maxTilt, k.tilt);
    }
    expect(k.stumbles + k.falls).toBe(0);
    expect(k.state).toBe('walk');
    expect(k.position().z).toBeGreaterThan(150);
    expect(Math.abs(k.position().x)).toBeLessThan(3);
    // It should visibly lean and sway, though: this is not a hovercraft.
    expect(maxTilt).toBeGreaterThan(0.08);
  });

  it('is heavy: 2-4 s to reach top speed, 1.5-3 s to stop', async () => {
    const { sim, k } = await plane();
    const max = sim.tuning.kaiju.maxSpeed;
    sim.players[0].thrust = 1;
    const up = secondsUntil(sim, () => k.speed > max * 0.95, 10);
    sim.run(60);
    sim.players[0].thrust = 0;
    const down = secondsUntil(sim, () => k.speed < 0.3, 10);
    console.log(`top speed in ${up.toFixed(2)} s, stop in ${down.toFixed(2)} s`);
    expect(up).toBeGreaterThan(2);
    expect(up).toBeLessThan(4);
    expect(down).toBeGreaterThan(1.5);
    expect(down).toBeLessThan(3);
  });

  it('stumbles on a hard turn at full speed, swings its tail wide, and recovers', async () => {
    const { sim, k } = await plane();
    sim.players[0].thrust = 1;
    sim.run(60 * 5);
    sim.players[0].turn = 1;
    let widest = 0;
    for (let i = 0; i < 60 * 4; i++) {
      sim.step();
      // How far the tail tip is from the line straight behind the body.
      const p = k.position();
      const t = k.tail.tip();
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      widest = Math.max(widest, Math.abs(dx * k.left.x + dz * k.left.z));
    }
    console.log(`tail tip swung ${widest.toFixed(1)} m off-axis; stumbles ${k.stumbles}`);
    expect(k.stumbles).toBeGreaterThanOrEqual(1);
    expect(k.falls).toBe(0);
    expect(widest).toBeGreaterThan(sim.tuning.kaiju.bodyRadius * 2);
    sim.players[0].turn = 0;
    sim.players[0].thrust = 0;
    sim.run(60 * 4);
    expect(k.state).toBe('walk');
    expect(k.tilt).toBeLessThan(0.15);
  });

  it('can take a gentle turn at half speed without stumbling', async () => {
    const { sim, k } = await plane();
    sim.players[0].thrust = 0.5;
    sim.run(60 * 4);
    sim.players[0].turn = 0.5;
    sim.run(60 * 8);
    expect(k.stumbles + k.falls).toBe(0);
  });

  it('recovers from a shove on its own', async () => {
    const { sim, k } = await plane();
    sim.run(60);
    k.body.applyTorqueImpulse({ x: 0, y: 0, z: k.body.mass() * 120 }, true);
    const recovered = secondsUntil(sim, () => k.stumbles > 0 && k.state === 'walk', 6);
    expect(k.stumbles).toBeGreaterThanOrEqual(1);
    expect(k.falls).toBe(0);
    expect(recovered).toBeLessThan(4);
  });

  it('falls over when shoved hard, then gets back up', async () => {
    const { sim, k } = await plane();
    sim.run(60);
    k.body.applyTorqueImpulse({ x: 0, y: 0, z: k.body.mass() * 420 }, true);
    sim.run(60);
    expect(k.falls).toBe(1);
    expect(k.state).toBe('fallen');
    const up = secondsUntil(sim, () => k.state === 'walk', 15);
    console.log(`back on its feet ${up.toFixed(1)} s after falling`);
    expect(up).toBeLessThan(12);
    sim.run(60 * 3);
    expect(k.position().y).toBeCloseTo(k.rideHeight, 0);
    expect(k.tilt).toBeLessThan(0.15);
    expect(k.falls).toBe(1);
    // And it can walk again.
    sim.players[0].thrust = 1;
    sim.run(60 * 4);
    expect(k.speed).toBeGreaterThan(sim.tuning.kaiju.maxSpeed * 0.8);
  });

  it('keeps its feet under it: steps alternate and land near the body', async () => {
    const { sim, k } = await plane();
    const sides: number[] = [];
    sim.on('footfall', (e) => sides.push(e.side));
    sim.players[0].thrust = 1;
    sim.run(60 * 10);
    expect(sides.length).toBeGreaterThan(10);
    const repeats = sides.filter((s, i) => i > 0 && s === sides[i - 1]).length;
    expect(repeats / sides.length).toBeLessThan(0.2);
    const p = k.position();
    for (const f of k.legs.feet) expect(Math.hypot(f.pos.x - p.x, f.pos.z - p.z)).toBeLessThan(14);
  });
});
