import * as THREE from 'three';
import type { Sim, System } from '../sim';

const MAX_PUFFS = 220;
const m = new THREE.Matrix4();
const p = new THREE.Vector3();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();

/** Dust puffs where chunks break and feet land. Visual only. */
export class Dust implements System {
  private mesh: THREE.InstancedMesh;
  private pos = new Float32Array(MAX_PUFFS * 3);
  private vel = new Float32Array(MAX_PUFFS * 3);
  private age = new Float32Array(MAX_PUFFS).fill(1e9);
  private life = new Float32Array(MAX_PUFFS).fill(1);
  private size = new Float32Array(MAX_PUFFS);
  private next = 0;
  private seed = 1;

  constructor(sim: Sim) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: 0xd8d0c0, transparent: true, opacity: 0.5, depthWrite: false }),
      MAX_PUFFS,
    );
    this.mesh.frustumCulled = false;
    s.set(0, 0, 0);
    for (let i = 0; i < MAX_PUFFS; i++) this.mesh.setMatrixAt(i, m.compose(p, q, s));
    sim.scene.add(this.mesh);
    sim.on('chunkBreak', (e) => {
      this.puff(e.x, e.y, e.z, e.size * 0.55, 2.5);
      this.puff(e.x, Math.max(1, e.y - e.size * 0.4), e.z, e.size * 0.4, 1.5);
    });
    sim.on('chunkCrumble', (e) => {
      // A piece going to dust: a bigger, thicker cloud than a plain break.
      for (let i = 0; i < 3; i++) this.puff(e.x, e.y, e.z, e.size * 0.6, 4);
    });
    sim.on('sneeze', (e) => {
      // A cone of spray out the front.
      for (let i = 0; i < 26; i++) {
        const far = 4 + i * 2.4;
        this.puff(e.x + e.dx * far + this.random() * far * 0.5, e.y - 2 + this.random() * 4, e.z + e.dz * far + this.random() * far * 0.5, 2.5 + i * 0.18, 6);
      }
    });
    sim.on('groundCollapse', (e) => {
      for (let i = 0; i < 14; i++) this.puff(e.x + this.random() * e.radius * 2, 1, e.z + this.random() * e.radius * 2, 4, 6);
    });
    sim.on('footfall', (e) => {
      // In the river a step throws up spray instead.
      if (e.wet) for (let i = 0; i < 5; i++) this.puff(e.x, -0.6, e.z, 2.2 * e.strength, 7, 5);
      else for (let i = 0; i < 3; i++) this.puff(e.x, 0.8, e.z, 1.6 * e.strength, 4);
    });
    sim.on('citizenSquish', (e) => this.puff(e.x, 1, e.z, 1.4, 2));
    sim.on('kaijuFall', (e) => {
      for (let i = 0; i < 10; i++) this.puff(e.x, 2, e.z, 4, 9);
    });
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647 - 0.5;
  }

  private puff(x: number, y: number, z: number, size: number, spread: number, rise = 1): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_PUFFS;
    this.pos.set([x + this.random() * size, y, z + this.random() * size], i * 3);
    this.vel.set([this.random() * spread, rise + Math.abs(this.random()) * 2.5 * rise, this.random() * spread], i * 3);
    this.age[i] = 0;
    this.life[i] = 1.3 + Math.abs(this.random()) * 1.6;
    this.size[i] = size;
  }

  render(_alpha: number, frameDt: number): void {
    let changed = false;
    for (let i = 0; i < MAX_PUFFS; i++) {
      if (this.age[i] > this.life[i]) continue;
      changed = true;
      this.age[i] += frameDt;
      const t = this.age[i] / this.life[i];
      const drag = Math.exp(-frameDt * 1.5);
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= drag;
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * frameDt;
      }
      // Swell quickly, then thin out.
      const k = t >= 1 ? 0 : this.size[i] * (0.4 + 1.6 * Math.sqrt(t)) * (1 - t * t);
      p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.mesh.setMatrixAt(i, m.compose(p, q, s.set(k, k, k)));
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
