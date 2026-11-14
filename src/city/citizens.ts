import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim, System } from '../sim';
import type { CityLayout } from './cityGen';
import type { Damage } from './damage';

const STROLL = 1.6;
const RUN = 7.5;
const SCARE_RADIUS = 46;
const SQUISH_RADIUS = 4.2;
const COLORS = [0xf2c230, 0xe85d4a, 0x4aa3e8, 0xf4f1ea, 0x7fd66b, 0xe58ad1, 0xf59f3a];

const m = new THREE.Matrix4();
const p = new THREE.Vector3();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const c = new THREE.Color();

/**
 * The townsfolk: tiny people strolling the sidewalks. They run from a kaiju that comes
 * stomping by (less so from one on tiptoe), and a foot landing on one squashes it.
 * They are not physics bodies, just points that walk; there can be hundreds.
 */
export class Citizens implements System {
  readonly count: number;
  alive: number;
  /** How many are running scared right now. */
  scared = 0;
  private mesh: THREE.InstancedMesh;
  private x: Float32Array;
  private z: Float32Array;
  /** Where each is strolling to along its block's sidewalk loop: block index and corner. */
  private block: Uint16Array;
  private corner: Uint8Array;
  private dir: Int8Array;
  private state: Uint8Array; // 0 strolling, 1 running, 2 squished
  private timer: Float32Array;
  private heading: Float32Array;
  private rng = new Rng(4242);
  private loops: { x: number; z: number }[][] = [];

  constructor(
    private sim: Sim,
    layout: CityLayout,
    private kaiju: Kaiju,
    private damage: Damage,
  ) {
    const cfg = sim.tuning.city;
    const inset = Math.min(1, cfg.sidewalk * 0.5);
    for (const b of layout.blocks) {
      const hw = b.w / 2 - inset;
      const hd = b.d / 2 - inset;
      this.loops.push([
        { x: b.x - hw, z: b.z - hd },
        { x: b.x + hw, z: b.z - hd },
        { x: b.x + hw, z: b.z + hd },
        { x: b.x - hw, z: b.z + hd },
      ]);
    }
    const perBlock = this.loops.length ? Math.round(5 * cfg.propDensity * sim.tuning.citizens.density) : 0;
    this.count = this.loops.length * perBlock;
    this.alive = this.count;
    const n = Math.max(1, this.count);
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.block = new Uint16Array(n);
    this.corner = new Uint8Array(n);
    this.dir = new Int8Array(n);
    this.state = new Uint8Array(n);
    this.timer = new Float32Array(n);
    this.heading = new Float32Array(n);

    // Drawn bigger than life (about 3 m) so they read from kaiju height.
    const geometry = new THREE.CapsuleGeometry(0.55, 1.5, 2, 6);
    geometry.translate(0, 1.3, 0);
    this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    this.mesh.count = this.count;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    sim.scene.add(this.mesh);

    for (let i = 0; i < this.count; i++) {
      const bi = Math.floor(i / perBlock);
      const loop = this.loops[bi];
      const k = this.rng.int(0, 3);
      const t = this.rng.next();
      const a = loop[k];
      const b = loop[(k + 1) % 4];
      this.block[i] = bi;
      this.dir[i] = this.rng.chance(0.5) ? 1 : -1;
      this.corner[i] = this.dir[i] > 0 ? (k + 1) % 4 : k;
      this.x[i] = a.x + (b.x - a.x) * t;
      this.z[i] = a.z + (b.z - a.z) * t;
      this.mesh.setColorAt(i, c.setHex(this.rng.pick(COLORS)));
      this.write(i, 1);
    }

    sim.on('footfall', (e) => this.stomped(e.x, e.z, e.strength));
  }

  private stomped(fx: number, fz: number, strength: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] === 2) continue;
      if (Math.hypot(this.x[i] - fx, this.z[i] - fz) < SQUISH_RADIUS) {
        this.state[i] = 2;
        this.timer[i] = 0;
        this.alive--;
        this.damage.citizensSquished++;
        this.sim.emit('citizenSquish', { x: this.x[i], y: 0, z: this.z[i] });
      }
    }
    void strength;
  }

  postStep(dt: number): void {
    if (!this.count) return;
    const kp = this.kaiju.body.translation();
    const loud = this.kaiju.mode === 'tiptoe' ? 0.4 : 1;
    // A kaiju standing still is merely alarming; a running one clears the street.
    const radius = SCARE_RADIUS * loud * (0.25 + Math.min(1, this.kaiju.speed / 12) * 0.75);
    let scared = 0;
    for (let i = 0; i < this.count; i++) {
      const st = this.state[i];
      if (st === 2) {
        this.timer[i] += dt;
        continue;
      }
      const dx = this.x[i] - kp.x;
      const dz = this.z[i] - kp.z;
      const dist = Math.hypot(dx, dz);
      if (st === 0 && dist < radius) {
        this.state[i] = 1;
        this.timer[i] = 2 + this.rng.next() * 2;
        if (this.rng.chance(0.25)) this.sim.emit('citizenScare', { x: this.x[i], y: 0, z: this.z[i] });
      }
      if (this.state[i] === 1) {
        scared++;
        // Run straight away from the kaiju; calm down a few seconds after it has gone.
        const inv = 1 / Math.max(dist, 0.01);
        this.x[i] += dx * inv * RUN * dt;
        this.z[i] += dz * inv * RUN * dt;
        this.heading[i] = Math.atan2(dx, dz);
        if (dist > radius * 1.3) {
          this.timer[i] -= dt;
          if (this.timer[i] <= 0) this.state[i] = 0;
        }
        continue;
      }
      // Stroll round the block.
      const target = this.loops[this.block[i]][this.corner[i]];
      const tx = target.x - this.x[i];
      const tz = target.z - this.z[i];
      const td = Math.hypot(tx, tz);
      if (td < 0.6) this.corner[i] = (this.corner[i] + this.dir[i] + 4) % 4;
      else {
        this.x[i] += (tx / td) * STROLL * dt;
        this.z[i] += (tz / td) * STROLL * dt;
        this.heading[i] = Math.atan2(tx, tz);
      }
    }
    this.scared = scared;
  }

  render(): void {
    if (!this.count) return;
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] === 2 && this.timer[i] > 1.2) continue;
      // Squished: flattened into a pancake.
      this.write(i, this.state[i] === 2 ? 0.08 : 1);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private write(i: number, squash: number): void {
    p.set(this.x[i], this.sim.ground(this.x[i], this.z[i]), this.z[i]);
    q.setFromAxisAngle(up, this.heading[i]);
    const wide = squash < 1 ? 1.8 : 1;
    this.mesh.setMatrixAt(i, m.compose(p, q, s.set(wide, squash, wide)));
  }

  /** Positions of the living, for tests. */
  positions(): { x: number; z: number; state: number }[] {
    const out = [];
    for (let i = 0; i < this.count; i++) if (this.state[i] !== 2) out.push({ x: this.x[i], z: this.z[i], state: this.state[i] });
    return out;
  }
}
