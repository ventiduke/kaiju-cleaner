import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Pieces } from '../src/city/pieces';
import { ChunkState } from '../src/city/destruction';
import { makeGame, type Game } from './helpers';

interface Yard extends Game {
  pieces: Pieces;
}

async function yard(overrides: Record<string, unknown> = {}): Promise<Yard> {
  const g = await makeGame('yard', { city: { propDensity: 0 }, ...overrides });
  return { ...g, pieces: g.sim.parts.pieces as Pieces };
}

/** Slides the kaiju (tail and all) so that its hands hang over the given spot, whichever way it faces. */
function handsOver(g: Game, x: number, z: number): void {
  const t = g.sim.tuning;
  const k = g.kaiju;
  const p = k.position();
  const d = t.kaiju.bodyRadius + t.carry.holdForward;
  const dx = x - k.forward.x * d - p.x;
  const dz = z - k.forward.z * d - p.z;
  for (const b of [k.body, ...k.tail.segments]) {
    const q = b.translation();
    b.setTranslation({ x: q.x + dx, y: q.y, z: q.z + dz }, true);
  }
  g.sim.run(60);
}

/** Spins the kaiju (tail and all) to face +z, where the yard is open ground. */
function faceOpenGround(g: Game): void {
  const k = g.kaiju;
  const c = k.position();
  for (const b of [k.body, ...k.tail.segments]) {
    const q = b.translation();
    b.setTranslation({ x: 2 * c.x - q.x, y: q.y, z: 2 * c.z - q.z }, true);
    b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }
  g.sim.run(30);
}

/** A player who keeps the ring on the dot. */
function followDial(g: Yard): void {
  const inp = g.sim.players[0];
  inp.balanceX = g.pieces.needed.x;
  inp.balanceZ = g.pieces.needed.z;
}

/** Steps while carrying, with or without someone minding the balance. */
function carry(g: Yard, seconds: number, balancing: boolean): number {
  let worst = 0;
  for (let i = 0; i < seconds * 60; i++) {
    if (balancing && g.pieces.held?.state === 'held') followDial(g);
    g.sim.step();
    if (g.pieces.held) worst = Math.max(worst, g.pieces.held.tilt);
  }
  return worst;
}

describe('repair pieces', () => {
  it('start asleep in the road, with a place to go', async () => {
    const g = await yard();
    expect(g.pieces.pieces.length).toBe(1);
    const piece = g.pieces.pieces[0];
    g.sim.run(30);
    expect(piece.state).toBe('loose');
    expect(piece.body.isSleeping()).toBe(true);
    expect(piece.job.socket.y).toBe(20);
    // The topless tower is five floors: low enough to carry the top over.
    const stump = g.chunks.buildings[2];
    expect(stump.floorTotal.length).toBe(5);
  });

  it('hold the grab button near one and it is hoisted onto the hands; let go and it drops', async () => {
    const g = await yard();
    const piece = g.pieces.pieces[0];
    const inp = g.sim.players[0];
    handsOver(g, piece.job.start.x, piece.job.start.z + 4);
    inp.grab = true;
    g.sim.run(10);
    expect(piece.state).toBe('lifting');
    g.sim.run(50);
    expect(piece.state).toBe('held');
    expect(g.kaiju.carrying).toBe(1);
    const p = piece.body.translation();
    expect(p.y).toBeCloseTo(g.kaiju.position().y + g.sim.tuning.carry.handHeight, 0);
    expect(piece.tilt).toBeLessThan(0.05);
    // Out of reach, nothing happens.
    inp.grab = false;
    g.sim.run(120);
    expect(piece.state).toBe('loose');
    expect(g.pieces.held).toBe(null);
    expect(g.kaiju.carrying).toBe(0);
    expect(g.pieces.placed).toBe(0);
    handsOver(g, piece.job.start.x + 60, piece.job.start.z);
    inp.grab = true;
    g.sim.run(30);
    expect(g.pieces.held).toBe(null);
  });

  it('carrying is a balancing act: mind the dial and it stays up, ignore it and it slips', async () => {
    const run = async (balancing: boolean) => {
      const g = await yard();
      const piece = g.pieces.pieces[0];
      const inp = g.sim.players[0];
      faceOpenGround(g);
      handsOver(g, piece.job.start.x, piece.job.start.z);
      inp.grab = true;
      g.sim.run(60);
      inp.thrust = 1;
      const worst = carry(g, 5, balancing);
      inp.thrust = 0;
      const worstStop = carry(g, 4, balancing);
      return { drops: g.pieces.drops, worst: Math.max(worst, worstStop), held: g.pieces.held === piece, speed: g.kaiju.speed, g };
    };
    const minded = await run(true);
    const ignored = await run(false);
    expect(minded.drops).toBe(0);
    expect(minded.held).toBe(true);
    expect(minded.worst).toBeLessThan(minded.g.sim.tuning.carry.dropAngle * 0.6);
    expect(ignored.drops).toBe(1);
    expect(ignored.held).toBe(false);
  });

  it('is slower and gentler with its hands full, and a careful turn can be held', async () => {
    const g = await yard();
    const t = g.sim.tuning;
    const piece = g.pieces.pieces[0];
    const inp = g.sim.players[0];
    faceOpenGround(g);
    handsOver(g, piece.job.start.x, piece.job.start.z);
    inp.grab = true;
    g.sim.run(60);
    inp.thrust = 1;
    carry(g, 6, true);
    expect(g.kaiju.speed).toBeLessThan(t.kaiju.maxSpeed * t.carry.speed * 1.08);
    expect(g.kaiju.speed).toBeGreaterThan(t.kaiju.maxSpeed * t.carry.speed * 0.8);
    // Ease off to half speed and bring it round with the turn held.
    inp.thrust = 0.5;
    carry(g, 3, true);
    const yaw0 = g.kaiju.yaw;
    inp.turn = 1;
    carry(g, 3, true);
    inp.turn = 0;
    carry(g, 3, true);
    expect(Math.abs(g.kaiju.yaw - yaw0)).toBeGreaterThan(0.8);
    expect(g.pieces.drops).toBe(0);
    expect(g.pieces.held).toBe(piece);
  });

  it('goes in straight when let go squarely over its place', async () => {
    const g = await yard({ carry: { reach: 120 } });
    const piece = g.pieces.pieces[0];
    const s = piece.job.socket;
    handsOver(g, s.x, s.z);
    g.sim.players[0].grab = true;
    g.sim.run(60);
    expect(piece.state).toBe('held');
    let placed: boolean | null = null;
    g.sim.on('piecePlace', (e) => (placed = e.straight));
    g.sim.players[0].grab = false;
    g.sim.run(5);
    expect(piece.state).toBe('placed');
    expect(piece.fit).toBe('straight');
    expect(placed).toBe(true);
    expect(g.pieces.placed).toBe(1);
    expect(g.pieces.crooked).toBe(0);
    const p = piece.body.translation();
    expect([p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100)).toEqual([s.x, s.y, s.z]);
    g.sim.run(120);
    expect(piece.tilt).toBeLessThan(0.01);
    // The stump underneath was not disturbed by any of it.
    const stump = g.chunks.buildings[2];
    expect(g.chunks.chunks.slice(stump.first, stump.first + stump.count).every((c) => c.state === ChunkState.Fixed)).toBe(true);
  });

  it('still counts when let go a few metres off, but sits crooked', async () => {
    const g = await yard({ carry: { reach: 120 } });
    const piece = g.pieces.pieces[0];
    const s = piece.job.socket;
    handsOver(g, s.x + 4, s.z);
    g.sim.players[0].grab = true;
    g.sim.run(60);
    g.sim.players[0].grab = false;
    g.sim.run(5);
    expect(piece.state).toBe('placed');
    expect(piece.fit).toBe('crooked');
    expect(g.pieces.placed).toBe(1);
    expect(g.pieces.crooked).toBe(1);
    g.sim.run(60);
    const p = piece.body.translation();
    expect(Math.abs(p.x - s.x)).toBeGreaterThan(1);
    expect(piece.tilt).toBeGreaterThan(0.05);
    expect(piece.tilt).toBeLessThan(0.2);
  });

  it('just drops when let go nowhere near its place', async () => {
    const g = await yard({ carry: { reach: 120 } });
    const piece = g.pieces.pieces[0];
    const s = piece.job.socket;
    handsOver(g, s.x + 25, s.z + 30);
    g.sim.players[0].grab = true;
    g.sim.run(60);
    g.sim.players[0].grab = false;
    g.sim.run(240);
    expect(piece.state).toBe('loose');
    expect(g.pieces.placed).toBe(0);
    expect(piece.body.translation().y).toBeLessThan(6);
  });

  it('can be knocked off again, and picked back up', async () => {
    const g = await yard({ carry: { reach: 120 } });
    const piece = g.pieces.pieces[0];
    const s = piece.job.socket;
    handsOver(g, s.x, s.z);
    g.sim.players[0].grab = true;
    g.sim.run(60);
    g.sim.players[0].grab = false;
    g.sim.run(5);
    expect(g.pieces.placed).toBe(1);
    // Picking a placed piece up un-places it.
    g.sim.players[0].grab = true;
    g.sim.run(60);
    expect(piece.state).toBe('held');
    expect(g.pieces.placed).toBe(0);
    g.sim.players[0].grab = false;
    g.sim.run(5);
    expect(g.pieces.placed).toBe(1);
    // A cannonball does it too.
    handsOver(g, s.x + 80, s.z + 80);
    g.ball.throw(new THREE.Vector3(s.x, s.y + 5, s.z + 60), new THREE.Vector3(0, 0, -1));
    g.sim.run(90);
    expect(piece.state).toBe('loose');
    expect(g.pieces.placed).toBe(0);
  });

  it('the city has tower tops to put back and a bridge span to refit', async () => {
    const g = await makeGame('city');
    const pieces = g.sim.parts.pieces as Pieces;
    const cfg = g.sim.tuning.city;
    expect(pieces.pieces.length).toBe(cfg.repairJobs);
    const tops = g.layout.jobs.filter((j) => j.kind === 'top');
    const spans = g.layout.jobs.filter((j) => j.kind === 'span');
    expect(spans.length).toBe(1);
    expect(tops.length).toBe(cfg.repairJobs - 1);
    // Every stump is low enough to carry its top over, and the top starts clear of its own tower.
    for (const j of tops) {
      expect(j.socket.y).toBeLessThanOrEqual(5 * cfg.floorHeight);
      expect(Math.hypot(j.start.x - j.socket.x, j.start.z - j.socket.z)).toBeGreaterThan(15);
    }
    // The bridge with the missing span has a gap exactly where the span belongs.
    const road = g.layout.bridges.find((b) => b.gap !== undefined)!;
    const index = g.layout.buildings.length + g.layout.bridges.indexOf(road);
    const record = g.chunks.buildings[index];
    const deck = g.chunks.chunks.slice(record.first, record.first + record.count).filter((c) => c.floor === 1);
    const s = spans[0].socket;
    expect(deck.every((c) => Math.abs(c.z - s.z) > 3)).toBe(true);
    expect(s.x).toBe(road.center);
    // Nothing is stirred up by any of this at rest.
    g.sim.step();
    expect(g.awakeOthers()).toBe(0);
    g.sim.run(120);
    expect(g.awakeOthers()).toBe(0);
    expect(pieces.pieces.every((p) => p.state === 'loose')).toBe(true);
  });
});
