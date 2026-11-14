import { describe, expect, it } from 'vitest';
import { makeGame, type Game } from './helpers';

/** Steps the game, tracking physics cost. */
function drive(g: Game, seconds: number): { avgMs: number; worstMs: number } {
  let total = 0;
  let worst = 0;
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    g.sim.step();
    total += g.sim.lastStepMs;
    worst = Math.max(worst, g.sim.lastStepMs);
  }
  return { avgMs: total / n, worstMs: worst };
}

describe('M3 kaiju in the city', () => {
  it('can run a boulevard lane without breaking a single chunk', async () => {
    const g = await makeGame('city');
    const startZ = g.kaiju.position().z;
    g.sim.players[0].thrust = 0.6;
    const cost = drive(g, 30);
    const p = g.kaiju.position();
    console.log(
      `careful boulevard run: ${(startZ - p.z).toFixed(0)} m, ${g.damage.chunksBroken} chunks, ` +
        `${g.damage.propsDisturbed} props, physics ${cost.avgMs.toFixed(2)} ms avg`,
    );
    expect(startZ - p.z).toBeGreaterThan(300); // right through the city and out the far side
    expect(Math.abs(p.x - g.layout.spawn.x)).toBeLessThan(3);
    expect(g.damage.chunksBroken).toBe(0);
    expect(g.kaiju.stumbles + g.kaiju.falls).toBe(0);
    expect(cost.avgMs).toBeLessThan(8);
  });

  it('wrecks dozens of chunks and sets off multi-floor collapses when it runs through a block', async () => {
    const g = await makeGame('city');
    g.sim.players[0].thrust = 1;
    g.sim.players[0].turn = 1;
    g.sim.run(40);
    g.sim.players[0].turn = 0;
    const start = g.kaiju.position();
    const cost = drive(g, 12);
    const p = g.kaiju.position();
    const travelled = Math.hypot(p.x - start.x, p.z - start.z);
    console.log(
      `careless run: ${travelled.toFixed(0)} m, ${g.damage.chunksBroken} chunks in ${g.damage.buildingsDamaged} buildings, ` +
        `${g.chunks.fellCount} fell from lost support, biggest collapse ${g.chunks.biggestCollapse} floors, ` +
        `${g.damage.propsDisturbed} props, ${g.kaiju.stumbles} stumbles, ${g.kaiju.falls} falls, ` +
        `physics ${cost.avgMs.toFixed(2)} ms avg / ${cost.worstMs.toFixed(1)} ms worst`,
    );
    expect(g.damage.chunksBroken).toBeGreaterThan(48);
    expect(g.damage.buildingsDamaged).toBeGreaterThanOrEqual(2);
    expect(g.chunks.biggestCollapse).toBeGreaterThanOrEqual(3);
    expect(g.chunks.fellCount).toBeGreaterThan(20);
    // It ploughs through; it must never end up wedged in its own rubble.
    expect(travelled).toBeGreaterThan(150);
    expect(g.chunks.looseCount).toBeLessThanOrEqual(g.sim.tuning.destruction.debrisCap + 60);
    // Budget is 4 ms on a mid-range laptop; CI machines vary, so allow slack here.
    expect(cost.avgMs).toBeLessThan(8);
  });

  it('finds the side street a squeeze: even a centre-line walk knocks things about', async () => {
    const g = await makeGame('city');
    const side = g.layout.streets.find((s) => s.along === 'z' && s.width === g.sim.tuning.city.sideStreetWidth)!;
    // Carry the kaiju over to the mouth of the side street.
    const dx = side.center - g.layout.spawn.x;
    for (const b of [g.kaiju.body, ...g.kaiju.tail.segments]) {
      const t = b.translation();
      b.setTranslation({ x: t.x + dx, y: t.y, z: t.z }, true);
    }
    g.sim.run(90);
    g.sim.players[0].thrust = 0.6;
    drive(g, 30);
    console.log(`side street walk: ${g.damage.chunksBroken} chunks, ${g.damage.propsDisturbed} props`);
    expect(g.damage.propsDisturbed).toBeGreaterThan(3);
  });

  it('breaks a building by leaning on it at full thrust from a standstill', async () => {
    const g = await makeGame('yard', { city: { propDensity: 0 } });
    // Stand right in front of the slim tower (its face is at z = -52), then push.
    const k = g.kaiju;
    const shift = -52 + g.sim.tuning.kaiju.bodyRadius + 2.5 - g.layout.spawn.z;
    for (const b of [k.body, ...k.tail.segments]) {
      const t = b.translation();
      b.setTranslation({ x: t.x, y: t.y, z: t.z + shift }, true);
    }
    g.sim.run(120);
    expect(g.damage.chunksBroken).toBe(0);
    g.sim.players[0].thrust = 1;
    drive(g, 12);
    expect(g.damage.chunksBroken).toBeGreaterThan(10);
    expect(k.position().z).toBeLessThan(-80);
  });
});
