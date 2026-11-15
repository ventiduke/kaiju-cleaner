import * as THREE from 'three';
import { Group, type RigidBody } from '../core/physics';
import type { Sim, System } from '../sim';
import type { River } from './cityGen';
import type { ChunkField } from './destruction';

/** Height of the water's surface (the banks are at 0). */
export const WATER_SURFACE = -1.1;
const STREAKS = 90;

const m = new THREE.Matrix4();
const p = new THREE.Vector3();
const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const s = new THREE.Vector3(1, 1, 1);

/**
 * The river's current. Anything loose that ends up in the water is carried downstream
 * (east); rubble floats and is swept clean out of the city, heavier things are rolled
 * along the bed. The kaiju feels the same push through its own controller.
 */
export class RiverFlow implements System {
  private streaks: THREE.InstancedMesh;
  private sx = new Float32Array(STREAKS);
  private sz = new Float32Array(STREAKS);
  private span: number;
  private skip = new Set<number>();

  constructor(
    private sim: Sim,
    private river: River,
    private chunks: ChunkField | null,
    sizeX: number,
  ) {
    this.span = sizeX / 2 + 220;
    sim.current = (_x, z) => (z > river.z0 && z < river.z1 ? sim.tuning.city.riverCurrent : 0);
    // Pale streaks sliding along the surface, so the current can be seen.
    this.streaks = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(14, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.45, depthWrite: false }),
      STREAKS,
    );
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 6;
    let seed = 12345;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < STREAKS; i++) {
      this.sx[i] = (rand() * 2 - 1) * this.span;
      this.sz[i] = river.z0 + 2 + rand() * (river.z1 - river.z0 - 4);
    }
    sim.scene.add(this.streaks);
  }

  /** Bodies the flow leaves alone (the kaiju's own body handles the current itself). */
  exclude(body: RigidBody): void {
    this.skip.add(body.handle);
  }

  preStep(dt: number): void {
    const { z0, z1 } = this.river;
    const g = this.sim.tuning.world.gravity;
    const speed = this.sim.tuning.city.riverCurrent;
    this.sim.world.forEachActiveRigidBody((body) => {
      if (!body.isDynamic() || this.skip.has(body.handle) || body.numColliders() === 0) return;
      const t = body.translation();
      if (t.z <= z0 || t.z >= z1 || t.y > WATER_SURFACE + 1.5) return;
      // How far under it is: 0 at the surface, 1 once a few metres down.
      const depth = Math.min(1, (WATER_SURFACE + 1.5 - t.y) / 3);
      const v = body.linvel();
      const kind = body.collider(0).collisionGroups() >>> 16;
      const floats = (kind & (Group.CHUNK | Group.PIECE)) !== 0;
      const pull = floats ? 1.4 : 0.5;
      body.setLinvel(
        {
          x: v.x + (speed - v.x) * pull * depth * dt,
          // Rubble bobs up to the surface; everything else stays down and is rolled along.
          y: v.y + (floats ? (g * 1.35 - v.y * 1.6) * depth * dt : 0),
          z: v.z - v.z * 0.6 * depth * dt,
        },
        true,
      );
    });
    // Rubble that has been carried clear of the city is gone for good.
    if (this.chunks && this.sim.tick % 30 === 0) this.chunks.sweepRiver(this.span - 60, z0, z1, WATER_SURFACE + 1.5, 25);
  }

  render(_alpha: number, frameDt: number): void {
    const speed = this.sim.tuning.city.riverCurrent;
    for (let i = 0; i < STREAKS; i++) {
      this.sx[i] += speed * frameDt * (0.75 + (i % 5) * 0.1);
      if (this.sx[i] > this.span) this.sx[i] -= this.span * 2;
      this.streaks.setMatrixAt(i, m.compose(p.set(this.sx[i], WATER_SURFACE + 0.08, this.sz[i]), q, s));
    }
    this.streaks.instanceMatrix.needsUpdate = true;
  }
}
