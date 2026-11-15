import * as THREE from 'three';
import type { ChunkField } from '../city/destruction';
import { Group, groups, type RigidBody } from '../core/physics';
import type { Sim } from '../sim';

type Joint = InstanceType<Sim['R']['ImpulseJoint']>;

/** Which way a positive root-joint angle folds the tail relative to the body's pitch. */
const BEND_SIGN = -1;

/** The engine's low-level joint set, which exposes per-axis motors for any joint type. */
interface RawJointSet {
  jointConfigureMotorModel(handle: number, axis: number, model: number): void;
  jointConfigureMotorPosition(handle: number, axis: number, target: number, stiffness: number, damping: number): void;
}

const PASSING = groups(Group.TAIL, Group.GROUND | Group.PROP | Group.BALL | Group.PIECE);
const SMASHING = groups(Group.TAIL, Group.GROUND | Group.CHUNK | Group.PROP | Group.BALL | Group.PIECE);

/**
 * The tail: a chain of heavy capsules on motorised ball joints.
 * It is fully physical, so a fast turn whips it round into whatever is behind you.
 */
export class Tail {
  readonly segments: RigidBody[] = [];
  /** For each segment: how far it reaches from its centre, and whether it is smashing things right now. */
  private reach: number[] = [];
  private armed: boolean[] = [];
  /** How many chunks each part has broken this swing, and whether it has had its fill. */
  private bites: number[] = [];
  private spent: boolean[] = [];
  readonly meshes: THREE.Mesh[] = [];
  private joints: Joint[] = [];
  private applied = NaN;
  private tuck = 0;
  private bend = 0;

  /**
   * @param anchor where the tail joins the body, in the body's local frame
   */
  constructor(
    private sim: Sim,
    parent: RigidBody,
    anchor: THREE.Vector3,
    material: THREE.Material,
    private chunks: ChunkField | null,
  ) {
    const { R, world, tuning } = sim;
    const t = tuning.tail;
    const n = Math.max(2, Math.round(t.segments));
    const len = t.length / n;
    const pp = parent.translation();
    const pr = parent.rotation();
    const parentQuat = new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w);
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(parentQuat);
    const cursor = anchor.clone().applyQuaternion(parentQuat).add(new THREE.Vector3(pp.x, pp.y, pp.z));
    // Capsules are Y-aligned in Rapier; lay them along the segment's local Z.
    const lay = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

    let prev = parent;
    let prevAnchor = { x: anchor.x, y: anchor.y, z: anchor.z };
    for (let i = 0; i < n; i++) {
      const radius = THREE.MathUtils.lerp(t.baseRadius, t.tipRadius, i / (n - 1));
      const centre = cursor.clone().addScaledVector(back, len / 2);
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(centre.x, centre.y, centre.z)
          .setRotation(pr)
          .setLinearDamping(0.1)
          .setAngularDamping(0.3)
          .setCanSleep(false),
      );
      world.createCollider(
        R.ColliderDesc.capsule(Math.max(0.05, len / 2 - radius * 0.5), radius)
          .setRotation({ x: lay.x, y: lay.y, z: lay.z, w: lay.w })
          .setDensity(t.density)
          .setFriction(0.4)
          // (Unarmed, it passes through buildings: a tail that merely bumped them would snag on
          // every corner and pull the kaiju off its feet.)
          .setCollisionGroups(PASSING),
        body,
      );
      const joint = world.createImpulseJoint(
        R.JointData.spherical(prevAnchor, { x: 0, y: 0, z: len / 2 }),
        prev,
        body,
        true,
      );
      joint.setContactsEnabled(false);
      this.joints.push(joint);
      this.segments.push(body);
      // Whether it smashes buildings is decided moment to moment, by how fast it is swinging (see `arm`).
      this.reach.push(len / 2 + radius);
      this.armed.push(false);
      this.bites.push(0);
      this.spent.push(false);

      const next = THREE.MathUtils.lerp(t.baseRadius, t.tipRadius, Math.min(1, (i + 1) / (n - 1)));
      const geometry = new THREE.CylinderGeometry(next * 0.95, radius, len * 1.08, 10);
      geometry.rotateX(-Math.PI / 2); // cylinder +Y -> -Z, so the wide end faces the body
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      sim.track(body, mesh);
      this.meshes.push(mesh);

      prev = body;
      prevAnchor = { x: 0, y: 0, z: -len / 2 };
      cursor.addScaledVector(back, len);
    }
    // Count what each swinging part breaks, so that a swing can run out (see `arm`).
    sim.on('chunkBreak', (e) => {
      for (let i = 0; i < this.segments.length; i++) {
        if (!this.armed[i]) continue;
        const p = this.segments[i].translation();
        const near = this.reach[i] + 3;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 + (e.z - p.z) ** 2 < near * near) this.bites[i]++;
      }
    });
    this.syncMotors();
  }

  /**
   * Stiffens the tail (0 free .. 1 rigid) and bends it at the root. Crawling pitches the
   * body forward, which would stand the tail straight up in the air; `bend` (rad) folds it
   * back down so it trails behind instead.
   */
  setPose(stiff: number, bend: number): void {
    if (Math.abs(stiff - this.tuck) < 0.01 && Math.abs(bend - this.bend) < 0.01) return;
    this.tuck = stiff;
    this.bend = bend;
    this.syncMotors();
  }

  /** Re-applies joint motor settings when the tuning or the pose changes. */
  syncMotors(): void {
    const t = this.sim.tuning.tail;
    const stiffness = t.stiffness * (1 + 9 * this.tuck);
    const damping = t.damping * (1 + 3 * this.tuck);
    const key = stiffness * 1000 + damping + this.bend * 7919;
    if (key === this.applied) return;
    this.applied = key;
    const { JointAxis, MotorModel } = this.sim.R;
    this.joints.forEach((j, index) => {
      // Rapier 0.21 hands a spherical joint back typed as "generic", which lacks the motor
      // methods, so go through the raw joint set. The motors themselves work fine.
      const raw = (j as unknown as { rawSet: RawJointSet }).rawSet;
      for (const axis of [JointAxis.AngX, JointAxis.AngY, JointAxis.AngZ]) {
        const target = axis === JointAxis.AngX && index === 0 ? this.bend * BEND_SIGN : 0;
        raw.jointConfigureMotorModel(j.handle, axis, MotorModel.AccelerationBased);
        raw.jointConfigureMotorPosition(j.handle, axis, target, stiffness, damping);
      }
    });
  }

  /**
   * Arms or disarms each part of the tail by how fast it is moving relative to the kaiju.
   * Trailing behind, or brushing a wall on a gentle turn, it passes buildings by. Whipped
   * round, the parts going faster than `wreckSpeed` smash what they hit, like the body does.
   * (They let go a little below the speed they caught at, so a part does not flicker.)
   */
  arm(bodyVel: { x: number; y: number; z: number }): void {
    const t = this.sim.tuning.tail;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const v = seg.linvel();
      const speed = Math.hypot(v.x - bodyVel.x, v.z - bodyVel.z);
      // A swing is spent once it has taken its few bites out of the street: after that the part
      // passes through until it has slowed right down, ready for the next swing.
      if (speed < t.wreckSpeed * 0.5) {
        this.spent[i] = false;
        this.bites[i] = 0;
      } else if (t.bite > 0 && this.bites[i] >= t.bite) this.spent[i] = true;
      const want = t.wrecks > 0 && !this.spent[i] && speed > t.wreckSpeed * (this.armed[i] ? 0.7 : 1);
      if (want === this.armed[i]) continue;
      this.armed[i] = want;
      seg.collider(0).setCollisionGroups(want ? SMASHING : PASSING);
      if (want) this.chunks?.addHitter(seg, this.reach[i]);
      else this.chunks?.removeHitter(seg);
    }
  }

  /** How many parts of the tail are smashing things right now. */
  armedCount(): number {
    return this.armed.filter(Boolean).length;
  }

  tip(target = new THREE.Vector3()): THREE.Vector3 {
    const p = this.segments[this.segments.length - 1].translation();
    return target.set(p.x, p.y, p.z);
  }
}
