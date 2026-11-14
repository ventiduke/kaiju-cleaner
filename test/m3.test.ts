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

describe('river, oil and townsfolk', () => {
  it('wades the river: down the bank, slower through the water, and up the far side', async () => {
    const g = await makeGame('city');
    const river = g.layout.river!;
    const k = g.kaiju;
    g.sim.players[0].thrust = 0.6;
    let lowest = Infinity;
    let wadingSpeed = 0;
    let wet = 0;
    g.sim.on('footfall', (e) => (wet += e.wet ? 1 : 0));
    for (let i = 0; i < 60 * 40 && k.position().z > river.z0 - 40; i++) {
      g.sim.step();
      const p = k.position();
      if (p.z < river.z1 - 12 && p.z > river.z0 + 12) {
        lowest = Math.min(lowest, p.y);
        wadingSpeed = Math.max(wadingSpeed, k.speed);
      }
    }
    expect(k.position().z).toBeLessThan(river.z0 - 30);
    // In mid-river it stands on the bed, a river-depth lower, with its feet down there too.
    expect(lowest).toBeLessThan(k.rideHeight - river.depth * 0.7);
    expect(wadingSpeed).toBeLessThan(g.sim.tuning.kaiju.maxSpeed * 0.6 * 0.8);
    expect(wet).toBeGreaterThan(2);
    // Back on the street at full height, and it never fell over the bank.
    expect(k.position().y).toBeGreaterThan(k.rideHeight - 1.5);
    expect(k.falls).toBe(0);
  });

  it('drops a road bridge when a pier is knocked out', async () => {
    const g = await makeGame('city');
    const index = g.layout.buildings.length + g.layout.bridges.findIndex((b) => b.kind === 'road' && b.gap === undefined);
    const bridge = g.chunks.buildings[index];
    const pieces = g.chunks.chunks.slice(bridge.first, bridge.first + bridge.count);
    const piers = pieces.filter((c) => c.floor === 0);
    const deck = pieces.filter((c) => c.floor === 1);
    expect(piers.length).toBeGreaterThanOrEqual(3);
    expect(deck.length).toBe(piers.length + 1);
    g.sim.run(30);
    expect(pieces.every((c) => c.state === 0)).toBe(true);
    g.chunks.loosen(g.chunks.chunks.indexOf(piers[1]), null);
    g.sim.run(60 * 3);
    expect(deck.every((c) => c.state !== 0)).toBe(true);
  });

  it('has no grip on an oil slick', async () => {
    const slide = async (oily: boolean) => {
      const g = await makeGame('yard', { city: { propDensity: 0 } });
      if (!oily) g.sim.traction = () => 1;
      const k = g.kaiju;
      // Carry it to just short of the slick (at x -60, z 30), heading across it.
      for (const b of [k.body, ...k.tail.segments]) {
        const t = b.translation();
        b.setTranslation({ x: t.x - 60, y: t.y, z: t.z + 60 }, true);
      }
      g.sim.players[0].thrust = 0.5;
      for (let i = 0; i < 600 && k.position().z > 38; i++) g.sim.step();
      // Hard left on the slick.
      g.sim.players[0].turn = 1;
      const x0 = k.position().x;
      let onOil = false;
      for (let i = 0; i < 50; i++) {
        g.sim.step();
        onOil ||= k.traction < 0.5;
      }
      return { drift: Math.abs(k.position().x - x0), onOil };
    };
    const dry = await slide(false);
    const oily = await slide(true);
    expect(oily.onOil).toBe(true);
    expect(dry.onOil).toBe(false);
    // On oil it keeps sliding the way it was going instead of following its nose.
    expect(oily.drift).toBeLessThan(dry.drift * 0.5);
  });

  it('townsfolk stroll, run from a stomping kaiju, and get squished underfoot', async () => {
    const g = await makeGame('city');
    const people = g.sim.parts.citizens as import('../src/city/citizens').Citizens;
    expect(people.count).toBeGreaterThan(200);
    g.sim.run(60);
    expect(people.scared).toBeLessThan(3);
    const before = people.positions();
    g.sim.run(120);
    const after = people.positions();
    const moved = after.filter((p, i) => Math.hypot(p.x - before[i].x, p.z - before[i].z) > 1).length;
    expect(moved).toBeGreaterThan(people.count * 0.8);
    // Nobody strolls into the river.
    const river = g.layout.river!;
    expect(after.every((p) => p.z < river.z0 || p.z > river.z1)).toBe(true);

    // Now run the kaiju through town.
    g.sim.players[0].thrust = 1;
    g.sim.players[0].turn = 1;
    g.sim.run(40);
    g.sim.players[0].turn = 0;
    let peak = 0;
    for (let i = 0; i < 60 * 8; i++) {
      g.sim.step();
      peak = Math.max(peak, people.scared);
    }
    expect(peak).toBeGreaterThan(5);
    expect(g.damage.citizensSquished).toBe(people.count - people.alive);
    console.log(`townsfolk: ${people.count}, peak ${peak} running, ${g.damage.citizensSquished} squished`);
  });

  it('scares fewer people on tiptoe', async () => {
    const scare = async (tiptoe: boolean) => {
      const g = await makeGame('city');
      const people = g.sim.parts.citizens as import('../src/city/citizens').Citizens;
      g.sim.players[0].thrust = tiptoe ? 1 : g.sim.tuning.modes.tiptoeSpeed;
      g.sim.players[0].tiptoe = tiptoe;
      let total = 0;
      for (let i = 0; i < 60 * 6; i++) {
        g.sim.step();
        total += people.scared;
      }
      return total;
    };
    expect(await scare(true)).toBeLessThan((await scare(false)) * 0.7);
  });
});
