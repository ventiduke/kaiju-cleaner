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
 * The mouse (or Q/E) swings it round and up and down; the wheel zooms.
 */
export class FollowCamera {
  /** View offsets on top of the tuned distance and height: swing (rad), tilt (rad), zoom (x). */
  orbit = 0;
  pitch = 0;
  zoom = 1;
  private yaw: number;
  private focus = new THREE.Vector3();
  private trauma = 0;
  private squat = 1;
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
    sim.on('kaijuSave', (e) => this.shake(0.2, e));
  }

  /** Mouse drag: swing round the kaiju and raise or lower the view. */
  drag(dx: number, dy: number): void {
    this.orbit -= dx * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, -1.2, 1.2);
  }

  wheel(deltaY: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(deltaY * 0.001), 0.35, 3);
  }

  /** Back to straight behind, at the tuned height and distance. */
  reset(): void {
    this.orbit = 0;
    this.pitch = 0;
    this.zoom = 1;
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

    this.focus.lerp(this.kaiju.visual.position, 1 - Math.exp(-frameDt / Math.max(0.01, c.followLag)));
    this.yaw = lerpAngle(this.yaw, this.kaiju.yaw, 1 - Math.exp(-frameDt / Math.max(0.01, c.yawLag)));

    // The tuned distance and height set the resting view; the mouse offsets move along a dome.
    // Crawling drops the view too: steady as a rock, but it can't see over the rooftops.
    const squat = this.kaiju.mode === 'crawl' ? 1 - this.sim.tuning.modes.crawlView : 1;
    this.squat += (squat - this.squat) * Math.min(1, frameDt * 4);
    const height = c.height * this.squat;
    const range = Math.hypot(c.distance, height) * this.zoom;
    const elevation = THREE.MathUtils.clamp(Math.atan2(height, c.distance) + this.pitch, 0.08, 1.5);
    const a = this.yaw + this.orbit;
    const flat = Math.cos(elevation) * range;
    this.camera.position.set(
      this.focus.x - Math.sin(a) * flat,
      Math.sin(elevation) * range,
      this.focus.z - Math.cos(a) * flat,
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
