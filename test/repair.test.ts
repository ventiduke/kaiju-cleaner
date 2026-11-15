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

/** One press of the grab button: a click. */
function press(g: Yard): void {
  g.sim.players[0].grab = true;
  g.sim.step();
  g.sim.players[0].grab = false;
}

/** Presses grab and waits for the piece to be up on the hands. */
function pickUp(g: Yard): void {
  press(g);
  g.sim.run(45);
}

/** A player who does what the prompt says: a shove of the mouse the way the arrow points. */
function mind(g: Yard): void {
  g.sim.players[0].balanceZ = g.pieces.prompt * 0.1;
}

/** Steps while holding, with or without someone minding the gauge. Returns the lowest the grip got. */
function carry(g: Yard, seconds: number, minding: boolean): number {
  let worst = 1;
  for (let i = 0; i < seconds * 60; i++) {
    if (minding) mind(g);
    g.sim.step();
    if (g.pieces.held) worst = Math.min(worst, g.pieces.grip);
  }
  g.sim.players[0].balanceZ = 0;
  return worst;
}

/** No shifting loads: only the kaiju's own motion moves the gauge. */
const STILL = { carry: { wander: 0 } };

describe('repair pieces', () => {
  it('start asleep, each with a place to go', async () => {
    const g = await yard();
    expect(g.pieces.pieces.map((p) => p.job.kind)).toEqual(['top', 'raise', 'bus']);
    const [top, tower] = g.pieces.pieces;
    g.sim.run(30);
    expect(top.state).toBe('loose');
    expect(top.body.isSleeping()).toBe(true);
    expect(top.job.socket.y).toBe(20);
    // The topless tower is five floors: low enough to carry the top over.
    const stump = g.chunks.buildings[2];
    expect(stump.floorTotal.length).toBe(5);
    // The clock tower is lying on its side, and stays there.
    expect(tower.body.isSleeping()).toBe(true);
    expect(tower.tilt).toBeCloseTo(Math.PI / 2, 1);
    expect(tower.body.translation().x).toBeCloseTo(tower.job.start.x, 1);
  });

  it('one click takes hold and hoists it onto the hands; the next lets go', async () => {
    const g = await yard();
    const piece = g.pieces.pieces[0];
    handsOver(g, piece.job.start.x, piece.job.start.z + 4);
    press(g);
    g.sim.run(9);
    expect(piece.state).toBe('lifting');
    g.sim.run(50);
    // Nothing is being held down, and it is still in hand.
    expect(g.sim.players[0].grab).toBe(false);
    expect(piece.state).toBe('held');
    expect(g.kaiju.carrying).toBe(1);
    const p = piece.body.translation();
    expect(p.y).toBeCloseTo(g.kaiju.position().y + g.sim.tuning.carry.handHeight, 0);
    g.sim.run(120);
    expect(g.pieces.held).toBe(piece);
    press(g);
    g.sim.run(120);
    expect(piece.state).toBe('loose');
    expect(g.pieces.held).toBe(null);
    expect(g.kaiju.carrying).toBe(0);
    expect(g.pieces.placed).toBe(0);
    expect(g.pieces.drops).toBe(0);
    // Out of reach, a click does nothing.
    handsOver(g, piece.job.start.x + 60, piece.job.start.z);
    press(g);
    g.sim.run(30);
    expect(g.pieces.held).toBe(null);
  });

  it('the gauge sits still for gentle handling and is thrown by sudden moves', async () => {
    const g = await yard(STILL);
    const piece = g.pieces.pieces[0];
    const inp = g.sim.players[0];
    faceOpenGround(g);
    handsOver(g, piece.job.start.x, piece.job.start.z);
    pickUp(g);
    const watch = (ticks: number) => {
      let lo = 0;
      let hi = 0;
      let prompted = 0;
      for (let i = 0; i < ticks; i++) {
        g.sim.step();
        lo = Math.min(lo, g.pieces.marker);
        hi = Math.max(hi, g.pieces.marker);
        if (g.pieces.prompt) prompted = g.pieces.prompt;
        g.pieces.grip = 1;
      }
      return { lo, hi, prompted };
    };
    // Standing still: dead centre, nothing to do.
    const idle = watch(240);
    expect(idle.lo).toBeGreaterThan(-0.05);
    expect(idle.hi).toBeLessThan(0.05);
    expect(idle.prompted).toBe(0);
    // Setting off flat out throws it down the gauge: "mouse up".
    inp.thrust = 1;
    const start = watch(90);
    expect(start.lo).toBeLessThan(-0.45);
    expect(start.prompted).toBe(1);
    // Once it is up to speed it settles again.
    watch(360);
    const cruise = watch(120);
    expect(cruise.lo).toBeGreaterThan(-0.2);
    expect(cruise.hi).toBeLessThan(0.2);
    // A hard left throws it up: "mouse down". An easy one doesn't trouble it.
    inp.turn = 1;
    const hard = watch(90);
    expect(hard.hi).toBeGreaterThan(0.45);
    expect(hard.prompted).toBe(-1);
    inp.turn = 0;
    watch(180);
    inp.turn = -0.35;
    const easy = watch(120);
    expect(easy.prompted).toBe(0);
    expect(g.pieces.held).toBe(piece);
  });

  it('a shove of the mouse the way the prompt says fixes it, and cannot overdo it', async () => {
    const g = await yard(STILL);
    const piece = g.pieces.pieces[0];
    const inp = g.sim.players[0];
    faceOpenGround(g);
    handsOver(g, piece.job.start.x, piece.job.start.z);
    pickUp(g);
    inp.thrust = 1;
    while (g.pieces.prompt === 0 && g.sim.tick < 2000) g.sim.step();
    expect(g.pieces.prompt).toBe(1);
    // One enormous heave upward: back in the band, and no further than its far side.
    inp.balanceZ = 1;
    g.sim.step();
    inp.balanceZ = 0;
    expect(g.pieces.prompt).toBe(0);
    expect(g.pieces.marker).toBeLessThan(g.sim.tuning.carry.tolerance);
    expect(g.pieces.marker).toBeGreaterThan(0);
    // Shoving the wrong way while it is out does nothing worse than leave it there.
    inp.thrust = 0;
    g.sim.run(240);
    expect(g.pieces.prompt).toBe(0);
    inp.balanceZ = -1;
    g.sim.step();
    inp.balanceZ = 0;
    expect(g.pieces.prompt).toBe(0);
    expect(g.pieces.held).toBe(piece);
  });

  it('carrying is a balancing act: follow the prompts and it stays up, ignore them and it slips', async () => {
    const run = async (minding: boolean) => {
      const g = await yard();
      const piece = g.pieces.pieces[0];
      const inp = g.sim.players[0];
      faceOpenGround(g);
      handsOver(g, piece.job.start.x, piece.job.start.z);
      pickUp(g);
      // Set off, throw it round one way and the other, and pull up.
      inp.thrust = 1;
      let worst = carry(g, 4, minding);
      inp.turn = 1;
      worst = Math.min(worst, carry(g, 3, minding));
      inp.turn = -1;
      worst = Math.min(worst, carry(g, 3, minding));
      inp.turn = 0;
      inp.thrust = 0;
      worst = Math.min(worst, carry(g, 4, minding));
      return { drops: g.pieces.drops, worst, held: g.pieces.held === piece };
    };
    const minded = await run(true);
    const ignored = await run(false);
    expect(minded.drops).toBe(0);
    expect(minded.held).toBe(true);
    expect(minded.worst).toBeGreaterThan(0.8);
    expect(ignored.drops).toBe(1);
    expect(ignored.held).toBe(false);
  });

  it('the load shifts by itself now and then, less so with feet planted', async () => {
    const shifts = async (planted: boolean) => {
      const g = await yard({ carry: { shiftEvery: 2 } });
      const piece = g.pieces.pieces[0];
      faceOpenGround(g);
      handsOver(g, piece.job.start.x, piece.job.start.z);
      pickUp(g);
      g.sim.players[0].crouch = planted;
      let prompts = 0;
      let was = 0;
      for (let i = 0; i < 20 * 60; i++) {
        mind(g);
        g.sim.step();
        if (g.pieces.prompt && !was) prompts++;
        was = g.pieces.prompt;
      }
      return { prompts, g, piece };
    };
    const standing = await shifts(false);
    const planted = await shifts(true);
    expect(standing.prompts).toBeGreaterThan(3);
    expect(planted.prompts).toBe(0);
    expect(standing.g.pieces.held).toBe(standing.piece);
    // Planted, it will not walk or turn; and it does not drop to a crawl with its hands full.
    const { g } = planted;
    const at = g.kaiju.position().clone();
    const yaw = g.kaiju.yaw;
    g.sim.players[0].thrust = 1;
    g.sim.players[0].turn = 1;
    g.sim.run(120);
    expect(g.kaiju.planted).toBe(true);
    expect(g.kaiju.mode).toBe('normal');
    expect(g.kaiju.position().distanceTo(at)).toBeLessThan(2);
    expect(Math.abs(g.kaiju.yaw - yaw)).toBeLessThan(0.1);
    // Feet free again, off it goes.
    g.sim.players[0].crouch = false;
    g.sim.players[0].turn = 0;
    carry(g, 2, true);
    expect(g.kaiju.planted).toBe(false);
    expect(g.kaiju.position().distanceTo(at)).toBeGreaterThan(8);
  });

  it('is slower and gentler with its hands full, and a careful turn needs no minding', async () => {
    const g = await yard(STILL);
    const t = g.sim.tuning;
    const piece = g.pieces.pieces[0];
    const inp = g.sim.players[0];
    faceOpenGround(g);
    handsOver(g, piece.job.start.x, piece.job.start.z);
    pickUp(g);
    inp.thrust = 1;
    carry(g, 6, true);
    expect(g.kaiju.speed).toBeLessThan(t.kaiju.maxSpeed * t.carry.speed * 1.08);
    expect(g.kaiju.speed).toBeGreaterThan(t.kaiju.maxSpeed * t.carry.speed * 0.8);
    // Ease off to half speed and bring it round gently, hands off the mouse.
    inp.thrust = 0.5;
    carry(g, 3, true);
    const yaw0 = g.kaiju.yaw;
    inp.turn = 0.4;
    const worst = carry(g, 5, false);
    inp.turn = 0;
    expect(Math.abs(g.kaiju.yaw - yaw0)).toBeGreaterThan(0.8);
    expect(worst).toBeGreaterThan(0.95);
    expect(g.pieces.drops).toBe(0);
    expect(g.pieces.held).toBe(piece);
  });

  it('a toppled piece is stood up where it lies: steady heaving with the gauge in the green', async () => {
    const g = await yard();
    const tower = g.pieces.pieces[1];
    const s = tower.job.socket;
    // Stand by its middle and take hold.
    handsOver(g, s.x + 12, s.z + 2);
    expect(g.pieces.nearest()).toBe(tower);
    press(g);
    expect(tower.state).toBe('raising');
    g.sim.run(30);
    expect(g.kaiju.planted).toBe(true);
    // Rooted to the spot while it heaves.
    const at = g.kaiju.position().clone();
    g.sim.players[0].thrust = 1;
    let placed: boolean | null = null;
    g.sim.on('piecePlace', (e) => (placed = e.straight));
    let last = 0;
    let rose = true;
    for (let i = 0; i < 12 * 60 && tower.state === 'raising'; i++) {
      mind(g);
      g.sim.step();
      if (i === 90) expect(g.pieces.progress).toBeGreaterThan(0.15);
      if (g.pieces.progress < last - 0.05) rose = false;
      last = Math.max(last, g.pieces.progress);
    }
    g.sim.players[0].thrust = 0;
    expect(rose).toBe(true);
    expect(tower.state).toBe('placed');
    expect(placed).toBe(true);
    expect(g.pieces.placed).toBe(1);
    expect(g.pieces.held).toBe(null);
    expect(g.kaiju.planted).toBe(false);
    expect(g.kaiju.position().distanceTo(at)).toBeLessThan(3);
    const p = tower.body.translation();
    expect([p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100)).toEqual([s.x, s.y, s.z]);
    g.sim.run(60);
    expect(tower.tilt).toBeLessThan(0.01);
  });

  it('let the gauge go while heaving and it sags back, then slips out of the hands', async () => {
    const g = await yard({ carry: { shiftEvery: 3 } });
    const tower = g.pieces.pieces[1];
    const s = tower.job.socket;
    handsOver(g, s.x + 12, s.z + 2);
    press(g);
    let peak = 0;
    for (let i = 0; i < 20 * 60 && g.pieces.held; i++) {
      g.sim.step();
      peak = Math.max(peak, g.pieces.progress);
    }
    expect(g.pieces.held).toBe(null);
    expect(tower.state).toBe('loose');
    expect(g.pieces.drops).toBe(1);
    expect(g.pieces.placed).toBe(0);
    expect(peak).toBeLessThan(1);
    // It falls back over and can be tried again.
    g.sim.run(240);
    expect(tower.tilt).toBeGreaterThan(1);
    expect(g.pieces.nearest()).toBe(tower);
  });

  it('goes in straight when let go squarely over its place', async () => {
    const g = await yard(STILL);
    const piece = g.pieces.pieces[0];
    const s = piece.job.socket;
    handsOver(g, s.x, s.z);
    g.pieces.grab(piece);
    g.sim.run(45);
    expect(piece.state).toBe('held');
    let placed: boolean | null = null;
    g.sim.on('piecePlace', (e) => (placed = e.straight));
    press(g);
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
    const g = await yard(STILL);
    const piece = g.pieces.pieces[0];
    const s = piece.job.socket;
    handsOver(g, s.x + 4, s.z);
    g.pieces.grab(piece);
    g.sim.run(45);
    press(g);
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
    const g = await yard(STILL);
    const piece = g.pieces.pieces[0];
    const s = piece.job.socket;
    handsOver(g, s.x + 25, s.z + 30);
    g.pieces.grab(piece);
    g.sim.run(45);
    press(g);
    g.sim.run(240);
    expect(piece.state).toBe('loose');
    expect(g.pieces.placed).toBe(0);
    expect(piece.body.translation().y).toBeLessThan(6);
  });

  it('can be knocked off again, and picked back up', async () => {
    const g = await yard(STILL);
    const piece = g.pieces.pieces[0];
    const s = piece.job.socket;
    handsOver(g, s.x, s.z);
    g.pieces.grab(piece);
    g.sim.run(45);
    press(g);
    g.sim.run(5);
    expect(g.pieces.placed).toBe(1);
    // Picking a placed piece up un-places it.
    g.pieces.grab(piece);
    g.sim.run(45);
    expect(piece.state).toBe('held');
    expect(g.pieces.placed).toBe(0);
    press(g);
    g.sim.run(5);
    expect(g.pieces.placed).toBe(1);
    // A cannonball does it too, once the piece has been in place a few seconds (just set down, it shrugs a knock off).
    g.sim.run(60 * 5);
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
    expect(pieces.pieces.length).toBe(cfg.repairJobs + cfg.monuments + cfg.busJobs);
    const tops = g.layout.jobs.filter((j) => j.kind === 'top');
    const spans = g.layout.jobs.filter((j) => j.kind === 'span');
    expect(spans.length).toBe(1);
    expect(tops.length).toBe(cfg.repairJobs - 1);
    // The plaza's clock tower is on its side, clear of the trees and carts round it.
    const towers = g.layout.jobs.filter((j) => j.kind === 'raise');
    expect(towers.length).toBe(cfg.monuments);
    expect(g.layout.plazas.some((p) => Math.abs(p.x - towers[0].socket.x) < 10 && p.z === towers[0].socket.z)).toBe(true);
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
