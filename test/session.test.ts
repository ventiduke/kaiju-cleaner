import { describe, expect, it } from 'vitest';
import type { Damage } from '../src/city/damage';
import { formatSession, SessionRecorder, type SessionFile } from '../src/core/session';
import { applyFeel, diffTuning, makeTuning } from '../src/core/tuning';
import { replaySession } from './feel/replay';
import { makeGame } from './helpers';

/** Plays a short scripted run in the yard, the way a person at the keyboard would, and records it. */
async function recordRun(): Promise<SessionFile> {
  const g = await makeGame('yard');
  const rec = g.sim.add(new SessionRecorder(g.sim, 'yard', g.kaiju, g.sim.parts.damage as Damage));
  const p = g.sim.players[0];
  const script: [number, number, number][] = [
    [90, 1, 0],
    [40, 1, 0.6],
    [150, 1, 0],
    [30, 0.5, -1],
    [200, 1, 0],
  ];
  let changed = false;
  for (const [steps, thrust, turn] of script) {
    p.thrust = thrust;
    p.turn = turn;
    g.sim.run(steps);
    if (!changed) {
      // A slider moved mid-run.
      g.sim.tuning.feel.speed = 18;
      applyFeel(g.sim.tuning);
      rec.tuningChanged();
      rec.addNote('slowed it down, turning felt too wild');
      changed = true;
    }
  }
  return JSON.parse(JSON.stringify(rec.file()));
}

describe('session recording', () => {
  it('reports only the settings that differ from the defaults', () => {
    const base = makeTuning();
    expect(diffTuning(base)).toEqual({});
    const speed = base.feel.speed + 5;
    // The kaiju numbers the dial implies are left out; a hand-set one is kept.
    expect(diffTuning(makeTuning({ feel: { speed } }))).toEqual({ feel: { speed } });
    const hand = makeTuning({ feel: { speed }, kaiju: { lean: 0.5 } });
    expect(diffTuning(hand)).toEqual({ feel: { speed }, kaiju: { lean: 0.5 } });
    expect(makeTuning(diffTuning(hand))).toEqual(hand);
  });

  it('captures settings, notes, stats and inputs, and prints a pasteable report', async () => {
    const f = await recordRun();
    expect(f.changed.feel.speed).toBe(18);
    expect(f.notes.length).toBe(1);
    expect(f.notes[0].changed.feel.speed).toBe(18);
    expect(f.tuningChanges.length).toBe(1);
    expect(f.inputs.length).toBe(5); // one entry per change of input
    expect(f.stats.distance).toBeGreaterThan(100);
    expect(f.stats.topSpeed).toBeGreaterThan(15);
    expect(f.samples.length).toBeGreaterThan(30);
    const text = formatSession(f);
    expect(text).toContain('"speed":18');
    expect(text).toContain('turning felt too wild');
    expect(text.length).toBeLessThan(2500);
  });

  it('replays a saved session to the same place', async () => {
    const f = await recordRun();
    const r = await replaySession(f);
    expect(r.endError).toBeLessThan(0.05);
    expect(r.recorder.stats().chunksBroken).toBe(f.stats.chunksBroken);
    expect(r.kaiju.stumbles).toBe(f.stats.stumbles);
  });
});
