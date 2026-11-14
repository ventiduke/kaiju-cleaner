import { describe, expect, it } from 'vitest';
import { initRapier, type RigidBody } from '../src/core/physics';
import { makeTuning, mergeTuning } from '../src/core/tuning';
import { createGame } from '../src/scenes';

describe('M0 scaffold', () => {
  it('drops the box onto the ground and it comes to rest', async () => {
    const R = await initRapier();
    const sim = createGame(R, 'yard', makeTuning());
    const box = sim.parts.dropBox as RigidBody;
    const startY = box.translation().y;
    sim.run(60 * 8);
    const y = box.translation().y;
    expect(startY).toBeGreaterThan(30);
    expect(y).toBeGreaterThan(2);
    expect(y).toBeLessThan(6);
    expect(box.isSleeping()).toBe(true);
    expect(sim.tick).toBe(480);
  });

  it('merges tuning overrides by key and type only', () => {
    const t = makeTuning({ world: { gravity: 3, nonsense: 1 }, kaiju: { maxSpeed: 'fast' } });
    expect(t.world.gravity).toBe(3);
    expect('nonsense' in t.world).toBe(false);
    expect(typeof t.kaiju.maxSpeed).toBe('number');
    mergeTuning(t as never, { world: { gravity: 12 } });
    expect(t.world.gravity).toBe(12);
  });
});
