import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Pieces } from '../src/city/pieces';
import { ChunkState } from '../src/city/destruction';
import { STYLES } from '../src/core/tuning';
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

/** A player who minds the bar: a press as the marker comes within this share of the zone (under 0.35 is dead centre). */
function mind(g: Yard, share = 0.3): void {
  g.sim.players[0].jump = g.pieces.inZone(share);
}

/** Steps while holding, with or without someone minding the bar. Returns the lowest the grip got. */
function carry(g: Yard, seconds: number, minding: boolean): number {
  let worst = 1;
  for (let i = 0; i < seconds * 60; i++) {
    if (minding) mind(g);
    g.sim.step();
    if (g.pieces.held) worst = Math.min(worst, g.pieces.grip);
  }
  g.sim.players[0].jump = false;
  return worst;
}

/** Steps until the load starts to slip (or the time runs out). Returns the seconds it took. */
function untilSlipping(g: Yard, seconds = 60): number {
  return g.sim.stepUntil(() => g.pieces.slipping || !g.pieces.held, seconds).seconds;
}

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

  it('a load works loose in the hands: slowly carried gently, sooner thrown about', async () => {
    // (As the Runner, the body the game ships with: it can be thrown about properly.)
    const loose = async (rough: boolean) => {
      const g = await yard({ move: STYLES[3].move });
      const piece = g.pieces.pieces[0];
      const inp = g.sim.players[0];
      const k = g.kaiju;
      // Facing +z, where the yard is open ground.
      k.yaw = 0;
      inp.look = 0;
      g.sim.run(5);
      handsOver(g, piece.job.start.x, piece.job.start.z);
      pickUp(g);
      expect(g.pieces.held).toBe(piece);
      expect(g.pieces.slipping).toBe(false);
      expect(g.pieces.grip).toBeGreaterThan(0.9);
      const ahead = k.yaw;
      inp.thrust = rough ? 1 : 0.4;
      let n = 0;
      const seconds = g.sim.stepUntil(
        () => g.pieces.slipping || !g.pieces.held,
        60,
        () => {
          // Rough: flat out, flung from one side to the other, stopping dead between.
          if (rough) {
            n++;
            inp.look = ahead + (Math.floor(n / 40) % 2 ? 1.5 : -1.5);
            inp.thrust = Math.floor(n / 25) % 3 === 2 ? 0 : 1;
          }
        },
      ).seconds;
      return { seconds, g, piece };
    };
    const gentle = await loose(false);
    const rough = await loose(true);
    const t = gentle.g.sim.tuning.carry;
    // Gently: about as long as the setting says, and it is still in hand when it starts to go.
    expect(gentle.seconds).toBeGreaterThan(t.holdSeconds * 0.7);
    expect(gentle.seconds).toBeLessThan(t.holdSeconds * 1.2);
    expect(gentle.g.pieces.held).toBe(gentle.piece);
    expect(gentle.g.pieces.grip).toBeLessThanOrEqual(t.slipAt);
    // Thrown about: in half the time or less.
    expect(rough.seconds).toBeLessThan(gentle.seconds * 0.5);
  });

  it('slipping, a bar comes up: a press in the zone catches it, dead centre best, and a press outside is a fumble', async () => {
    const g = await yard();
    const piece = g.pieces.pieces[0];
    const inp = g.sim.players[0];
    const t = g.sim.tuning.carry;
    faceOpenGround(g);
    handsOver(g, piece.job.start.x, piece.job.start.z);
    pickUp(g);
    const heard: string[] = [];
    g.sim.on('gripSlip', () => heard.push('slip'));
    g.sim.on('gripTick', () => heard.push('tick'));
    g.sim.on('gripCatch', (e) => heard.push(e.perfect ? 'perfect' : 'catch'));
    g.sim.on('gripFumble', () => heard.push('fumble'));
    // A press while it is held firm is nothing at all.
    inp.jump = true;
    g.sim.step();
    inp.jump = false;
    g.sim.step();
    expect(heard).toEqual([]);
    expect(g.pieces.fumbles).toBe(0);

    const press = (when: () => boolean) => {
      g.sim.stepUntil(when, 5);
      inp.jump = true;
      g.sim.step();
      inp.jump = false;
    };
    // Let it go to the point of slipping. The marker starts from one end and ticks as it crosses the middle.
    untilSlipping(g);
    expect(heard).toEqual(['slip']);
    expect(g.pieces.bar).toBeLessThan(0.1);
    g.sim.run(Math.round(t.sweep * 60 * 2.2));
    expect(heard.filter((h) => h === 'tick').length).toBe(2);
    // A press nowhere near the zone: a fumble. It costs grip, and the load is still going.
    const before = g.pieces.grip;
    press(() => !g.pieces.inZone(2.2));
    expect(heard.at(-1)).toBe('fumble');
    expect(g.pieces.fumbles).toBe(1);
    expect(g.pieces.slipping).toBe(true);
    expect(g.pieces.grip).toBeLessThan(before - t.fumble * 0.9);
    // A press in the zone, off centre: caught, and held firm again.
    press(() => g.pieces.inZone(0.95) && !g.pieces.inZone(0.6));
    expect(heard.at(-1)).toBe('catch');
    expect(g.pieces.slipping).toBe(false);
    expect(g.pieces.grip).toBeCloseTo(1, 1);
    expect(g.pieces.held).toBe(piece);
    // Next time, dead centre: a better hold than it started with, so the next slip is further off.
    untilSlipping(g);
    press(() => g.pieces.inZone(0.2));
    expect(heard.at(-1)).toBe('perfect');
    expect(g.pieces.grip).toBeGreaterThan(1.1);
    expect(g.pieces.catches).toBe(2);
    expect(g.pieces.drops).toBe(0);
  });

  it('minded, it is carried all day; ignored, it is on the ground a few seconds after it starts to go', async () => {
    const run = async (minding: boolean) => {
      const g = await yard();
      const piece = g.pieces.pieces[0];
      const inp = g.sim.players[0];
      faceOpenGround(g);
      handsOver(g, piece.job.start.x, piece.job.start.z);
      pickUp(g);
      let dropped = -1;
      let slipped = -1;
      g.sim.on('gripSlip', () => slipped < 0 && (slipped = g.sim.time));
      g.sim.on('pieceDrop', () => dropped < 0 && (dropped = g.sim.time));
      // Set off, throw it round one way and the other, and pull up.
      inp.thrust = 1;
      let worst = carry(g, 6, minding);
      inp.turn = 1;
      worst = Math.min(worst, carry(g, 5, minding));
      inp.turn = -1;
      worst = Math.min(worst, carry(g, 5, minding));
      inp.turn = 0;
      inp.thrust = 0;
      worst = Math.min(worst, carry(g, 14, minding));
      return { drops: g.pieces.drops, worst, held: g.pieces.held === piece, catches: g.pieces.catches, warning: dropped - slipped, t: g.sim.tuning.carry };
    };
    const minded = await run(true);
    const ignored = await run(false);
    expect(minded.drops).toBe(0);
    expect(minded.held).toBe(true);
    expect(minded.catches).toBeGreaterThanOrEqual(2);
    // (It only ever got as low as the point where the bar comes up, and a moment past.)
    expect(minded.worst).toBeGreaterThan(minded.t.slipAt * 0.5);
    expect(ignored.drops).toBe(1);
    expect(ignored.held).toBe(false);
    // From the bar coming up to the load hitting the ground: the warning the setting promises.
    expect(ignored.warning).toBeGreaterThan(ignored.t.slipTime * 0.8);
    expect(ignored.warning).toBeLessThan(ignored.t.slipTime * 1.2);
  });

  it('the zone is wider standing still, and widest with feet planted, which also steadies the load', async () => {
    const g = await yard();
    const piece = g.pieces.pieces[0];
    const inp = g.sim.players[0];
    const t = g.sim.tuning.carry;
    faceOpenGround(g);
    handsOver(g, piece.job.start.x, piece.job.start.z);
    pickUp(g);
    g.sim.run(30);
    const standing = g.pieces.zone;
    expect(standing).toBeCloseTo((t.zone / 2) * t.zoneStill, 2);
    inp.thrust = 1;
    g.sim.run(240);
    const moving = g.pieces.zone;
    expect(moving).toBeLessThan(standing * 0.8);
    expect(moving).toBeGreaterThanOrEqual(t.zone / 2 - 1e-6);
    inp.thrust = 0;
    g.sim.run(120);
    // Planted (the crouch key, with hands full): no walking, no turning, no crawl, and the load keeps far longer.
    inp.crouch = true;
    g.pieces.grip = 1;
    g.pieces.slipping = false;
    g.sim.run(10);
    const at = g.kaiju.position().clone();
    const yaw = g.kaiju.yaw;
    inp.thrust = 1;
    inp.turn = 1;
    const grip = g.pieces.grip;
    g.sim.run(120);
    expect(g.kaiju.planted).toBe(true);
    expect(g.kaiju.mode).toBe('normal');
    expect(g.pieces.zone).toBeCloseTo(standing, 3);
    expect(g.kaiju.position().distanceTo(at)).toBeLessThan(2);
    expect(Math.abs(g.kaiju.yaw - yaw)).toBeLessThan(0.1);
    expect(grip - g.pieces.grip).toBeLessThan(((1 - t.slipAt) / t.holdSeconds) * 2 * 0.5);
    // Feet free again, off it goes.
    inp.crouch = false;
    inp.turn = 0;
    carry(g, 2, true);
    expect(g.kaiju.planted).toBe(false);
    expect(g.kaiju.position().distanceTo(at)).toBeGreaterThan(8);
  });

  it('is slower with its hands full', async () => {
    const g = await yard();
    const t = g.sim.tuning;
    const piece = g.pieces.pieces[0];
    faceOpenGround(g);
    handsOver(g, piece.job.start.x, piece.job.start.z);
    pickUp(g);
    g.sim.players[0].thrust = 1;
    carry(g, 6, true);
    expect(g.kaiju.speed).toBeLessThan(t.kaiju.maxSpeed * t.carry.speed * 1.08);
    expect(g.kaiju.speed).toBeGreaterThan(t.kaiju.maxSpeed * t.carry.speed * 0.8);
    expect(g.pieces.held).toBe(piece);
  });

  it('a toppled piece is stood up with heaves: a press each time the marker is in the zone', async () => {
    const g = await yard();
    const tower = g.pieces.pieces[1];
    const s = tower.job.socket;
    const t = g.sim.tuning.carry;
    // Stand by its middle and take hold.
    handsOver(g, s.x + 12, s.z + 2);
    expect(g.pieces.nearest()).toBe(tower);
    press(g);
    expect(tower.state).toBe('raising');
    g.sim.run(30);
    expect(g.kaiju.planted).toBe(true);
    // The bar is up from the start, and nothing happens until it is used.
    expect(g.pieces.slipping).toBe(true);
    expect(g.pieces.progress).toBe(0);
    // Rooted to the spot while it heaves.
    const at = g.kaiju.position().clone();
    g.sim.players[0].thrust = 1;
    let placed: { straight: boolean; perfect: boolean } | null = null;
    let heaves = 0;
    g.sim.on('piecePlace', (e) => (placed = e));
    g.sim.on('gripCatch', (e) => e.heave && heaves++);
    let last = 0;
    let rose = true;
    // (Off centre, so each heave counts for one.)
    for (let i = 0; i < 20 * 60 && tower.state === 'raising'; i++) {
      g.sim.players[0].jump = g.pieces.inZone(0.9);
      g.sim.step();
      if (g.pieces.progress < last - 0.01) rose = false;
      last = Math.max(last, g.pieces.progress);
    }
    g.sim.players[0].thrust = 0;
    g.sim.players[0].jump = false;
    expect(rose).toBe(true);
    expect(heaves).toBe(t.heaves);
    expect(tower.state).toBe('placed');
    expect(tower.fit).toBe('straight');
    expect(placed!.straight).toBe(true);
    expect(placed!.perfect).toBe(false);
    expect(g.pieces.placed).toBe(1);
    expect(g.pieces.held).toBe(null);
    expect(g.pieces.slipping).toBe(false);
    expect(g.kaiju.planted).toBe(false);
    expect(g.kaiju.position().distanceTo(at)).toBeLessThan(3);
    const p = tower.body.translation();
    expect([p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100)).toEqual([s.x, s.y, s.z]);
    g.sim.run(60);
    expect(tower.tilt).toBeLessThan(0.01);
  });

  it('heaves dead centre lift harder and stand it up perfectly; fumbles let it sag and leave it skew', async () => {
    const raise = async (share: number, fumbleEvery: number) => {
      const g = await yard();
      const tower = g.pieces.pieces[1];
      const s = tower.job.socket;
      handsOver(g, s.x + 12, s.z + 2);
      press(g);
      let heaves = 0;
      let crossings = 0;
      let sagged = false;
      let last = 0;
      let was = false;
      g.sim.on('gripCatch', () => heaves++);
      for (let i = 0; i < 30 * 60 && tower.state === 'raising'; i++) {
        const centre = g.pieces.inZone(share);
        const edge = !g.pieces.inZone(1.8);
        if (centre && !was) crossings++;
        was = centre;
        // Every so often, a stab at the wrong moment.
        g.sim.players[0].jump = fumbleEvery && crossings % fumbleEvery === fumbleEvery - 1 ? edge && i % 20 === 0 : centre;
        g.sim.step();
        if (g.pieces.progress < last - 0.02) sagged = true;
        last = g.pieces.progress;
      }
      return { fit: tower.fit, heaves, sagged, fumbles: g.pieces.fumbles, t: g.sim.tuning.carry, perfect: g.pieces.perfect };
    };
    const centred = await raise(0.2, 0);
    expect(centred.fit).toBe('perfect');
    expect(centred.perfect).toBe(1);
    expect(centred.heaves).toBeLessThan(centred.t.heaves);
    const clumsy = await raise(0.9, 3);
    expect(clumsy.fumbles).toBeGreaterThanOrEqual(2);
    expect(clumsy.sagged).toBe(true);
    expect(clumsy.fit).toBe('crooked');
  });

  it('left alone while heaving, the grip gives out and it falls back over', async () => {
    const g = await yard();
    const tower = g.pieces.pieces[1];
    const s = tower.job.socket;
    handsOver(g, s.x + 12, s.z + 2);
    press(g);
    // A couple of heaves, then nothing.
    let heaves = 0;
    g.sim.on('gripCatch', () => heaves++);
    for (let i = 0; i < 600 && heaves < 2; i++) {
      g.sim.players[0].jump = g.pieces.inZone(0.9);
      g.sim.step();
    }
    g.sim.players[0].jump = false;
    g.sim.run(60);
    expect(g.pieces.progress).toBeGreaterThan(0.2);
    const gone = g.sim.stepUntil(() => !g.pieces.held, 40);
    expect(gone.met).toBe(true);
    expect(gone.seconds).toBeLessThan(g.sim.tuning.carry.heaveSeconds * 1.1);
    expect(tower.state).toBe('loose');
    expect(g.pieces.drops).toBe(1);
    expect(g.pieces.placed).toBe(0);
    // It falls back over and can be tried again.
    g.sim.run(240);
    expect(tower.tilt).toBeGreaterThan(1);
    expect(g.pieces.nearest()).toBe(tower);
  });

  it('goes in perfectly when let go dead on its place with a firm hold, whichever way the kaiju is facing', async () => {
    const g = await yard();
    const piece = g.pieces.pieces[0];
    const s = piece.job.socket;
    handsOver(g, s.x, s.z);
    g.pieces.grab(piece);
    g.sim.run(45);
    expect(piece.state).toBe('held');
    // The screen can say what letting go would do, before it is done.
    expect(g.pieces.over).toBe('perfect');
    let placed: { straight: boolean; perfect: boolean } | null = null;
    g.sim.on('piecePlace', (e) => (placed = e));
    press(g);
    g.sim.run(5);
    expect(piece.state).toBe('placed');
    expect(piece.fit).toBe('perfect');
    expect(placed).toEqual(expect.objectContaining({ straight: true, perfect: true }));
    expect(g.pieces.placed).toBe(1);
    expect(g.pieces.perfect).toBe(1);
    expect(g.pieces.crooked).toBe(0);
    const p = piece.body.translation();
    expect([p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100)).toEqual([s.x, s.y, s.z]);
    g.sim.run(120);
    expect(piece.tilt).toBeLessThan(0.01);
    // The stump underneath was not disturbed by any of it.
    const stump = g.chunks.buildings[2];
    expect(g.chunks.chunks.slice(stump.first, stump.first + stump.count).every((c) => c.state === ChunkState.Fixed)).toBe(true);
  });

  it('goes in straight a couple of metres off; and crooked if it is slipping when it is let go', async () => {
    const g = await yard();
    const piece = g.pieces.pieces[0];
    const s = piece.job.socket;
    handsOver(g, s.x + 2, s.z);
    g.pieces.grab(piece);
    g.sim.run(45);
    expect(g.pieces.over).toBe('straight');
    press(g);
    g.sim.run(5);
    expect(piece.fit).toBe('straight');
    expect(g.pieces.perfect).toBe(0);
    const p = piece.body.translation();
    expect([p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100)).toEqual([s.x, s.y, s.z]);
    // Up again, and this time let it go while it is slipping out of the hands.
    g.pieces.grab(piece);
    g.sim.run(45);
    g.pieces.grip = g.sim.tuning.carry.slipAt + 0.01;
    untilSlipping(g);
    expect(g.pieces.over).toBe('crooked');
    press(g);
    g.sim.run(5);
    expect(piece.state).toBe('placed');
    expect(piece.fit).toBe('crooked');
  });

  it('still counts when let go a few metres off, but sits crooked', async () => {
    const g = await yard();
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
    const g = await yard();
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
    const g = await yard();
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
