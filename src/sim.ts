import * as THREE from 'three';
import { FIXED_DT, type Rapier, type RigidBody, type World } from './core/physics';
import type { Tuning } from './core/tuning';

/** Abstract per-player actions. Devices (keyboard, gamepad, tests) write these. */
export interface PlayerInput {
  /** Forward (+1) / backward (-1). */
  thrust: number;
  /** Turn left (+1) / right (-1). */
  turn: number;
  /** Held to go up on tiptoe: slow, narrow and quiet, for as long as the calves last. */
  tiptoe: boolean;
  /** Held to crouch: slow and steady, tail tucked. */
  crouch: boolean;
  /** Pressed (not held) to take hold of a piece, and again to let go. */
  grab: boolean;
  /** Unused. */
  balanceX: number;
  /** This step's shove on the balance gauge, in gauge half-lengths: up is positive. */
  balanceZ: number;
  /** Held to hold its breath, keeping dust out of its nose. */
  breath: boolean;
  /** Tapped to bow in apology. */
  bow: boolean;
  /** Tapped to leap, for a kaiju that can. */
  jump: boolean;
  /** Camera orbit input (-1..1). */
  camYaw: number;
}

export function emptyInput(): PlayerInput {
  return { thrust: 0, turn: 0, tiptoe: false, crouch: false, grab: false, balanceX: 0, balanceZ: 0, breath: false, bow: false, jump: false, camYaw: 0 };
}

export interface System {
  /** Runs before each physics step. */
  preStep?(dt: number): void;
  /** Runs after every system's preStep, immediately before the physics step. */
  beforePhysics?(dt: number): void;
  /** Runs after each physics step (events for the step are already dispatched). */
  postStep?(dt: number): void;
  /** Runs once per rendered frame. */
  render?(alpha: number, frameDt: number): void;
}

/** Things that happen in the sim that other systems react to (camera shake, dust, sound). */
export interface SimEvents {
  footfall: { x: number; y: number; z: number; side: number; strength: number; wet: boolean };
  kaijuSave: { x: number; y: number; z: number };
  kaijuStumble: { x: number; y: number; z: number };
  oilSlip: { x: number; y: number; z: number };
  chunkCrumble: { x: number; y: number; z: number; size: number };
  groundCollapse: { x: number; y: number; z: number; radius: number };
  /** The kaiju has bowed in apology (at the bottom of the bow). */
  kaijuBow: { x: number; y: number; z: number };
  /** The balance gauge has strayed out of its band: `up` if the fix is to move the mouse up. */
  gaugePrompt: { x: number; y: number; z: number; up: boolean };
  /** A blocked road has been swept clear. */
  sweepDone: { x: number; y: number; z: number };
  /** The city's opinion just moved: by how much, why, and where it happened. */
  approval: { x: number; y: number; z: number; delta: number; why: string };
  /** The kaiju has left the ground, come back down (`speed` is how fast it was falling), or thrown itself into a slide. */
  kaijuJump: { x: number; y: number; z: number };
  kaijuLand: { x: number; y: number; z: number; speed: number };
  kaijuSlide: { x: number; y: number; z: number };
  /** On the test course: a gate passed (`leg` is how many so far), and the run finished. */
  courseGate: { x: number; y: number; z: number; leg: number; seconds: number };
  courseDone: { x: number; y: number; z: number; seconds: number; score: number };
  /** A water main has burst. */
  mainBurst: { x: number; y: number; z: number };
  /** Every repair job is done. `approval` is the city's verdict, 0..100. */
  repairsDone: { x: number; y: number; z: number; approval: number };
  sneezeWindup: { x: number; y: number; z: number };
  sneeze: { x: number; y: number; z: number; dx: number; dz: number };
  citizenSplat: { x: number; y: number; z: number };
  citizenCheer: { x: number; y: number; z: number };
  citizenSquish: { x: number; y: number; z: number };
  citizenScare: { x: number; y: number; z: number };
  propHit: { x: number; y: number; z: number };
  pieceGrab: { x: number; y: number; z: number };
  pieceDrop: { x: number; y: number; z: number };
  piecePlace: { x: number; y: number; z: number; straight: boolean };
  chunkBreak: { x: number; y: number; z: number; size: number };
  kaijuFall: { x: number; y: number; z: number };
}

export type ForceListener = (collider1: number, collider2: number, force: number) => void;

/** Something that owns many bodies and wants to know which ones are awake. */
export interface BodyField {
  touch(index: number): void;
}

/** Keeps a Three object in step with a rigid body, interpolated between physics steps. */
export class Tracked {
  private prevPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  private currPos = new THREE.Vector3();
  private currQuat = new THREE.Quaternion();

  constructor(
    readonly body: RigidBody,
    readonly object: THREE.Object3D,
  ) {
    this.read();
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
    this.apply(1);
  }

  private read(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);
  }

  capture(): void {
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
    this.read();
  }

  apply(alpha: number): void {
    this.object.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.object.quaternion.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
  }
}

/**
 * The whole simulation: physics world, scene graph, and systems.
 * It has no dependency on the DOM or WebGL, so tests can step it under Node.
 */
export class Sim {
  readonly scene = new THREE.Scene();
  readonly world: World;
  readonly systems: System[] = [];
  readonly players: PlayerInput[] = [emptyInput()];
  /** Named things scenes expose to the app and to tests (kaiju, city, ...). */
  readonly parts: Record<string, unknown> = {};
  tick = 0;
  time = 0;
  /** Wall-clock cost of the last physics step, in ms. */
  lastStepMs = 0;
  /** Bodies the engine simulated in the last step. */
  awake = 0;
  /** Height of the ground at a point. Scenes with a river replace this. */
  ground: (x: number, z: number) => number = () => 0;
  /** Traction at a point: 1 normally, near 0 on an oil slick. Scenes with hazards replace this. */
  traction: (x: number, z: number) => number = () => 1;
  /** Speed of the water at a point, along +x (m/s). Zero on dry land. */
  current: (x: number, z: number) => number = () => 0;

  private readonly events;
  private readonly tracked = new Set<Tracked>();
  private readonly forceListeners: ForceListener[] = [];
  private readonly owners = new Map<number, { field: BodyField; index: number }>();
  private readonly listeners: { [K in keyof SimEvents]?: ((e: SimEvents[K]) => void)[] } = {};

  constructor(
    readonly R: Rapier,
    readonly tuning: Tuning,
  ) {
    this.world = new R.World({ x: 0, y: -tuning.world.gravity, z: 0 });
    this.world.timestep = FIXED_DT;
    this.events = new R.EventQueue(true);
  }

  add<T extends System>(system: T): T {
    this.systems.push(system);
    return system;
  }

  track(body: RigidBody, object: THREE.Object3D): Tracked {
    const t = new Tracked(body, object);
    this.tracked.add(t);
    this.scene.add(object);
    return t;
  }

  untrack(t: Tracked): void {
    this.tracked.delete(t);
    this.scene.remove(t.object);
  }

  on<K extends keyof SimEvents>(name: K, fn: (e: SimEvents[K]) => void): void {
    (this.listeners[name] ??= [] as never[]).push(fn as never);
  }

  emit<K extends keyof SimEvents>(name: K, e: SimEvents[K]): void {
    const list = this.listeners[name];
    if (list) for (const fn of list) fn(e);
  }

  /** Registers a body as belonging to a field, so the field hears when it is awake. */
  own(body: RigidBody, field: BodyField, index: number): void {
    this.owners.set(body.handle, { field, index });
  }

  disown(body: RigidBody): void {
    this.owners.delete(body.handle);
  }

  onContactForce(listener: ForceListener): void {
    this.forceListeners.push(listener);
  }

  step(): void {
    const dt = FIXED_DT;
    this.world.gravity.y = -this.tuning.world.gravity;
    for (const s of this.systems) s.preStep?.(dt);
    for (const s of this.systems) s.beforePhysics?.(dt);
    const t0 = performance.now();
    this.world.step(this.events);
    this.lastStepMs = performance.now() - t0;
    this.events.drainContactForceEvents((ev) => {
      const a = ev.collider1();
      const b = ev.collider2();
      const f = ev.totalForceMagnitude();
      for (const l of this.forceListeners) l(a, b, f);
    });
    this.events.drainCollisionEvents(() => {});
    this.tick++;
    this.time += dt;
    this.awake = 0;
    this.world.forEachActiveRigidBody((b) => {
      this.awake++;
      const o = this.owners.get(b.handle);
      if (o) o.field.touch(o.index);
    });
    for (const s of this.systems) s.postStep?.(dt);
    for (const t of this.tracked) t.capture();
  }

  /** Steps the sim `n` times. For tests and the headless hook. */
  run(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  render(alpha: number, frameDt: number): void {
    for (const t of this.tracked) t.apply(alpha);
    for (const s of this.systems) s.render?.(alpha, frameDt);
  }

  /**
   * Steps until `done()` says so, or `maxSeconds` of game time have gone by, whichever is
   * first. Returns whether it got there and how long it took, so a test or a script can
   * wait for the thing it cares about instead of guessing a number of steps.
   */
  stepUntil(done: () => boolean, maxSeconds: number, each?: () => void): { met: boolean; seconds: number; steps: number } {
    const limit = Math.round(maxSeconds / FIXED_DT);
    let steps = 0;
    while (steps < limit && !done()) {
      each?.();
      this.step();
      steps++;
    }
    return { met: done(), seconds: steps * FIXED_DT, steps };
  }

  counts(): { bodies: number; awake: number } {
    return { bodies: this.world.bodies.len(), awake: this.awake };
  }
}
