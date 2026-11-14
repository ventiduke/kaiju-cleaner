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

  it('gives every chunk above the ground floor something to rest on', () => {
    for (const b of layout.buildings) {
      const chunks = buildingChunks(b, cfg.floorHeight);
      expect(chunks.length).toBe(chunkCount(b));
      for (const c of chunks) {
        if (c.floor === 0) expect(c.supports.length).toBe(0);
        else {
          expect(c.supports.length).toBeGreaterThan(0);
          const area = c.supports.reduce((a, s) => a + s.area, 0);
          expect(area).toBeLessThanOrEqual(4 * c.hx * c.hz + 1e-6);
          for (const s of c.supports) expect(chunks[s.chunk].floor).toBe(c.floor - 1);
        }
      }
    }
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
    for (const b of g.layout.bridges) {
      expect(b.to - b.from).toBeGreaterThanOrEqual(cfg.sideStreetWidth);
      // Low enough to catch a kaiju in the belly.
      expect(b.floor * cfg.floorHeight).toBeGreaterThan(g.sim.tuning.kaiju.legLength);
    }
    console.log(
      `city: ${g.layout.sizeX} x ${g.layout.sizeZ} m, ${g.layout.buildings.length} buildings, ` +
        `${g.chunks.fixedCount} chunks, ${g.props.total} props, ${g.layout.bridges.length} skybridges`,
    );
  });

  it('lets wreckage settle back to sleep', async () => {
    const g = await makeGame('yard');
    const tower = g.chunks.buildings[1];
    g.chunks.loosen(tower.first, null);
    g.chunks.loosen(tower.first + 1, null);
    g.chunks.loosen(tower.first + 2, null);
    g.sim.run(60 * 20);
    // The tower's 32 chunks, plus the skybridge it was holding up.
    expect(g.chunks.looseCount).toBeGreaterThanOrEqual(32);
    expect(g.chunks.looseCount).toBeLessThanOrEqual(36);
    expect(g.awakeOthers()).toBeLessThan(4);
  });

  it('keeps live debris under the cap by shrinking away the oldest', async () => {
    const g = await makeGame('yard', { destruction: { debrisCap: 50 } });
    for (const b of g.chunks.buildings) g.chunks.loosen(b.first, null);
    for (let i = 0; i < g.chunks.chunks.length; i++) g.chunks.loosen(i, null);
    g.sim.run(60 * 4);
    expect(g.chunks.looseCount).toBeLessThanOrEqual(50);
    expect(g.chunks.chunks.filter((c) => c.state === ChunkState.Gone).length).toBeGreaterThan(40);
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
