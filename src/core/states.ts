import * as THREE from 'three';
import type { CityLayout } from '../city/cityGen';
import type { WaterMains } from '../city/mains';
import type { Pieces } from '../city/pieces';
import type { Sweeps } from '../city/sweeps';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim } from '../sim';

const UP = new THREE.Vector3(0, 1, 0);

/** Hands-on helpers for putting the game somewhere on purpose. Used by named states, tests and screenshots. */
export class Stage {
  readonly kaiju: Kaiju;
  constructor(readonly sim: Sim) {
    this.kaiju = sim.parts.kaiju as Kaiju;
    if (!this.kaiju) throw new Error('this scene has no kaiju');
  }

  run(seconds: number): void {
    this.sim.run(Math.round(seconds * 60));
  }

  /** Slides the kaiju (tail and all) so that it stands at (x, z). It keeps its heading. */
  moveTo(x: number, z: number, settle = 0.5): void {
    const k = this.kaiju;
    const p = k.position();
    for (const b of [k.body, ...k.tail.segments]) {
      const q = b.translation();
      b.setTranslation({ x: q.x + x - p.x, y: q.y, z: q.z + z - p.z }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.run(settle);
  }

  /** Turns the kaiju on the spot to face a compass heading (0 faces +z, pi faces -z). */
  face(yaw: number, settle = 0.5): void {
    const k = this.kaiju;
    const c = k.position().clone();
    const turn = yaw - k.yaw;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const v = new THREE.Vector3();
    for (const b of [k.body, ...k.tail.segments]) {
      const t = b.translation();
      v.set(t.x - c.x, 0, t.z - c.z).applyAxisAngle(UP, turn);
      b.setTranslation({ x: c.x + v.x, y: t.y, z: c.z + v.z }, true);
      b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.run(settle);
  }

  /** Stands the kaiju so that its hands are over (x, z), facing the given heading. */
  handsOver(x: number, z: number, yaw = this.kaiju.yaw): void {
    const t = this.sim.tuning;
    const d = t.kaiju.bodyRadius + t.carry.holdForward;
    this.face(yaw, 0.2);
    this.moveTo(x - Math.sin(yaw) * d, z - Math.cos(yaw) * d);
  }

  /** One press of the grab button. */
  click(): void {
    const input = this.sim.players[0];
    input.grab = true;
    this.sim.step();
    input.grab = false;
  }
}

type Setup = (s: Stage) => void;

function need<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`this state needs ${what}`);
  return value;
}

const pieceOf = (s: Stage, kind: string) =>
  need(
    (s.sim.parts.pieces as Pieces | undefined)?.pieces.find((p) => p.job.kind === kind),
    `a '${kind}' job (try the yard scene)`,
  );

/**
 * Named states: places and moments worth looking at or testing, each reached the same way
 * every time from a fresh scene. Add one here rather than scripting it inline, so that
 * screenshots and tests mean the same thing by the same name.
 */
export const STATES: Record<string, Setup> = {
  /** Just standing where it starts. */
  spawn: (s) => s.run(0.5),
  /** Walking flat out up the street it starts on. */
  walking: (s) => {
    s.sim.players[0].thrust = 1;
    s.run(3.3);
    s.sim.players[0].thrust = 0;
    s.run(0.3);
  },
  /** Flat on its back. */
  toppled: (s) => {
    s.run(0.5);
    s.kaiju.knockDown();
    s.run(1.6);
  },
  /** At the bottom of a bow. */
  bowing: (s) => {
    s.run(0.5);
    s.sim.players[0].bow = true;
    s.sim.step();
    s.sim.players[0].bow = false;
    s.run(0.7);
  },
  /** Standing by a tower top, close enough to take hold. */
  'job-nearby': (s) => {
    const piece = pieceOf(s, 'top');
    const p = piece.body.translation();
    s.handsOver(p.x, p.z + 4, Math.PI);
  },
  /** A tower top up on the hands, held firm. */
  carrying: (s) => {
    const pieces = s.sim.parts.pieces as Pieces;
    const piece = pieceOf(s, 'top');
    const p = piece.body.translation();
    s.handsOver(p.x, p.z, 0);
    pieces.grab(piece);
    s.run(0.9);
  },
  /** Carrying, with the load slipping and the bar up. */
  'carrying-slipping': (s) => {
    STATES.carrying(s);
    const pieces = s.sim.parts.pieces as Pieces;
    // (Rather than walk about for ten seconds waiting for it to work loose.)
    pieces.grip = s.sim.tuning.carry.slipAt + 0.02;
    for (let i = 0; i < 240 && !pieces.slipping && pieces.held; i++) s.sim.step();
    s.run(0.25);
  },
  /** Half way through standing the clock tower up. */
  raising: (s) => {
    const pieces = s.sim.parts.pieces as Pieces;
    const piece = pieceOf(s, 'raise');
    const k = piece.job.socket;
    s.handsOver(k.x + 12, k.z, Math.PI);
    pieces.grab(piece);
    for (let i = 0; i < 900 && pieces.progress < 0.5 && pieces.held; i++) {
      // A heave each time the marker is in the zone.
      s.sim.players[0].jump = pieces.inZone(0.6);
      s.sim.step();
    }
    s.sim.players[0].jump = false;
  },
  /** Standing by the bus on its roof. */
  'bus-nearby': (s) => {
    const piece = pieceOf(s, 'bus');
    const p = piece.body.translation();
    const d = s.sim.tuning.kaiju.bodyRadius + s.sim.tuning.carry.holdForward;
    s.face(Math.PI, 0.2);
    s.moveTo(p.x, p.z + d + 4);
  },
  /** Facing a blocked road from just outside the tape. */
  'sweep-nearby': (s) => {
    const sweep = need((s.sim.parts.sweeps as Sweeps | undefined)?.sweeps[0], 'a blocked road').spec;
    const alongX = sweep.hx > sweep.hz;
    s.face(alongX ? -Math.PI / 2 : Math.PI, 0.2);
    s.moveTo(sweep.x + (alongX ? sweep.hx + 22 : 0), sweep.z + (alongX ? 0 : sweep.hz + 22));
  },
  /** A water main just burst beside it. */
  geyser: (s) => {
    const mains = need(s.sim.parts.mains as WaterMains | undefined, 'water mains');
    const main = need(mains.mains[0], 'a water main');
    s.face(Math.PI, 0.2);
    s.moveTo(main.x + 14, main.z + 30);
    mains.burst(main);
    s.run(1.5);
  },
  /** Part way through knocking a building down (whichever is nearest the street ahead). */
  wrecking: (s) => {
    const layout = s.sim.parts.layout as CityLayout;
    need(layout.buildings[0], 'buildings');
    const k = s.kaiju.position();
    const target = [...layout.buildings].sort((a, b) => Math.hypot(a.x - k.x, a.z - k.z) - Math.hypot(b.x - k.x, b.z - k.z))[0];
    s.face(Math.PI, 0.2);
    s.moveTo(target.x, target.z + 34);
    s.sim.players[0].thrust = 1;
    s.run(2.2);
    s.sim.players[0].thrust = 0;
  },
};

/**
 * Puts a fresh scene into a named state and returns the name, so a caller can check that it
 * got what it asked for. An unknown name is an error, never a silent "spawn".
 */
export function setState(sim: Sim, name: string): string {
  const setup = STATES[name];
  if (!setup) throw new Error(`unknown state '${name}'. Known: ${Object.keys(STATES).join(', ')}`);
  setup(new Stage(sim));
  return name;
}
