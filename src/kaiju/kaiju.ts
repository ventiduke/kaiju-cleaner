import * as THREE from 'three';
import type { ChunkField } from '../city/destruction';
import { ALL_GROUPS, Group, groups, type RigidBody } from '../core/physics';
import type { PlayerInput, Sim, System } from '../sim';
import { Legs, type LegContext } from './legs';
import { Tail } from './tail';

export type KaijuState = 'walk' | 'stumble' | 'fallen' | 'getup';

const UP = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const vel = new THREE.Vector3();
const quat = new THREE.Quaternion();
const up = new THREE.Vector3();
const fwd = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const point = new THREE.Vector3();

function smooth(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * One kaiju: a top-heavy capsule floating on a hover spring, kept upright by a
 * deliberately under-damped balance controller. The wobble is the game.
 *
 * Nothing here is a singleton; build one per player.
 */
export class Kaiju implements System {
  readonly body: RigidBody;
  readonly visual = new THREE.Group();
  readonly tail: Tail;
  readonly legs: Legs;
  readonly rideHeight: number;

  state: KaijuState = 'walk';
  stateTime = 0;
  /** Angle between the body's up axis and vertical, in radians. */
  tilt = 0;
  /** Heading in radians. 0 faces +z; positive turns left. */
  yaw: number;
  /** Horizontal speed, and its signed forward part. */
  speed = 0;
  forwardSpeed = 0;
  stumbles = 0;
  falls = 0;
  /** Seconds spent pushing without getting anywhere. */
  stall = 0;
  private lastForwardSpeed = 0;

  /** Horizontal facing and left vectors, refreshed every step. */
  readonly forward = new THREE.Vector3(0, 0, 1);
  readonly left = new THREE.Vector3(1, 0, 0);
  private readonly ray;
  private readonly legContext: LegContext;

  constructor(
    private sim: Sim,
    readonly player: number,
    spawn: { x: number; z: number; yaw: number },
    chunks: ChunkField | null,
  ) {
    const { R, world, tuning } = sim;
    const k = tuning.kaiju;
    this.rideHeight = k.legLength + k.bodyRadius + k.bodyHalfHeight;
    this.yaw = spawn.yaw;
    this.forward.set(Math.sin(spawn.yaw), 0, Math.cos(spawn.yaw));
    this.left.set(this.forward.z, 0, -this.forward.x);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, spawn.yaw);

    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, this.rideHeight, spawn.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setCanSleep(false)
        .setAdditionalSolverIterations(4),
    );
    world.createCollider(
      R.ColliderDesc.capsule(k.bodyHalfHeight, k.bodyRadius)
        .setDensity(k.density)
        .setFriction(0.35)
        .setRestitution(0)
        .setCollisionGroups(groups(Group.BODY, Group.GROUND | Group.CHUNK | Group.PROP | Group.BALL)),
      this.body,
    );
    chunks?.addHitter(this.body, k.bodyHalfHeight + k.bodyRadius);
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

    const skin = new THREE.MeshLambertMaterial({ color: 0x4fa37a });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3c8463 });
    this.buildVisual(skin, dark);
    sim.track(this.body, this.visual);

    this.tail = new Tail(
      sim,
      this.body,
      new THREE.Vector3(0, -k.bodyHalfHeight * 0.55, -k.bodyRadius * 0.75),
      skin,
      chunks,
    );
    this.legContext = {
      pos: new THREE.Vector3(spawn.x, this.rideHeight, spawn.z),
      forward: this.forward,
      left: this.left,
      velocity: new THREE.Vector3(),
      yaw: this.yaw,
      standing: true,
    };
    this.legs = new Legs(sim, chunks, this.visual, dark, this.legContext);
    this.legs.onFootfall = (side, p, strength) => this.footfall(side, p, strength);
  }

  private get input(): PlayerInput {
    return this.sim.players[this.player] ?? this.sim.players[0];
  }

  private buildVisual(skin: THREE.Material, dark: THREE.Material): void {
    const k = this.sim.tuning.kaiju;
    const r = k.bodyRadius;
    const h = k.bodyHalfHeight;
    const belly = new THREE.MeshLambertMaterial({ color: 0xe9dfb4 });
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const black = new THREE.MeshLambertMaterial({ color: 0x1c1f24 });
    const add = (mesh: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh => {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.visual.add(mesh);
      return mesh;
    };
    add(new THREE.Mesh(new THREE.CapsuleGeometry(r, h * 2, 6, 14), skin), 0, 0, 0);
    const tum = add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.84, 14, 10), belly), 0, -h * 0.25, r * 0.36);
    tum.scale.set(0.92, 1.45, 0.86);
    // Head: big and blunt, set forward so it leads the lean.
    const headY = h + r * 0.55;
    add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 14, 10), skin), 0, headY, r * 0.45);
    add(new THREE.Mesh(new THREE.BoxGeometry(r * 1.15, r * 0.7, r * 1.2), skin), 0, headY - r * 0.25, r * 1.15);
    add(new THREE.Mesh(new THREE.BoxGeometry(r * 1.0, r * 0.16, r * 1.0), belly), 0, headY - r * 0.62, r * 1.2);
    for (const s of [-1, 1]) {
      add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.27, 10, 8), white), s * r * 0.5, headY + r * 0.42, r * 0.95);
      add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 8, 6), black), s * r * 0.5, headY + r * 0.44, r * 1.19);
      add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.09, r * 0.09, r * 0.09), black), s * r * 0.25, headY - r * 0.05, r * 1.76);
      // Stubby arms.
      const arm = add(new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.22, r * 0.7, 4, 8), dark), s * r * 0.98, h * 0.25, r * 0.5);
      arm.rotation.set(-1.0, 0, s * 0.35);
    }
    // Back plates.
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const plate = add(
        new THREE.Mesh(new THREE.ConeGeometry(r * (0.34 - 0.1 * Math.abs(t - 0.4)), r * 0.75, 4), dark),
        0,
        h * (0.95 - t * 1.5),
        -r * (0.82 + 0.16 * Math.sin(t * Math.PI)),
      );
      plate.rotation.x = -Math.PI / 2 + 0.35;
    }
  }

  private footfall(side: number, p: THREE.Vector3, strength: number): void {
    const k = this.sim.tuning.kaiju;
    if (this.state === 'walk' || this.state === 'stumble') {
      // Each step rocks the body toward the foot that just landed.
      const w = this.body.angvel();
      const kick = k.footfallKick * strength * side;
      this.body.setAngvel(
        { x: w.x - this.forward.x * kick, y: w.y, z: w.z - this.forward.z * kick },
        true,
      );
    }
    this.sim.emit('footfall', { x: p.x, y: p.y, z: p.z, side, strength });
  }

  private setState(next: KaijuState): void {
    this.state = next;
    this.stateTime = 0;
  }

  preStep(dt: number): void {
    const k = this.sim.tuning.kaiju;
    const g = this.sim.tuning.world.gravity;
    const body = this.body;
    const mass = body.mass();
    const t = body.translation();
    const r = body.rotation();
    const lv = body.linvel();
    pos.set(t.x, t.y, t.z);
    quat.set(r.x, r.y, r.z, r.w);
    vel.set(lv.x, lv.y, lv.z);

    up.set(0, 1, 0).applyQuaternion(quat);
    this.tilt = Math.acos(THREE.MathUtils.clamp(up.y, -1, 1));
    fwd.set(0, 0, 1).applyQuaternion(quat);
    fwd.y = 0;
    if (fwd.lengthSq() > 0.05) {
      this.forward.copy(fwd.normalize());
      this.yaw = Math.atan2(this.forward.x, this.forward.z);
    }
    this.left.set(this.forward.z, 0, -this.forward.x);
    this.forwardSpeed = vel.x * this.forward.x + vel.z * this.forward.z;
    const sideSpeed = vel.x * this.left.x + vel.z * this.left.z;
    this.speed = Math.hypot(vel.x, vel.z);

    // --- State machine ---
    this.stateTime += dt;
    if ((this.state === 'walk' || this.state === 'stumble') && this.tilt > k.fallAngle) {
      this.setState('fallen');
      this.falls++;
      this.sim.emit('kaijuFall', { x: pos.x, y: pos.y, z: pos.z });
    } else if (this.state === 'walk' && this.tilt > k.stumbleAngle) {
      this.setState('stumble');
      this.stumbles++;
      this.lurch(mass);
    } else if (this.state === 'stumble' && this.stateTime > k.stumbleDuration) {
      if (this.tilt < k.stumbleAngle * 0.75) this.setState('walk');
      else {
        // Still going over: stagger again.
        this.stateTime = 0;
        this.lurch(mass);
      }
    } else if (this.state === 'fallen') {
      const settled = this.speed < 1.5 && Math.abs(vel.y) < 1.5;
      if ((this.stateTime > k.fallDuration && settled) || this.stateTime > k.fallDuration * 2.5) this.setState('getup');
    } else if (this.state === 'getup') {
      if ((this.stateTime > k.getUpDuration && this.tilt < k.stumbleAngle * 0.75) || this.stateTime > k.getUpDuration * 2.5) {
        this.setState('walk');
      }
    }

    const standing = this.state === 'walk' || this.state === 'stumble';
    /** How much the hover and balance controllers are engaged (0 fallen .. 1 standing). */
    const engaged = standing ? 1 : this.state === 'getup' ? smooth(this.stateTime / k.getUpDuration) : 0;
    const control = this.state === 'walk' ? 1 : this.state === 'stumble' ? k.stumbleControl : 0;
    const input = this.input;

    // --- Hover spring: holds the body at ride height above the ground ---
    if (engaged > 0) {
      this.ray.origin = pos;
      const hit = this.sim.world.castRay(
        this.ray,
        this.rideHeight * 1.6,
        true,
        undefined,
        groups(ALL_GROUPS, Group.GROUND),
      );
      if (hit) {
        const w = Math.PI * 2 * k.hoverFrequency;
        const zeta = this.state === 'getup' ? Math.max(k.hoverDamping, 1) : k.hoverDamping;
        const error = this.rideHeight - hit.timeOfImpact;
        let lift = g + w * w * error - 2 * zeta * w * vel.y;
        lift = THREE.MathUtils.clamp(lift, 0, g * 2.6) * engaged;
        body.applyImpulse({ x: 0, y: mass * lift * dt, z: 0 }, true);
      }
    }

    // --- Locomotion: the feet push at a point well below the centre of mass ---
    if (standing) {
      const target = input.thrust >= 0 ? input.thrust * k.maxSpeed : input.thrust * k.reverseSpeed;
      const diff = target * control - this.forwardSpeed;
      const speedingUp = Math.sign(diff) === Math.sign(target) && target !== 0;
      // Stalled against something? Lean into it: the push builds until the obstacle gives.
      const gained = (this.forwardSpeed - this.lastForwardSpeed) / dt;
      this.lastForwardSpeed = this.forwardSpeed;
      const wanted = Math.abs(diff) > 1 && speedingUp;
      this.stall = wanted && Math.abs(gained) < k.acceleration * 0.3 ? this.stall + dt : Math.max(0, this.stall - dt * 3);
      const boost = 1 + (k.pushBoost - 1) * smooth((this.stall - 0.3) / 0.8);
      const rate = (speedingUp ? k.acceleration * boost : k.braking) * (speedingUp ? control : 1);
      const along = THREE.MathUtils.clamp(diff / dt, -rate, rate);
      const across = THREE.MathUtils.clamp(-sideSpeed / dt, -k.grip, k.grip);
      tmp
        .copy(this.forward)
        .multiplyScalar(along)
        .addScaledVector(this.left, across)
        .multiplyScalar(mass * dt);
      point.copy(pos);
      point.y -= k.driveOffset;
      body.applyImpulseAtPoint(tmp, point, true);
    }

    // --- Balance and turning: angular accelerations, independent of mass ---
    const av = body.angvel();
    tmp.set(av.x, av.y, av.z);
    if (engaged > 0) {
      const w = Math.PI * 2 * k.uprightFrequency;
      const zeta = this.state === 'getup' ? Math.max(k.uprightDamping, 0.9) : k.uprightDamping;
      // Axis that rotates the body's up back onto world up; its length is sin(tilt).
      tmp2.crossVectors(up, UP);
      const s = tmp2.length();
      if (s > 1e-5) tmp2.multiplyScalar((w * w * this.tilt) / s);
      tmp2.x -= 2 * zeta * w * av.x;
      tmp2.z -= 2 * zeta * w * av.z;
      tmp2.y = 0;
      tmp.addScaledVector(tmp2, engaged * dt);
    }
    if (standing) {
      const authority = 1 - k.turnSpeedPenalty * Math.min(1, Math.abs(this.forwardSpeed) / k.maxSpeed);
      const targetRate = input.turn * k.maxTurnRate * authority * control;
      const accel = THREE.MathUtils.clamp((targetRate - av.y) / dt, -k.turnAcceleration, k.turnAcceleration);
      tmp.y += accel * dt;
    }
    body.setAngvel(tmp, true);

    // --- Legs and tail ---
    const ctx = this.legContext;
    ctx.pos.copy(pos);
    ctx.velocity.set(vel.x, 0, vel.z);
    ctx.yaw = this.yaw;
    ctx.standing = standing;
    this.legs.update(dt, ctx);
    if (this.sim.tick % 30 === 0) this.tail.syncMotors();
  }

  /** The catch-step of a stumble: a shove at foot level toward the side it is toppling to. */
  private lurch(mass: number): void {
    const k = this.sim.tuning.kaiju;
    tmp.set(up.x, 0, up.z);
    if (tmp.lengthSq() < 1e-6) return;
    tmp.normalize().multiplyScalar(mass * k.stumbleLurch);
    point.copy(pos);
    point.y -= k.driveOffset;
    this.body.applyImpulseAtPoint(tmp, point, true);
  }

  render(alpha: number): void {
    this.legs.render(alpha, this.forward);
  }

  position(target = new THREE.Vector3()): THREE.Vector3 {
    const t = this.body.translation();
    return target.set(t.x, t.y, t.z);
  }
}
