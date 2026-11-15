import * as THREE from 'three';
import type { RigidBody } from '../core/physics';
import type { BodyField, Sim } from '../sim';

const m = new THREE.Matrix4();
const p = new THREE.Vector3();
const o = new THREE.Vector3();
const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const s = new THREE.Vector3();
const c = new THREE.Color();

/** One drawn box of a body, placed relative to the body's own origin. */
export interface Part {
  ox: number;
  oy: number;
  oz: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
}

/**
 * Many rigid bodies drawn as one InstancedMesh. A body may be several boxes (an L-shaped
 * chunk, say); they share its transform. Only bodies the physics engine reports as awake
 * are read back and redrawn, so a sleeping city costs nothing per frame.
 */
export class InstancedBodies implements BodyField {
  readonly mesh: THREE.InstancedMesh;
  readonly bodies: (RigidBody | null)[] = [];
  /** Number of bodies (items), and of drawn instances (parts). */
  count = 0;
  parts = 0;

  private partStart: number[] = [];
  private partCount: number[] = [];
  private offset: Float32Array;
  private scale: Float32Array;
  private shrink: number[] = [];
  private prev: number[] = [];
  private curr: number[] = [];
  private isActive: number[] = [];
  private active: number[] = [];
  private dirty: number[] = [];

  constructor(
    private sim: Sim,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    /** Most instances (parts) it will ever draw. */
    readonly capacity: number,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.offset = new Float32Array(Math.max(1, capacity) * 3);
    this.scale = new Float32Array(Math.max(1, capacity) * 3);
    sim.scene.add(this.mesh);
  }

  /** A body drawn as a single instance at its own origin. */
  add(body: RigidBody, sx: number, sy: number, sz: number, color: number): number {
    return this.addCompound(body, [{ ox: 0, oy: 0, oz: 0, sx, sy, sz, color }]);
  }

  /** A body drawn as several instances. Returns the body's index in this field. */
  addCompound(body: RigidBody, parts: Part[]): number {
    const i = this.count++;
    if (this.parts + parts.length > this.capacity) throw new Error('InstancedBodies capacity exceeded');
    this.bodies[i] = body;
    this.partStart[i] = this.parts;
    this.partCount[i] = parts.length;
    this.shrink[i] = 1;
    this.isActive[i] = 0;
    for (const part of parts) {
      const k = this.parts++;
      this.offset.set([part.ox, part.oy, part.oz], k * 3);
      this.scale.set([part.sx, part.sy, part.sz], k * 3);
      this.mesh.setColorAt(k, c.setHex(part.color));
    }
    this.mesh.count = this.parts;
    this.read(i);
    for (let k = 0; k < 7; k++) this.prev[i * 7 + k] = this.curr[i * 7 + k];
    this.write(i, 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.sim.own(body, this, i);
    return i;
  }

  /** Called by the sim for every body the engine reports awake this step. */
  touch(i: number): void {
    if (this.isActive[i]) return;
    this.isActive[i] = 1;
    this.active.push(i);
  }

  /** After a physics step: pull fresh transforms for awake bodies, retire sleepers. */
  capture(): void {
    let w = 0;
    for (let k = 0; k < this.active.length; k++) {
      const i = this.active[k];
      const body = this.bodies[i];
      if (!body) {
        this.isActive[i] = 0;
        continue;
      }
      for (let n = 0; n < 7; n++) this.prev[i * 7 + n] = this.curr[i * 7 + n];
      this.read(i);
      if (body.isSleeping() || !body.isDynamic()) {
        this.isActive[i] = 0;
        this.dirty.push(i);
      } else {
        this.active[w++] = i;
      }
    }
    this.active.length = w;
  }

  /** Before drawing: write interpolated matrices for everything that moved. */
  apply(alpha: number): void {
    if (this.active.length === 0 && this.dirty.length === 0) return;
    for (const i of this.active) this.write(i, alpha);
    for (const i of this.dirty) this.write(i, 1);
    this.dirty.length = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setShrink(i: number, k: number): void {
    this.shrink[i] = k;
    this.dirty.push(i);
  }

  /** Forgets the body and stops drawing it. */
  release(i: number): void {
    this.bodies[i] = null;
    this.shrink[i] = 0;
    this.dirty.push(i);
  }

  /** Puts a different body (and look) in an existing single-part slot. For recycled rubble. */
  reuse(i: number, body: RigidBody, sx: number, sy: number, sz: number, color: number): void {
    const k = this.partStart[i];
    this.bodies[i] = body;
    this.shrink[i] = 1;
    this.scale.set([sx, sy, sz], k * 3);
    this.mesh.setColorAt(k, c.setHex(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.read(i);
    for (let n = 0; n < 7; n++) this.prev[i * 7 + n] = this.curr[i * 7 + n];
    this.dirty.push(i);
    this.sim.own(body, this, i);
  }

  activeCount(): number {
    return this.active.length;
  }

  /** Indices of the bodies that moved in the last step. */
  activeIndices(): readonly number[] {
    return this.active;
  }

  private read(i: number): void {
    const body = this.bodies[i]!;
    const t = body.translation();
    const r = body.rotation();
    const n = i * 7;
    this.curr[n] = t.x;
    this.curr[n + 1] = t.y;
    this.curr[n + 2] = t.z;
    this.curr[n + 3] = r.x;
    this.curr[n + 4] = r.y;
    this.curr[n + 5] = r.z;
    this.curr[n + 6] = r.w;
  }

  private write(i: number, alpha: number): void {
    const a = this.prev;
    const b = this.curr;
    const n = i * 7;
    p.set(a[n] + (b[n] - a[n]) * alpha, a[n + 1] + (b[n + 1] - a[n + 1]) * alpha, a[n + 2] + (b[n + 2] - a[n + 2]) * alpha);
    q.set(a[n + 3], a[n + 4], a[n + 5], a[n + 6]);
    if (alpha >= 1) q.set(b[n + 3], b[n + 4], b[n + 5], b[n + 6]);
    else if (alpha > 0) q.slerp(q2.set(b[n + 3], b[n + 4], b[n + 5], b[n + 6]), alpha);
    const k = this.shrink[i];
    const start = this.partStart[i];
    for (let j = start; j < start + this.partCount[i]; j++) {
      o.set(this.offset[j * 3] * k, this.offset[j * 3 + 1] * k, this.offset[j * 3 + 2] * k).applyQuaternion(q).add(p);
      s.set(this.scale[j * 3] * k, this.scale[j * 3 + 1] * k, this.scale[j * 3 + 2] * k);
      this.mesh.setMatrixAt(j, m.compose(o, q, s));
    }
  }
}
