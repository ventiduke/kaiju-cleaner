import * as THREE from 'three';
import type { RigidBody } from '../core/physics';
import type { BodyField, Sim } from '../sim';

const m = new THREE.Matrix4();
const p = new THREE.Vector3();
const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const s = new THREE.Vector3();
const c = new THREE.Color();

/**
 * Many rigid bodies drawn as one InstancedMesh.
 * Only bodies the physics engine reports as awake are read back and redrawn,
 * so a sleeping city costs nothing per frame.
 */
export class InstancedBodies implements BodyField {
  readonly mesh: THREE.InstancedMesh;
  readonly bodies: (RigidBody | null)[] = [];
  count = 0;

  private scale: Float32Array;
  private shrink: Float32Array;
  private prev: Float32Array;
  private curr: Float32Array;
  private isActive: Uint8Array;
  private active: number[] = [];
  private dirty: number[] = [];

  constructor(
    private sim: Sim,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    readonly capacity: number,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.scale = new Float32Array(capacity * 3);
    this.shrink = new Float32Array(capacity).fill(1);
    this.prev = new Float32Array(capacity * 7);
    this.curr = new Float32Array(capacity * 7);
    this.isActive = new Uint8Array(capacity);
    sim.scene.add(this.mesh);
  }

  add(body: RigidBody, sx: number, sy: number, sz: number, color: number): number {
    const i = this.count++;
    if (i >= this.capacity) throw new Error('InstancedBodies capacity exceeded');
    this.bodies[i] = body;
    this.scale.set([sx, sy, sz], i * 3);
    this.read(i);
    this.prev.set(this.curr.subarray(i * 7, i * 7 + 7), i * 7);
    this.mesh.count = this.count;
    this.mesh.setColorAt(i, c.setHex(color));
    this.write(i, 1);
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
      this.prev.set(this.curr.subarray(i * 7, i * 7 + 7), i * 7);
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

  /** Forgets the body and stops drawing the instance. */
  release(i: number): void {
    this.bodies[i] = null;
    this.shrink[i] = 0;
    this.dirty.push(i);
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
    this.curr.set([t.x, t.y, t.z, r.x, r.y, r.z, r.w], i * 7);
  }

  private write(i: number, alpha: number): void {
    const a = this.prev;
    const b = this.curr;
    const o = i * 7;
    p.set(a[o] + (b[o] - a[o]) * alpha, a[o + 1] + (b[o + 1] - a[o + 1]) * alpha, a[o + 2] + (b[o + 2] - a[o + 2]) * alpha);
    q.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]);
    if (alpha >= 1) q.set(b[o + 3], b[o + 4], b[o + 5], b[o + 6]);
    else if (alpha > 0) q.slerp(q2.set(b[o + 3], b[o + 4], b[o + 5], b[o + 6]), alpha);
    const k = this.shrink[i];
    s.set(this.scale[i * 3] * k, this.scale[i * 3 + 1] * k, this.scale[i * 3 + 2] * k);
    this.mesh.setMatrixAt(i, m.compose(p, q, s));
  }
}
