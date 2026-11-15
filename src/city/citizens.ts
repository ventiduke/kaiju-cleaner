import * as THREE from 'three';
import { ALL_GROUPS, Group, groups } from '../core/physics';
import { Rng } from '../core/rng';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim, System } from '../sim';
import type { CityLayout } from './cityGen';
import type { Damage } from './damage';

const STROLL = 1.6;
const RUN = 7.5;
const SCARE_RADIUS = 46;
const SQUISH_RADIUS = 4.2;
const MAX_SPLATS = 420;
const WALL_SPLAT_LIFE = 18;
const COLORS = [0xf2c230, 0xe85d4a, 0x4aa3e8, 0xf4f1ea, 0x7fd66b, 0xe58ad1, 0xf59f3a, 0x9b6bff, 0x3fe0c5];

const enum State {
  Stroll,
  Run,
  Gone,
  Flying,
  Cheer,
}

const m = new THREE.Matrix4();
const p = new THREE.Vector3();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const flat = new THREE.Vector3(0, 0, 1);
const n = new THREE.Vector3();
const c = new THREE.Color();

/**
 * The townsfolk: tiny people strolling the sidewalks. They run from a kaiju that comes
 * stomping by (less so from one on tiptoe) and cheer a repair. A foot landing on one
 * leaves a colourful splat; a kick, a tail or a sneeze sends them flying, and they
 * splat wherever they land, ground or wall.
 * They are not physics bodies, just points that walk; there can be hundreds.
 */
export class Citizens implements System {
  readonly count: number;
  alive: number;
  /** How many are running scared, and how many are airborne, right now. */
  scared = 0;
  flying = 0;
  /** Splats so far, on the ground and on walls. */
  splats = 0;
  wallSplats = 0;

  private mesh: THREE.InstancedMesh;
  private splatMesh: THREE.InstancedMesh;
  private x: Float32Array;
  private y: Float32Array;
  private z: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private color: Uint32Array;
  private block: Uint16Array;
  private corner: Uint8Array;
  private dir: Int8Array;
  private state: Uint8Array;
  private timer: Float32Array;
  private heading: Float32Array;
  private rng = new Rng(4242);
  private loops: { x: number; z: number }[][] = [];
  private nextSplat = 0;
  /** Sim time at which each wall splat fades, or 0 for one that stays. */
  private splatExpiry = new Float32Array(MAX_SPLATS);
  private splatPose: THREE.Matrix4[] = [];
  private ray;

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
    const size = Math.max(1, this.count);
    this.x = new Float32Array(size);
    this.y = new Float32Array(size);
    this.z = new Float32Array(size);
    this.vx = new Float32Array(size);
    this.vy = new Float32Array(size);
    this.vz = new Float32Array(size);
    this.color = new Uint32Array(size);
    this.block = new Uint16Array(size);
    this.corner = new Uint8Array(size);
    this.dir = new Int8Array(size);
    this.state = new Uint8Array(size);
    this.timer = new Float32Array(size);
    this.heading = new Float32Array(size);
    this.ray = new sim.R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

    // Drawn bigger than life (about 3 m) so they read from kaiju height.
    const geometry = new THREE.CapsuleGeometry(0.55, 1.5, 2, 6);
    geometry.translate(0, 1.3, 0);
    this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xffffff }), size);
    this.mesh.count = this.count;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    sim.scene.add(this.mesh);

    // Splats: flat blobs that face out from whatever they hit.
    this.splatMesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 9),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      MAX_SPLATS,
    );
    this.splatMesh.count = 0;
    this.splatMesh.frustumCulled = false;
    sim.scene.add(this.splatMesh);
    for (let i = 0; i < MAX_SPLATS; i++) this.splatPose.push(new THREE.Matrix4());

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
      this.color[i] = this.rng.pick(COLORS);
      this.mesh.setColorAt(i, c.setHex(this.color[i]));
      this.write(i);
    }

    sim.on('footfall', (e) => this.stomped(e.x, e.z, e.strength));
    sim.on('kaijuFall', (e) => this.flattened(e.x, e.z, sim.tuning.kaiju.bodyRadius * 1.6));
    sim.on('sneeze', (e) => this.blown(e.x, e.z, e.dx, e.dz));
    sim.on('piecePlace', (e) => this.cheer(e.x, e.z));
  }

  /** Leaves a splat at a point, facing along `normal`. Wall splats fade; ground ones stay. */
  private splat(i: number, x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    const slot = this.nextSplat;
    this.nextSplat = (this.nextSplat + 1) % MAX_SPLATS;
    this.splatMesh.count = Math.min(MAX_SPLATS, this.splatMesh.count + (this.splatMesh.count <= slot ? 1 : 0));
    n.set(nx, ny, nz).normalize();
    const wall = Math.abs(n.y) < 0.6;
    const size = 2.2 + this.rng.next() * 1.8;
    q.setFromUnitVectors(flat, n);
    // Spin it round its own facing, so no two look alike.
    q.multiply(new THREE.Quaternion().setFromAxisAngle(flat, this.rng.next() * 6.28));
    p.set(x, y, z).addScaledVector(n, 0.12);
    this.splatPose[slot].compose(p, q, s.set(size * (0.75 + this.rng.next() * 0.5), size, 1));
    this.splatMesh.setMatrixAt(slot, this.splatPose[slot]);
    this.splatMesh.setColorAt(slot, c.setHex(this.color[i]));
    this.splatMesh.instanceMatrix.needsUpdate = true;
    if (this.splatMesh.instanceColor) this.splatMesh.instanceColor.needsUpdate = true;
    this.splatExpiry[slot] = wall ? this.sim.time + WALL_SPLAT_LIFE : 0;
    this.splats++;
    if (wall) this.wallSplats++;
    this.sim.emit('citizenSplat', { x, y, z });
  }

  private kill(i: number): void {
    if (this.state[i] === State.Gone) return;
    this.state[i] = State.Gone;
    this.alive--;
    this.damage.citizensSquished++;
  }

  /** Sends one flying. It splats wherever it comes down. */
  fling(i: number, vx: number, vy: number, vz: number): void {
    if (this.state[i] === State.Gone || this.state[i] === State.Flying) return;
    this.state[i] = State.Flying;
    this.y[i] = Math.max(this.y[i], 0.5);
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.sim.emit('citizenSquish', { x: this.x[i], y: this.y[i], z: this.z[i] });
  }

  private stomped(fx: number, fz: number, strength: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] === State.Gone || this.state[i] === State.Flying) continue;
      const dx = this.x[i] - fx;
      const dz = this.z[i] - fz;
      const d = Math.hypot(dx, dz);
      if (d < SQUISH_RADIUS) {
        // Under the foot: a splat where they stood.
        this.kill(i);
        this.splat(i, this.x[i], this.sim.ground(this.x[i], this.z[i]), this.z[i], 0, 1, 0);
        this.sim.emit('citizenSquish', { x: this.x[i], y: 0, z: this.z[i] });
      } else if (d < SQUISH_RADIUS * 2.1 && strength > 0.5) {
        // Right beside it: thrown clear by the shock.
        const k = (9 + this.rng.next() * 9) / Math.max(d, 0.1);
        this.fling(i, dx * k, 9 + this.rng.next() * 6, dz * k);
      }
    }
  }

  /** The kaiju has come down on top of them. */
  private flattened(fx: number, fz: number, radius: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] === State.Gone || this.state[i] === State.Flying) continue;
      if (Math.hypot(this.x[i] - fx, this.z[i] - fz) < radius) {
        this.kill(i);
        this.splat(i, this.x[i], this.sim.ground(this.x[i], this.z[i]), this.z[i], 0, 1, 0);
      }
    }
  }

  /** A sneeze: everyone in front of the kaiju goes with it. */
  private blown(ox: number, oz: number, dx: number, dz: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] === State.Gone) continue;
      const rx = this.x[i] - ox;
      const rz = this.z[i] - oz;
      const along = rx * dx + rz * dz;
      const dist = Math.hypot(rx, rz);
      if (along < 0 || dist > 85 || along / Math.max(dist, 0.01) < 0.75) continue;
      const power = 34 * (1 - dist / 110);
      this.fling(i, dx * power + this.rng.range(-4, 4), 10 + this.rng.next() * 12, dz * power + this.rng.range(-4, 4));
    }
  }

  private cheer(x: number, z: number): void {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] !== State.Stroll && this.state[i] !== State.Run) continue;
      if (Math.hypot(this.x[i] - x, this.z[i] - z) < 110) {
        this.state[i] = State.Cheer;
        this.timer[i] = 3.5 + this.rng.next() * 1.5;
        any = true;
      }
    }
    if (any) this.sim.emit('citizenCheer', { x, y: 0, z });
  }

  /**
   * The kaiju has said sorry. Everyone near who was running from it stops, and gives it a
   * (short, wary) cheer. Returns how many were won over.
   */
  calm(x: number, z: number, radius: number): number {
    let won = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] !== State.Run) continue;
      if (Math.hypot(this.x[i] - x, this.z[i] - z) > radius) continue;
      this.state[i] = State.Cheer;
      this.timer[i] = 2 + this.rng.next();
      won++;
    }
    if (won) this.sim.emit('citizenCheer', { x, y: 0, z });
    return won;
  }

  /** A jolt from a point (a geyser, say): everyone within the radius is thrown up and outward. */
  jolt(x: number, z: number, radius: number, power: number): number {
    let thrown = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] === State.Gone || this.state[i] === State.Flying) continue;
      const dx = this.x[i] - x;
      const dz = this.z[i] - z;
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const k = (power * 0.5) / Math.max(d, 1);
      this.fling(i, dx * k, power * (0.8 + 0.4 * this.rng.next()), dz * k);
      thrown++;
    }
    return thrown;
  }

  /** How many are cheering right now. */
  cheering(): number {
    let k = 0;
    for (let i = 0; i < this.count; i++) if (this.state[i] === State.Cheer) k++;
    return k;
  }

  postStep(dt: number): void {
    if (!this.count) return;
    const k = this.kaiju;
    const kp = k.body.translation();
    const loud = k.mode === 'tiptoe' ? 0.4 : 1;
    // A kaiju standing still is merely alarming; a running one clears the street.
    const radius = SCARE_RADIUS * loud * (0.25 + Math.min(1, k.speed / 12) * 0.75);
    const g = this.sim.tuning.world.gravity;

    // The tail sweeps them up: anything a low, fast segment passes over goes flying.
    const tail = k.tail.segments;
    const tailHits: { x: number; z: number; vx: number; vy: number; vz: number; r: number }[] = [];
    for (const seg of tail) {
      const t = seg.translation();
      const v = seg.linvel();
      const speed = Math.hypot(v.x, v.z);
      if (t.y < 7 && speed > 6) tailHits.push({ x: t.x, z: t.z, vx: v.x, vy: v.y, vz: v.z, r: 4.2 });
    }

    let scared = 0;
    let flying = 0;
    for (let i = 0; i < this.count; i++) {
      const st = this.state[i];
      if (st === State.Gone) continue;

      if (st === State.Flying) {
        flying++;
        this.vy[i] -= g * dt;
        const step = Math.hypot(this.vx[i], this.vy[i], this.vz[i]) * dt;
        // Whatever is in the way: a wall, a roof, a piece, the ground.
        this.ray.origin = { x: this.x[i], y: this.y[i] + 1, z: this.z[i] };
        const inv = dt / Math.max(step, 1e-6);
        this.ray.dir = { x: this.vx[i] * inv, y: this.vy[i] * inv, z: this.vz[i] * inv };
        const hit = this.sim.world.castRayAndGetNormal(
          this.ray,
          step + 0.6,
          true,
          undefined,
          groups(ALL_GROUPS, Group.CHUNK | Group.PIECE | Group.GROUND),
        );
        if (hit) {
          const d = hit.timeOfImpact;
          const hx = this.x[i] + this.ray.dir.x * d;
          const hy = this.y[i] + 1 + this.ray.dir.y * d;
          const hz = this.z[i] + this.ray.dir.z * d;
          this.kill(i);
          this.splat(i, hx, hy, hz, hit.normal.x, hit.normal.y, hit.normal.z);
          continue;
        }
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        this.z[i] += this.vz[i] * dt;
        this.heading[i] += dt * 9;
        // Safety net: never fall through the world.
        if (this.y[i] < this.sim.ground(this.x[i], this.z[i]) - 1) {
          this.kill(i);
          this.splat(i, this.x[i], this.sim.ground(this.x[i], this.z[i]), this.z[i], 0, 1, 0);
        }
        continue;
      }

      for (const h of tailHits) {
        if (Math.abs(this.x[i] - h.x) < h.r && Math.abs(this.z[i] - h.z) < h.r) {
          this.fling(i, h.vx * 1.15, Math.max(7, h.vy + 8), h.vz * 1.15);
          break;
        }
      }
      if (this.state[i] === State.Flying) continue;

      if (st === State.Cheer) {
        this.timer[i] -= dt;
        // Hopping on the spot.
        this.y[i] = Math.abs(Math.sin(this.timer[i] * 7 + i)) * 1.6;
        if (this.timer[i] <= 0) {
          this.state[i] = State.Stroll;
          this.y[i] = 0;
        }
        continue;
      }

      const dx = this.x[i] - kp.x;
      const dz = this.z[i] - kp.z;
      const dist = Math.hypot(dx, dz);
      if (st === State.Stroll && dist < radius) {
        this.state[i] = State.Run;
        this.timer[i] = 2 + this.rng.next() * 2;
        if (this.rng.chance(0.25)) this.sim.emit('citizenScare', { x: this.x[i], y: 0, z: this.z[i] });
      }
      if (this.state[i] === State.Run) {
        scared++;
        // Run straight away from the kaiju; calm down a few seconds after it has gone.
        const inv = 1 / Math.max(dist, 0.01);
        this.x[i] += dx * inv * RUN * dt;
        this.z[i] += dz * inv * RUN * dt;
        this.heading[i] = Math.atan2(dx, dz);
        if (dist > radius * 1.3) {
          this.timer[i] -= dt;
          if (this.timer[i] <= 0) this.state[i] = State.Stroll;
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
    this.flying = flying;

    // Wall splats dry up and flake off after a while (the wall may not be there by then anyway).
    if (this.sim.tick % 30 === 0) {
      for (let slot = 0; slot < this.splatMesh.count; slot++) {
        if (this.splatExpiry[slot] > 0 && this.sim.time > this.splatExpiry[slot]) {
          this.splatExpiry[slot] = 0;
          this.splatMesh.setMatrixAt(slot, m.makeScale(0, 0, 0));
          this.splatMesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  render(): void {
    if (!this.count) return;
    for (let i = 0; i < this.count; i++) this.write(i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private write(i: number): void {
    const st = this.state[i];
    if (st === State.Gone) {
      this.mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
      return;
    }
    const groundY = st === State.Flying ? 0 : this.sim.ground(this.x[i], this.z[i]);
    p.set(this.x[i], groundY + this.y[i], this.z[i]);
    q.setFromAxisAngle(up, this.heading[i]);
    // Tumbling through the air.
    if (st === State.Flying) q.multiply(new THREE.Quaternion().setFromAxisAngle(flat, this.heading[i] * 1.7));
    this.mesh.setMatrixAt(i, m.compose(p, q, s.set(1, 1, 1)));
  }

  /** Positions of the living, for tests. */
  positions(): { x: number; z: number; state: number }[] {
    const out = [];
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] !== State.Gone) out.push({ x: this.x[i], z: this.z[i], state: this.state[i] });
    }
    return out;
  }

  /** Index of the living person nearest a point, or -1. For tests. */
  nearestTo(x: number, z: number): number {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] === State.Gone) continue;
      const d = Math.hypot(this.x[i] - x, this.z[i] - z);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  where(i: number): { x: number; y: number; z: number; alive: boolean } {
    return { x: this.x[i], y: this.y[i], z: this.z[i], alive: this.state[i] !== State.Gone };
  }
}
