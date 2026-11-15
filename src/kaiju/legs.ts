import * as THREE from 'three';
import type { ChunkField } from '../city/destruction';
import { Group, groups, type RigidBody } from '../core/physics';
import { Rng } from '../core/rng';
import type { Sim } from '../sim';

interface Foot {
  /** +1 is the kaiju's left, -1 its right. */
  side: number;
  body: RigidBody;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  yaw: number;
  prevYaw: number;
  from: THREE.Vector3;
  fromYaw: number;
  swinging: boolean;
  phase: number;
  duration: number;
  /** How far the foot may trail its home spot before it steps (randomised: the offbeat). */
  slack: number;
  thigh: THREE.Mesh;
  shin: THREE.Mesh;
  foot: THREE.Group;
}

export interface LegContext {
  /** Body centre. */
  pos: THREE.Vector3;
  /** Horizontal facing and left vectors. */
  forward: THREE.Vector3;
  left: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  /** False while fallen: the legs go limp and the feet stop colliding. */
  standing: boolean;
  /** Stance width and footprint multipliers (tiptoe narrows both). */
  stanceScale: number;
  footScale: number;
  /** 0 standing .. 1 on all fours: the back feet then belong under the hips, well behind the middle. */
  crawl: number;
  /** While not standing (in the air, flat out in a slide): 0 lets the legs hang, 1 draws them up under the body. */
  tuck?: number;
}

const Y = new THREE.Vector3(0, 1, 0);
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const d = new THREE.Vector3();
const q = new THREE.Quaternion();

function lerpAngle(from: number, to: number, t: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

/** Stretches a unit-height mesh between two points. */
function span(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  d.subVectors(to, from);
  const len = d.length();
  mesh.position.copy(from).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(Y, d.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
}

/** The body radius the leg settings were tuned at. */
const REFERENCE_RADIUS = 6.9;
const CLAW = new THREE.MeshLambertMaterial({ color: 0xd9d2bd });

/**
 * Procedural legs. The body floats on its hover spring; these feet step to keep up,
 * with a deliberately loose, offbeat rhythm. Each foot carries a kinematic collider,
 * so steps shove props about and break whatever building they land in.
 */
export class Legs {
  /**
   * The leg settings at this kaiju's size. They are written for the reference giant (a body
   * 6.9 m in radius); a smaller or larger body gets feet, stance and stride in proportion,
   * so that changing the body's size does not leave it on somebody else's legs.
   */
  private dims(): Sim['tuning']['legs'] {
    const l = this.sim.tuning.legs;
    const s = this.sim.tuning.kaiju.bodyRadius / REFERENCE_RADIUS;
    return { ...l, stanceWidth: l.stanceWidth * s, stepLength: l.stepLength * s, stepHeight: l.stepHeight * s, footLength: l.footLength * s, footWidth: l.footWidth * s, footHeight: l.footHeight * s };
  }

  readonly feet: Foot[] = [];
  /** Every mesh the legs draw, for effects that need to touch all of the kaiju. */
  readonly meshes: THREE.Mesh[] = [];
  /** Fired when a foot lands. */
  onFootfall: ((side: number, pos: THREE.Vector3, strength: number) => void) | null = null;
  private rng = new Rng(11);
  private shape: InstanceType<Sim['R']['Cuboid']>;
  private tipShape: InstanceType<Sim['R']['Cuboid']>;
  private readonly shinHeight: number;
  private stanceScale = 1;
  private wasStanding = true;
  /** How far, on average, the planted feet are standing above the ground (on rubble). */
  lift = 0;
  private lastSide = -1;
  private readonly hipHeight: number;
  private readonly boneLength: number;
  /** Farthest a foot can be from under the body, horizontally, with the leg at full stretch. */
  readonly reach: number;
  /** The runner's gait: where its stride has got to (0..1: one foot lands at 0, the other at 0.5)... */
  cycle = 0;
  /** ...the share of a stride each foot spends on the ground (under a half, both are in the air between steps)... */
  duty = 0.62;
  /** ...and whether the stride is turning over, or the feet are just settling where it stands; and how fast (strides a second). */
  striding = false;
  cadence = 0;
  /** How far a foot can be planted ahead of or behind its hip before the leg is at full stretch (m). */
  private readonly stretch: number;

  constructor(
    private sim: Sim,
    private chunks: ChunkField | null,
    private bodyVisual: THREE.Object3D,
    material: THREE.Material,
    start: LegContext,
  ) {
    const { R, world, tuning } = sim;
    const l = this.dims();
    const k = tuning.kaiju;
    const s = k.bodyRadius / REFERENCE_RADIUS;
    this.hipHeight = k.legLength + k.bodyRadius * 0.8;
    this.boneLength = this.hipHeight * 0.58;
    this.reach = Math.sqrt((this.boneLength * 2) ** 2 - this.hipHeight ** 2) + l.stanceWidth;
    // (The hip the legs are drawn from is a little above `hipHeight`; the ankle a little above the ground.)
    const drop = k.legLength + k.bodyRadius + k.bodyHalfHeight * 0.25 - l.footHeight * 0.9;
    this.stretch = Math.sqrt(Math.max(1, (this.boneLength * 2) ** 2 - drop * drop));
    // What a step breaks: the foot and the shin above it, so a leg can't pass through a bridge deck.
    this.shinHeight = k.legLength * 0.7;
    this.shape = new R.Cuboid(l.footWidth / 2, this.shinHeight / 2, l.footLength / 2);
    this.tipShape = new R.Cuboid((l.footWidth / 2) * tuning.modes.tiptoeFoot, this.shinHeight / 2, (l.footLength / 2) * tuning.modes.tiptoeFoot);
    for (const side of [1, -1]) {
      const home = this.home(start, side, new THREE.Vector3());
      const body = world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(home.x, l.footHeight / 2, home.z),
      );
      world.createCollider(
        R.ColliderDesc.cuboid(l.footWidth / 2, l.footHeight / 2, l.footLength / 2)
          .setFriction(0.8)
          // Feet shove props about physically. Building chunks they deal with in code (see
          // `stomp`): an unstoppable kinematic foot squeezing a chunk against the body is
          // how a kaiju gets fired into the sky.
          .setCollisionGroups(groups(Group.FOOT, Group.PROP | Group.BALL)),
        body,
      );
      // Heavy haunches: these carry thirty metres of animal.
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(3.0 * s, 3.3 * s, 1, 10), material);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(2.0 * s, 2.4 * s, 1, 10), material);
      const foot = new THREE.Group();
      const sole = new THREE.Mesh(new THREE.BoxGeometry(l.footWidth, l.footHeight, l.footLength * 0.72), material);
      sole.position.set(0, l.footHeight / 2, -l.footLength * 0.1);
      foot.add(sole);
      for (const tx of [-1, 0, 1]) {
        const toe = new THREE.Mesh(
          new THREE.BoxGeometry(l.footWidth * 0.26, l.footHeight * 0.7, l.footLength * 0.3),
          material,
        );
        toe.position.set(tx * l.footWidth * 0.34, l.footHeight * 0.35, l.footLength * 0.37);
        foot.add(toe);
        // A blunt claw on the end of each toe.
        const claw = new THREE.Mesh(new THREE.ConeGeometry(l.footWidth * 0.11, l.footLength * 0.2, 4), CLAW);
        claw.rotation.x = Math.PI / 2;
        claw.position.set(tx * l.footWidth * 0.34, l.footHeight * 0.3, l.footLength * 0.6);
        foot.add(claw);
      }
      for (const m of [thigh, shin, ...foot.children] as THREE.Mesh[]) {
        m.castShadow = true;
        this.meshes.push(m);
      }
      sim.scene.add(thigh, shin, foot);
      this.feet.push({
        side,
        body,
        pos: home.clone(),
        prev: home.clone(),
        yaw: start.yaw,
        prevYaw: start.yaw,
        from: home.clone(),
        fromYaw: start.yaw,
        swinging: false,
        phase: 0,
        duration: l.stepDuration,
        slack: 1,
        thigh,
        shin,
        foot,
      });
    }
  }

  /** Where a foot would stand if the kaiju were still: under the hip, out to the side. */
  private home(ctx: LegContext, side: number, target: THREE.Vector3): THREE.Vector3 {
    const w = this.dims().stanceWidth * this.stanceScale;
    const back = this.sim.tuning.kaiju.bodyHalfHeight * 0.85 * ctx.crawl;
    return target.set(
      ctx.pos.x + ctx.left.x * side * w - ctx.forward.x * back,
      0,
      ctx.pos.z + ctx.left.z * side * w - ctx.forward.z * back,
    );
  }

  update(dt: number, ctx: LegContext): void {
    const l = this.dims();
    const maxSpeed = this.sim.tuning.kaiju.maxSpeed;
    const speed = Math.hypot(ctx.velocity.x, ctx.velocity.z);
    this.stanceScale += (ctx.stanceScale - this.stanceScale) * Math.min(1, dt * 5);
    const ground = this.sim.ground;

    if (!ctx.standing) {
      // Limp: feet hang off the body, wherever it has ended up.
      for (const f of this.feet) {
        f.prev.copy(f.pos);
        f.prevYaw = f.yaw;
        const tuck = ctx.tuck ?? 0;
        a.set(f.side * l.stanceWidth * 0.8, -this.hipHeight * (0.9 - 0.42 * tuck), this.hipHeight * 0.3 * tuck).applyQuaternion(this.bodyVisual.quaternion);
        f.pos.set(ctx.pos.x + a.x, Math.max(ground(ctx.pos.x + a.x, ctx.pos.z + a.z), ctx.pos.y + a.y), ctx.pos.z + a.z);
        f.swinging = false;
        if (this.wasStanding) f.body.setEnabled(false);
      }
      this.wasStanding = false;
      return;
    }
    if (!this.wasStanding) {
      for (const f of this.feet) {
        this.home(ctx, f.side, f.pos);
        f.pos.y = ground(f.pos.x, f.pos.z);
        f.prev.copy(f.pos);
        f.yaw = f.prevYaw = ctx.yaw;
        f.body.setEnabled(true);
        f.body.setTranslation({ x: f.pos.x, y: f.pos.y + l.footHeight / 2, z: f.pos.z }, true);
      }
      this.wasStanding = true;
    }

    // Decide whether a planted foot should step. One foot in the air at a time.
    if (!this.feet.some((f) => f.swinging)) {
      let pick: Foot | null = null;
      let worst = 0;
      for (const f of this.feet) {
        this.home(ctx, f.side, a);
        const err = Math.hypot(f.pos.x - a.x, f.pos.z - a.z) / (l.stepLength * f.slack);
        const twist = Math.abs(lerpAngle(f.yaw, ctx.yaw, 1) - f.yaw) / 0.7;
        // Prefer alternating feet when both are about as far out.
        const score = Math.max(err, twist) * (f.side === this.lastSide ? 0.85 : 1);
        if (score > 1 && score > worst) {
          worst = score;
          pick = f;
        }
      }
      if (pick) {
        pick.swinging = true;
        pick.phase = 0;
        pick.from.copy(pick.pos);
        pick.fromYaw = pick.yaw;
        // Quicker steps at speed, or the feet can never keep up.
        pick.duration = Math.max(0.16, (l.stepDuration / (1 + speed / 12)) * (1 + l.offbeat * this.rng.range(-0.4, 0.4)));
        pick.slack = 1 + l.offbeat * this.rng.range(-0.5, 0.5);
        this.lastSide = pick.side;
      }
    }

    // Standing on rubble lifts the whole kaiju a little.
    let raised = 0;
    for (const f of this.feet) if (!f.swinging) raised += Math.max(0, f.pos.y - ground(f.pos.x, f.pos.z));
    this.lift = raised / this.feet.length;
    let landed: Foot | null = null;
    for (const f of this.feet) {
      f.prev.copy(f.pos);
      f.prevYaw = f.yaw;
      if (f.swinging) {
        f.phase = Math.min(1, f.phase + dt / f.duration);
        // Aim at where the home spot will be on landing, plus a bit: steps reach ahead of the body.
        // The reach is capped so a sprinting kaiju doesn't plant feet it couldn't stretch to.
        const lead = l.lookahead + (1 - f.phase) * f.duration;
        d.copy(ctx.velocity).multiplyScalar(lead).clampLength(0, l.stepLength * 0.95);
        this.home(ctx, f.side, a).add(d);
        a.y = 0;
        const p = f.phase * f.phase * (3 - 2 * f.phase);
        const fromY = f.from.y;
        f.pos.lerpVectors(f.from, a, p);
        // Rise from where it stood to where it will land (the river bed is lower than the street).
        const floor = fromY + (ground(a.x, a.z) - fromY) * p;
        f.pos.y = floor + Math.sin(Math.PI * f.phase) * l.stepHeight * (0.45 + 0.55 * Math.min(1, speed / maxSpeed));
        f.yaw = lerpAngle(f.fromYaw, ctx.yaw, p);
        if (f.phase >= 1) {
          f.swinging = false;
          f.pos.y = ground(f.pos.x, f.pos.z);
          this.onFootfall?.(f.side, f.pos, Math.min(1.2, 0.35 + speed / maxSpeed));
          landed = f;
        }
      }
      q.setFromAxisAngle(Y, f.yaw);
      b.set(f.pos.x, f.pos.y + l.footHeight / 2, f.pos.z);
      f.body.setNextKinematicTranslation(b);
      f.body.setNextKinematicRotation(q);
      if (this.chunks && (f.swinging || landed === f)) {
        c.subVectors(f.pos, f.prev).divideScalar(dt);
        b.y = f.pos.y + this.shinHeight / 2;
        const shape = ctx.footScale < 0.99 ? this.tipShape : this.shape;
        this.chunks.stomp(shape, b, q, c, landed === f);
        if (landed === f) {
          // Whatever sturdy rubble survived that is what the foot is standing on now.
          const top = this.chunks.footing(shape, b, q);
          if (top > f.pos.y + 0.5) f.pos.y = Math.min(top, f.pos.y + 9);
        }
      }
    }
  }

  /**
   * The runner's gait. `update` lets each foot step when it has been left behind, one at a
   * time: a shuffle, which is right for a kaiju finding its balance and cannot keep up with a
   * sprint. This runs a stride instead: the feet take turns, half a cycle apart, each planted
   * for a share of the cycle and in the air for the rest. The faster it goes, the shorter the
   * planted share (a leg can only reach so far), until both feet are off the ground between
   * steps, which is what running is. Standing still, the stride stops and the feet settle
   * under the hips.
   *
   * @param cadence strides a second right now; 0 when it is not going anywhere
   * @param skid 0..1: how far the planted feet are skating rather than holding
   * @param creep true to keep a foot on the ground at all times (it takes quicker steps instead of longer ones)
   */
  stride(dt: number, ctx: LegContext, cadence: number, skid: number, creep = false): void {
    const l = this.dims();
    const ground = this.sim.ground;
    const speed = Math.hypot(ctx.velocity.x, ctx.velocity.z);
    if (creep && cadence > 0) cadence = Math.max(cadence, (speed * 0.56) / (this.stretch * 1.9));
    this.cadence = cadence;
    const pace = Math.min(1.2, speed / this.sim.tuning.runner.speed);
    this.stanceScale += (ctx.stanceScale - this.stanceScale) * Math.min(1, dt * 5);

    if (!ctx.standing) {
      for (const f of this.feet) {
        f.prev.copy(f.pos);
        f.prevYaw = f.yaw;
        const tuck = ctx.tuck ?? 0;
        a.set(f.side * l.stanceWidth * 0.8, -this.hipHeight * (0.9 - 0.42 * tuck), this.hipHeight * 0.3 * tuck).applyQuaternion(this.bodyVisual.quaternion);
        f.pos.set(ctx.pos.x + a.x, Math.max(ground(ctx.pos.x + a.x, ctx.pos.z + a.z), ctx.pos.y + a.y), ctx.pos.z + a.z);
        f.yaw = ctx.yaw;
        f.swinging = false;
        if (this.wasStanding) f.body.setEnabled(false);
      }
      this.wasStanding = false;
      this.striding = false;
      return;
    }
    if (!this.wasStanding) {
      // Coming back to its feet (landing, or getting up out of a slide): they are put down where
      // they are, under it, rather than stepping there from wherever the last stride left them.
      for (const f of this.feet) {
        this.home(ctx, f.side, f.pos);
        f.pos.y = ground(f.pos.x, f.pos.z);
        f.prev.copy(f.pos);
        f.yaw = f.prevYaw = ctx.yaw;
        f.swinging = false;
        f.body.setEnabled(true);
        f.body.setTranslation({ x: f.pos.x, y: f.pos.y + l.footHeight / 2, z: f.pos.z }, true);
      }
      this.wasStanding = true;
      this.striding = false;
    }

    const period = cadence > 0 ? 1 / cadence : 0;
    if (cadence > 0) {
      // The planted share: as long as the leg can cover the ground going by, and no longer.
      const duty = THREE.MathUtils.clamp((this.stretch * 1.9) / Math.max(1e-3, speed * period), 0.2, 0.62);
      this.duty += (duty - this.duty) * Math.min(1, dt * 8);
      if (!this.striding) {
        // Setting off: the foot farthest behind goes first.
        let first = this.feet[0];
        let behind = Infinity;
        for (const f of this.feet) {
          this.home(ctx, f.side, a);
          const along = (f.pos.x - a.x) * ctx.velocity.x + (f.pos.z - a.z) * ctx.velocity.z + (f.swinging ? -1e6 : 0);
          if (along < behind) {
            behind = along;
            first = f;
          }
        }
        this.cycle = (this.duty - (first.side > 0 ? 0 : 0.5) + 1) % 1;
        this.striding = true;
      }
      this.cycle = (this.cycle + cadence * dt) % 1;
    } else this.striding = false;

    // Standing on rubble lifts the whole kaiju a little.
    let raised = 0;
    for (const f of this.feet) if (!f.swinging) raised += Math.max(0, f.pos.y - ground(f.pos.x, f.pos.z));
    this.lift = raised / this.feet.length;

    const stanceTime = this.duty * period;
    let landed: Foot | null = null;
    for (const f of this.feet) {
      f.prev.copy(f.pos);
      f.prevYaw = f.yaw;
      this.home(ctx, f.side, a);
      // Where this foot is in its own stride: planted until `duty`, then in the air.
      const local = (this.cycle + (f.side > 0 ? 0 : 0.5)) % 1;
      let left: number;
      if (cadence > 0) {
        left = local >= this.duty ? (1 - local) * period : 0;
        if (!f.swinging && local >= this.duty && local < 0.97) this.liftOff(f, ctx);
      } else {
        // Not going anywhere: finish any step in a hurry, and shuffle a foot home if it was left out of place.
        left = f.swinging ? (1 - f.phase) * 0.22 : 0;
        const out = Math.hypot(f.pos.x - a.x, f.pos.z - a.z) / (l.stepLength * 0.5);
        const twist = Math.abs(lerpAngle(f.yaw, ctx.yaw, 1) - f.yaw) / 0.5;
        if (!f.swinging && Math.max(out, twist) > 1 && !this.feet.some((o) => o.swinging)) {
          this.liftOff(f, ctx);
          left = 0.22;
        }
      }

      if (f.swinging) {
        // Carried along with the body, from where it left the ground (trailing) to where it will land (reaching).
        f.phase = left <= dt ? 1 : Math.min(1, f.phase + (dt * (1 - f.phase)) / left);
        d.copy(ctx.velocity).multiplyScalar(stanceTime * 0.5).clampLength(0, this.stretch);
        // (`a` is the foot's home now; `from` holds where it was, measured from the home it left.)
        const p = f.phase * f.phase * (3 - 2 * f.phase);
        const tx = a.x + d.x;
        const tz = a.z + d.z;
        f.pos.x = a.x + f.from.x + (tx - a.x - f.from.x) * p;
        f.pos.z = a.z + f.from.z + (tz - a.z - f.from.z) * p;
        const floor = f.from.y + (ground(tx, tz) - f.from.y) * p;
        f.pos.y = floor + Math.sin(Math.PI * f.phase) * l.stepHeight * (0.45 + 0.75 * pace);
        f.yaw = lerpAngle(f.fromYaw, ctx.yaw, p);
        if (f.phase >= 1) {
          f.swinging = false;
          f.pos.y = ground(f.pos.x, f.pos.z);
          this.onFootfall?.(f.side, f.pos, Math.min(1.25, 0.35 + 0.6 * pace));
          this.lastSide = f.side;
          landed = f;
        }
      } else {
        // Planted. A skating foot is dragged along; and no foot is ever left so far behind that the leg lets go of it.
        const drag = skid * 0.85;
        if (drag > 0) {
          f.pos.x += ctx.velocity.x * dt * drag;
          f.pos.z += ctx.velocity.z * dt * drag;
        }
        const far = Math.hypot(f.pos.x - a.x, f.pos.z - a.z);
        const limit = this.stretch * 1.35;
        if (far > limit) {
          f.pos.x = a.x + ((f.pos.x - a.x) * limit) / far;
          f.pos.z = a.z + ((f.pos.z - a.z) * limit) / far;
        }
        f.pos.y = Math.max(f.pos.y, ground(f.pos.x, f.pos.z));
        if (skid > 0.3) f.yaw = lerpAngle(f.yaw, ctx.yaw, Math.min(1, dt * 10));
      }

      q.setFromAxisAngle(Y, f.yaw);
      b.set(f.pos.x, f.pos.y + l.footHeight / 2, f.pos.z);
      f.body.setNextKinematicTranslation(b);
      f.body.setNextKinematicRotation(q);
      if (this.chunks && (f.swinging || landed === f)) {
        c.subVectors(f.pos, f.prev).divideScalar(dt);
        b.y = f.pos.y + this.shinHeight / 2;
        const shape = ctx.footScale < 0.99 ? this.tipShape : this.shape;
        this.chunks.stomp(shape, b, q, c, landed === f);
        if (landed === f) {
          const top = this.chunks.footing(shape, b, q);
          if (top > f.pos.y + 0.5) f.pos.y = Math.min(top, f.pos.y + 9);
        }
      }
    }
  }

  /** Puts any foot that is in the air down where it is (for when the kaiju changes how it moves mid-step). */
  settle(): void {
    for (const f of this.feet) {
      if (f.swinging) f.pos.y = this.sim.ground(f.pos.x, f.pos.z);
      f.swinging = false;
      f.prev.copy(f.pos);
    }
    this.striding = false;
  }

  /** A foot leaves the ground: remember where, measured from the spot under its hip. */
  private liftOff(f: Foot, ctx: LegContext): void {
    this.home(ctx, f.side, c);
    f.swinging = true;
    f.phase = 0;
    f.from.set(f.pos.x - c.x, f.pos.y, f.pos.z - c.z);
    f.fromYaw = f.yaw;
  }

  /** Draws the legs: feet interpolated between steps, knees solved to reach from the hips. */
  render(alpha: number, forward: THREE.Vector3): void {
    const l = this.dims();
    for (const f of this.feet) {
      const fp = f.foot.position.lerpVectors(f.prev, f.pos, alpha);
      f.foot.quaternion.setFromAxisAngle(Y, lerpAngle(f.prevYaw, f.yaw, alpha));
      const hip = a
        .set(f.side * l.stanceWidth * 0.8, -this.sim.tuning.kaiju.bodyHalfHeight * 0.75, 0)
        .applyQuaternion(this.bodyVisual.quaternion)
        .add(this.bodyVisual.position);
      const ankle = b.set(fp.x, fp.y + l.footHeight * 0.9, fp.z);
      // Two-bone IK with the knee pushed forwards.
      d.subVectors(ankle, hip);
      const reach = Math.min(d.length(), this.boneLength * 2 - 0.05);
      const dir = d.normalize();
      const along = reach / 2;
      const out = Math.sqrt(Math.max(0, this.boneLength * this.boneLength - along * along));
      const bend = c.copy(forward).addScaledVector(dir, -forward.dot(dir));
      if (bend.lengthSq() < 1e-4) bend.set(0, 0, 1);
      bend.normalize();
      const knee = new THREE.Vector3().copy(hip).addScaledVector(dir, along).addScaledVector(bend, out);
      const hipCopy = hip.clone();
      const ankleCopy = ankle.clone();
      span(f.thigh, hipCopy, knee);
      span(f.shin, knee, ankleCopy);
    }
  }
}
