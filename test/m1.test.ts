import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildingChunks } from '../src/city/building';
import { chunkCount, generateCity } from '../src/city/cityGen';
import { ChunkState } from '../src/city/destruction';
import { makeTuning } from '../src/core/tuning';
import { makeGame } from './helpers';

describe('city layout', () => {
  const cfg = makeTuning().city;
  const layout = generateCity(cfg);

  it('is deterministic for a seed', () => {
    expect(generateCity(cfg)).toEqual(layout);
    expect(generateCity({ ...cfg, seed: cfg.seed + 1 })).not.toEqual(layout);
  });

  it('keeps every building inside a block, clear of the streets', () => {
    expect(layout.buildings.length).toBeGreaterThan(20);
    for (const b of layout.buildings) {
      const t = b.tiers[0];
      const inside = layout.blocks.some(
        (k) =>
          b.x - t.w / 2 >= k.x - k.w / 2 &&
          b.x + t.w / 2 <= k.x + k.w / 2 &&
          b.z - t.d / 2 >= k.z - k.d / 2 &&
          b.z + t.d / 2 <= k.z + k.d / 2,
      );
      expect(inside).toBe(true);
    }
  });

  it('has an avenue the kaiju fits down and a side street that is a squeeze', () => {
    const t = makeTuning();
    const stance = 2 * t.legs.stanceWidth + t.legs.footWidth;
    // Clear width between building faces is the road plus both sidewalks.
    expect(cfg.avenueWidth + 2 * cfg.sidewalk).toBeGreaterThan(stance + 6);
    // The side street leaves only a metre or so either side of the feet.
    expect(cfg.sideStreetWidth + 2 * cfg.sidewalk).toBeGreaterThan(stance);
    expect(cfg.sideStreetWidth + 2 * cfg.sidewalk).toBeLessThan(stance + 3);
  });

  it('gives every chunk above the ground floor something to rest on, whatever the building is made of', () => {
    const styles = new Set<string>();
    for (const b of layout.buildings) {
      const style = b.style ?? 'grid';
      styles.add(style);
      const chunks = buildingChunks(b, cfg.floorHeight);
      if (style === 'grid') expect(chunks.length).toBe(chunkCount(b));
      if (style === 'fine') expect(chunks.length).toBe(chunkCount(b) * 4);
      // Every box of the building is accounted for exactly once: the pieces fill it with no overlap.
      const volume = chunks.reduce((v, c) => v + c.boxes.reduce((k, x) => k + 8 * x.hx * x.hy * x.hz, 0), 0);
      const solid = b.tiers.reduce((v, t) => v + t.w * t.d * t.floors * cfg.floorHeight, 0);
      expect(volume).toBeCloseTo(solid, 3);
      for (const c of chunks) {
        const ground = c.boxes.some((x) => x.y - x.hy < 0.01);
        if (ground) expect(c.floor).toBe(0);
        else {
          expect(c.supports.length).toBeGreaterThan(0);
          for (const s of c.supports) expect(chunks[s.chunk].floor).toBeLessThanOrEqual(c.floor + 1);
        }
        const area = c.supports.reduce((a, s) => a + s.area, 0);
        const footprint = c.boxes.reduce((a, x) => a + 4 * x.hx * x.hz, 0);
        expect(area).toBeLessThanOrEqual(footprint + 1e-6);
        // And nothing rests on itself.
        expect(c.supports.every((s) => chunks[s.chunk] !== c)).toBe(true);
      }
    }
    // The city really is a mix.
    expect([...styles].sort()).toEqual(['brick', 'fine', 'grid', 'puzzle']);
    const puzzle = layout.buildings.find((b) => b.style === 'puzzle')!;
    const pieces = buildingChunks(puzzle, cfg.floorHeight);
    expect(pieces.some((c) => c.boxes.length === 2)).toBe(true); // L-shapes
    expect(pieces.some((c) => c.hy > cfg.floorHeight * 0.9)).toBe(true); // two-floor columns
  });
});

describe('M1 destruction', () => {
  it('idles with nothing awake in an untouched city', async () => {
    const g = await makeGame('city');
    g.sim.step();
    expect(g.awakeOthers()).toBe(0);
    g.sim.run(120);
    expect(g.awakeOthers()).toBe(0);
    expect(g.chunks.looseCount).toBe(0);
    expect(g.damage.chunksBroken).toBe(0);
    expect(g.damage.propsDisturbed).toBe(0);
    expect(g.chunks.fixedCount).toBeGreaterThan(800);
  });

  it('breaks a ground-floor chunk with a ball and drops the column above it', async () => {
    const g = await makeGame('yard');
    // The slim tower is building 1: 8 floors of 2x2 chunks, centred at (0, -60).
    const tower = g.chunks.buildings[1];
    // Aim at the corner away from the skybridge, so only this one column is involved.
    const target = g.chunks.chunks.slice(tower.first, tower.first + tower.count).find((c) => c.floor === 0 && c.x > 0 && c.z > -60)!;
    const origin = new THREE.Vector3(target.x, target.y + 1, target.z + 40);
    g.ball.throw(origin, new THREE.Vector3(0, 0, -1));
    g.sim.run(240);
    const column = g.chunks.chunks
      .slice(tower.first, tower.first + tower.count)
      .filter((c) => Math.abs(c.x - target.x) < 0.1 && Math.abs(c.z - target.z) < 0.1);
    expect(column.length).toBe(8);
    expect(target.state).not.toBe(ChunkState.Fixed);
    for (const c of column) expect(c.state).not.toBe(ChunkState.Fixed);
    expect(g.damage.chunksBroken).toBeGreaterThanOrEqual(8);
    expect(g.damage.buildingsDamaged).toBe(1);
    // The low block next door was never touched.
    const low = g.chunks.buildings[0];
    expect(g.chunks.chunks.slice(low.first, low.first + low.count).every((c) => c.state === ChunkState.Fixed)).toBe(true);
  });

  it('carries a heavy ball through what it breaks instead of stopping it dead', async () => {
    const g = await makeGame('yard');
    const tower = g.chunks.buildings[1];
    const target = g.chunks.chunks.slice(tower.first, tower.first + tower.count).find((c) => c.floor === 2 && c.x > 0 && c.z > -60)!;
    const ballBody = g.ball.throw(new THREE.Vector3(target.x, target.y, target.z + 40), new THREE.Vector3(0, 0, -1));
    g.sim.run(50);
    // After punching into the tower it should still be moving forward.
    expect(ballBody.linvel().z).toBeLessThan(-5);
  });

  it('fails a whole building once a floor loses too many pieces', async () => {
    const g = await makeGame('yard');
    const tower = g.chunks.buildings[1];
    const ground = [];
    for (let i = tower.first; i < tower.first + tower.count; i++) if (g.chunks.chunks[i].floor === 0) ground.push(i);
    // Three of four ground-floor chunks: under the 45% floor-fail line.
    for (const i of ground.slice(0, 3)) g.chunks.loosen(i, null);
    g.sim.run(120);
    for (let i = tower.first; i < tower.first + tower.count; i++) {
      expect(g.chunks.chunks[i].state).not.toBe(ChunkState.Fixed);
    }
  });

  it('drops a skybridge piece by piece when one end lets go', async () => {
    const g = await makeGame('yard');
    const bridge = g.chunks.buildings[3];
    expect(bridge.count).toBeGreaterThanOrEqual(3);
    const pieces = g.chunks.chunks.slice(bridge.first, bridge.first + bridge.count);
    g.sim.run(60);
    expect(pieces.every((c) => c.state === ChunkState.Fixed)).toBe(true);
    // Break the piece of the low block that the bridge hangs from.
    const anchor = pieces[0].supports[0].chunk;
    expect(g.chunks.chunks[anchor].building).toBe(0);
    g.chunks.loosen(anchor, null);
    g.sim.run(5);
    expect(pieces[0].state).toBe(ChunkState.Fixed); // the collapse delay hasn't run out yet
    g.sim.run(90);
    expect(pieces.every((c) => c.state !== ChunkState.Fixed)).toBe(true);
    // The tower at the far end only lost its bridge, not itself.
    const tower = g.chunks.buildings[1];
    expect(g.chunks.chunks.slice(tower.first, tower.first + tower.count).every((c) => c.state === ChunkState.Fixed)).toBe(true);
  });

  it('builds the city with a boulevard, a plaza and skybridges', async () => {
    const g = await makeGame('city');
    const cfg = g.sim.tuning.city;
    expect(g.layout.blocks.length).toBe(cfg.blocks * cfg.blocks);
    expect(g.layout.plazas.length).toBe(1);
    expect(g.layout.streets.filter((s) => s.width === cfg.boulevardWidth).length).toBe(1);
    expect(g.layout.bridges.length).toBeGreaterThanOrEqual(2);
    const sky = g.layout.bridges.filter((b) => b.kind === 'sky');
    const road = g.layout.bridges.filter((b) => b.kind === 'road');
    expect(sky.length).toBeGreaterThanOrEqual(3);
    for (const b of sky) {
      expect(b.to - b.from).toBeGreaterThanOrEqual(cfg.sideStreetWidth);
      // Low enough to catch a kaiju in the belly.
      expect(b.floor * cfg.floorHeight).toBeGreaterThan(g.sim.tuning.kaiju.legLength);
    }
    // A river splits the city, with road bridges on the wider streets and blocks on both banks.
    const river = g.layout.river!;
    expect(river.z1 - river.z0).toBe(cfg.riverWidth);
    expect(road.length).toBeGreaterThanOrEqual(2);
    for (const b of road) expect([b.from, b.to]).toEqual([river.z0, river.z1]);
    expect(g.layout.blocks.some((b) => b.z < river.z0)).toBe(true);
    expect(g.layout.blocks.some((b) => b.z > river.z1)).toBe(true);
    for (const b of g.layout.blocks) expect(b.z + b.d / 2 <= river.z0 || b.z - b.d / 2 >= river.z1).toBe(true);
    expect(g.sim.ground(0, (river.z0 + river.z1) / 2)).toBe(-cfg.riverDepth);
    expect(g.sim.ground(0, river.z1 + 5)).toBe(0);
    expect(g.layout.hazards.filter((h) => h.kind === 'oil').length).toBe(cfg.oilSlicks);
    console.log(
      `city: ${g.layout.sizeX} x ${g.layout.sizeZ} m, ${g.layout.buildings.length} buildings, ` +
        `${g.chunks.fixedCount} chunks, ${g.props.total} props, ${g.layout.bridges.length} skybridges`,
    );
  });

  it('brittle pieces crumble to dust and rubble when they land; sturdy ones stay as lumps', async () => {
    const g = await makeGame('yard');
    // Bring the slim tower down.
    const tower = g.chunks.buildings[1];
    const all = g.chunks.chunks.slice(tower.first, tower.first + tower.count);
    for (let i = tower.first; i < tower.first + 4; i++) g.chunks.loosen(i, null);
    let dust = 0;
    g.sim.on('chunkCrumble', () => dust++);
    g.sim.run(60 * 8);
    const gone = all.filter((c) => c.state === ChunkState.Gone);
    const left = all.filter((c) => c.state === ChunkState.Loose);
    expect(gone.length).toBeGreaterThan(5);
    expect(left.length).toBeGreaterThan(5);
    expect(g.chunks.crumbled).toBeGreaterThanOrEqual(gone.length); // the skybridge's pieces count too
    expect(dust).toBeGreaterThanOrEqual(gone.length);
    // Sturdy pieces never crumble; what crumbled left small rubble behind.
    expect(all.filter((c) => c.sturdy).every((c) => c.state === ChunkState.Loose)).toBe(true);
    expect(gone.every((c) => !c.sturdy)).toBe(true);
    expect(g.chunks.rubble.count).toBeGreaterThan(3);
  });

  it('a foot landing on rubble crushes the weak bits and stands on the sturdy lumps', async () => {
    const g = await makeGame('yard', { city: { propDensity: 0 } });
    const tower = g.chunks.buildings[1];
    for (let i = tower.first; i < tower.first + 4; i++) g.chunks.loosen(i, null);
    g.sim.run(60 * 8);
    const sturdyLeft = g.chunks.chunks.slice(tower.first, tower.first + tower.count).filter((c) => c.state === ChunkState.Loose && c.sturdy).length;
    expect(sturdyLeft).toBeGreaterThan(2);
    const crumbledBefore = g.chunks.crumbled;
    // Walk the kaiju straight through the pile.
    const k = g.kaiju;
    for (const b of [k.body, ...k.tail.segments]) {
      const t = b.translation();
      b.setTranslation({ x: t.x, y: t.y, z: t.z - 80 }, true);
    }
    g.sim.players[0].thrust = 0.35;
    let highest = 0;
    for (let i = 0; i < 60 * 12; i++) {
      g.sim.step();
      for (const f of k.legs.feet) if (!f.swinging) highest = Math.max(highest, f.pos.y);
    }
    // It stepped up onto something, and ground some of the small stuff to nothing.
    expect(highest).toBeGreaterThan(1.5);
    expect(g.chunks.rubble.crushed + g.chunks.crumbled - crumbledBefore).toBeGreaterThan(0);
    expect(k.falls).toBe(0);
  });

  it('lets wreckage settle back to sleep', async () => {
    const g = await makeGame('yard');
    const tower = g.chunks.buildings[1];
    g.chunks.loosen(tower.first, null);
    g.chunks.loosen(tower.first + 1, null);
    g.chunks.loosen(tower.first + 2, null);
    g.sim.run(60 * 20);
    // The tower's 32 chunks and the skybridge it was holding up, less whatever crumbled.
    expect(g.chunks.looseCount + g.chunks.crumbled).toBeGreaterThanOrEqual(32);
    expect(g.chunks.looseCount + g.chunks.crumbled).toBeLessThanOrEqual(36);
    expect(g.chunks.looseCount).toBeGreaterThan(8);
    expect(g.awakeOthers()).toBeLessThan(4);
  });

  it('keeps live debris under the cap by shrinking away the oldest', async () => {
    const g = await makeGame('yard', { destruction: { debrisCap: 50 } });
    for (const b of g.chunks.buildings) g.chunks.loosen(b.first, null);
    for (let i = 0; i < g.chunks.chunks.length; i++) g.chunks.loosen(i, null);
    g.sim.run(60 * 4);
    expect(g.chunks.looseCount).toBeLessThanOrEqual(50);
    expect(g.chunks.chunks.filter((c) => c.state === ChunkState.Gone).length).toBeGreaterThan(10);
  });

  it('stays inside the physics budget with 150 pieces of debris in motion', async () => {
    const g = await makeGame('city');
    // Blow the upper floors off several buildings so the debris is really flying and colliding.
    let loosened = 0;
    for (const b of g.chunks.buildings) {
      if (loosened >= 150) break;
      for (let i = b.first + b.count - 1; i >= b.first && loosened < 150; i--) {
        const c = g.chunks.chunks[i];
        if (c.floor < 2) break;
        const a = i * 2.4;
        g.chunks.loosen(i, new THREE.Vector3(Math.cos(a) * 7, 3, Math.sin(a) * 7));
        loosened++;
      }
    }
    expect(loosened).toBe(150);
    let total = 0;
    let worst = 0;
    let peakAwake = 0;
    const steps = 180;
    for (let i = 0; i < steps; i++) {
      g.sim.step();
      total += g.sim.lastStepMs;
      worst = Math.max(worst, g.sim.lastStepMs);
      peakAwake = Math.max(peakAwake, g.awakeOthers());
    }
    const ms = total / steps;
    console.log(
      `physics: ${ms.toFixed(2)} ms avg, ${worst.toFixed(2)} ms worst over ${steps} steps; ` +
        `peak ${peakAwake} awake, ${g.chunks.looseCount} loose, ${g.damage.propsDisturbed} props disturbed`,
    );
    expect(peakAwake).toBeGreaterThanOrEqual(150);
    // Budget is 4 ms on a mid-range laptop; CI machines vary, so allow slack here.
    expect(ms).toBeLessThan(8);
  });
});
