import { describe, expect, it } from 'vitest';
import type { Citizens } from '../src/city/citizens';
import { ChunkState } from '../src/city/destruction';
import type { Nose } from '../src/kaiju/nose';
import type { WeakSpot } from '../src/scenes/city';
import { makeGame, type Game } from './helpers';

/** Slides the kaiju (tail and all) to a spot. It keeps facing -z. */
function moveTo(g: Game, x: number, z: number): void {
  const k = g.kaiju;
  const p = k.position();
  for (const b of [k.body, ...k.tail.segments]) {
    const q = b.translation();
    b.setTranslation({ x: q.x + x - p.x, y: q.y, z: q.z + z - p.z }, true);
  }
  g.sim.run(30);
}

describe('sneezing', () => {
  it('dust from nearby destruction builds to a sneeze that throws the kaiju back and flattens what is in front', async () => {
    // (A sensitive nose, so that one small tower is enough.)
    const g = await makeGame('yard', { city: { propDensity: 0 }, sneeze: { dust: 0.12 } });
    const nose = g.sim.parts.nose as Nose;
    // Stand facing the slim tower, 25 m off its face, and bring it down.
    moveTo(g, 0, -27 + g.sim.tuning.kaiju.bodyRadius);
    expect(nose.tickle).toBe(0);
    const tower = g.chunks.buildings[1];
    for (let i = tower.first; i < tower.first + 4; i++) g.chunks.loosen(i, null);
    let windups = 0;
    let blasts = 0;
    g.sim.on('sneezeWindup', () => windups++);
    g.sim.on('sneeze', () => blasts++);
    const z0 = g.kaiju.position().z;
    for (let i = 0; i < 60 * 8 && blasts === 0; i++) g.sim.step();
    expect(windups).toBe(1);
    expect(blasts).toBe(1);
    expect(nose.sneezes).toBe(1);
    expect(nose.tickle).toBe(0);
    g.sim.run(40);
    // Thrown backwards (it faces -z, so backwards is +z), and staggering.
    expect(g.kaiju.position().z - z0).toBeGreaterThan(3);
    expect(g.kaiju.stumbles).toBeGreaterThanOrEqual(1);
    // The rubble in front of it went flying down-range.
    const far = g.chunks.chunks
      .slice(tower.first, tower.first + tower.count)
      .filter((c) => c.state === ChunkState.Loose && c.body.translation().z < -75).length;
    expect(far).toBeGreaterThan(2);
  });

  it('a sneeze breaks the wall in front of it', async () => {
    const g = await makeGame('yard', { city: { propDensity: 0 } });
    const nose = g.sim.parts.nose as Nose;
    moveTo(g, 0, -34);
    expect(g.damage.chunksBroken).toBe(0);
    nose.sneeze();
    g.sim.run(30);
    const tower = g.chunks.buildings[1];
    const broken = g.chunks.chunks.slice(tower.first, tower.first + tower.count).filter((c) => c.state !== ChunkState.Fixed).length;
    expect(broken).toBeGreaterThan(3);
    // The low block off to the side, out of the cone, is untouched.
    const low = g.chunks.buildings[0];
    expect(g.chunks.chunks.slice(low.first, low.first + low.count).every((c) => c.state === ChunkState.Fixed)).toBe(true);
  });

  it('cannot be held in: the only warning is the wind-up, which is long enough to turn somewhere harmless', async () => {
    const g = await makeGame('yard', { city: { propDensity: 0 } });
    const nose = g.sim.parts.nose as Nose;
    const t = g.sim.tuning.sneeze;
    let warned = -1;
    let blew = -1;
    g.sim.on('sneezeWindup', () => (warned = g.sim.time));
    g.sim.on('sneeze', () => (blew = g.sim.time));
    // The old breath key does nothing now.
    g.sim.players[0].breath = true;
    nose.tickle = 1;
    g.sim.run(Math.round(60 * (t.windup + 0.5)));
    expect(warned).toBeGreaterThanOrEqual(0);
    expect(blew - warned).toBeCloseTo(t.windup, 1);
    expect(t.windup).toBeGreaterThanOrEqual(0.9);
    expect(nose.sneezes).toBe(1);
    expect(nose.tickle).toBe(0);
  });
});

describe('weak ground', () => {
  it('gives way under a heavy step, tripping the kaiju and leaving a pit', async () => {
    const g = await makeGame('yard', { city: { propDensity: 0 } });
    const spot = (g.sim.parts.weakSpots as WeakSpot[])[0];
    expect(g.sim.ground(spot.x, spot.z)).toBe(0);
    let collapses = 0;
    g.sim.on('groundCollapse', () => collapses++);
    // Walk straight over it, one foot's width off-centre so a foot lands in it.
    moveTo(g, spot.x + g.sim.tuning.legs.stanceWidth, spot.z + 40);
    g.sim.players[0].thrust = 0.5;
    for (let i = 0; i < 60 * 10 && collapses === 0; i++) g.sim.step();
    expect(collapses).toBe(1);
    expect(spot.collapsed).toBe(true);
    expect(g.kaiju.stumbles).toBeGreaterThanOrEqual(1);
    expect(g.sim.ground(spot.x, spot.z)).toBe(-5);
    expect(g.sim.ground(spot.x + spot.radius + 1, spot.z)).toBe(0);
  });

  it('holds on tiptoe', async () => {
    const g = await makeGame('yard', { city: { propDensity: 0 } });
    const spot = (g.sim.parts.weakSpots as WeakSpot[])[0];
    moveTo(g, spot.x + g.sim.tuning.legs.stanceWidth * 0.5, spot.z + 34);
    g.sim.players[0].thrust = 1;
    g.sim.players[0].tiptoe = true;
    let stepsInside = 0;
    g.sim.on('footfall', (e) => {
      if (Math.hypot(e.x - spot.x, e.z - spot.z) < spot.radius) stepsInside++;
    });
    g.sim.run(60 * 6);
    expect(stepsInside).toBeGreaterThan(0);
    expect(spot.collapsed).toBe(false);
  });

  it('the city has both kinds of hazard on its roads', async () => {
    const g = await makeGame('city');
    const cfg = g.sim.tuning.city;
    expect(g.layout.hazards.filter((h) => h.kind === 'oil').length).toBe(cfg.oilSlicks);
    expect(g.layout.hazards.filter((h) => h.kind === 'weak').length).toBe(cfg.weakSpots);
    expect((g.sim.parts.weakSpots as WeakSpot[]).length).toBe(cfg.weakSpots);
  });
});

describe('townsfolk splats', () => {
  it('a foot leaves a splat where someone stood', async () => {
    const g = await makeGame('city');
    const people = g.sim.parts.citizens as Citizens;
    g.sim.run(10);
    const i = people.nearestTo(0, 0);
    const p = people.where(i);
    let splats = 0;
    g.sim.on('citizenSplat', () => splats++);
    g.sim.emit('footfall', { x: p.x, y: 0, z: p.z, side: 1, strength: 1, wet: false });
    expect(people.where(i).alive).toBe(false);
    expect(people.splats).toBe(1);
    expect(people.wallSplats).toBe(0);
    expect(splats).toBe(1);
    expect(g.damage.citizensSquished).toBe(1);
  });

  it('someone thrown into a building splats on the wall', async () => {
    const g = await makeGame('city');
    const people = g.sim.parts.citizens as Citizens;
    g.sim.run(10);
    // Find someone, and the building nearest them.
    const b = g.layout.buildings[10];
    const i = people.nearestTo(b.x, b.z + b.tiers[0].d / 2 + 6);
    const p = people.where(i);
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const d = Math.hypot(dx, dz);
    people.fling(i, (dx / d) * 30, 5, (dz / d) * 30);
    g.sim.run(60 * 3);
    expect(people.where(i).alive).toBe(false);
    expect(people.splats).toBe(1);
    expect(people.wallSplats).toBe(1);
    expect(people.flying).toBe(0);
  });

  it('someone thrown clear comes down as a splat on the ground', async () => {
    const g = await makeGame('city');
    const people = g.sim.parts.citizens as Citizens;
    g.sim.run(10);
    const i = people.nearestTo(g.layout.spawn.x, g.layout.spawn.z - 30);
    // Straight up: whatever is around, it lands back where it started.
    people.fling(i, 0, 25, 0);
    g.sim.run(20);
    expect(people.flying).toBe(1);
    expect(people.where(i).y).toBeGreaterThan(4);
    g.sim.run(60 * 6);
    expect(people.where(i).alive).toBe(false);
    expect(people.splats).toBe(1);
    expect(people.wallSplats).toBe(0);
  });

  it('a rampage leaves splats, some of them from people sent flying', async () => {
    const g = await makeGame('city');
    const people = g.sim.parts.citizens as Citizens;
    let flung = 0;
    g.sim.players[0].thrust = 1;
    g.sim.players[0].turn = 1;
    g.sim.run(40);
    g.sim.players[0].turn = 0;
    for (let i = 0; i < 60 * 10; i++) {
      // Swing about so the tail does its work.
      g.sim.players[0].turn = Math.floor(i / 50) % 2 ? 0.7 : -0.7;
      g.sim.step();
      flung = Math.max(flung, people.flying);
    }
    console.log(`rampage: ${g.damage.citizensSquished} people, ${people.splats} splats (${people.wallSplats} on walls), up to ${flung} in the air at once`);
    expect(g.damage.citizensSquished).toBeGreaterThan(0);
    expect(people.count - people.alive).toBe(g.damage.citizensSquished);
  });

  it('they cheer a repair', async () => {
    const g = await makeGame('city');
    const people = g.sim.parts.citizens as Citizens;
    g.sim.run(10);
    expect(people.cheering()).toBe(0);
    let cheers = 0;
    g.sim.on('citizenCheer', () => cheers++);
    const b = g.layout.blocks[0];
    g.sim.emit('piecePlace', { x: b.x, y: 20, z: b.z, straight: true, perfect: false, quick: false });
    g.sim.run(5);
    expect(cheers).toBe(1);
    expect(people.cheering()).toBeGreaterThan(5);
    g.sim.run(60 * 6);
    expect(people.cheering()).toBe(0);
  });
});
