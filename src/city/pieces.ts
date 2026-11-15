import { Face, facadeMaterial } from '../gfx/facade';
import type { Look } from '../gfx/look';
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { ALL_GROUPS, FIXED_DT, Group, groups, type RigidBody } from '../core/physics';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim, System, Tracked } from '../sim';
import type { JobSpec } from './cityGen';
import type { ChunkField } from './destruction';

export type PieceState = 'loose' | 'lifting' | 'held' | 'raising' | 'placed';
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
/** How far the load visibly leans when the marker is at the end of the gauge (rad). */
const MAX_LEAN = 0.4;

function angleDiff(from: number, to: number, period: number): number {
  let d = (to - from) % period;
  if (d > period / 2) d -= period;
  if (d < -period / 2) d += period;
  return d;
}

function startPose(job: JobSpec, pos: THREE.Vector3, rot: THREE.Quaternion): void {
  pos.set(job.start.x, (job.start.y ?? 0) + 0.04, job.start.z);
  rot.setFromAxisAngle(UP, job.start.yaw);
  // Lying on its side: tipped over about its own z axis.
  if (job.start.roll) rot.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), job.start.roll));
}

/**
 * Repair pieces: whole chunks of city that can't crumble, only be put back.
 *
 * Click by one (or press E) and the kaiju takes hold; click again and it lets go.
 * Most are carried: hoisted onto the hands, walked over to where they belong, and let go
 * there. A toppled one is stood back up where it lies, the kaiju rooted to the spot and
 * heaving.
 *
 * Either way there is one thing to mind, shown on a gauge at the side of the screen: a
 * marker that drifts up and down, shoved by the kaiju's own starts, stops and turns.
 * Move the mouse up or down to bring it back to the middle. While it is outside the
 * middle band the grip burns down, and when the grip is gone the piece slips.
 */
export class Pieces implements System {
  readonly pieces: Piece[] = [];
  held: Piece | null = null;
  /** Counters for the HUD, the session log and tests. */
  placed = 0;
  crooked = 0;
  drops = 0;
  /** Where the marker is on the gauge: -1 bottom, 0 middle, 1 top. */
  marker = 0;
  /** Which way to move the mouse to fix it: 1 up, -1 down, 0 it is fine. */
  prompt = 0;
  /** How much grip is left (1 firm, 0 gone), and how far a toppled piece has been raised (0..1). */
  grip = 1;
  progress = 0;

  private sway = 0;
  /** The kaiju's forward acceleration, smoothed (m/s^2). */
  private push = 0;
  private lastVel = new THREE.Vector3();
  /** The load's own shifts: how far it is being thrown now, for how long, and when the next comes. */
  private shift = 0;
  private shiftFor = 0;
  private shiftIn = 0;
  private rng = new Rng(977);
  private liftTime = 0;
  private liftFrom = new THREE.Vector3();
  private liftQuat = new THREE.Quaternion();
  private wasPressed = false;
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
      startPose(job, a, q);
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(a.x, a.y, a.z)
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
          job.kind === 'top' && Math.abs(box.x) + Math.abs(box.z) > 0.1
            ? facadeMaterial(sim.parts.look as Look | undefined, {
                color: box.color,
                face: (box.x > 0 ? Face.PX : Face.NX) | (box.z > 0 ? Face.PZ : Face.NZ),
                seed: Math.abs(Math.round(job.socket.x * 3 + job.socket.z)) % 100,
              })
            : new THREE.MeshLambertMaterial({ color: box.color }),
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
      // A bus needs no plinth: its marker floats over it.
      band.visible = job.kind !== 'bus';
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

    // Arms that reach out to whatever is being held.
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0x3c8463 });
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.3, 1, 7), armMaterial);
      arm.castShadow = true;
      arm.visible = false;
      sim.scene.add(arm);
      this.arms.push(arm);
    }

    sim.onContactForce((c1, c2, force) => this.onForce(c1, c2, force));
    // A piece resting on a building is asleep; when the building goes from under it, it has to wake up and fall.
    sim.on('chunkBreak', (e) => {
      for (const piece of this.pieces) {
        if (piece.state !== 'loose' || !piece.body.isSleeping()) continue;
        const p = piece.body.translation();
        if (p.y > 1 && e.y < p.y + 1 && Math.hypot(e.x - p.x, e.z - p.z) < piece.bounds.hx + 14) piece.body.wakeUp();
      }
    });
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

  /** Where on a piece the kaiju takes hold: its base, or the middle of it if it is lying down. */
  private handle(piece: Piece, target: THREE.Vector3): THREE.Vector3 {
    const p = piece.body.translation();
    target.set(p.x, p.y, p.z);
    if (piece.job.kind === 'raise' && piece.state !== 'placed') {
      const r = piece.body.rotation();
      target.add(a.set(0, piece.job.height / 2, 0).applyQuaternion(q.set(r.x, r.y, r.z, r.w)));
    }
    return target;
  }

  /** The loose (or already placed) piece nearest the hands, if any is in reach. */
  nearest(): Piece | null {
    const reach = this.sim.tuning.carry.reach;
    this.anchor(b);
    let best: Piece | null = null;
    let bestDist = reach;
    for (const piece of this.pieces) {
      if (piece.state !== 'loose' && piece.state !== 'placed') continue;
      this.handle(piece, c);
      const d = Math.hypot(c.x - b.x, c.z - b.z);
      if (d < bestDist) {
        bestDist = d;
        best = piece;
      }
    }
    return best;
  }

  /** Takes hold of a piece: hoists it onto the hands, or starts heaving a toppled one upright. */
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
    this.progress = 0;
    piece.state = piece.job.kind === 'raise' ? 'raising' : 'lifting';
    piece.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    this.setGroups(piece, HELD_GROUPS);
    this.held = piece;
    this.sway = 0;
    this.push = 0;
    this.shift = 0;
    this.shiftIn = piece.job.kind === 'raise' ? 0.8 : this.sim.tuning.carry.shiftEvery * 0.5;
    this.marker = 0;
    this.prompt = 0;
    this.grip = 1;
    const v = this.kaiju.body.linvel();
    this.lastVel.set(v.x, 0, v.z);
    this.sim.emit('pieceGrab', { x: p.x, y: p.y, z: p.z });
  }

  private setGroups(piece: Piece, g: number): void {
    for (let i = 0; i < piece.body.numColliders(); i++) piece.body.collider(i).setCollisionGroups(g);
  }

  /** Lets go. A carried piece over the place it belongs goes in; anything else just drops. */
  release(reason: 'let go' | 'slipped'): void {
    const piece = this.held;
    if (!piece) return;
    const { R } = this.sim;
    this.held = null;
    this.kaiju.carrying = 0;
    this.kaiju.planted = false;
    const carried = piece.state === 'held';
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
    if (reason === 'let go' && carried && offset < t.snapRadius && p.y > s.y - 2.5) {
      const twist = angleDiff(s.yaw, this.kaiju.yaw, piece.job.symmetry);
      const steady = this.prompt === 0 && this.grip > 0.5;
      this.place(piece, offset, twist, offset < t.straightRadius && Math.abs(twist) < 0.22 && steady);
      return;
    }
    if (reason === 'slipped') this.drops++;
    this.sim.emit('pieceDrop', { x: p.x, y: p.y, z: p.z });
  }

  /** World-space axis (scaled by how far) the load is leaning about: forward or back, with the marker. */
  private leanAxis(target: THREE.Vector3): THREE.Vector3 {
    // Marker high means it is tipping away from the kaiju; low, back toward it.
    c.copy(this.kaiju.forward).multiplyScalar(this.marker);
    // Leaning toward a direction v is a turn about UP x v.
    return target.crossVectors(UP, c);
  }

  /** Sets a piece into its place. A sloppy job still counts, but it sits visibly skew. */
  private place(piece: Piece, offset: number, twist: number, straight: boolean): void {
    const { R } = this.sim;
    const s = piece.job.socket;
    const p = piece.body.translation();
    if (straight) {
      a.set(s.x, s.y, s.z);
      q.setFromAxisAngle(UP, s.yaw);
    } else {
      // Keep some of the miss: slid off-centre, twisted, and leaning toward the side it overhangs.
      const keep = 0.4;
      a.set(s.x + (p.x - s.x) * keep, s.y, s.z + (p.z - s.z) * keep);
      q.setFromAxisAngle(UP, s.yaw + twist * 0.8);
      const lean = THREE.MathUtils.clamp(0.07 + offset * 0.018 + Math.abs(this.marker) * 0.06, 0.07, 0.17);
      b.set(p.z - s.z, 0, -(p.x - s.x));
      if (b.lengthSq() < 0.01) b.set(this.kaiju.left.x, 0, this.kaiju.left.z);
      q.premultiply(q2.setFromAxisAngle(b.normalize(), lean));
      this.crooked++;
    }
    piece.body.setBodyType(R.RigidBodyType.Fixed, true);
    piece.body.setTranslation(a, true);
    piece.body.setRotation(q, true);
    this.setGroups(piece, LOOSE_GROUPS);
    piece.state = 'placed';
    piece.fit = straight ? 'straight' : 'crooked';
    this.placed++;
    this.sim.emit('piecePlace', { x: a.x, y: a.y, z: a.z, straight });
  }

  /** True once every piece is back where it belongs. */
  allPlaced(): boolean {
    return this.pieces.length > 0 && this.placed === this.pieces.length;
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

  /** A blast of air: loose pieces in the cone are shoved along, and a held one takes a jolt to the grip. */
  blast(origin: THREE.Vector3, dir: THREE.Vector3, range: number, spread: number, power: number): void {
    for (const piece of this.pieces) {
      if (piece.state !== 'loose') continue;
      const p = piece.body.translation();
      const dx = p.x - origin.x;
      const dz = p.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 0.01 || (dx * dir.x + dz * dir.z) / dist < spread) continue;
      const fall = power * 0.5 * (1 - dist / range);
      piece.body.setLinvel({ x: dir.x * fall, y: fall * 0.3, z: dir.z * fall }, true);
    }
    if (this.held) this.grip -= 0.5;
  }

  preStep(dt: number): void {
    const t = this.sim.tuning.carry;
    const k = this.kaiju;
    const input = this.sim.players[k.player] ?? this.sim.players[0];
    const able = k.state === 'walk' || k.state === 'stumble';

    // One press takes hold, the next lets go.
    const pressed = input.grab && !this.wasPressed;
    this.wasPressed = input.grab;
    if (pressed) {
      if (this.held) {
        this.release('let go');
        return;
      }
      if (able) {
        const target = this.nearest();
        if (target) this.grab(target);
      }
    }

    const piece = this.held;
    if (!piece) return;
    if (!able) {
      this.release('slipped');
      return;
    }
    k.carrying = 1;
    // Holding the crawl key with its hands full plants its feet instead: no walking, no turning,
    // and a much steadier load. Standing a piece up, it is planted throughout.
    const planted = piece.state === 'raising' || input.crouch;
    k.planted = planted;
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

    // --- The balance gauge ---
    // What throws the marker out: the kaiju speeding up (down the gauge), braking (up), and
    // swinging round (up for a left turn, down for a right). Gentle driving barely moves it.
    const kt = this.sim.tuning.kaiju;
    const v = k.body.linvel();
    const fwd = ((v.x - this.lastVel.x) * k.forward.x + (v.z - this.lastVel.z) * k.forward.z) / dt;
    this.lastVel.set(v.x, 0, v.z);
    // Smoothed, so that it is the manoeuvre that counts and not each footstep.
    this.push += (fwd - this.push) * Math.min(1, dt / 0.35);
    const accel = THREE.MathUtils.clamp(this.push / (kt.acceleration * t.accel), -1.3, 1.3);
    const swing = THREE.MathUtils.clamp(k.body.angvel().y / (kt.maxTurnRate * t.turn), -1.3, 1.3);
    // And now and then the load shifts by itself. Standing a piece up, that is all there is,
    // so it comes more often; with feet planted for a carry, it is much smaller.
    this.clock += dt;
    this.shiftIn -= dt;
    if (this.shiftIn <= 0) {
      const raising = piece.state === 'raising';
      this.shift = (this.rng.chance(0.5) ? 1 : -1) * t.wander * (0.8 + 0.4 * this.rng.next()) * (planted && !raising ? 0.35 : 1);
      this.shiftFor = 1.3;
      this.shiftIn = (raising ? 0.3 : 1) * t.shiftEvery * (0.6 + 0.8 * this.rng.next());
    }
    this.shiftFor -= dt;
    if (this.shiftFor <= 0) this.shift = 0;
    const target = THREE.MathUtils.clamp(t.sway * (swing - accel) + this.shift, -1.2, 1.2);
    this.sway += (target - this.sway) * Math.min(1, dt / 0.6);
    // The player's shove moves the marker itself: back toward the band from outside it, or
    // about inside it, but never out the far side. Over-correcting is not a thing.
    const shove = input.balanceZ;
    const limit = t.tolerance * 0.7;
    if (shove > 0) this.sway = Math.min(this.sway + shove, Math.max(this.sway, limit));
    else if (shove < 0) this.sway = Math.max(this.sway + shove, Math.min(this.sway, -limit));
    this.marker = THREE.MathUtils.clamp(this.sway, -1, 1);
    const out = Math.abs(this.marker) - t.tolerance;
    // Marker too low: move the mouse up. Too high: down.
    const prompt = out > 0 ? -Math.sign(this.marker) : 0;
    if (prompt && prompt !== this.prompt) this.sim.emit('gaugePrompt', { x: anchorX, y: anchorY, z: anchorZ, up: prompt > 0 });
    this.prompt = prompt;
    if (out > 0) this.grip -= dt / t.slipTime;
    else this.grip = Math.min(1, this.grip + dt / t.gripRecover);

    if (piece.state === 'raising') {
      // Standing it up: steady heaving while the marker is in the band; it sags back while it isn't.
      this.progress = THREE.MathUtils.clamp(this.progress + (out > 0 ? -0.35 : 1) * (dt / t.raiseTime), 0, 1);
      if (this.grip <= 0) {
        this.release('slipped');
        return;
      }
      const s = this.progress * this.progress * (3 - 2 * this.progress);
      const sock = piece.job.socket;
      a.lerpVectors(this.liftFrom, b.set(sock.x, sock.y, sock.z), s);
      // (Swung over the edge of its base, which stays on the ground.)
      a.y += Math.sin(Math.PI * s) * 0.21 * piece.bounds.hx;
      q.setFromAxisAngle(UP, sock.yaw);
      q2.copy(this.liftQuat).slerp(q, s);
      // It shudders as the grip goes.
      if (out > 0) q2.multiply(q.setFromAxisAngle(UP, Math.sin(this.clock * 31) * 0.015));
      piece.body.setNextKinematicTranslation(a);
      piece.body.setNextKinematicRotation(q2);
      piece.tilt = (1 - s) * Math.abs(piece.job.start.roll ?? 0);
      if (this.progress >= 1) {
        this.held = null;
        k.carrying = 0;
        k.planted = false;
        piece.body.setTranslation(a, true);
        this.place(piece, 0, 0, this.grip > 0.55);
      }
      return;
    }

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

    // Show it: the load tips forward or back with the marker, more as the grip goes.
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
      if (piece.state === 'held' || piece.state === 'lifting' || piece.state === 'raising') continue;
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
      this.handle(piece, c);
      piece.marker.position.set(c.x, o.position.y + (piece.job.kind === 'raise' ? 16 : piece.job.height + 7) + bob, c.z);
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
      b.set(side * 3, held.state === 'raising' ? held.job.height * 0.5 : 0.5, 0).applyQuaternion(o.quaternion).add(o.position);
      c.subVectors(b, a);
      const len = c.length();
      arm.position.copy(a).addScaledVector(c, 0.5);
      arm.quaternion.setFromUnitVectors(UP, c.divideScalar(len || 1));
      arm.scale.set(1, len, 1);
    });
  }
}
