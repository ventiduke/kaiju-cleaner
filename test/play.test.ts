import { describe, expect, it } from 'vitest';
import type { Approval } from '../src/city/approval';
import { WORTH } from '../src/city/approval';
import { playShift, PlayBot } from '../src/bot/playbot';
import { snapshot } from '../src/core/snapshot';
import { setState, STATES } from '../src/core/states';
import type { Pieces } from '../src/city/pieces';
import type { WaterMains } from '../src/city/mains';
import { makeGame } from './helpers';

describe('scripted players', () => {
  it('a careful one finishes every job in the yard, squarely, without a fall', async () => {
    const g = await makeGame('yard');
    const r = playShift(g.sim, 'careful', 240);
    expect(r.broken).toEqual([]);
    expect(r.finished).toBe(true);
    expect(r.jobs.every((j) => j.done)).toBe(true);
    expect(r.jobs.filter((j) => j.sloppy).length).toBeLessThanOrEqual(1);
    expect(r.falls).toBe(0);
    expect(r.drops).toBe(0);
    expect(r.seconds).toBeLessThan(150);
    // Doing the lot well is worth most of the 50 points on offer, less what it knocked over on the way.
    expect(r.approval).toBeGreaterThan(WORTH.start + WORTH.jobs * 0.8);
  });

  it('one who never touches the controls finishes nothing, breaks nothing, and stays at 50%', async () => {
    const g = await makeGame('yard');
    const r = playShift(g.sim, 'idle', 30);
    expect(r.broken).toEqual([]);
    expect(r.finished).toBe(false);
    expect(r.jobs.some((j) => j.done)).toBe(false);
    expect(r.approval).toBe(WORTH.start);
    expect(r.damage.chunks).toBe(0);
    expect(r.distance).toBeLessThan(2);
  });

  it('a reckless one pays for it: more tumbles, and a worse score than the careful one', async () => {
    const careful = playShift((await makeGame('yard')).sim, 'careful', 240);
    const reckless = playShift((await makeGame('yard')).sim, 'reckless', 240);
    expect(reckless.broken).toEqual([]);
    expect(reckless.stumbles + reckless.falls).toBeGreaterThan(careful.stumbles + careful.falls + 3);
    expect(reckless.approval).toBeLessThan(careful.approval - 5);
  });

  it('in the city the bot keeps to the streets and makes real progress in the first minutes', async () => {
    const g = await makeGame('city');
    const bot = new PlayBot(g.sim, 'careful');
    const approval = g.sim.parts.approval as Approval;
    g.sim.stepUntil(() => approval.board.done >= 2, 150, () => bot.think());
    expect(approval.board.done).toBeGreaterThanOrEqual(2);
    expect(bot.stalls.length).toBeLessThanOrEqual(3);
    // (The reference feel these tests run on is tippier than the shipped one.)
    expect(g.kaiju.falls).toBeLessThanOrEqual(5);
  });
});

describe('named states', () => {
  for (const name of Object.keys(STATES)) {
    it(`'${name}' can be reached from a fresh yard`, async () => {
      const g = await makeGame('yard');
      expect(setState(g.sim, name)).toBe(name);
      const p = g.kaiju.position();
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      const pieces = g.sim.parts.pieces as Pieces;
      if (name === 'toppled') expect(['fallen', 'getup']).toContain(g.kaiju.state);
      if (name === 'bowing') expect(g.kaiju.bow).toBe(1);
      if (name === 'job-nearby') expect(pieces.nearest()?.job.kind).toBe('top');
      if (name === 'carrying') expect(pieces.held?.state).toBe('held');
      if (name === 'carrying-slipping') {
        expect(pieces.slipping).toBe(true);
        expect(pieces.held?.state).toBe('held');
      }
      if (name === 'raising') expect(pieces.progress).toBeGreaterThanOrEqual(0.5);
      if (name === 'bus-nearby') expect(pieces.nearest()?.job.kind).toBe('bus');
      if (name === 'geyser') expect((g.sim.parts.mains as WaterMains).bursts).toBe(1);
      if (name === 'wrecking') expect(g.damage.chunksBroken).toBeGreaterThan(5);
    });
  }

  it('an unknown name is an error that lists the real ones', async () => {
    const g = await makeGame('yard');
    expect(() => setState(g.sim, 'nonsense')).toThrow(/unknown state 'nonsense'.*carrying/);
  });
});

describe('the state snapshot', () => {
  it('is plain data, small enough to read at a glance, and says what is going on', async () => {
    const g = await makeGame('city');
    setState(g.sim, 'walking');
    const s = snapshot(g.sim) as { kaiju: { state: string; speed: number }; jobs: { total: number; list: string[] }; approval: number };
    const text = JSON.stringify(s);
    expect(JSON.parse(text)).toEqual(s);
    expect(text.length).toBeLessThan(4096);
    expect(s.kaiju.state).toBe('walk');
    expect(s.kaiju.speed).toBeGreaterThan(5);
    expect(s.jobs.total).toBe(9);
    expect(s.jobs.list.length).toBe(9);
    expect(s.approval).toBe(50);
  });

  it('stepUntil waits for the thing itself, and gives up at the limit', async () => {
    const g = await makeGame('plane');
    g.sim.players[0].thrust = 1;
    const got = g.sim.stepUntil(() => g.kaiju.speed > 10, 10);
    expect(got.met).toBe(true);
    expect(got.seconds).toBeLessThan(5);
    const never = g.sim.stepUntil(() => g.kaiju.speed > 1000, 0.5);
    expect(never.met).toBe(false);
    expect(never.steps).toBe(30);
  });
});
