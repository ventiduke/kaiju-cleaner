import { describe, expect, it } from 'vitest';
import { codeDefaults, applyFeel, makeTuning } from '../src/core/tuning';
import { feelReport, formatReport, rig, turnAtSpeed } from './feel/maneuvers';

describe('feel dials', () => {
  it('derive the detailed kaiju numbers, and the shipped defaults agree with them', () => {
    const t = structuredClone(codeDefaults);
    applyFeel(t);
    expect(t.kaiju).toEqual(codeDefaults.kaiju);
  });

  it('carry through overrides, and let an explicit detailed value win', () => {
    expect(makeTuning({ feel: { speed: 10 } }).kaiju.maxSpeed).toBe(10);
    expect(makeTuning({ feel: { speed: 10 }, kaiju: { maxSpeed: 12 } }).kaiju.maxSpeed).toBe(12);
    expect(makeTuning({ kaiju: { grip: 5 } }).kaiju.grip).toBe(5);
  });
});

describe('M2 kaiju movement', () => {
  it('stands still without drifting, stumbling or falling', async () => {
    const { sim, k } = await rig();
    sim.run(60 * 10);
    const p = k.position();
    expect(Math.hypot(p.x, p.z)).toBeLessThan(0.5);
    expect(p.y).toBeCloseTo(k.rideHeight, 0);
    expect(k.tilt).toBeLessThan(0.12);
    expect(k.stumbles + k.falls).toBe(0);
  });

  it('runs a long straight line without ever stumbling', async () => {
    const { sim, k } = await rig();
    sim.players[0].thrust = 1;
    sim.run(60 * 20);
    expect(k.stumbles + k.falls).toBe(0);
    expect(k.position().z).toBeGreaterThan(sim.tuning.kaiju.maxSpeed * 17);
    expect(Math.abs(k.position().x)).toBeLessThan(4);
  });

  it('handles as designed: the default feel report', async () => {
    const rep = await feelReport();
    console.log(formatReport(rep, 'Feel report (defaults)'));
    const t = makeTuning();

    // Snappy but not instant, and it visibly leans into starts and stops.
    expect(rep.pickup).toBeGreaterThan(t.feel.pickup * 0.7);
    expect(rep.pickup).toBeLessThan(t.feel.pickup * 1.4);
    expect(rep.stop).toBeLessThan(3.5);
    expect(rep.startLeanDeg).toBeGreaterThan(5);
    expect(rep.startLeanDeg).toBeLessThan(25);

    // The handling envelope: speed times turn sharpness is what tips it.
    expect(rep.turns['full speed, full turn, held 2s'].outcome).toBe('fall');
    expect(rep.turns['full speed, full turn, tapped 0.3s'].outcome).toBe('steady');
    expect(rep.turns['full speed, half turn, held 2s'].outcome).toBe('steady');
    expect(rep.turns['full speed, quarter turn, held 2s'].outcome).toBe('steady');
    expect(rep.turns['70% speed, full turn, held 2s'].outcome).not.toBe('steady');
    expect(rep.turns['40% speed, full turn, held 2s'].outcome).toBe('steady');

    // There is time to react between the stumble and the fall.
    const hard = rep.turns['full speed, full turn, held 2s'];
    expect(hard.fallAt! - hard.stumbleAt!).toBeGreaterThan(0.4);
    expect(rep.getUp).toBeLessThan(7);
  });

  it('saves itself if you let go of the turn when it stumbles', async () => {
    const { sim, k } = await rig();
    sim.players[0].thrust = 1;
    sim.run(60 * 5);
    sim.players[0].turn = 1;
    for (let i = 0; i < 60 * 3 && k.stumbles === 0; i++) sim.step();
    expect(k.stumbles).toBe(1);
    sim.players[0].turn = 0;
    sim.run(60 * 4);
    expect(k.falls).toBe(0);
    expect(k.state).toBe('walk');
  });

  it('balance dial: solid never falls on the hard turn, tippy falls on a gentler one', async () => {
    expect((await turnAtSpeed(1, 1, 2, { feel: { balance: 1 } })).outcome).not.toBe('fall');
    expect((await turnAtSpeed(0.7, 1, 2, { feel: { balance: 0.1 } })).outcome).toBe('fall');
  });

  it('grip dial: low grip slides wide instead of tipping', async () => {
    const grippy = await turnAtSpeed(1, 1, 1, {});
    const slick = await turnAtSpeed(1, 1, 1, { feel: { grip: 8 } });
    expect(slick.outcome).toBe('steady');
    expect(slick.maxTiltDeg).toBeLessThan(grippy.maxTiltDeg);
  });

  it('wobble dial: more wobble means more lean and more sway', async () => {
    const steady = await feelReport({ feel: { wobble: 0 } });
    const drunk = await feelReport({ feel: { wobble: 1, balance: 1 } });
    expect(drunk.startLeanDeg).toBeGreaterThan(steady.startLeanDeg * 1.5);
    expect(drunk.swayDeg).toBeGreaterThan(steady.swayDeg);
  });

  it('falls over when knocked flat, then gets back up and can run again', async () => {
    const { sim, k } = await rig();
    sim.run(60);
    k.knockDown();
    sim.run(30);
    expect(k.falls).toBe(1);
    expect(k.state).toBe('fallen');
    sim.run(60 * 9);
    expect(k.state).toBe('walk');
    expect(k.position().y).toBeCloseTo(k.rideHeight, 0);
    expect(k.tilt).toBeLessThan(0.15);
    expect(k.falls).toBe(1);
    sim.players[0].thrust = 1;
    sim.run(60 * 4);
    expect(k.speed).toBeGreaterThan(sim.tuning.kaiju.maxSpeed * 0.8);
  });

  it('keeps its feet under it at a sprint: steps alternate and stay in reach', async () => {
    const { sim, k } = await rig();
    const sides: number[] = [];
    sim.on('footfall', (e) => sides.push(e.side));
    sim.players[0].thrust = 1;
    let farthest = 0;
    for (let i = 0; i < 60 * 10; i++) {
      sim.step();
      const p = k.position();
      for (const f of k.legs.feet) farthest = Math.max(farthest, Math.hypot(f.pos.x - p.x, f.pos.z - p.z));
    }
    expect(sides.length).toBeGreaterThan(15);
    const repeats = sides.filter((s, i) => i > 0 && s === sides[i - 1]).length;
    expect(repeats / sides.length).toBeLessThan(0.2);
    // Never planted farther away than the leg could stretch.
    expect(farthest).toBeLessThan(k.legs.reach);
  });
});
