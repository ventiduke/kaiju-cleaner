import * as THREE from 'three';
import { FEEDBACK, TIERS } from '../core/juice';
import type { Sim, System } from '../sim';

const MAX = 260;
const LIFE = 2.6;
const m = new THREE.Matrix4();
const p = new THREE.Vector3();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const s = new THREE.Vector3();
const c = new THREE.Color();
const COLORS = [0xffc928, 0x7dff9a, 0x3fd0ff, 0xff7ad9, 0xffffff];

/** A burst of paper when a job is finished: the one piece of feedback that is pure reward. */
export class Confetti implements System {
  private mesh: THREE.InstancedMesh;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private age = new Float32Array(MAX).fill(LIFE);
  private spin = new Float32Array(MAX);
  private next = 0;
  private seed = 1;

  constructor(private sim: Sim) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    sim.scene.add(this.mesh);
    for (const name of ['piecePlace', 'sweepDone', 'repairsDone'] as const) {
      sim.on(name, (at) => this.burst(at.x, at.y + 6, at.z, TIERS[FEEDBACK[name]!.tier].burst * (name === 'repairsDone' ? 2 : 1)));
    }
  }

  /** (Its own little random numbers: this is decoration, and must not disturb the simulation's.) */
  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  burst(x: number, y: number, z: number, count: number): void {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = this.random() * Math.PI * 2;
      const out = 6 + this.random() * 16;
      this.pos.set([x, y, z], i * 3);
      this.vel.set([Math.cos(a) * out, 18 + this.random() * 22, Math.sin(a) * out], i * 3);
      this.age[i] = 0;
      this.spin[i] = this.random() * 6.28;
      this.mesh.setColorAt(i, c.setHex(COLORS[i % COLORS.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  render(_alpha: number, frameDt: number): void {
    let live = 0;
    const g = this.sim.tuning.world.gravity;
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] >= LIFE) {
        this.mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
        continue;
      }
      live++;
      this.age[i] += frameDt;
      const k = i * 3;
      // Up fast, then fluttering down: light things in air stop quickly.
      this.vel[k] *= 1 - 1.6 * frameDt;
      this.vel[k + 2] *= 1 - 1.6 * frameDt;
      this.vel[k + 1] = Math.max(-7, this.vel[k + 1] - g * 0.55 * frameDt);
      this.pos[k] += this.vel[k] * frameDt;
      this.pos[k + 1] += this.vel[k + 1] * frameDt;
      this.pos[k + 2] += this.vel[k + 2] * frameDt;
      const t = this.age[i];
      e.set(this.spin[i] + t * 7, this.spin[i] * 2 + t * 5, t * 3);
      const fade = Math.min(1, (LIFE - t) * 2.5);
      this.mesh.setMatrixAt(i, m.compose(p.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]), q.setFromEuler(e), s.setScalar(fade)));
    }
    this.mesh.count = live ? MAX : 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
