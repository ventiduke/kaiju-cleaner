import { Face, facadeMaterial } from '../gfx/facade';
import type { Look } from '../gfx/look';
import * as THREE from 'three';
import { ALL_GROUPS, FIXED_DT, Group, groups, type RigidBody } from '../core/physics';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim, System, Tracked } from '../sim';
import type { JobSpec } from './cityGen';
import type { ChunkField } from './destruction';

export type PieceState = 'loose' | 'lifting' | 'held' | 'raising' | 'placed';
/** How well a piece went back: dead on its mark with a firm hold, well enough, or skew. */
export type Fit = 'perfect' | 'straight' | 'crooked';

export interface Piece {
  job: JobSpec;
  body: RigidBody;
  tracked: Tracked;
  state: PieceState;
  fit: Fit | null;
  mass: number;
  /** Lean from upright, in radians, refreshed every step. */
  /** Sim time it was last set in place. */
  placedAt: number;
  /** Seconds, from taking hold, in which setting it right counts as quick work; and whether it was. */
  par: number;
  quick: boolean;
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
/** How far a load that is all but out of the hands has tipped (rad). */
const MAX_LEAN = 0.4;
/** The middle share of the zone that counts as dead centre. */
const PERFECT = 0.35;
/** Seconds after a piece is set in place during which a knock will not dislodge it. */
const PLACED_GRACE = 4;

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
 * Either way there is one thing to mind: its grip. A load works loose, faster the more it is
 * thrown about, and when it starts to slip a bar comes up beside it with a marker running
 * back and forth. A press of the jump key as the marker crosses the zone in the middle takes
 * a firm hold again; a press at the wrong moment is a fumble; no press at all and it is on
 * the ground in a few seconds. Standing a toppled piece up is the same bar used the other
 * way: every press in the zone is a heave.
 */
export class Pieces implements System {
  readonly pieces: Piece[] = [];
  held: Piece | null = null;
  /** Counters for the HUD, the session log and tests. */
  placed = 0;
  crooked = 0;
  drops = 0;
  perfect = 0;
  quick = 0;
  /** Seconds left, for the piece in hand, to set it right and have it count as quick work. */
  parLeft = 0;
  private heldSince = 0;
  /** How much grip is left (1 firm, 0 gone), and how far a toppled piece has been raised (0..1). */
  grip = 1;
  progress = 0;
  /** True while the load is slipping and the bar is up (for a piece being stood up, it always is). */
  slipping = false;
  /** Where the marker is along the bar (0..1; the zone is centred on 0.5), and half the zone's width right now. */
  bar = 0;
  zone = 0.12;
  /** Presses that found the zone, and those that did not. */
  catches = 0;
  fumbles = 0;
  /** What letting go right now would do: nothing, or set it in crooked, straight or perfect. */
  over: Fit | null = null;
  /** The last press on the bar, for whoever draws it: what it was, and the tick it happened on. */
  lastPress: { kind: 'catch' | 'perfect' | 'fumble'; tick: number } | null = null;

  /** The kaiju's forward acceleration and rate of turn, smoothed (m/s^2, rad/s). */
  private push = 0;
  private swing = 0;
  private lastVel = new THREE.Vector3();
  private lastYaw = 0;
  private barTime = 0;
  private wasJump = false;
  /** Standing a piece up: heaves landed so far (a dead-centre one counts for more), and how this attempt has gone. */
  private heaved = 0;
  private heaveFumbles = 0;
  private heavePerfects = 0;
  /** A jolt to the load from a fumble, dying away (rad). */
  private jolt = 0;
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
        placedAt: -1e9,
        par: this.parFor(job),
        quick: false,
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
   * How long a job should take once the piece is in hand, done briskly: a few seconds to get
   * it up and set it down, and the walk between at a carrying pace with something in reserve.
   * (Standing a piece up has no walk in it.)
   */
  private parFor(job: JobSpec): number {
    const t = this.sim.tuning;
    if (job.kind === 'raise') return 6;
    const top = (t.move.controller === 1 ? t.runner.speed : t.kaiju.maxSpeed) * t.carry.speed;
    const far = Math.hypot(job.socket.x - job.start.x, job.socket.z - job.start.z);
    return Math.round(7 + far / (top * 0.55));
  }

  /**
   * The point the hands hold a load at: straight ahead of the kaiju and a little above its
   * middle. It follows the kaiju's heading but not its lean; the arms soak that up.
   */
  anchor(target: THREE.Vector3): THREE.Vector3 {
    const k = this.sim.tuning.kaiju;
    const t = this.sim.tuning.carry;
    const p = this.kaiju.body.translation();
    return target.set(p.x, p.y + t.handHeight, p.z).addScaledVector(this.kaiju.forward, k.bodyRadius + t.holdForward);
  }

  /** Where on a piece the kaiju takes hold: its base, or the middle of it if it is lying down. */
  handle(piece: Piece, target: THREE.Vector3): THREE.Vector3 {
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
    if (piece.state === 'placed') this.unplace(piece);
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
    this.push = 0;
    this.swing = 0;
    this.grip = 1;
    this.slipping = false;
    this.bar = 0;
    this.barTime = 0;
    this.heaved = 0;
    this.heaveFumbles = 0;
    this.heavePerfects = 0;
    this.jolt = 0;
    this.over = null;
    this.lastPress = null;
    // (A press already down as it takes hold is not a press on the bar.)
    this.wasJump = true;
    const v = this.kaiju.body.linvel();
    this.lastVel.set(v.x, 0, v.z);
    this.lastYaw = this.kaiju.yaw;
    this.heldSince = this.sim.time;
    this.parLeft = piece.par;
    this.sim.emit('pieceGrab', { x: p.x, y: p.y, z: p.z });
  }

  /** A piece that was in place no longer is: take it off the counts. */
  private unplace(piece: Piece): void {
    this.placed--;
    if (piece.fit === 'crooked') this.crooked--;
    if (piece.fit === 'perfect') this.perfect--;
    if (piece.quick) this.quick--;
    piece.quick = false;
    piece.fit = null;
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
    const firm = !this.slipping;
    this.slipping = false;
    this.over = null;
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
      this.place(piece, offset, twist, this.fitAt(offset, firm));
      return;
    }
    if (reason === 'slipped') this.drops++;
    this.sim.emit('pieceDrop', { x: p.x, y: p.y, z: p.z });
  }

  /**
   * Whether a press on the next step would land in the zone (`share` 1), or within that share
   * of it (under 0.35 is dead centre). False when the bar is not up. For bots, tests and states:
   * a player has only eyes and ears.
   */
  inZone(share = 1): boolean {
    if (!this.slipping) return false;
    const u = ((this.barTime + FIXED_DT) / Math.max(0.1, this.sim.tuning.carry.sweep)) % 2;
    return Math.abs((u < 1 ? u : 2 - u) - 0.5) <= this.zone * share;
  }

  /** How well a carried piece would go in, let go this far (m) from its mark: only a firm hold puts it in true. */
  private fitAt(offset: number, firm: boolean): Fit {
    const t = this.sim.tuning.carry;
    return firm && offset < t.perfectRadius ? 'perfect' : firm && offset < t.straightRadius ? 'straight' : 'crooked';
  }

  /** How far out of the hands the load is (0 firm .. 1 gone), counting a fumble's jolt. */
  private get slack(): number {
    const t = this.sim.tuning.carry;
    return THREE.MathUtils.clamp((this.slipping ? 1 - this.grip / t.slipAt : 0) + this.jolt, 0, 1);
  }

  /** World-space axis (scaled by how far) the load is leaning about: it tips away from the kaiju as it goes. */
  private leanAxis(target: THREE.Vector3): THREE.Vector3 {
    c.copy(this.kaiju.forward).multiplyScalar(this.slack);
    // Leaning toward a direction v is a turn about UP x v.
    return target.crossVectors(UP, c);
  }

  /** Sets a piece into its place. A sloppy job still counts, but it sits visibly skew. */
  private place(piece: Piece, offset: number, twist: number, fit: Fit): void {
    const { R } = this.sim;
    const s = piece.job.socket;
    const p = piece.body.translation();
    const straight = fit !== 'crooked';
    if (straight) {
      a.set(s.x, s.y, s.z);
      q.setFromAxisAngle(UP, s.yaw);
    } else {
      // Keep some of the miss: slid off-centre, twisted, and leaning toward the side it overhangs.
      const keep = 0.4;
      a.set(s.x + (p.x - s.x) * keep, s.y, s.z + (p.z - s.z) * keep);
      q.setFromAxisAngle(UP, s.yaw + twist * 0.8);
      const lean = THREE.MathUtils.clamp(0.07 + offset * 0.018, 0.07, 0.17);
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
    piece.placedAt = this.sim.time;
    piece.fit = fit;
    this.placed++;
    if (fit === 'perfect') this.perfect++;
    // Set right inside its time, it is quick work. (A crooked job done fast is only a fast crooked job.)
    piece.quick = straight && this.sim.time - this.heldSince <= piece.par;
    if (piece.quick) this.quick++;
    this.parLeft = 0;
    this.sim.emit('piecePlace', { x: a.x, y: a.y, z: a.z, straight, perfect: fit === 'perfect', quick: piece.quick });
  }

  /** True once every piece is back where it belongs. */
  allPlaced(): boolean {
    return this.pieces.length > 0 && this.placed === this.pieces.length;
  }

  /** A placed piece that takes a hard enough knock comes off again. */
  private onForce(c1: number, c2: number, force: number): void {
    const piece = this.byCollider.get(c1) ?? this.byCollider.get(c2);
    if (!piece || piece.state !== 'placed') return;
    // Just set down: give the kaiju a moment to get clear before a careless elbow can undo it.
    if (this.sim.time - piece.placedAt < PLACED_GRACE) return;
    if (force * FIXED_DT < piece.mass * this.sim.tuning.destruction.breakSpeed * 2.5) return;
    piece.body.setBodyType(this.sim.R.RigidBodyType.Dynamic, true);
    piece.state = 'loose';
    this.unplace(piece);
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
    if (this.held) this.grip -= 0.4;
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
    this.parLeft = Math.max(0, piece.par - (this.sim.time - this.heldSince));
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

    // --- Keeping hold ---
    // What works a load loose: time, and being thrown about (hard starts and stops, sharp turns).
    const v = k.body.linvel();
    const fwd = ((v.x - this.lastVel.x) * k.forward.x + (v.z - this.lastVel.z) * k.forward.z) / dt;
    this.lastVel.set(v.x, 0, v.z);
    const turned = Math.atan2(Math.sin(k.yaw - this.lastYaw), Math.cos(k.yaw - this.lastYaw)) / dt;
    this.lastYaw = k.yaw;
    // Smoothed, so that it is the manoeuvre that counts and not each footstep.
    this.push += (fwd - this.push) * Math.min(1, dt / 0.25);
    this.swing += (turned - this.swing) * Math.min(1, dt / 0.25);
    const speed = Math.hypot(v.x, v.z);
    // (With its feet planted nothing is thrown about, however the body sways.)
    const rough = planted ? 0 : Math.min(2, Math.abs(this.push) / 45 + (Math.abs(this.swing) * speed) / 45);
    const raising = piece.state === 'raising';
    const press = input.jump && !this.wasJump;
    this.wasJump = input.jump;
    this.jolt = Math.max(0, this.jolt - dt * 1.5);

    // The bar: a marker running end to end and back, and a zone in the middle that is wider the stiller it stands.
    const wasLeft = this.bar < 0.5;
    this.barTime += dt;
    const u = (this.barTime / Math.max(0.1, t.sweep)) % 2;
    this.bar = u < 1 ? u : 2 - u;
    const still = planted ? 1 : 1 - THREE.MathUtils.clamp(speed / 12, 0, 1);
    this.zone = (t.zone / 2) * (1 + (t.zoneStill - 1) * still);
    const up = this.slipping || raising;
    if (up && wasLeft !== this.bar < 0.5) this.sim.emit('gripTick', { x: anchorX, y: anchorY, z: anchorZ });
    /** A press on the bar: 0 none, 1 in the zone, 2 dead centre, -1 a fumble. */
    let hit = 0;
    if (press && up) {
      const off = Math.abs(this.bar - 0.5);
      hit = off <= this.zone * PERFECT ? 2 : off <= this.zone ? 1 : -1;
      this.lastPress = { kind: hit === 2 ? 'perfect' : hit === 1 ? 'catch' : 'fumble', tick: this.sim.tick };
      if (hit > 0) {
        this.catches++;
        this.sim.emit('gripCatch', { x: anchorX, y: anchorY, z: anchorZ, perfect: hit === 2, heave: raising });
      } else {
        this.fumbles++;
        this.jolt = 0.35;
        this.sim.emit('gripFumble', { x: anchorX, y: anchorY, z: anchorZ });
      }
    }

    if (raising) {
      // Standing it up: every press in the zone is a heave, and a fumble lets it sag. The grip
      // only lasts so long, so it cannot be left half way.
      this.slipping = true;
      this.grip -= dt / t.heaveSeconds;
      if (hit > 0) {
        this.heaved += hit === 2 ? 1.5 : 1;
        if (hit === 2) this.heavePerfects++;
        this.grip = Math.min(1, this.grip + 0.1);
      } else if (hit < 0) {
        // It lurches back at once, and there is that much more to do.
        this.heaved = Math.max(0, this.heaved - 0.5);
        this.progress = Math.max(0, this.progress - 0.3 / Math.max(1, t.heaves));
        this.heaveFumbles++;
        this.grip -= t.fumble * 2;
      }
      const goal = THREE.MathUtils.clamp(this.heaved / Math.max(1, t.heaves), 0, 1);
      this.progress = THREE.MathUtils.clamp(this.progress + THREE.MathUtils.clamp(goal - this.progress, -dt * 0.6, dt * 1.1), 0, 1);
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
      // It shudders after a fumble.
      if (this.jolt > 0) q2.multiply(q.setFromAxisAngle(UP, Math.sin(this.clock * 31) * 0.05 * this.jolt));
      this.clock += dt;
      piece.body.setNextKinematicTranslation(a);
      piece.body.setNextKinematicRotation(q2);
      piece.tilt = (1 - s) * Math.abs(piece.job.start.roll ?? 0);
      if (this.progress >= 0.999) {
        this.held = null;
        this.slipping = false;
        k.carrying = 0;
        k.planted = false;
        piece.body.setTranslation(a, true);
        // Clean heaves, most of them dead centre, could not be bettered; a couple of fumbles and it stands skew.
        const fit: Fit = this.heaveFumbles === 0 && this.heavePerfects * 2 >= t.heaves ? 'perfect' : this.heaveFumbles >= 2 ? 'crooked' : 'straight';
        this.place(piece, 0, 0, fit);
      }
      return;
    }

    if (this.slipping) {
      // Going: catch it on the bar, or it is on the ground in a few seconds.
      if (hit > 0) {
        this.slipping = false;
        this.grip = hit === 2 ? 1.25 : 1;
      } else {
        this.grip -= (t.slipAt / t.slipTime) * dt + (hit < 0 ? t.fumble : 0);
      }
    } else {
      this.grip -= dt * (((1 - t.slipAt) / t.holdSeconds) * (planted ? 0.3 : 1) + 0.4 * t.rough * rough);
    }

    // Carried through a building, it takes the building with it, and that jolts the grip.
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
    if (!this.slipping && this.grip <= t.slipAt) {
      this.slipping = true;
      // (The marker starts from one end, so the first crossing is always a moment away.)
      this.barTime = 0;
      this.bar = 0;
      this.sim.emit('gripSlip', { x: anchorX, y: anchorY, z: anchorZ });
    }

    // Near where it belongs, it squares itself up to the place: which way the kaiju happens to
    // be facing is not the test. What letting go would do now is kept for the screen to say.
    const sock = piece.job.socket;
    const offset = Math.hypot(anchorX - sock.x, anchorZ - sock.z);
    const reachable = anchorY > sock.y - 2.5;
    this.over = offset < t.snapRadius && reachable ? this.fitAt(offset, !this.slipping) : null;
    const near = 1 - THREE.MathUtils.smoothstep(offset, t.snapRadius * 0.6, t.snapRadius * 1.8);
    const yaw = k.yaw + angleDiff(k.yaw, sock.yaw, piece.job.symmetry) * near;

    // Show it: the load tips away as the grip goes, and lurches at a fumble.
    this.leanAxis(a);
    const lean = Math.min(1, a.length());
    piece.tilt = lean * MAX_LEAN;
    q.setFromAxisAngle(UP, yaw);
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
