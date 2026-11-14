import * as THREE from 'three';
import { FIXED_DT, type Rapier, type RigidBody, type World } from './core/physics';
import type { Tuning } from './core/tuning';

/** Abstract per-player actions. Devices (keyboard, gamepad, tests) write these. */
export interface PlayerInput {
  /** Forward (+1) / backward (-1). */
  thrust: number;
  /** Turn left (+1) / right (-1). */
  turn: number;
  /** Modifier held (tiptoe, later). */
  tiptoe: boolean;
  /** Camera orbit input (-1..1). */
  camYaw: number;
}

export function emptyInput(): PlayerInput {
  return { thrust: 0, turn: 0, tiptoe: false, camYaw: 0 };
}

export interface System {
  /** Runs before each physics step. */
  preStep?(dt: number): void;
  /** Runs after each physics step (events for the step are already dispatched). */
  postStep?(dt: number): void;
  /** Runs once per rendered frame. */
  render?(alpha: number, frameDt: number): void;
}

export type ForceListener = (collider1: number, collider2: number, force: number) => void;

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

  private readonly events;
  private readonly tracked = new Set<Tracked>();
  private readonly forceListeners: ForceListener[] = [];

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

  onContactForce(listener: ForceListener): void {
    this.forceListeners.push(listener);
  }

  step(): void {
    const dt = FIXED_DT;
    this.world.gravity.y = -this.tuning.world.gravity;
    for (const s of this.systems) s.preStep?.(dt);
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

  counts(): { bodies: number; awake: number } {
    let awake = 0;
    this.world.forEachActiveRigidBody(() => awake++);
    return { bodies: this.world.bodies.len(), awake };
  }
}
