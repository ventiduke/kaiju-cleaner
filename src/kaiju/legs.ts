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

/**
 * Procedural legs. The body floats on its hover spring; these feet step to keep up,
 * with a deliberately loose, offbeat rhythm. Each foot carries a kinematic collider,
 * so steps shove props about and break whatever building they land in.
 */
export class Legs {
  readonly feet: Foot[] = [];
  /** Fired when a foot lands. */
  onFootfall: ((side: number, pos: THREE.Vector3, strength: number) => void) | null = null;
  private rng = new Rng(11);
  private shape: InstanceType<Sim['R']['Cuboid']>;
  private wasStanding = true;
  private lastSide = -1;
  private readonly hipHeight: number;
  private readonly boneLength: number;

  constructor(
    private sim: Sim,
    private chunks: ChunkField | null,
    private bodyVisual: THREE.Object3D,
    material: THREE.Material,
    start: LegContext,
  ) {
    const { R, world, tuning } = sim;
    const l = tuning.legs;
    const k = tuning.kaiju;
    this.hipHeight = k.legLength + k.bodyRadius * 0.8;
    this.boneLength = this.hipHeight * 0.58;
    this.shape = new R.Cuboid(l.footWidth / 2, l.footHeight / 2, l.footLength / 2);
    for (const side of [1, -1]) {
      const home = this.home(start, side, new THREE.Vector3());
      const body = world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(home.x, l.footHeight / 2, home.z),
      );
      world.createCollider(
        R.ColliderDesc.cuboid(l.footWidth / 2, l.footHeight / 2, l.footLength / 2)
          .setFriction(0.8)
          .setCollisionGroups(groups(Group.FOOT, Group.CHUNK | Group.PROP | Group.BALL)),
        body,
      );
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.3, 1, 8), material);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 1, 8), material);
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
      }
      for (const m of [thigh, shin, sole, ...foot.children]) (m as THREE.Mesh).castShadow = true;
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
    const w = this.sim.tuning.legs.stanceWidth;
    return target.set(ctx.pos.x + ctx.left.x * side * w, 0, ctx.pos.z + ctx.left.z * side * w);
  }

  update(dt: number, ctx: LegContext): void {
    const l = this.sim.tuning.legs;
    const maxSpeed = this.sim.tuning.kaiju.maxSpeed;
    const speed = Math.hypot(ctx.velocity.x, ctx.velocity.z);

    if (!ctx.standing) {
      // Limp: feet hang off the body, wherever it has ended up.
      for (const f of this.feet) {
        f.prev.copy(f.pos);
        f.prevYaw = f.yaw;
        a.set(f.side * l.stanceWidth * 0.8, -this.hipHeight * 0.9, 0).applyQuaternion(this.bodyVisual.quaternion);
        f.pos.set(ctx.pos.x + a.x, Math.max(0, ctx.pos.y + a.y), ctx.pos.z + a.z);
        f.swinging = false;
        if (this.wasStanding) f.body.setEnabled(false);
      }
      this.wasStanding = false;
      return;
    }
    if (!this.wasStanding) {
      for (const f of this.feet) {
        this.home(ctx, f.side, f.pos);
        f.prev.copy(f.pos);
        f.yaw = f.prevYaw = ctx.yaw;
        f.body.setEnabled(true);
        f.body.setTranslation({ x: f.pos.x, y: l.footHeight / 2, z: f.pos.z }, true);
      }
      this.wasStanding = true;
    }

    // Decide whether a planted foot should step. One foot in the air at a time.
    if (!this.feet.some((f) => f.swinging)) {
      let pick: Foot | null = null;
      let worst = 0;
      for (const f of this.feet) {
        this.home(ctx, f.side, a);
        const err = Math.hypot(f.pos.x - a.x, f.pos.z - a.z) / (l.stepLength * 0.5 * f.slack);
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
        pick.duration = l.stepDuration * (1 + l.offbeat * this.rng.range(-0.4, 0.4));
        pick.slack = 1 + l.offbeat * this.rng.range(-0.5, 0.5);
        this.lastSide = pick.side;
      }
    }

    for (const f of this.feet) {
      f.prev.copy(f.pos);
      f.prevYaw = f.yaw;
      if (f.swinging) {
        f.phase = Math.min(1, f.phase + dt / f.duration);
        // Aim at where the home spot will be on landing, plus a bit: steps reach ahead of the body.
        const lead = l.lookahead + (1 - f.phase) * f.duration;
        this.home(ctx, f.side, a).addScaledVector(ctx.velocity, lead);
        a.y = 0;
        const p = f.phase * f.phase * (3 - 2 * f.phase);
        f.pos.lerpVectors(f.from, a, p);
        f.pos.y = Math.sin(Math.PI * f.phase) * l.stepHeight * (0.45 + 0.55 * Math.min(1, speed / maxSpeed));
        f.yaw = lerpAngle(f.fromYaw, ctx.yaw, p);
        if (f.phase >= 1) {
          f.swinging = false;
          f.pos.y = 0;
          this.onFootfall?.(f.side, f.pos, Math.min(1.2, 0.35 + speed / maxSpeed));
        }
      }
      q.setFromAxisAngle(Y, f.yaw);
      b.set(f.pos.x, f.pos.y + l.footHeight / 2, f.pos.z);
      f.body.setNextKinematicTranslation(b);
      f.body.setNextKinematicRotation(q);
      if (this.chunks && f.swinging) {
        c.subVectors(f.pos, f.prev).divideScalar(dt);
        this.chunks.stomp(this.shape, b, q, c);
      }
    }
  }

  /** Draws the legs: feet interpolated between steps, knees solved to reach from the hips. */
  render(alpha: number, forward: THREE.Vector3): void {
    const l = this.sim.tuning.legs;
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
