import { FEEDBACK, TIERS } from '../core/juice';
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
    // Every event with feedback shakes the camera by its size (see core/juice.ts).
    for (const name of Object.keys(FEEDBACK) as (keyof typeof FEEDBACK)[]) {
      const f = FEEDBACK[name]!;
      sim.on(name, (e) => {
        const strength = name === 'footfall' ? (e as { strength: number }).strength : 1;
        this.shake(TIERS[f.tier].trauma * (f.scale ?? 1) * strength, e);
      });
    }
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

  /**
   * The runner's camera: close behind and a little above, pointing exactly where the player has
   * turned it. It does not drift round behind the kaiju by itself; the kaiju turns to face it.
   */
  private updateRunner(frameDt: number): void {
    const r = this.sim.tuning.runner;
    const c = this.sim.tuning.camera;
    const input = this.sim.players[this.kaiju.player];
    const at = this.kaiju.visual.position;
    this.focus.lerp(at, 1 - Math.exp(-frameDt / 0.05));
    this.yaw = input?.look ?? this.kaiju.yaw;
    const elevation = THREE.MathUtils.clamp(0.3 + this.pitch, -0.25, 1.35);
    const range = r.camDistance * this.zoom;
    const flat = Math.cos(elevation) * range;
    const eye = this.focus.y + r.camHeight * 0.25;
    this.camera.position.set(this.focus.x - Math.sin(this.yaw) * flat, Math.max(2, eye + Math.sin(elevation) * range), this.focus.z - Math.cos(this.yaw) * flat);
    if (this.camera.fov !== c.fov) {
      this.camera.fov = c.fov;
      this.camera.updateProjectionMatrix();
    }
    // Looking past the kaiju, so that what it is running at is in the middle of the screen.
    this.camera.lookAt(this.focus.x + Math.sin(this.yaw) * 30, eye + r.camHeight * 0.2 - Math.sin(elevation - 0.3) * 30, this.focus.z + Math.cos(this.yaw) * 30);
    this.trauma = Math.max(0, this.trauma - frameDt * 1.4);
    const s = this.trauma * this.trauma * c.shake;
    if (s > 0) {
      const t = this.time * 38;
      this.camera.position.x += Math.sin(t * 1.3) * s * 1.2;
      this.camera.position.y += Math.sin(t * 1.7 + 1) * s * 1.2;
    }
  }

  update(frameDt: number): void {
    const c = this.sim.tuning.camera;
    const input = this.sim.players[this.kaiju.player];
    this.time += frameDt;
    this.orbit += (input?.camYaw ?? 0) * 1.6 * frameDt;

    if (this.sim.tuning.move.controller === 1) {
      this.updateRunner(frameDt);
      return;
    }

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
