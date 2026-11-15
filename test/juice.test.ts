import { describe, expect, it } from 'vitest';
import { FEEDBACK, HitStop, TIERS, vary } from '../src/core/juice';
import { makeGame } from './helpers';

describe('feedback by size', () => {
  it('bigger moments get more of everything, and small ones never stop the game', () => {
    expect(TIERS.small.trauma).toBeLessThan(TIERS.medium.trauma);
    expect(TIERS.medium.trauma).toBeLessThan(TIERS.large.trauma);
    expect(TIERS.small.stop).toBe(0);
    expect(TIERS.medium.stop).toBeLessThan(TIERS.large.stop);
    // Nothing holds the game for longer than a blink.
    expect(TIERS.large.stop).toBeLessThanOrEqual(HitStop.LIMIT);
    expect(HitStop.LIMIT).toBeLessThanOrEqual(0.15);
    // One shake cannot max the camera out by itself: there has to be room for two things at once.
    for (const f of Object.values(FEEDBACK)) expect(TIERS[f!.tier].trauma * (f!.scale ?? 1)).toBeLessThan(0.85);
  });

  it('every moment a player should feel is in the table', () => {
    for (const name of ['footfall', 'chunkBreak', 'kaijuStumble', 'kaijuFall', 'sneeze', 'piecePlace', 'pieceDrop', 'groundCollapse', 'mainBurst', 'sweepDone', 'repairsDone'] as const) {
      expect(FEEDBACK[name], name).toBeDefined();
    }
    // Footsteps are the commonest event there is: they must be the small kind.
    expect(FEEDBACK.footfall!.tier).toBe('small');
  });

  it('hit-stop runs on real time, does not stack, and always ends', () => {
    const stop = new HitStop();
    expect(stop.holding(1 / 60)).toBe(false);
    stop.hit(0.08);
    // A second impact 30 ms later does not add its length on top.
    expect(stop.holding(0.03)).toBe(true);
    stop.hit(0.08);
    expect(stop.remaining).toBeCloseTo(0.08, 5);
    // A pile-up of impacts is capped.
    for (let i = 0; i < 50; i++) stop.hit(1);
    expect(stop.remaining).toBe(HitStop.LIMIT);
    let frames = 0;
    while (stop.holding(1 / 60) && frames < 100) frames++;
    expect(frames).toBeLessThanOrEqual(Math.ceil(HitStop.LIMIT * 60) + 1);
    expect(stop.holding(1 / 60)).toBe(false);
    expect(stop.remaining).toBe(0);
  });

  it('repeated sounds wander in pitch by a few percent, no more', () => {
    expect(vary('small', 0.5)).toBe(1);
    expect(vary('small', 0)).toBeCloseTo(1 - TIERS.small.pitch, 6);
    expect(vary('small', 1)).toBeCloseTo(1 + TIERS.small.pitch, 6);
    for (const tier of ['small', 'medium', 'large'] as const) expect(TIERS[tier].pitch).toBeLessThanOrEqual(0.1);
  });

  it('none of it touches the simulation: a run with every effect firing replays the same', async () => {
    const run = async () => {
      const g = await makeGame('yard');
      g.sim.players[0].thrust = 1;
      g.sim.run(240);
      g.kaiju.knockDown();
      g.sim.run(120);
      const p = g.kaiju.position();
      return [p.x, p.y, p.z, g.damage.chunksBroken, g.kaiju.falls];
    };
    expect(await run()).toEqual(await run());
  });
});
