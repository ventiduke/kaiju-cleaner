import * as THREE from 'three';
import type { Sim } from '../sim';
import type { Kaiju } from './kaiju';

function lerpAngle(from: number, to: number, t: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

/**
 * Third-person camera: high, behind, and lazy. It trails the kaiju's position and
 * heading with separate lags, so turns swing the view after the body has gone.
 */
export class FollowCamera {
  /** Manual orbit offset in radians. */
  orbit = 0;
  private yaw: number;
  private focus = new THREE.Vector3();
  private trauma = 0;
  private time = 0;

  constructor(
    private sim: Sim,
    private camera: THREE.PerspectiveCamera,
    private kaiju: Kaiju,
  ) {
    this.yaw = kaiju.yaw;
    this.focus.copy(kaiju.visual.position);
    sim.on('footfall', (e) => this.shake(0.1 * e.strength, e));
    sim.on('chunkBreak', (e) => this.shake(0.05, e));
    sim.on('kaijuFall', (e) => this.shake(0.6, e));
  }

  /** Adds shake, fading with distance from the kaiju. */
  private shake(amount: number, at: { x: number; z: number }): void {
    const d = Math.hypot(at.x - this.focus.x, at.z - this.focus.z);
    this.trauma = Math.min(1, this.trauma + amount / (1 + d / 60));
  }

  update(frameDt: number): void {
    const c = this.sim.tuning.camera;
    const input = this.sim.players[this.kaiju.player];
    this.time += frameDt;
    this.orbit += (input?.camYaw ?? 0) * 1.6 * frameDt;
    // Drift back behind the kaiju once it is walking again.
    if (!input?.camYaw && Math.abs(input?.thrust ?? 0) > 0.1) this.orbit *= Math.exp(-frameDt / 1.5);

    this.focus.lerp(this.kaiju.visual.position, 1 - Math.exp(-frameDt / Math.max(0.01, c.followLag)));
    this.yaw = lerpAngle(this.yaw, this.kaiju.yaw, 1 - Math.exp(-frameDt / Math.max(0.01, c.yawLag)));

    const a = this.yaw + this.orbit;
    this.camera.position.set(
      this.focus.x - Math.sin(a) * c.distance,
      c.height,
      this.focus.z - Math.cos(a) * c.distance,
    );
    if (this.camera.fov !== c.fov) {
      this.camera.fov = c.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this.focus.x, c.lookHeight, this.focus.z);

    this.trauma = Math.max(0, this.trauma - frameDt * 1.4);
    const s = this.trauma * this.trauma * c.shake;
    if (s > 0) {
      const t = this.time * 38;
      this.camera.position.x += Math.sin(t * 1.3) * s * 1.6;
      this.camera.position.y += Math.sin(t * 1.7 + 1) * s * 1.6;
      this.camera.rotation.z += Math.sin(t * 1.1 + 2) * s * 0.012;
    }
  }
}
