import * as THREE from 'three';
import { ALL_GROUPS, FIXED_DT, Group, groups, type RigidBody } from '../core/physics';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim, System, Tracked } from '../sim';
import type { JobSpec } from './cityGen';

export type PieceState = 'loose' | 'lifting' | 'held' | 'placed';
export type Fit = 'straight' | 'crooked';

export interface Piece {
  job: JobSpec;
  body: RigidBody;
  tracked: Tracked;
  state: PieceState;
  fit: Fit | null;
  mass: number;
  /** Lean from upright, in radians, refreshed every step. */
  tilt: number;
  /** How hard gravity topples it per unit of lean, and how hard a metre of hand shift rights it (rad/s^2). */
  topple: number;
  handGain: number;
  marker: THREE.Mesh;
  socketMarker: THREE.Mesh;
  socketPad: THREE.Mesh;
}

type Joint = InstanceType<Sim['R']['ImpulseJoint']>;

const UP = new THREE.Vector3(0, 1, 0);
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();

/** While loose: everything. While held: everything but the kaiju carrying it. */
const LOOSE_GROUPS = groups(Group.PIECE, ALL_GROUPS & ~Group.FOOT);
const HELD_GROUPS = groups(Group.PIECE, Group.GROUND | Group.CHUNK | Group.PROP | Group.BALL | Group.PIECE);

function angleDiff(from: number, to: number, period: number): number {
  let d = (to - from) % period;
  if (d > period / 2) d -= period;
  if (d < -period / 2) d += period;
  return d;
}

/**
 * Repair pieces: whole chunks of city that can't crumble, only be carried.
 *
 * Hold the grab button near one and the kaiju hoists it onto its hands, where it
 * balances like a broom on a palm: the hands have to stay under it. Kaiju movement
 * shoves the hands about; the balance control (mouse, keys, stick) shifts them back.
 * Let it lean too far and it slips. Let go over the place it belongs and it goes in:
 * straight if it was lined up, crooked (and it shows) if it was not.
 */
export class Pieces implements System {
  readonly pieces: Piece[] = [];
  held: Piece | null = null;
  /** Counters for the HUD, the session log and tests. */
  placed = 0;
  crooked = 0;
  drops = 0;
  /** Where the hands are under the load, relative to centred: -1..1 on each axis (x right, z forward). */
  readonly hand = { x: 0, z: 0 };
  /** Where the hands would have to be right now to stop the load leaning any further (same units). */
  readonly needed = { x: 0, z: 0 };

  private hands: RigidBody;
  private joint: Joint | null = null;
  private liftTime = 0;
  private liftFrom = new THREE.Vector3();
  private liftQuat = new THREE.Quaternion();
  private holdYaw = 0;
  private wasGrabbing = false;
  private byCollider = new Map<number, Piece>();
  private arms: THREE.Mesh[] = [];
  private time = 0;

  constructor(
    private sim: Sim,
    jobs: JobSpec[],
    private kaiju: Kaiju,
  ) {
    const { R, world } = sim;
    this.hands = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    const markerGeometry = new THREE.OctahedronGeometry(2.2);
    for (const job of jobs) {
      q.setFromAxisAngle(UP, job.start.yaw);
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(job.start.x, 0.04, job.start.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setLinearDamping(0.1)
          .setAngularDamping(0.5)
          .setSleeping(true),
      );
      const group = new THREE.Group();
      let volume = 0;
      for (const box of job.boxes) {
        const collider = world.createCollider(
          R.ColliderDesc.cuboid(box.hx - 0.03, box.hy - 0.03, box.hz - 0.03)
            .setTranslation(box.x, box.y, box.z)
            .setDensity(sim.tuning.destruction.chunkDensity)
            .setFriction(0.8)
            .setRestitution(0)
            .setCollisionGroups(LOOSE_GROUPS)
            .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
            .setContactForceEventThreshold(2000),
          body,
        );
        volume += 8 * box.hx * box.hy * box.hz;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(box.hx * 2 - 0.14, box.hy * 2 - 0.14, box.hz * 2 - 0.14),
          new THREE.MeshLambertMaterial({ color: box.color }),
        );
        mesh.position.set(box.x, box.y, box.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        this.byCollider.set(collider.handle, null as unknown as Piece);
      }
      // A coloured band round the base, matching the marker over the place it belongs.
      const span = job.boxes.reduce((m, bx) => Math.max(m, Math.abs(bx.x) + bx.hx, Math.abs(bx.z) + bx.hz), 0);
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(span * 2 + 0.3, 0.5, span * 2 + 0.3),
        new THREE.MeshBasicMaterial({ color: job.color }),
      );
      band.position.y = job.kind === 'span' ? job.height + 0.1 : 0.3;
      if (job.kind === 'span') band.scale.set(0.3, 0.2, 0.3);
      group.add(band);

      const material = new THREE.MeshBasicMaterial({ color: job.color });
      const marker = new THREE.Mesh(markerGeometry, material);
      const socketMarker = new THREE.Mesh(markerGeometry, material);
      const socketPad = new THREE.Mesh(
        new THREE.BoxGeometry(span * 2, 0.4, span * 2),
        new THREE.MeshBasicMaterial({ color: job.color, transparent: true, opacity: 0.45, depthWrite: false }),
      );
      socketPad.position.set(job.socket.x, job.socket.y + 0.25, job.socket.z);
      socketMarker.position.set(job.socket.x, job.socket.y + job.height + 9, job.socket.z);
      sim.scene.add(marker, socketMarker, socketPad);

      const piece: Piece = {
        job,
        body,
        tracked: sim.track(body, group),
        state: 'loose',
        fit: null,
        mass: volume * sim.tuning.destruction.chunkDensity,
        tilt: 0,
        // A box balanced on its base: inertia about the base from its height and width.
        topple: (sim.tuning.world.gravity * job.height * 0.5) / (job.height ** 2 / 3 + (span * 2) ** 2 / 12),
        handGain: sim.tuning.world.gravity / (job.height ** 2 / 3 + (span * 2) ** 2 / 12),
        marker,
        socketMarker,
        socketPad,
      };
      for (let i = 0; i < body.numColliders(); i++) this.byCollider.set(body.collider(i).handle, piece);
      this.pieces.push(piece);
    }

    // Arms that reach out to whatever is being carried.
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0x3c8463 });
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.3, 1, 7), armMaterial);
      arm.castShadow = true;
      arm.visible = false;
      sim.scene.add(arm);
      this.arms.push(arm);
    }

    sim.onContactForce((c1, c2, force) => this.onForce(c1, c2, force));
  }

  /**
   * The point the hands rest at: straight ahead of the kaiju and a little above its middle.
   * It follows the kaiju's heading but not its lean; the arms soak that up, or every sway
   * of the body would whip the load up and down.
   */
  private anchor(target: THREE.Vector3): THREE.Vector3 {
    const k = this.sim.tuning.kaiju;
    const t = this.sim.tuning.carry;
    const p = this.kaiju.body.translation();
    return target.set(p.x, p.y + t.handHeight, p.z).addScaledVector(this.kaiju.forward, k.bodyRadius + t.holdForward);
  }

  /** The loose (or already placed) piece nearest the hands, if any is in reach. */
  nearest(): Piece | null {
    const reach = this.sim.tuning.carry.reach;
    this.anchor(b);
    let best: Piece | null = null;
    let bestDist = reach;
    for (const piece of this.pieces) {
      if (piece.state !== 'loose' && piece.state !== 'placed') continue;
      const p = piece.body.translation();
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d < bestDist) {
        bestDist = d;
        best = piece;
      }
    }
    return best;
  }

  /** Starts hoisting a piece onto the hands. */
  grab(piece: Piece): void {
    if (this.held) return;
    const { R } = this.sim;
    if (piece.state === 'placed') {
      this.placed--;
      if (piece.fit === 'crooked') this.crooked--;
      piece.fit = null;
    }
    const p = piece.body.translation();
    const r = piece.body.rotation();
    this.liftFrom.set(p.x, p.y, p.z);
    this.liftQuat.set(r.x, r.y, r.z, r.w);
    // It is squared up to the kaiju as it is hoisted: face the gap square-on and it goes in square.
    this.holdYaw = 0;
    this.liftTime = 0;
    piece.state = 'lifting';
    piece.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    this.setGroups(piece, HELD_GROUPS);
    this.held = piece;
    this.hand.x = 0;
    this.hand.z = 0;
    this.sim.emit('pieceGrab', { x: p.x, y: p.y, z: p.z });
  }

  private setGroups(piece: Piece, g: number): void {
    for (let i = 0; i < piece.body.numColliders(); i++) piece.body.collider(i).setCollisionGroups(g);
  }

  /** Lets go. Over the place it belongs it goes in; anywhere else it just drops. */
  release(reason: 'let go' | 'slipped'): void {
    const piece = this.held;
    if (!piece) return;
    const { R, world } = this.sim;
    if (this.joint) {
      world.removeImpulseJoint(this.joint, true);
      this.joint = null;
    }
    this.held = null;
    this.kaiju.carrying = 0;
    if (piece.state === 'lifting') piece.body.setBodyType(R.RigidBodyType.Dynamic, true);
    piece.state = 'loose';
    this.setGroups(piece, LOOSE_GROUPS);

    const t = this.sim.tuning.carry;
    const p = piece.body.translation();
    const s = piece.job.socket;
    const offset = Math.hypot(p.x - s.x, p.z - s.z);
    if (reason === 'let go' && offset < t.snapRadius && p.y > s.y - 2.5 && piece.tilt < 0.6) {
      this.place(piece, offset);
      return;
    }
    if (reason === 'slipped') this.drops++;
    this.sim.emit('pieceDrop', { x: p.x, y: p.y, z: p.z });
  }

  /** Sets a piece into its place. A sloppy drop still counts, but it sits visibly skew. */
  private place(piece: Piece, offset: number): void {
    const { R } = this.sim;
    const t = this.sim.tuning.carry;
    const s = piece.job.socket;
    const p = piece.body.translation();
    const r = piece.body.rotation();
    const yaw = 2 * Math.atan2(r.y, r.w);
    const twist = angleDiff(s.yaw, yaw, piece.job.symmetry);
    const straight = offset < t.straightRadius && Math.abs(twist) < 0.22 && piece.tilt < 0.2;
    if (straight) {
      a.set(s.x, s.y, s.z);
      q.setFromAxisAngle(UP, s.yaw);
    } else {
      // Keep some of the miss: slid off-centre, twisted, and leaning toward the side it overhangs.
      const keep = 0.4;
      a.set(s.x + (p.x - s.x) * keep, s.y, s.z + (p.z - s.z) * keep);
      q.setFromAxisAngle(UP, s.yaw + twist * 0.8);
      const lean = THREE.MathUtils.clamp(0.05 + offset * 0.018 + piece.tilt * 0.3, 0.06, 0.17);
      b.set(p.z - s.z, 0, -(p.x - s.x));
      if (b.lengthSq() < 0.01) b.set(1, 0, 0);
      q.premultiply(q2.setFromAxisAngle(b.normalize(), lean));
      this.crooked++;
    }
    piece.body.setBodyType(R.RigidBodyType.Fixed, true);
    piece.body.setTranslation(a, true);
    piece.body.setRotation(q, true);
    piece.state = 'placed';
    piece.fit = straight ? 'straight' : 'crooked';
    this.placed++;
    this.sim.emit('piecePlace', { x: a.x, y: a.y, z: a.z, straight });
  }

  /** A placed piece that takes a hard enough knock comes off again. */
  private onForce(c1: number, c2: number, force: number): void {
    const piece = this.byCollider.get(c1) ?? this.byCollider.get(c2);
    if (!piece || piece.state !== 'placed') return;
    if (force * FIXED_DT < piece.mass * this.sim.tuning.destruction.breakSpeed * 2.5) return;
    piece.body.setBodyType(this.sim.R.RigidBodyType.Dynamic, true);
    piece.state = 'loose';
    this.placed--;
    if (piece.fit === 'crooked') this.crooked--;
    piece.fit = null;
    const p = piece.body.translation();
    this.sim.emit('pieceDrop', { x: p.x, y: p.y, z: p.z });
  }

  preStep(dt: number): void {
    const { R, world } = this.sim;
    const t = this.sim.tuning.carry;
    const k = this.kaiju;
    const input = this.sim.players[k.player] ?? this.sim.players[0];
    const able = k.state === 'walk' || k.state === 'stumble';

    // Grab on the press, hold while held, let go on release.
    if (input.grab && !this.wasGrabbing && !this.held && able) {
      const target = this.nearest();
      if (target) this.grab(target);
    }
    this.wasGrabbing = input.grab;

    const piece = this.held;
    if (!piece) return;
    if (!input.grab) {
      this.release('let go');
      return;
    }
    if (!able) {
      this.release('slipped');
      return;
    }

    // The hands follow the balance control, quickly but not instantly.
    const ease = Math.min(1, dt * 9);
    this.hand.x += (THREE.MathUtils.clamp(input.balanceX, -1, 1) - this.hand.x) * ease;
    this.hand.z += (THREE.MathUtils.clamp(input.balanceZ, -1, 1) - this.hand.z) * ease;
    this.anchor(c);
    this.hands.setNextKinematicTranslation(c);
    k.carrying = 1;

    if (piece.state === 'lifting') {
      // Hoist: swing it up from where it lay to upright on the hands.
      this.liftTime += dt;
      const u = Math.min(1, this.liftTime / t.liftTime);
      const s = u * u * (3 - 2 * u);
      a.lerpVectors(this.liftFrom, c, s);
      a.y += Math.sin(Math.PI * s) * 3;
      q.setFromAxisAngle(UP, k.yaw + this.holdYaw);
      q2.copy(this.liftQuat).slerp(q, s);
      piece.body.setNextKinematicTranslation(a);
      piece.body.setNextKinematicRotation(q2);
      if (u >= 1) {
        piece.body.setBodyType(R.RigidBodyType.Dynamic, true);
        piece.body.setTranslation(c, true);
        piece.body.setRotation(q, true);
        piece.body.setLinvel(k.body.linvel(), true);
        piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.hands.setTranslation(c, true);
        this.joint = world.createImpulseJoint(
          R.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
          this.hands,
          piece.body,
          true,
        );
        piece.state = 'held';
      }
      return;
    }

    // Held: balanced on its base like a broom on a palm. Gravity topples it the way it leans;
    // the kaiju cancels part of that by itself (`assist`). The rest is the player's: sliding
    // the hands under the lean holds it, sliding them past the lean rights it. The kaiju's own
    // starts, stops and turns reach the load through the joint, as real shoves.
    const r = piece.body.rotation();
    q.set(r.x, r.y, r.z, r.w);
    a.set(0, 1, 0).applyQuaternion(q);
    piece.tilt = Math.acos(THREE.MathUtils.clamp(a.y, -1, 1));
    if (piece.tilt > t.dropAngle) {
      this.release('slipped');
      return;
    }
    const av = piece.body.angvel();
    // Unit vector of the way it is leaning, on the ground plane.
    b.set(a.x, 0, a.z);
    const flat = b.length();
    if (flat > 1e-5) b.divideScalar(flat);
    const gravityPull = piece.topple * Math.sin(piece.tilt);
    // Hand shift in world space (hand.x is to the kaiju's right, which is minus its left).
    c.copy(k.left).multiplyScalar(-this.hand.x * t.handRange).addScaledVector(k.forward, this.hand.z * t.handRange);
    // Tipping the top toward a direction v is an angular acceleration about UP x v.
    // Assist tips it back against the lean; the hands tip it away from where they have moved to.
    const assistX = -b.x * t.assist * gravityPull - c.x * piece.handGain;
    const assistZ = -b.z * t.assist * gravityPull - c.z * piece.handGain;
    const ax = assistZ; // UP x (x, 0, z) = (z, 0, -x)
    const az = -assistX;
    // And it turns with the kaiju, so facing is how you square it up.
    const yaw = 2 * Math.atan2(r.y, r.w);
    const spin = THREE.MathUtils.clamp(angleDiff(yaw, k.yaw + this.holdYaw, Math.PI * 2) * 5, -3, 3);
    piece.body.setAngvel({ x: av.x + ax * dt, y: av.y + (spin - av.y) * Math.min(1, dt * 8), z: av.z + az * dt }, true);

    // For the balance dial: where the hands need to be to bring it back upright. That is
    // enough to hold its lean, plus a lead for how fast it is going over, plus a push home.
    // While the dot is inside the dial the load can be saved; pinned to the rim, it is going.
    // The top moves at w x up, which near upright is (-w.z, 0, w.x).
    const tipRateX = -av.z;
    const tipRateZ = av.x;
    const hold = (1 - t.assist) * gravityPull + 3 * piece.tilt;
    const needX = (b.x * hold + tipRateX * 2) / piece.handGain;
    const needZ = (b.z * hold + tipRateZ * 2) / piece.handGain;
    // Into the kaiju's frame: x to its right, z forward.
    this.needed.x = THREE.MathUtils.clamp(-(needX * k.left.x + needZ * k.left.z) / t.handRange, -1, 1);
    this.needed.z = THREE.MathUtils.clamp((needX * k.forward.x + needZ * k.forward.z) / t.handRange, -1, 1);
  }

  postStep(): void {
    for (const piece of this.pieces) {
      if (piece.state === 'held' || piece.state === 'lifting') continue;
      const r = piece.body.rotation();
      a.set(0, 1, 0).applyQuaternion(q.set(r.x, r.y, r.z, r.w));
      piece.tilt = Math.acos(THREE.MathUtils.clamp(a.y, -1, 1));
    }
  }

  render(_alpha: number, frameDt: number): void {
    this.time += frameDt;
    const bob = Math.sin(this.time * 2.4) * 1.2;
    for (const piece of this.pieces) {
      const done = piece.state === 'placed';
      const o = piece.tracked.object;
      piece.marker.visible = !done && piece.state === 'loose';
      piece.marker.position.set(o.position.x, o.position.y + piece.job.height + 7 + bob, o.position.z);
      piece.marker.rotation.y = this.time * 1.5;
      piece.socketMarker.visible = !done;
      piece.socketMarker.position.y = piece.job.socket.y + piece.job.height + 9 + bob;
      piece.socketMarker.rotation.y = -this.time * 1.5;
      piece.socketPad.visible = !done;
    }

    // Arms out to the load.
    const held = this.held;
    for (const arm of this.arms) arm.visible = !!held;
    if (!held) return;
    const body = this.kaiju.visual;
    const k = this.sim.tuning.kaiju;
    const o = held.tracked.object;
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? 1 : -1;
      a.set(side * k.bodyRadius * 0.9, k.bodyHalfHeight * 0.3, k.bodyRadius * 0.4).applyQuaternion(body.quaternion).add(body.position);
      b.set(side * 3, 0.5, 0).applyQuaternion(o.quaternion).add(o.position);
      c.subVectors(b, a);
      const len = c.length();
      arm.position.copy(a).addScaledVector(c, 0.5);
      arm.quaternion.setFromUnitVectors(UP, c.divideScalar(len || 1));
      arm.scale.set(1, len, 1);
    });
  }
}
