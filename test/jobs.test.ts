import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cityFor, DIFFICULTY, makeTuning } from '../src/core/tuning';
import type { Approval } from '../src/city/approval';
import { ChunkState } from '../src/city/destruction';
import type { Pieces } from '../src/city/pieces';
import type { Sweeps } from '../src/city/sweeps';
import type { Nose } from '../src/kaiju/nose';
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

function tap(g: Game): void {
  g.sim.players[0].grab = true;
  g.sim.step();
  g.sim.players[0].grab = false;
}

describe('a bus on a roof', () => {
  it('sits up there quietly, and can be lifted down and set on the road', async () => {
    const g = await makeGame('yard', { city: { propDensity: 0 }, carry: { wander: 0 } });
    const pieces = g.sim.parts.pieces as Pieces;
    const bus = pieces.pieces[2];
    expect(bus.job.kind).toBe('bus');
    g.sim.run(60);
    // On the roof of the three-floor block, asleep, level.
    expect(bus.body.isSleeping()).toBe(true);
    expect(bus.body.translation().y).toBeCloseTo(12, 0);
    expect(bus.tilt).toBeLessThan(0.02);
    const block = g.chunks.buildings[0];
    expect(g.chunks.chunks.slice(block.first, block.first + block.count).every((c) => c.state === ChunkState.Fixed)).toBe(true);
    // Stand in front of the block (it faces -z; the block is to the north) and click.
    const reach = g.sim.tuning.kaiju.bodyRadius + g.sim.tuning.carry.holdForward;
    moveTo(g, bus.job.start.x, bus.job.start.z + reach + 4);
    expect(pieces.nearest()).toBe(bus);
    tap(g);
    g.sim.run(50);
    expect(bus.state).toBe('held');
    // Lifting it off did not hurt the building.
    expect(g.damage.chunksBroken).toBe(0);
    // Over to its marker, and down.
    const s = bus.job.socket;
    moveTo(g, s.x, s.z + reach);
    let placed: boolean | null = null;
    g.sim.on('piecePlace', (e) => (placed = e.straight));
    tap(g);
    g.sim.run(5);
    expect(bus.state).toBe('placed');
    expect(placed).not.toBe(null);
    expect(bus.body.translation().y).toBeLessThan(0.5);
  });

  it('comes down with the building if the building goes', async () => {
    const g = await makeGame('yard', { city: { propDensity: 0 } });
    const pieces = g.sim.parts.pieces as Pieces;
    const bus = pieces.pieces[2];
    const block = g.chunks.buildings[0];
    expect(block.count).toBeGreaterThan(0);
    // A gale straight through the block (what a sneeze does).
    g.chunks.blast(new THREE.Vector3(bus.job.start.x, 6, bus.job.start.z + 30), new THREE.Vector3(0, 0, -1), 70, 0.5, 34);
    g.sim.run(360);
    expect(bus.state).toBe('loose');
    expect(bus.body.translation().y).toBeLessThan(9);
  });
});

describe('a blocked road', () => {
  it('is cleared by shoving the rubble off it, lump by lump', async () => {
    const g = await makeGame('yard', { city: { propDensity: 0 } });
    const sweeps = g.sim.parts.sweeps as Sweeps;
    const sweep = sweeps.sweeps[0];
    expect(sweep.lumps.length).toBeGreaterThanOrEqual(6);
    g.sim.run(60);
    expect(sweep.done).toBe(false);
    expect(sweep.remaining).toBe(sweep.lumps.length);
    expect(sweep.lumps.every((b) => b.isSleeping())).toBe(true);
    let done = 0;
    g.sim.on('sweepDone', () => done++);
    // Walk straight through the middle of it: lumps go flying, but not all of them.
    const before = sweep.remaining;
    moveTo(g, sweep.spec.x, sweep.spec.z + 45);
    g.sim.players[0].thrust = 1;
    g.sim.run(60 * 5);
    g.sim.players[0].thrust = 0;
    g.sim.run(120);
    expect(sweep.remaining).toBeLessThan(before);
    expect(g.kaiju.position().z).toBeLessThan(sweep.spec.z - 5);
    // Back and forth until it is clear.
    for (let pass = 0; pass < 8 && !sweep.done; pass++) {
      const side = (pass % 3) - 1;
      moveTo(g, sweep.spec.x + side * 6, sweep.spec.z + 45);
      g.sim.players[0].thrust = 1;
      g.sim.run(60 * 5);
      g.sim.players[0].thrust = 0;
      g.sim.run(90);
    }
    expect(sweep.done).toBe(true);
    expect(done).toBe(1);
    expect(sweeps.allDone()).toBe(true);
  });

  it('a sneeze clears most of it in one go', async () => {
    const g = await makeGame('yard', { city: { propDensity: 0 } });
    const sweeps = g.sim.parts.sweeps as Sweeps;
    const nose = g.sim.parts.nose as Nose;
    const sweep = sweeps.sweeps[0];
    moveTo(g, sweep.spec.x, sweep.spec.z + 26);
    const before = sweep.remaining;
    nose.sneeze();
    g.sim.run(240);
    expect(sweep.remaining).toBeLessThan(before / 2);
  });
});

describe('the city job list', () => {
  it('has every kind of job, each with somewhere to go, and nothing stirs before the kaiju does', async () => {
    const g = await makeGame('city');
    const cfg = g.sim.tuning.city;
    const approval = g.sim.parts.approval as Approval;
    const sweeps = g.sim.parts.sweeps as Sweeps;
    const jobs = approval.board.list();
    expect(sweeps.sweeps.length).toBe(cfg.sweepJobs);
    expect(jobs.length).toBe(cfg.repairJobs + cfg.monuments + cfg.busJobs + cfg.sweepJobs);
    expect(new Set(jobs.map((j) => j.name))).toEqual(new Set(['Tower top', 'Bridge span', 'Toppled clock tower', 'Bus on a roof', 'Blocked road']));
    expect(approval.board.done).toBe(0);
    expect(approval.board.allDone()).toBe(false);
    // Buses are on low roofs, and belong on a road.
    for (const j of g.layout.jobs.filter((x) => x.kind === 'bus')) {
      expect(j.start.y).toBeGreaterThanOrEqual(2 * cfg.floorHeight);
      expect(j.start.y).toBeLessThanOrEqual(4 * cfg.floorHeight);
      expect(g.layout.blocks.some((b) => Math.abs(j.socket.x - b.x) < b.w / 2 && Math.abs(j.socket.z - b.z) < b.d / 2)).toBe(false);
    }
    // Blocked stretches are on roads, full of rubble.
    for (const s of sweeps.sweeps) {
      expect(g.layout.blocks.some((b) => Math.abs(s.spec.x - b.x) < b.w / 2 && Math.abs(s.spec.z - b.z) < b.d / 2)).toBe(false);
      expect(s.lumps.length).toBeGreaterThanOrEqual(5);
      expect(s.done).toBe(false);
    }
    g.sim.run(120);
    expect(g.awakeOthers()).toBe(0);
    expect(approval.value).toBe(50);
  });
});

describe('difficulty', () => {
  it('is the same city with the streets pulled in, the side streets most, and never too narrow to walk', async () => {
    const shipped = makeTuning();
    const widths = DIFFICULTY.map((_, level) => {
      const t = makeTuning({ game: { difficulty: level } });
      const c = cityFor(t);
      return [c.boulevardWidth, c.avenueWidth, c.sideStreetWidth];
    });
    expect(widths[0]).toEqual([shipped.city.boulevardWidth, shipped.city.avenueWidth, shipped.city.sideStreetWidth]);
    for (let level = 1; level < widths.length; level++) {
      for (let kind = 0; kind < 3; kind++) expect(widths[level][kind]).toBeLessThan(widths[level - 1][kind]);
      // The side streets lose the most.
      expect(widths[level][2] / widths[0][2]).toBeLessThan(widths[level][0] / widths[0][0]);
      // A kaiju can still get down the narrowest of them with room either side.
      expect(widths[level][2]).toBeGreaterThanOrEqual(shipped.kaiju.bodyRadius * 2 + 6);
    }
    // The hardest city is really built that way, with every job it had before.
    // (At the size and in the streets it ships with: the tests' giant would not fit down them.)
    const asShipped = { kaiju: shipped.kaiju, city: shipped.city };
    const easy = await makeGame('city', { ...asShipped, game: { difficulty: 0 } });
    const hard = await makeGame('city', { ...asShipped, game: { difficulty: 2 } });
    const narrowest = (g: typeof easy) => Math.min(...g.layout.streets.map((s) => s.width));
    expect(narrowest(hard)).toBeLessThan(narrowest(easy) * 0.7);
    expect(hard.layout.jobs.length).toBe(easy.layout.jobs.length);
    expect(hard.layout.sweeps.length).toBe(easy.layout.sweeps.length);
    hard.sim.run(60);
    expect(hard.awakeOthers()).toBe(0);
    expect(hard.damage.chunksBroken).toBe(0);
  });
});
