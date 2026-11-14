import * as THREE from 'three';
import type { ChunkField } from '../city/destruction';
import { ALL_GROUPS, Group, groups, type RigidBody } from '../core/physics';
import type { PlayerInput, Sim, System } from '../sim';
import { Legs, type LegContext } from './legs';
import { Tail } from './tail';

export type KaijuState = 'walk' | 'stumble' | 'falling' | 'fallen' | 'getup';
export type KaijuMode = 'normal' | 'tiptoe' | 'crouch';

const UP = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const vel = new THREE.Vector3();
const quat = new THREE.Quaternion();
const up = new THREE.Vector3();
const fwd = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

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
  /** Falls caught before they landed. */
  saves = 0;
  mode: KaijuMode = 'normal';
  /** How long it can stay on tiptoe: 1 fresh, 0 spent. */
  toeMeter = 1;
  /** How deep it is wading, 0 on dry land to 1 at leg depth. */
  wading = 0;
  /** Traction under it right now: 1 normal, near 0 on oil. */
  traction = 1;
  private toeLock = false;
  private stanceOffset = 0;
  /** Seconds spent pushing without getting anywhere. */
  stall = 0;
  /** Horizontal acceleration the feet are applying right now (m/s^2): what is tipping it. */
  load = 0;
  private lastForwardSpeed = 0;

  /** Horizontal facing and left vectors, refreshed every step. */
  readonly forward = new THREE.Vector3(0, 0, 1);
  readonly left = new THREE.Vector3(1, 0, 0);
  private readonly ray;
  private ghost: THREE.MeshBasicMaterial | null = null;
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
      stanceScale: 1,
      footScale: 1,
    };
    this.legs = new Legs(sim, chunks, this.visual, dark, this.legContext);
    this.legs.onFootfall = (side, p, strength) => this.footfall(side, p, strength);
    this.addSilhouette([...this.tail.meshes, ...this.legs.meshes]);
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

  /**
   * Lets the kaiju show through whatever hides it, as a flat tinted shape.
   * Every kaiju mesh marks the stencil where it is actually visible; a ghost copy of each
   * mesh then draws only where it is behind something and no kaiju pixel was drawn.
   */
  private addSilhouette(extra: THREE.Mesh[]): void {
    this.ghost = new THREE.MeshBasicMaterial({
      color: 0x8dffd0,
      transparent: true,
      opacity: 0.4,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
      // Mark what the ghost draws too, so overlapping parts don't stack up darker.
      stencilZPass: THREE.ReplaceStencilOp,
    });
    const meshes: THREE.Mesh[] = [...extra];
    this.visual.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const seen = new Set<THREE.Material>();
    for (const mesh of meshes) {
      const material = mesh.material as THREE.Material;
      if (!seen.has(material)) {
        seen.add(material);
        material.stencilWrite = true;
        material.stencilRef = 1;
        material.stencilFunc = THREE.AlwaysStencilFunc;
        material.stencilZPass = THREE.ReplaceStencilOp;
      }
      const ghost = new THREE.Mesh(mesh.geometry, this.ghost);
      ghost.renderOrder = 20;
      mesh.add(ghost);
    }
  }

  private footfall(side: number, p: THREE.Vector3, strength: number): void {
    const k = this.sim.tuning.kaiju;
    const quiet = this.mode === 'tiptoe';
    if ((this.state === 'walk' || this.state === 'stumble') && !quiet) {
      // Each step rocks the body toward the foot that just landed.
      const w = this.body.angvel();
      const kick = k.footfallKick * strength * side;
      this.body.setAngvel(
        { x: w.x - this.forward.x * kick, y: w.y, z: w.z - this.forward.z * kick },
        true,
      );
    }
    this.sim.emit('footfall', { x: p.x, y: p.y, z: p.z, side, strength: quiet ? strength * 0.25 : strength, wet: this.wading > 0.05 });
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

    // --- Movement mode: tiptoe and crouch trade speed for control ---
    const input = this.input;
    const m = this.sim.tuning.modes;
    const upright = this.state === 'walk' || this.state === 'stumble' || this.state === 'falling';
    if (this.toeLock && this.toeMeter > 0.5) this.toeLock = false;
    this.mode = !upright ? 'normal' : input.crouch ? 'crouch' : input.tiptoe && !this.toeLock ? 'tiptoe' : 'normal';
    const tiptoe = this.mode === 'tiptoe';
    const crouch = this.mode === 'crouch';
    this.toeMeter = THREE.MathUtils.clamp(
      this.toeMeter + (tiptoe ? -dt / m.tiptoeSeconds : dt / m.tiptoeRecover),
      0,
      1,
    );
    const speedShare = (tiptoe ? m.tiptoeSpeed : crouch ? m.crouchSpeed : 1) * (1 - 0.45 * this.wading);
    const leanScale = tiptoe ? m.tiptoeLean : crouch ? m.crouchLean : 1;
    const stumbleAngle = k.stumbleAngle * (crouch ? m.crouchBalance : 1);
    const fallAngle = Math.max(k.fallAngle, stumbleAngle * 1.6);
    // How far each mode shifts the body: up on its toes, or down in a squat.
    const stance = tiptoe ? m.tiptoeRise : crouch ? -m.crouchDrop * k.legLength : 0;
    this.stanceOffset += (stance - this.stanceOffset) * Math.min(1, dt * 6);

    // --- State machine ---
    this.stateTime += dt;
    // Which way it is toppling, and how well the player is steering into it:
    // turning toward the side it leans to, or running the way it pitches.
    tmp.set(up.x, 0, up.z);
    const leaning = tmp.lengthSq() > 1e-6;
    if (leaning) tmp.normalize();
    const counter = leaning
      ? THREE.MathUtils.clamp(input.turn * tmp.dot(this.left) + input.thrust * tmp.dot(this.forward), 0, 1)
      : 0;
    if ((this.state === 'walk' || this.state === 'stumble') && this.tilt > fallAngle) {
      this.setState('falling');
    } else if (this.state === 'walk' && tiptoe && this.toeMeter <= 0) {
      // Calves give out: off the toes with a stagger.
      this.toeLock = true;
      this.setState('stumble');
      this.stumbles++;
      this.body.applyImpulse({ x: this.left.x * mass * k.stumbleLurch, y: 0, z: this.left.z * mass * k.stumbleLurch }, true);
    } else if (this.state === 'walk' && this.tilt > stumbleAngle) {
      this.setState('stumble');
      this.stumbles++;
      this.lurch(mass);
    } else if (this.state === 'stumble' && this.stateTime > k.stumbleDuration) {
      if (this.tilt < stumbleAngle * 0.75) this.setState('walk');
      else {
        // Still going over: stagger again.
        this.stateTime = 0;
        this.lurch(mass);
      }
    } else if (this.state === 'falling') {
      // Past the point of no return, unless the player catches it in time.
      if (this.tilt < stumbleAngle * 1.15) {
        this.setState('stumble');
        this.saves++;
        this.sim.emit('kaijuSave', { x: pos.x, y: pos.y, z: pos.z });
      } else if (this.stateTime > k.saveWindow || this.tilt > 1.45) {
        this.setState('fallen');
        this.falls++;
        body.setLinearDamping(1.1);
        this.sim.emit('kaijuFall', { x: pos.x, y: pos.y, z: pos.z });
      }
    } else if (this.state === 'fallen') {
      // Up again once it has stopped sliding, sooner if the player is mashing to get up.
      // Mashing can even catch it before it has finished going down: a scramble, not a get-up.
      const eager = Math.abs(input.thrust) > 0.3 || Math.abs(input.turn) > 0.3;
      const ready = eager ? this.speed < 14 : this.speed < 4 && Math.abs(vel.y) < 2.5;
      if ((this.stateTime > (eager ? 0.5 : k.fallDuration) && ready) || this.stateTime > k.fallDuration * 2) {
        body.setLinearDamping(0);
        this.setState('getup');
      }
    } else if (this.state === 'getup') {
      if ((this.stateTime > k.getUpDuration && this.tilt < stumbleAngle * 0.75) || this.stateTime > k.getUpDuration * 2.5) {
        this.setState('walk');
      }
    }

    const standing = this.state === 'walk' || this.state === 'stumble' || this.state === 'falling';
    /** How much the hover and balance controllers are engaged (0 fallen .. 1 standing). */
    const engaged = standing ? 1 : this.state === 'getup' ? smooth(this.stateTime / k.getUpDuration) : 0;
    const control = this.state === 'walk' ? 1 : this.state === 'stumble' || this.state === 'falling' ? k.stumbleControl : 0;

    // --- Hover spring: holds the body at ride height above the ground ---
    this.wading = 0;
    if (engaged > 0) {
      this.ray.origin = pos;
      const hit = this.sim.world.castRay(
        this.ray,
        this.rideHeight * 2,
        true,
        undefined,
        groups(ALL_GROUPS, Group.GROUND),
      );
      if (hit) {
        // Below street level means standing in the river.
        const groundY = pos.y - hit.timeOfImpact;
        this.wading = THREE.MathUtils.clamp(-groundY / (k.legLength * 0.8), 0, 1);
        const w = Math.PI * 2 * k.hoverFrequency;
        const zeta = this.state === 'getup' ? Math.max(k.hoverDamping, 1) : k.hoverDamping;
        // The more it tips, the lower it sinks: a toppling kaiju goes down, not just over.
        const dip = (1 - Math.cos(Math.min(this.tilt, 1.4))) * k.legLength * 0.9;
        const error = this.rideHeight + this.stanceOffset - dip - hit.timeOfImpact;
        // A spring-damper near ride height. Far from it, approach no faster than the legs
        // (pushing up) or gravity (coming down) can stop it, so it arrives without bouncing.
        const brake = 1.6 * g * (error > 0 ? 0.6 : 1);
        const approach = Math.min((Math.abs(error) * w) / (2 * zeta), Math.sqrt(brake * Math.abs(error)));
        let lift = g + 2 * zeta * w * (Math.sign(error) * approach - vel.y);
        lift = THREE.MathUtils.clamp(lift, 0, g * 2.6) * engaged;
        body.applyImpulse({ x: 0, y: mass * lift * dt, z: 0 }, true);
      }
      // Nothing a standing kaiju does throws it skyward. If something does (a chunk pinched
      // against it, say), take the launch back out.
      if (standing && vel.y > 9) body.setLinvel({ x: vel.x, y: 9, z: vel.z }, true);
    }

    // --- Locomotion ---
    // Everything the feet do is a horizontal acceleration, and every horizontal
    // acceleration tips the body the other way (`lean`). That one coupling is where
    // the lean into starts and stops, the roll out of corners, and the falls come from.
    tmp.set(0, 0, 0);
    if (standing) {
      const target = (input.thrust >= 0 ? input.thrust * k.maxSpeed : input.thrust * k.reverseSpeed) * speedShare;
      const diff = target * control - this.forwardSpeed;
      // Oil and the like: the feet can neither push nor hold.
      const traction = this.sim.traction(pos.x, pos.z);
      this.traction = traction;
      const speedingUp = Math.sign(diff) === Math.sign(target) && target !== 0;
      // Stalled against something? Lean into it: the push builds until the obstacle gives.
      const gained = (this.forwardSpeed - this.lastForwardSpeed) / dt;
      this.lastForwardSpeed = this.forwardSpeed;
      const wanted = Math.abs(diff) > 1 && speedingUp;
      this.stall = wanted && Math.abs(gained) < k.acceleration * 0.3 ? this.stall + dt : Math.max(0, this.stall - dt * 3);
      const boost = 1 + (k.pushBoost - 1) * smooth((this.stall - 0.3) / 0.8);
      const rate = (speedingUp ? k.acceleration * boost : k.braking) * (speedingUp ? control : 1);
      const along = THREE.MathUtils.clamp(diff / dt, -rate * traction, rate * traction);
      const across = THREE.MathUtils.clamp(-sideSpeed / dt, -k.grip * traction, k.grip * traction);
      tmp.copy(this.forward).multiplyScalar(along).addScaledVector(this.left, across);
      // A leaning kaiju staggers the way it leans, which is also what catches it.
      tmp.x += up.x * k.stagger;
      tmp.z += up.z * k.stagger;
      body.applyImpulse({ x: tmp.x * mass * dt, y: 0, z: tmp.z * mass * dt }, true);
      this.load = Math.hypot(tmp.x, tmp.z);
    } else this.load = 0;

    // --- Balance and turning: angular accelerations, independent of mass ---
    const av = body.angvel();
    tmp2.crossVectors(tmp, UP).multiplyScalar(k.lean * leanScale * dt);
    tmp.set(av.x + tmp2.x, av.y, av.z + tmp2.z);
    if (engaged > 0) {
      // Getting up uses a firmer, well-damped pull than everyday balance does.
      const rising = this.state === 'getup';
      const w = Math.PI * 2 * (rising ? Math.max(k.uprightFrequency, 0.85) : k.uprightFrequency);
      const zeta = rising ? Math.max(k.uprightDamping, 0.9) : k.uprightDamping;
      // The righting pull grows with tilt up to the stumble angle, then gives way: by the
      // fall angle there is nothing left. Push it past the peak and it is going over.
      let pull = this.tilt;
      if (standing && this.tilt > stumbleAngle) {
        const span = Math.max(0.01, fallAngle - stumbleAngle);
        pull = stumbleAngle * Math.max(0, 1 - (this.tilt - stumbleAngle) / span);
      }
      // The save: while it is going over, steering into the fall hauls it back.
      if (this.state === 'falling' || this.state === 'stumble') pull += counter * k.saveStrength * Math.min(this.tilt, 1);
      // Axis that rotates the body's up back onto world up; its length is sin(tilt).
      tmp2.crossVectors(up, UP);
      const s = tmp2.length();
      if (s > 1e-5) tmp2.multiplyScalar((w * w * pull) / s);
      tmp2.x -= 2 * zeta * w * av.x;
      tmp2.z -= 2 * zeta * w * av.z;
      tmp2.y = 0;
      tmp.addScaledVector(tmp2, engaged * dt);
    }
    if (standing) {
      const authority = 1 - k.turnSpeedPenalty * Math.min(1, Math.abs(this.forwardSpeed) / k.maxSpeed);
      const targetRate = input.turn * k.maxTurnRate * authority * control * (tiptoe ? m.tiptoeTurn : 1);
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
    ctx.stanceScale = tiptoe ? m.tiptoeStance : 1;
    ctx.footScale = tiptoe ? m.tiptoeFoot : 1;
    this.legs.update(dt, ctx);
    this.tail.setTuck(crouch ? 1 : 0);
    if (this.sim.tick % 30 === 0) this.tail.syncMotors();
  }

  /** The catch-step of a stumble: a stagger toward the side it is toppling to, which rights it a little. */
  private lurch(mass: number): void {
    const k = this.sim.tuning.kaiju;
    tmp.set(up.x, 0, up.z);
    if (tmp.lengthSq() < 1e-6) return;
    tmp.normalize().multiplyScalar(k.stumbleLurch);
    this.body.applyImpulse({ x: tmp.x * mass, y: 0, z: tmp.z * mass }, true);
    const av = this.body.angvel();
    tmp2.crossVectors(tmp, UP).multiplyScalar(k.lean);
    this.body.setAngvel({ x: av.x + tmp2.x, y: av.y, z: av.z + tmp2.z }, true);
  }

  /** Knocks the kaiju flat, toppling toward `direction` (defaults to its left). For hazards and tests. */
  knockDown(direction: THREE.Vector3 = this.left): void {
    if (this.state === 'fallen') return;
    this.setState('fallen');
    this.falls++;
    this.body.setLinearDamping(1.1);
    const av = this.body.angvel();
    tmp.crossVectors(UP, direction).normalize().multiplyScalar(1.6);
    this.body.setAngvel({ x: av.x + tmp.x, y: av.y, z: av.z + tmp.z }, true);
    const t = this.body.translation();
    this.sim.emit('kaijuFall', { x: t.x, y: t.y, z: t.z });
  }

  render(alpha: number): void {
    this.legs.render(alpha, this.forward);
    if (this.ghost) this.ghost.visible = this.sim.tuning.camera.silhouette;
  }

  position(target = new THREE.Vector3()): THREE.Vector3 {
    const t = this.body.translation();
    return target.set(t.x, t.y, t.z);
  }
}
