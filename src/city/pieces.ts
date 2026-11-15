import * as THREE from 'three';
import { ALL_GROUPS, FIXED_DT, Group, groups, type RigidBody } from '../core/physics';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim, System, Tracked } from '../sim';
import type { JobSpec } from './cityGen';
import type { ChunkField } from './destruction';

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
  /** Half-size of a box that bounds it, for sweeping it through buildings while carried. */
  bounds: { hx: number; hy: number; hz: number };
  marker: THREE.Mesh;
  socketMarker: THREE.Mesh;
  socketPad: THREE.Mesh;
}

const UP = new THREE.Vector3(0, 1, 0);
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();

/** While loose: everything except feet. While carried: only things it can shove without pinching anyone. */
const LOOSE_GROUPS = groups(Group.PIECE, ALL_GROUPS & ~Group.FOOT);
const HELD_GROUPS = groups(Group.PIECE, Group.PROP | Group.BALL);
/** How far the load visibly leans at full misalignment (rad). */
const MAX_LEAN = 0.42;

function angleDiff(from: number, to: number, period: number): number {
  let d = (to - from) % period;
  if (d > period / 2) d -= period;
  if (d < -period / 2) d += period;
  return d;
}

/**
 * Repair pieces: whole chunks of city that can't crumble, only be carried.
 *
 * Hold grab near one and the kaiju hoists it onto its hands. Carrying is a balance game
 * played on a dial: the load's dot drifts and gets shoved about by the kaiju's own starts,
 * stops and turns; the player's dot follows the mouse. Keep them together. The further
 * apart they are, the faster the grip goes, and when it is gone the load slips.
 * Let go over the place it belongs and it goes in: straight if it was steady and lined
 * up, crooked (and it shows) if it was not.
 */
export class Pieces implements System {
  readonly pieces: Piece[] = [];
  held: Piece | null = null;
  /** Counters for the HUD, the session log and tests. */
  placed = 0;
  crooked = 0;
  drops = 0;
  /** The balance dial, all in dial-widths (-1..1, x to the kaiju's right, z forward). */
  readonly sway = { x: 0, z: 0 };
  readonly target = { x: 0, z: 0 };
  /** How far apart the two dots are, and how much grip is left (1 firm, 0 gone). */
  error = 0;
  grip = 1;

  private swayVel = { x: 0, z: 0 };
  private lastVel = new THREE.Vector3();
  private lastYawRate = 0;
  private liftTime = 0;
  private liftFrom = new THREE.Vector3();
  private liftQuat = new THREE.Quaternion();
  private wasGrabbing = false;
  private byCollider = new Map<number, Piece>();
  private arms: THREE.Mesh[] = [];
  private time = 0;
  private clock = 0;

  constructor(
    private sim: Sim,
    jobs: JobSpec[],
    private kaiju: Kaiju,
    private chunks: ChunkField | null,
  ) {
    const { R, world } = sim;
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
        world.createCollider(
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
        bounds: { hx: span, hy: job.height / 2, hz: span },
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
   * The point the hands hold a load at: straight ahead of the kaiju and a little above its
   * middle. It follows the kaiju's heading but not its lean; the arms soak that up.
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
    this.liftTime = 0;
    piece.state = 'lifting';
    piece.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    this.setGroups(piece, HELD_GROUPS);
    this.held = piece;
    this.sway.x = this.sway.z = 0;
    this.swayVel.x = this.swayVel.z = 0;
    this.grip = 1;
    this.error = 0;
    const v = this.kaiju.body.linvel();
    this.lastVel.set(v.x, 0, v.z);
    this.lastYawRate = this.kaiju.body.angvel().y;
    this.sim.emit('pieceGrab', { x: p.x, y: p.y, z: p.z });
  }

  private setGroups(piece: Piece, g: number): void {
    for (let i = 0; i < piece.body.numColliders(); i++) piece.body.collider(i).setCollisionGroups(g);
  }

  /** Lets go. Over the place it belongs it goes in; anywhere else it just drops. */
  release(reason: 'let go' | 'slipped'): void {
    const piece = this.held;
    if (!piece) return;
    const { R } = this.sim;
    this.held = null;
    this.kaiju.carrying = 0;
    const wasHeld = piece.state === 'held';
    piece.state = 'loose';
    piece.body.setBodyType(R.RigidBodyType.Dynamic, true);
    this.setGroups(piece, LOOSE_GROUPS);
    // It leaves the hands with the kaiju's speed, toppling the way it was leaning.
    const v = this.kaiju.body.linvel();
    piece.body.setLinvel({ x: v.x, y: 0, z: v.z }, true);
    this.leanAxis(a);
    piece.body.setAngvel({ x: a.x * 1.2, y: 0, z: a.z * 1.2 }, true);

    const t = this.sim.tuning.carry;
    const p = piece.body.translation();
    const s = piece.job.socket;
    const offset = Math.hypot(p.x - s.x, p.z - s.z);
    if (reason === 'let go' && wasHeld && offset < t.snapRadius && p.y > s.y - 2.5) {
      this.place(piece, offset);
      return;
    }
    if (reason === 'slipped') this.drops++;
    this.sim.emit('pieceDrop', { x: p.x, y: p.y, z: p.z });
  }

  /** World-space axis (scaled by how far) the load is leaning about: toward the gap between the dots. */
  private leanAxis(target: THREE.Vector3): THREE.Vector3 {
    const k = this.kaiju;
    // The load leans toward where its dot is relative to the player's.
    const dx = this.sway.x - this.target.x;
    const dz = this.sway.z - this.target.z;
    // Dial x is the kaiju's right (minus its left), z its forward.
    c.copy(k.left).multiplyScalar(-dx).addScaledVector(k.forward, dz);
    // Leaning toward a direction v is a turn about UP x v.
    return target.crossVectors(UP, c);
  }

  /** Sets a piece into its place. A sloppy drop still counts, but it sits visibly skew. */
  private place(piece: Piece, offset: number): void {
    const { R } = this.sim;
    const t = this.sim.tuning.carry;
    const s = piece.job.socket;
    const p = piece.body.translation();
    const twist = angleDiff(s.yaw, this.kaiju.yaw, piece.job.symmetry);
    const steady = this.error < t.tolerance * 1.5 && this.grip > 0.5;
    const straight = offset < t.straightRadius && Math.abs(twist) < 0.22 && steady;
    if (straight) {
      a.set(s.x, s.y, s.z);
      q.setFromAxisAngle(UP, s.yaw);
    } else {
      // Keep some of the miss: slid off-centre, twisted, and leaning toward the side it overhangs.
      const keep = 0.4;
      a.set(s.x + (p.x - s.x) * keep, s.y, s.z + (p.z - s.z) * keep);
      q.setFromAxisAngle(UP, s.yaw + twist * 0.8);
      const lean = THREE.MathUtils.clamp(0.06 + offset * 0.018 + this.error * 0.08, 0.06, 0.17);
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
    k.carrying = 1;
    this.anchor(c);
    const anchorX = c.x;
    const anchorY = c.y;
    const anchorZ = c.z;

    if (piece.state === 'lifting') {
      // Hoist: swing it up from where it lay to upright on the hands, squared to the kaiju.
      this.liftTime += dt;
      const u = Math.min(1, this.liftTime / t.liftTime);
      const s = u * u * (3 - 2 * u);
      a.lerpVectors(this.liftFrom, c, s);
      a.y += Math.sin(Math.PI * s) * 3;
      q.setFromAxisAngle(UP, k.yaw);
      q2.copy(this.liftQuat).slerp(q, s);
      piece.body.setNextKinematicTranslation(a);
      piece.body.setNextKinematicRotation(q2);
      if (u >= 1) piece.state = 'held';
      return;
    }

    // --- The balance game ---
    // What the kaiju is doing to the load: its acceleration, felt in its own frame, plus the
    // sideways whip of the hands when it swings round.
    const v = k.body.linvel();
    const ax = (v.x - this.lastVel.x) / dt;
    const az = (v.z - this.lastVel.z) / dt;
    this.lastVel.set(v.x, 0, v.z);
    const yawRate = k.body.angvel().y;
    const whip = ((yawRate - this.lastYawRate) / dt) * (this.sim.tuning.kaiju.bodyRadius + t.holdForward);
    this.lastYawRate = yawRate;
    // In dial terms: x is to the kaiju's right (a left turn swings the hands left, so the load lags right).
    const right = -(ax * k.left.x + az * k.left.z) + whip;
    const fwd = ax * k.forward.x + az * k.forward.z;
    // And it has a mind of its own: a slow drift that never quite settles.
    this.clock += dt;
    const wx = Math.sin(this.clock * 1.31) + Math.sin(this.clock * 2.17 + 1.3) * 0.6;
    const wz = Math.sin(this.clock * 1.07 + 2.1) + Math.sin(this.clock * 2.63 + 0.4) * 0.6;
    // A sprung, lightly damped dot: shoved the opposite way to the kaiju's acceleration.
    const spring = 7;
    const damp = 1.6;
    this.swayVel.x += (-spring * this.sway.x - damp * this.swayVel.x - t.sway * right + t.wander * wx) * dt;
    this.swayVel.z += (-spring * this.sway.z - damp * this.swayVel.z - t.sway * fwd + t.wander * wz) * dt;
    this.sway.x += this.swayVel.x * dt;
    this.sway.z += this.swayVel.z * dt;
    const far = Math.hypot(this.sway.x, this.sway.z);
    if (far > 1) {
      this.sway.x /= far;
      this.sway.z /= far;
      this.swayVel.x *= 0.5;
      this.swayVel.z *= 0.5;
    }

    // The player's dot.
    this.target.x = THREE.MathUtils.clamp(input.balanceX, -1, 1);
    this.target.z = THREE.MathUtils.clamp(input.balanceZ, -1, 1);
    const tl = Math.hypot(this.target.x, this.target.z);
    if (tl > 1) {
      this.target.x /= tl;
      this.target.z /= tl;
    }
    this.error = Math.hypot(this.sway.x - this.target.x, this.sway.z - this.target.z);
    if (this.error > t.tolerance) this.grip -= (dt / t.slipTime) * Math.min(1, (this.error - t.tolerance) / (1 - t.tolerance));
    else this.grip += dt / t.gripRecover;
    this.grip = Math.min(1, this.grip);

    // Carried through a building, it takes the building with it, and jolts the grip.
    if (this.chunks) {
      const bd = piece.bounds;
      const shape = new this.sim.R.Cuboid(bd.hx, bd.hy, bd.hz);
      a.set(anchorX, anchorY + bd.hy, anchorZ);
      q.setFromAxisAngle(UP, k.yaw);
      b.set(v.x, 0, v.z);
      const broke = this.chunks.stomp(shape, a, q, b, false);
      if (broke) this.grip -= 0.06 * broke;
    }
    if (this.grip <= 0) {
      this.release('slipped');
      return;
    }

    // Show it: the load leans toward the gap between the dots, more as the grip goes.
    this.leanAxis(a);
    const lean = Math.min(1, a.length());
    piece.tilt = lean * MAX_LEAN * (0.6 + 0.4 * (1 - this.grip));
    q.setFromAxisAngle(UP, k.yaw);
    if (lean > 1e-4) q.premultiply(q2.setFromAxisAngle(a.normalize(), piece.tilt));
    piece.body.setNextKinematicTranslation({ x: anchorX, y: anchorY, z: anchorZ });
    piece.body.setNextKinematicRotation(q);
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
