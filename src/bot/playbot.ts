import * as THREE from 'three';
import { cityFor } from '../core/tuning';
import type { Approval } from '../city/approval';
import type { CityLayout } from '../city/cityGen';
import type { Damage } from '../city/damage';
import type { Piece, Pieces } from '../city/pieces';
import type { Sweep, Sweeps } from '../city/sweeps';
import { FIXED_DT } from '../core/physics';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim } from '../sim';

/**
 * How the bot plays. `careful` keeps to the streets, goes gently and lines things up.
 * `reckless` goes straight at everything flat out. `idle` never touches the controls.
 */
export type BotStyle = 'careful' | 'reckless' | 'idle';

export interface BotJob {
  name: string;
  done: boolean;
  sloppy: boolean;
  /** Game seconds from first taking the job on to finishing it (null if it never did). */
  seconds: number | null;
  tries: number;
  gaveUp: boolean;
}

export interface BotReport {
  style: BotStyle;
  seconds: number;
  finished: boolean;
  approval: number;
  jobs: BotJob[];
  /** Times it was pushing on the controls and getting nowhere. */
  stalls: { at: [number, number]; second: number; doing: string }[];
  /** Things that must never happen, if any did. */
  broken: string[];
  distance: number;
  stumbles: number;
  falls: number;
  drops: number;
  /** On the grip bar: presses that caught it, and fumbles. And how the repairs went in. */
  catches: number;
  fumbles: number;
  perfect: number;
  sneezes: number;
  damage: { chunks: number; buildings: number; squashed: number };
}

interface Point {
  x: number;
  z: number;
}

const v = new THREE.Vector3();
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const fussy = (style: BotStyle) => style === 'careful';
const nearest = (list: number[], value: number) => list.reduce((best, c) => (Math.abs(c - value) < Math.abs(best - value) ? c : best), list[0]);

/**
 * A scripted player. It reads the same things a person could see (where the jobs are, what
 * it is holding, where the marker is on the bar) and presses the same controls. It is not clever, and
 * that is the point: if a plodding, literal-minded player cannot finish a job, or keeps
 * getting stuck in the same place, that is worth knowing before a person finds out.
 */
export class PlayBot {
  readonly jobs: BotJob[] = [];
  readonly stalls: BotReport['stalls'] = [];
  private kaiju: Kaiju;
  private pieces: Pieces | null;
  private sweeps: Sweeps | null;
  private layout: CityLayout;
  private xs: number[];
  private zs: number[];
  private wideXs: number[];
  private current = -1;
  private phase = '';
  private path: Point[] = [];
  private heading = 0;
  private pass = 0;
  private distance = 0;
  private last = new THREE.Vector3();
  private checkAt = new THREE.Vector3();
  private checkTime = 0;
  private recover = 0;
  private pushing = false;
  private clicked = 0;
  private firstTaken: number[] = [];
  private phaseSince = 0;
  private lastPhase = '';
  private lastJob = -1;
  private backOff = false;
  private backTo: number | null = null;
  private presses = 0;
  private pressed = false;

  constructor(
    private sim: Sim,
    readonly style: BotStyle,
  ) {
    this.kaiju = sim.parts.kaiju as Kaiju;
    this.pieces = (sim.parts.pieces as Pieces | undefined) ?? null;
    this.sweeps = (sim.parts.sweeps as Sweeps | undefined) ?? null;
    this.layout = sim.parts.layout as CityLayout;
    this.xs = this.layout.streets.filter((s) => s.along === 'z').map((s) => s.center);
    this.zs = this.layout.streets.filter((s) => s.along === 'x').map((s) => s.center);
    this.wideXs = this.layout.streets.filter((s) => s.along === 'z' && s.width >= cityFor(sim.tuning).avenueWidth).map((s) => s.center);
    for (const piece of this.pieces?.pieces ?? []) this.jobs.push({ name: piece.job.name ?? piece.job.kind, done: false, sloppy: false, seconds: null, tries: 0, gaveUp: false });
    for (let i = 0; i < (this.sweeps?.sweeps.length ?? 0); i++) this.jobs.push({ name: 'blocked road', done: false, sloppy: false, seconds: null, tries: 0, gaveUp: false });
    this.last.copy(this.kaiju.position());
    this.checkAt.copy(this.last);
  }

  private get reach(): number {
    return this.sim.tuning.kaiju.bodyRadius + this.sim.tuning.carry.holdForward;
  }

  private piece(i: number): Piece | null {
    return this.pieces?.pieces[i] ?? null;
  }

  private sweep(i: number): Sweep | null {
    return this.sweeps?.sweeps[i - (this.pieces?.pieces.length ?? 0)] ?? null;
  }

  /** Where job `i` wants the kaiju to go next. */
  private where(i: number): Point {
    const piece = this.piece(i);
    if (piece) {
      this.pieces!.handle(piece, v);
      return { x: v.x, z: v.z };
    }
    return this.sweep(i)!.spec;
  }

  /**
   * The way a careful player would walk it: out to the nearest crossing, along to a wide
   * street, down that, and in from the crossing nearest the target. The river is forded
   * between bridges (they will not take a kaiju), from quay to quay.
   */
  private route(to: Point): Point[] {
    const from = this.kaiju.position();
    if (this.style !== 'careful' || !this.xs.length || !this.zs.length || Math.hypot(to.x - from.x, to.z - from.z) < 45) return [to];
    const river = this.layout.river;
    const side = (z: number) => (river ? (z > river.z1 ? 1 : z < river.z0 ? -1 : 0) : 1);
    // Streets on a given bank (or all of them, if there is no river).
    const zsOn = (bank: number) => (river && bank ? this.zs.filter((z) => side(z) === bank) : this.zs);
    const start = { x: nearest(this.xs, from.x), z: nearest(zsOn(side(from.z)), from.z) };
    const end = { x: nearest(this.xs, to.x), z: nearest(zsOn(side(to.z)), to.z) };
    const wide = this.wideXs.length ? this.wideXs : this.xs;
    const main = wide.reduce((best, x) => (Math.abs(from.x - x) + Math.abs(to.x - x) < Math.abs(from.x - best) + Math.abs(to.x - best) ? x : best), wide[0]);
    const out: Point[] = [start, { x: main, z: start.z }];
    if (river && side(from.z) !== side(to.z) && side(from.z) !== 0 && side(to.z) !== 0) {
      // Ford: along this bank's quay to a spot between two bridges, straight over, and back along the far quay.
      const quayA = nearest(zsOn(side(from.z)), side(from.z) > 0 ? river.z1 : river.z0);
      const quayB = nearest(zsOn(side(to.z)), side(to.z) > 0 ? river.z1 : river.z0);
      const others = this.xs.filter((x) => x !== main).sort((p, q) => Math.abs(p - main) - Math.abs(q - main));
      const ford = others.length ? (main + others[0]) / 2 : main + 40;
      out.push({ x: main, z: quayA }, { x: ford, z: quayA }, { x: ford, z: quayB }, { x: main, z: quayB });
    }
    out.push({ x: main, z: end.z }, end, to);
    // Drop steps that go nowhere.
    return out.filter((p, i) => i === out.length - 1 || Math.hypot(p.x - out[i + 1].x, p.z - out[i + 1].z) > 8);
  }

  private take(i: number): void {
    this.current = i;
    this.phase = 'go';
    this.pass = 0;
    this.firstTaken[i] ??= this.sim.time;
    this.jobs[i].tries++;
    // Enough is enough: leave it and do something else.
    if (this.jobs[i].tries > 8) {
      this.jobs[i].gaveUp = true;
      this.current = -1;
      return;
    }
    this.path = this.route(this.where(i));
  }

  private choose(): void {
    const k = this.kaiju.position();
    let best = -1;
    let bestDist = Infinity;
    this.jobs.forEach((job, i) => {
      if (job.done || job.gaveUp) return;
      const w = this.where(i);
      const d = Math.hypot(w.x - k.x, w.z - k.z);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best >= 0) this.take(best);
    else this.current = -1;
  }

  /** Steers at a point. Returns how far off it still is. */
  private drive(to: Point, cap: number, stopAt = 0): number {
    const k = this.kaiju;
    const p = k.position();
    const input = this.sim.players[0];
    const dist = Math.hypot(to.x - p.x, to.z - p.z);
    const err = wrap(Math.atan2(to.x - p.x, to.z - p.z) - k.yaw);
    const reckless = this.style === 'reckless';
    if (this.runner) {
      // The Runner is pointed, not steered: told which way to go, it turns to go there. It has no
      // reverse, so on arriving it simply stops (still facing the way it came, which is at the thing).
      const near = reckless ? 1 : THREE.MathUtils.clamp((dist - stopAt) / 18, 0, 1);
      input.turn = 0;
      input.strafe = 0;
      input.look = Math.atan2(to.x - p.x, to.z - p.z);
      input.thrust = dist - stopAt < 0.4 ? 0 : Math.max(0.1, cap * near);
      this.pushing = input.thrust > 0.25;
      return dist;
    }
    input.turn = THREE.MathUtils.clamp(err * 2.2, -1, 1) * (reckless || Math.abs(err) > 0.5 ? 1 : 0.7);
    // Point first, then go; and ease up on arriving.
    // (Eased off smoothly: stamping on the brakes for a corner tips the kaiju as surely as taking it flat out.)
    const aim = Math.abs(err) > 1 ? 0.12 : 1 - Math.abs(err) / 1.3;
    const near = reckless ? 1 : THREE.MathUtils.clamp((dist - stopAt) / 22, -0.5, 1);
    input.thrust = THREE.MathUtils.clamp(cap * aim * near, -0.4, 1);
    // A careful player lets a wobble settle before pressing on.
    if (!reckless && k.state === 'stumble') {
      input.turn = 0;
      input.thrust = 0;
    }
    this.pushing = Math.abs(input.thrust) > 0.25;
    return dist;
  }

  /** Turns on the spot to a heading. Returns how far off it still is (radians). */
  private turnTo(yaw: number): number {
    const err = wrap(yaw - this.kaiju.yaw);
    this.sim.players[0].turn = THREE.MathUtils.clamp(err * 2.5, -0.8, 0.8);
    return Math.abs(err);
  }

  /** True when it is the Runner being driven (the body the game ships with), not the balancing kaiju. */
  private get runner(): boolean {
    return this.sim.tuning.move.controller === 1;
  }

  private click(): void {
    this.sim.players[0].grab = true;
    this.clicked = this.sim.time;
  }

  private giveUp(why: string): void {
    const job = this.jobs[this.current];
    if (job.tries >= 3) job.gaveUp = true;
    this.stalls.push({ at: [Math.round(this.kaiju.position().x), Math.round(this.kaiju.position().z)], second: Math.round(this.sim.time), doing: `${job.name}: ${why}` });
    if (this.pieces?.held && this.sim.time - this.clicked > 0.5) this.click();
    this.current = -1;
  }

  /** A carried piece: fetch it, then set it down where it belongs, squared up. */
  private carry(piece: Piece): void {
    const pieces = this.pieces!;
    const speed = this.style === 'reckless' ? 1 : 0.7;
    const held = pieces.held === piece;
    if (this.phase === 'go') {
      // Walk up until the hands are over it, facing it.
      // (The last leg aims at where the piece is now, which may not be where it was.)
      const last = this.path.length === 1;
      const target = last ? this.where(this.current) : this.path[0];
      const dist = this.drive(target, speed, last ? this.reach : 0);
      if (!last && dist < 12) this.path.shift();
      if (last && pieces.nearest() === piece && this.kaiju.speed < 6 && this.sim.time - this.clicked > 1) {
        this.click();
        this.phase = 'lift';
      }
    } else if (this.phase === 'lift') {
      if (held && piece.state === 'held') {
        // Pick the side to come at its place from: the nearest of the ways it fits.
        const s = piece.job.socket;
        const k = this.kaiju.position();
        let best = Infinity;
        for (let turn = 0; turn < Math.PI * 2 - 0.01; turn += piece.job.symmetry) {
          const yaw = s.yaw + turn;
          const d = Math.hypot(s.x - Math.sin(yaw) * this.reach - k.x, s.z - Math.cos(yaw) * this.reach - k.z);
          if (d < best) {
            best = d;
            this.heading = yaw;
          }
        }
        this.path = this.route({ x: s.x - Math.sin(this.heading) * this.reach, z: s.z - Math.cos(this.heading) * this.reach });
        this.phase = 'deliver';
      } else if (!pieces.held && this.sim.time - this.clicked > 1.5) this.phase = 'go';
    } else if (this.phase === 'deliver') {
      if (!held) {
        // Dropped it. Go and get it again.
        this.take(this.current);
        return;
      }
      const gentle = this.style === 'reckless' ? 1 : 0.55;
      const dist = this.drive(this.path[0], gentle);
      if (this.path.length > 1 && dist < 12) this.path.shift();
      // (In the river "there" is looser: the current will not let it stand on a spot until its feet are planted.
      // And the Runner goes straight on to the place itself from wherever it has got to.)
      else if (this.path.length === 1 && dist < (this.runner ? 14 : this.style === 'reckless' ? 7 : this.kaiju.wading > 0.05 ? 6 : 2.5)) this.phase = 'square';
      // Never so gentle that the current wins.
      if (this.kaiju.wading > 0.05 && dist > 3) this.sim.players[0].thrust = Math.max(this.sim.players[0].thrust, 0.3);
    } else if (this.phase === 'square') {
      if (!held) {
        this.take(this.current);
        return;
      }
      // Get the hands over the spot, and let go once the hold is firm. (The piece squares itself
      // up to its place as it gets there; which way the kaiju is facing is not the test.)
      const fussy = this.style === 'careful';
      const s = piece.job.socket;
      pieces.anchor(v);
      const short = (s.x - v.x) * this.kaiju.forward.x + (s.z - v.z) * this.kaiju.forward.z;
      const miss = Math.hypot(s.x - v.x, s.z - v.z);
      const wet = this.kaiju.wading > 0.05;
      let off = 0;
      if (this.runner) {
        // Walk at the place until the hands are over it. Too close to turn the load onto it: walk off and come again.
        const dist = this.drive(s, 0.45, this.reach);
        if (dist < this.reach - 3 && miss > 2.5) {
          this.recover = 1.1;
          this.phase = 'deliver';
          this.path = [{ x: s.x, z: s.z }];
          return;
        }
        // In the river, once it is roughly there, plant the feet so the current cannot carry it off the mark.
        if (wet && miss < 3) this.sim.players[0].crouch = true;
      } else {
        off = this.turnTo(this.heading);
        if (off < 0.3) this.sim.players[0].thrust = THREE.MathUtils.clamp(short * 0.12, -0.35, 0.35);
        if (wet && off < 0.12 && miss < 3) this.sim.players[0].crouch = true;
      }
      const want = this.sim.tuning.carry;
      const ready = off < (fussy ? 0.1 : 0.5) && this.kaiju.speed < 2 && (!fussy || (!pieces.slipping && miss < (wet ? want.straightRadius : want.perfectRadius) * 0.9));
      if (ready || this.sim.time - this.phaseSince > 20) {
        this.click();
        this.phase = 'set';
      }
    } else if (this.phase === 'set') {
      if (piece.state === 'placed') {
        // Step back before turning away, so as not to clout it on the way out.
        this.recover = fussy(this.style) ? 1.4 : 0;
        this.backOff = true;
      } else if (this.sim.time - this.clicked > 1) this.take(this.current);
    }
  }

  /** A toppled piece: stand by its middle, take hold, and heave on the bar until it is up. */
  private raise(piece: Piece): void {
    const pieces = this.pieces!;
    if (pieces.held === piece) return;
    if (this.phase === 'heave') {
      // It slipped.
      this.phase = 'go';
      this.jobs[this.current].tries++;
      if (this.jobs[this.current].tries > 4) return this.giveUp('kept slipping');
    }
    const dist = this.drive(this.where(this.current), this.style === 'reckless' ? 1 : 0.7, this.reach);
    if (pieces.nearest() === piece && Math.abs(dist - this.reach) < 9 && this.kaiju.speed < 6 && this.sim.time - this.clicked > 1) {
      this.click();
      this.phase = 'heave';
    }
  }

  /** A blocked road: walk through it from end to end, a different line each time, until it is clear. */
  private clear(sweep: Sweep): void {
    const s = sweep.spec;
    const alongX = s.hx > s.hz;
    const lines = [0, -5, 5, -8, 8, -2, 2];
    const offset = lines[this.pass % lines.length];
    const far = (alongX ? s.hx : s.hz) + 30;
    const sign = this.pass % 2 === 0 ? 1 : -1;
    const end = (t: number): Point => (alongX ? { x: s.x + t, z: s.z + offset } : { x: s.x + offset, z: s.z + t });
    if (this.phase === 'go') {
      // Get to one end of this pass (by the streets, if being careful).
      if (!this.path.length) this.path = this.route(end(far * sign));
      const dist = this.drive(this.path[0], this.style === 'reckless' ? 1 : 0.7);
      if (dist < 10) {
        this.path.shift();
        if (!this.path.length) this.phase = 'sweep';
      }
    } else if (this.drive(end(-far * sign), this.style === 'reckless' ? 1 : 0.8) < 10) {
      this.pass++;
      this.phase = 'go';
      this.path = [end(far * (this.pass % 2 === 0 ? 1 : -1))];
      if (this.pass >= 14) this.giveUp('rubble would not shift');
    }
  }

  /** Book-keeping: what has been finished (by whatever means), and how long the job in hand took. */
  private tally(): void {
    this.jobs.forEach((job, i) => {
      const piece = this.piece(i);
      const done = piece ? piece.state === 'placed' : this.sweep(i)!.done;
      if (done && !job.done) job.seconds = Math.round(this.sim.time - (this.firstTaken[i] ?? this.sim.time));
      job.done = done;
      job.sloppy = piece?.fit === 'crooked';
    });
  }

  /** Decides this step's inputs. Call it before every `sim.step()`. */
  think(): void {
    const input = this.sim.players[0];
    input.thrust = 0;
    input.turn = 0;
    input.grab = false;
    input.jump = false;
    input.crouch = false;
    this.pushing = false;
    const k = this.kaiju;
    const p = k.position();
    this.distance += Math.hypot(p.x - this.last.x, p.z - this.last.z);
    this.last.copy(p);
    if (this.style === 'idle') return;

    this.tally();

    // Whatever else is going on, mind the bar: a press as the marker crosses the zone. The careful
    // player waits for dead centre; the reckless one stabs at it, and one press in four is a fumble.
    if (this.pieces?.slipping) {
      const sloppy = this.style === 'reckless' && this.presses % 4 === 3;
      const now = this.pieces.inZone(this.style === 'careful' ? 0.3 : sloppy ? 1.6 : 0.9);
      if (now && !this.pressed) this.presses++;
      this.pressed = now;
      input.jump = now;
    } else this.pressed = false;
    // Flat on its back: mash a direction to scramble up.
    if (k.state === 'fallen' || k.state === 'getup' || k.state === 'falling') {
      input.thrust = 1;
      return;
    }
    if (this.recover > 0) {
      // Stuck a moment ago (or just set something down): back out, and after a stall come at it from a different angle.
      this.recover -= FIXED_DT;
      if (this.runner) {
        // (The Runner turns about and walks out, rather than backing.)
        this.backTo ??= k.yaw + Math.PI + (this.backOff ? 0 : this.stalls.length % 2 ? 0.8 : -0.8);
        input.look = this.backTo;
        input.thrust = 0.6;
        input.turn = 0;
        return;
      }
      input.thrust = -0.7;
      input.turn = this.backOff ? 0 : this.stalls.length % 2 ? 0.8 : -0.8;
      return;
    }
    this.backOff = false;
    this.backTo = null;

    if (this.current < 0 || this.jobs[this.current].done) this.choose();
    if (this.current < 0) return;
    const piece = this.piece(this.current);
    if (piece) {
      if (piece.job.kind === 'raise') this.raise(piece);
      else this.carry(piece);
    } else this.clear(this.sweep(this.current)!);

    // A step that will not complete: start the job again, and after three goes leave it.
    if (this.phase !== this.lastPhase || this.current !== this.lastJob) {
      this.lastPhase = this.phase;
      this.lastJob = this.current;
      this.phaseSince = this.sim.time;
    } else if (this.current >= 0 && this.sim.time - this.phaseSince > 90 && this.phase !== 'heave') {
      const job = this.jobs[this.current];
      this.stalls.push({ at: [Math.round(p.x), Math.round(p.z)], second: Math.round(this.sim.time), doing: `${job.name} (${this.phase}): no progress in 90 s` });
      if (job.tries >= 3) job.gaveUp = true;
      if (this.pieces?.held) this.click();
      this.current = -1;
      this.lastJob = -2;
    }

    // Pushing on the stick and going nowhere for four seconds is a stall.
    if (this.sim.time - this.checkTime > 4) {
      if (this.pushing && p.distanceTo(this.checkAt) < 2.5 && this.current >= 0) {
        const job = this.jobs[this.current];
        this.stalls.push({ at: [Math.round(p.x), Math.round(p.z)], second: Math.round(this.sim.time), doing: `${job.name} (${this.phase})` });
        this.recover = 1.6;
        if (this.stalls.filter((s) => s.doing.startsWith(job.name)).length >= 5) this.giveUp('stuck too often');
      }
      this.checkAt.copy(p);
      this.checkTime = this.sim.time;
    }
  }

  report(broken: string[] = []): BotReport {
    this.tally();
    const approval = this.sim.parts.approval as Approval | undefined;
    const damage = this.sim.parts.damage as Damage;
    return {
      style: this.style,
      seconds: Math.round(approval?.finished?.seconds ?? this.sim.time),
      finished: !!approval?.finished,
      approval: Math.round(approval?.value ?? 0),
      jobs: this.jobs.map((j) => ({ ...j })),
      stalls: this.stalls,
      broken,
      distance: Math.round(this.distance),
      stumbles: this.kaiju.stumbles,
      falls: this.kaiju.falls,
      drops: this.pieces?.drops ?? 0,
      catches: this.pieces?.catches ?? 0,
      fumbles: this.pieces?.fumbles ?? 0,
      perfect: this.pieces?.perfect ?? 0,
      sneezes: (this.sim.parts.nose as { sneezes: number } | undefined)?.sneezes ?? 0,
      damage: { chunks: damage.chunksBroken, buildings: damage.buildingsDamaged, squashed: damage.citizensSquished },
    };
  }
}

/**
 * Plays a shift with a bot and reports how it went. Every step it also checks the things that
 * must hold whoever is playing: nothing has flown off to infinity, the kaiju is not under the
 * ground or in orbit, the score is a score.
 */
export function playShift(sim: Sim, style: BotStyle, maxSeconds: number): BotReport {
  const bot = new PlayBot(sim, style);
  const kaiju = sim.parts.kaiju as Kaiju;
  const approval = sim.parts.approval as Approval | undefined;
  const bodies = sim.counts().bodies;
  const broken: string[] = [];
  const fail = (what: string) => {
    if (broken.length < 8 && !broken.some((b) => b.startsWith(what.slice(0, 18)))) broken.push(`${what} at ${sim.time.toFixed(1)}s`);
  };
  sim.stepUntil(
    () => !!approval?.finished || broken.length >= 8,
    maxSeconds,
    () => {
      bot.think();
      const p = kaiju.position();
      if (!Number.isFinite(p.x + p.y + p.z)) fail('kaiju position is not a number');
      else if (p.y < sim.ground(p.x, p.z) - 6) fail(`kaiju under the ground (y ${p.y.toFixed(1)})`);
      else if (p.y > sim.ground(p.x, p.z) + 45) fail(`kaiju in the air (y ${p.y.toFixed(1)})`);
      if (approval && !(approval.value >= 0 && approval.value <= 100)) fail(`approval out of range (${approval.value})`);
      if (sim.counts().bodies > bodies + 900) fail(`body count ran away (${sim.counts().bodies})`);
    },
  );
  return bot.report(broken);
}

export function formatBotReport(r: BotReport, title: string): string {
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const lines = [
    `${title}: ${r.finished ? 'finished' : 'DID NOT FINISH'} in ${clock(r.seconds)}, approval ${r.approval}%`,
    `  jobs ${r.jobs.filter((j) => j.done).length}/${r.jobs.length} (${r.perfect} perfect)   walked ${r.distance} m   ${r.stumbles} stumbles, ${r.falls} falls`,
    `  grip: ${r.catches} catches, ${r.fumbles} fumbles, ${r.drops} drops   ${r.sneezes} sneezes`,
    `  damage: ${r.damage.chunks} chunks in ${r.damage.buildings} buildings, ${r.damage.squashed} people`,
  ];
  for (const j of r.jobs) {
    lines.push(`    ${j.done ? (j.sloppy ? '~' : 'x') : j.gaveUp ? '!' : ' '} ${j.name.padEnd(22)} ${j.done ? clock(j.seconds ?? 0) : j.gaveUp ? 'gave up' : 'not done'}${j.tries > 1 ? `  (${j.tries} tries)` : ''}`);
  }
  for (const s of r.stalls) lines.push(`  stalled at (${s.at[0]}, ${s.at[1]}) after ${clock(s.second)}: ${s.doing}`);
  for (const b of r.broken) lines.push(`  BROKEN: ${b}`);
  return lines.join('\n');
}
