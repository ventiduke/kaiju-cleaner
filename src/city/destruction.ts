import * as THREE from 'three';
import { ALL_GROUPS, FIXED_DT, Group, groups, type RigidBody } from '../core/physics';
import type { Sim, System } from '../sim';
import { buildingChunks, type BoxSpec, type ChunkSpec } from './building';
import { totalFloors, type BridgeSpec, type BuildingSpec } from './cityGen';
import type { Damage } from './damage';
import { InstancedBodies, type Part } from './instanced';

export const enum ChunkState {
  Fixed,
  Loose,
  Gone,
}

export interface Chunk {
  building: number;
  floor: number;
  x: number;
  y: number;
  z: number;
  /** Bounding radius and half-size, for cheap "is it near" and "how tall" tests. */
  radius: number;
  hx: number;
  hy: number;
  hz: number;
  body: RigidBody;
  /** Collider handles: one per box. */
  colliders: number[];
  /** Sturdy pieces never crumble: they end up as rubble a kaiju can stand on. */
  sturdy: boolean;
  /** Brittle pieces turn to dust at their first hard knock once loose. */
  brittle: boolean;
  /** Where it sits in the list of loose chunks, and when it came loose. */
  slot: number;
  looseAt: number;
  mass: number;
  state: ChunkState;
  supports: { chunk: number; area: number }[];
  dependents: number[];
  footprint: number;
  /** Share of its footprint that must stay supported, where it differs from the tuned default. */
  needs?: number;
  /** Sim time at which a scheduled collapse lets this chunk go, or -1. */
  releaseAt: number;
  /** Recent pressure on the chunk (decaying sum of contact impulses), and when it was last updated. */
  stress: number;
  stressTick: number;
}

interface BuildingRecord {
  first: number;
  count: number;
  floorTotal: number[];
  floorFixed: number[];
  /** Lowest floor that has failed; everything at or above it is coming down. */
  failedFrom: number;
  /** Floors that have lost a chunk to collapse (not a direct hit). */
  fellFloors: number[];
}

/**
 * A heavy body whose momentum should carry through the things it breaks:
 * the kaiju's body and tail, and debug balls.
 */
interface Hitter {
  body: RigidBody;
  reach: number;
  pv: THREE.Vector3;
  pw: THREE.Vector3;
  pp: THREE.Vector3;
  cost: number;
  hit: boolean;
}

interface PendingBreak {
  chunk: number;
  other: number;
  force: number;
}

const SHRINK_TIME = 0.5;
const GROOVE = 0.14;
const EVENT_SPEED = 1.5;
const MAX_KICK = 32;
const MAX_DEBRIS_KICK = 10;
const STRESS_DECAY = 0.9;

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();

/**
 * Every building chunk in the scene, and the rules for breaking them.
 *
 * Chunks start as fixed bodies. One comes loose (turns dynamic) when it is hit hard
 * enough, when a foot lands in it, or when what it rests on has gone.
 */
export class ChunkField implements System {
  readonly chunks: Chunk[] = [];
  readonly buildings: BuildingRecord[] = [];
  fixedCount = 0;
  looseCount = 0;

  private field: InstancedBodies;
  readonly rubble: Rubble;
  /** Chunks that have crumbled to dust, for the HUD and tests. */
  crumbled = 0;
  private pendingCrumble: number[] = [];
  private byCollider = new Map<number, number>();
  private hitters = new Map<number, Hitter>();
  private pendingBreaks: PendingBreak[] = [];
  private scheduled: number[] = [];
  private looseOrder: number[] = [];
  private looseHead = 0;
  private shrinking: { chunk: number; t: number }[] = [];
  private looseAt: number[] = [];
  private settleHead = 0;
  private brokeThisStep: number[] = [];
  /** Chunks that fell because their support went, rather than from a direct hit. */
  fellCount = 0;
  /** The most floors any one building has lost to a collapse. */
  biggestCollapse = 0;

  constructor(
    private sim: Sim,
    private damage: Damage,
    specs: BuildingSpec[],
    bridges: BridgeSpec[] = [],
  ) {
    const bridgePieces = (b: BridgeSpec) => Math.max(2, Math.round((b.to - b.from) / sim.tuning.city.chunkSize));
    const built = specs.map((spec) => buildingChunks(spec, sim.tuning.city.floorHeight));
    const capacity =
      built.reduce((n, chunks) => n + chunks.reduce((k, c) => k + c.boxes.length, 0), 0) +
      bridges.reduce((n, b) => n + bridgePieces(b) * (b.pierDepth ? 2 : 1), 0);
    this.field = new InstancedBodies(
      sim,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      capacity,
    );
    this.rubble = new Rubble(sim);
    specs.forEach((spec, i) => this.addBuilding(spec, built[i]));
    for (const bridge of bridges) this.addBridge(bridge, bridgePieces(bridge));
    sim.onContactForce((a, b, force) => this.onForce(a, b, force));
  }

  /** Adds one chunk: a fixed body with a collider and a drawn box for each of its boxes. */
  private createChunk(
    building: number,
    spec: Pick<ChunkSpec, 'floor' | 'x' | 'y' | 'z' | 'hx' | 'hy' | 'hz' | 'boxes' | 'color' | 'sturdy'>,
    supports: Chunk['supports'],
    needs?: number,
  ): number {
    const { R, world, tuning } = this.sim;
    const d = tuning.destruction;
    let volume = 0;
    for (const b of spec.boxes) volume += 8 * b.hx * b.hy * b.hz;
    const mass = volume * d.chunkDensity;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(spec.x, spec.y, spec.z));
    const index = this.chunks.length;
    const colliders: number[] = [];
    const parts: Part[] = [];
    for (const b of spec.boxes) {
      const collider = world.createCollider(
        R.ColliderDesc.cuboid(b.hx - 0.03, b.hy - 0.03, b.hz - 0.03)
          .setTranslation(b.x - spec.x, b.y - spec.y, b.z - spec.z)
          .setDensity(d.chunkDensity)
          .setFriction(d.friction)
          .setRestitution(0)
          .setCollisionGroups(groups(Group.CHUNK, ALL_GROUPS))
          .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
          .setContactForceEventThreshold((mass * EVENT_SPEED) / FIXED_DT),
        body,
      );
      colliders.push(collider.handle);
      this.byCollider.set(collider.handle, index);
      parts.push({
        ox: b.x - spec.x,
        oy: b.y - spec.y,
        oz: b.z - spec.z,
        sx: b.hx * 2 - GROOVE,
        sy: b.hy * 2 - GROOVE,
        sz: b.hz * 2 - GROOVE,
        color: spec.color,
      });
    }
    for (const s of supports) this.chunks[s.chunk].dependents.push(index);
    this.chunks.push({
      building,
      floor: spec.floor,
      x: spec.x,
      y: spec.y,
      z: spec.z,
      radius: Math.hypot(spec.hx, spec.hy, spec.hz),
      hx: spec.hx,
      hy: spec.hy,
      hz: spec.hz,
      body,
      colliders,
      sturdy: spec.sturdy,
      brittle: false,
      slot: -1,
      looseAt: 0,
      mass,
      state: ChunkState.Fixed,
      supports,
      dependents: [],
      footprint: supports.reduce((a, s) => a + s.area, 0),
      needs,
      releaseAt: -1,
      stress: 0,
      stressTick: 0,
    });
    this.field.addCompound(body, parts);
    const record = this.buildings[building];
    record.floorTotal[spec.floor]++;
    record.floorFixed[spec.floor]++;
    record.count++;
    this.fixedCount++;
    return index;
  }

  /** A single-box chunk (bridges, piers). */
  private createBox(building: number, floor: number, box: BoxSpec, color: number, supports: Chunk['supports'], needs?: number): number {
    return this.createChunk(building, { floor, ...box, boxes: [box], color, sturdy: false }, supports, needs);
  }

  private addBuilding(spec: BuildingSpec, chunks: ChunkSpec[]): void {
    const first = this.chunks.length;
    const floors = totalFloors(spec);
    const building = this.buildings.length;
    this.buildings.push({
      first,
      count: 0,
      floorTotal: new Array(floors).fill(0),
      floorFixed: new Array(floors).fill(0),
      failedFrom: Infinity,
      fellFloors: [],
    });
    for (const c of chunks) {
      const supports = c.supports.map((s) => ({ chunk: first + s.chunk, area: s.area }));
      this.createChunk(building, c, supports);
    }
  }

  /**
   * A skybridge: a row of chunks hung between two buildings. Each piece holds onto its
   * neighbour on both sides (the end pieces onto the buildings), and needs both: break
   * one link and the span lets go piece by piece from there.
   */
  private addBridge(spec: BridgeSpec, pieces: number): void {
    const floorHeight = this.sim.tuning.city.floorHeight;
    const y = spec.y ?? floorHeight * (spec.floor + 0.5);
    const hy = (spec.thickness ?? floorHeight * 0.84) / 2;
    const anchor = (buildingIndex: number, at: number): number => {
      if (buildingIndex < 0) return -1;
      const b = this.buildings[buildingIndex];
      let best = -1;
      let bestDist = Infinity;
      for (let i = b.first; i < b.first + b.count; i++) {
        const c = this.chunks[i];
        if (c.floor !== spec.floor) continue;
        const dist = spec.along === 'x' ? Math.hypot(c.x - at, c.z - spec.center) : Math.hypot(c.z - at, c.x - spec.center);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      return best;
    };
    const start = anchor(spec.a, spec.from);
    const end = anchor(spec.b, spec.to);
    if ((spec.a >= 0 && start < 0) || (spec.b >= 0 && end < 0)) return;

    const building = this.buildings.length;
    const first = this.chunks.length;
    this.buildings.push({
      first,
      count: 0,
      floorTotal: new Array(spec.floor + 1).fill(0),
      floorFixed: new Array(spec.floor + 1).fill(0),
      failedFrom: Infinity,
      fellFloors: [],
    });
    // A little short of the gap at each end, so loose pieces drop clear instead of wedging.
    const slack = 0.3;
    const length = (spec.to - spec.from - 2 * slack) / pieces;
    const place = (along: number, halfLength: number, halfWidth: number): [number, number, number, number] =>
      spec.along === 'x' ? [along, spec.center, halfLength, halfWidth] : [spec.center, along, halfWidth, halfLength];
    const deck: number[] = [];
    for (let i = 0; i < pieces; i++) {
      // A missing span (a repair job) leaves the two halves standing on their own.
      if (i === spec.gap) {
        deck.push(-1);
        continue;
      }
      const [x, z, hx, hz] = place(spec.from + slack + length * (i + 0.5), length / 2, spec.width / 2);
      const before = i === 0 ? start : deck[i - 1];
      const supports = before >= 0 ? [{ chunk: before, area: 0.5 }] : [];
      const index = this.createBox(building, spec.floor, { x, y, z, hx, hy, hz }, spec.color, supports, 1);
      deck.push(index);
      // Link forward as well, once the next piece (or the far building) is known.
      if (i > 0 && deck[i - 1] >= 0) this.link(deck[i - 1], index);
      if (i === pieces - 1 && end >= 0) this.link(index, end);
    }
    // Road bridges stand on piers, one under each joint. Knock a pier out and the deck goes.
    if (spec.pierDepth) {
      const top = y - hy;
      const pierHalf = (top + spec.pierDepth) / 2;
      for (let i = 1; i < pieces; i++) {
        const [x, z, hx, hz] = place(spec.from + slack + length * i, 1.6, spec.width * 0.36);
        const pier = this.createBox(building, 0, { x, y: top - pierHalf, z, hx, hy: pierHalf, hz }, spec.color, []);
        if (deck[i - 1] >= 0) this.link(deck[i - 1], pier);
        if (deck[i] >= 0) this.link(deck[i], pier);
      }
    }
  }

  /** Makes `chunk` rest on `support` as well as whatever it already rests on. */
  private link(chunk: number, support: number): void {
    const c = this.chunks[chunk];
    c.supports.push({ chunk: support, area: 0.5 });
    c.footprint += 0.5;
    this.chunks[support].dependents.push(chunk);
  }

  /** Registers a heavy body so its momentum carries through what it breaks. */
  addHitter(body: RigidBody, reach: number): void {
    this.hitters.set(body.handle, {
      body,
      reach,
      pv: new THREE.Vector3(),
      pw: new THREE.Vector3(),
      pp: new THREE.Vector3(),
      cost: 0,
      hit: false,
    });
  }

  removeHitter(body: RigidBody): void {
    this.hitters.delete(body.handle);
  }

  chunkAtCollider(handle: number): Chunk | undefined {
    const i = this.byCollider.get(handle);
    return i === undefined ? undefined : this.chunks[i];
  }

  // --- System hooks ---

  preStep(): void {
    // Let go of chunks whose collapse timer has run out.
    if (this.scheduled.length) {
      const now = this.sim.time;
      let w = 0;
      for (const i of this.scheduled) {
        const c = this.chunks[i];
        if (c.state !== ChunkState.Fixed) continue;
        if (c.releaseAt <= now) this.loosen(i, null);
        else this.scheduled[w++] = i;
      }
      this.scheduled.length = w;
    }
  }

  beforePhysics(): void {
    for (const h of this.hitters.values()) {
      const v = h.body.linvel();
      const w = h.body.angvel();
      const p = h.body.translation();
      h.pv.set(v.x, v.y, v.z);
      h.pw.set(w.x, w.y, w.z);
      h.pp.set(p.x, p.y, p.z);
      h.cost = 0;
      h.hit = false;
    }
  }

  private onForce(a: number, b: number, force: number): void {
    const ia = this.byCollider.get(a);
    const ib = this.byCollider.get(b);
    // A brittle piece that is already loose goes to dust the first time it is knocked hard:
    // landing after a fall, say, or being ploughed into.
    for (const i of [ia, ib]) {
      if (i === undefined) continue;
      const c = this.chunks[i];
      if (c.state !== ChunkState.Loose || !c.brittle) continue;
      if (this.sim.time - c.looseAt < 0.2) continue;
      if (force * FIXED_DT > c.mass * this.sim.tuning.destruction.crumbleSpeed) this.pendingCrumble.push(i);
    }
    if (ia !== undefined && this.chunks[ia].state === ChunkState.Fixed) this.pendingBreaks.push({ chunk: ia, other: b, force });
    if (ib !== undefined && this.chunks[ib].state === ChunkState.Fixed) this.pendingBreaks.push({ chunk: ib, other: a, force });
  }

  postStep(dt: number): void {
    this.resolveBreaks(dt);
    if (this.pendingCrumble.length) {
      for (const i of this.pendingCrumble) this.crumble(i);
      this.pendingCrumble.length = 0;
    }
    this.field.capture();
    this.rubble.postStep();
    this.enforceBudget(dt);
  }

  render(alpha: number): void {
    this.field.apply(alpha);
    this.rubble.render(alpha);
  }

  // --- Breaking ---

  private resolveBreaks(dt: number): void {
    const d = this.sim.tuning.destruction;
    if (this.pendingBreaks.length) {
      const orphans: number[] = [];
      for (const pb of this.pendingBreaks) {
        const c = this.chunks[pb.chunk];
        if (c.state !== ChunkState.Fixed) continue;
        const impulse = pb.force * dt;
        // One hard knock breaks it; so does steady pressure that keeps coming.
        c.stress = c.stress * Math.pow(STRESS_DECAY, this.sim.tick - c.stressTick) + impulse;
        c.stressTick = this.sim.tick;
        const limit = d.breakSpeed * c.mass;
        if (impulse < limit && c.stress < limit * d.crush) continue;
        const otherBody = this.sim.world.getCollider(pb.other)?.parent();
        const hitter = otherBody ? this.hitters.get(otherBody.handle) : undefined;
        if (hitter) {
          // Kick the chunk with the hitter's own pre-contact velocity at that point.
          v1.set(c.x, c.y, c.z).sub(hitter.pp);
          v2.copy(hitter.pw).cross(v1).add(hitter.pv).multiplyScalar(d.handoff).clampLength(0, MAX_KICK);
          hitter.cost += d.crunch;
          hitter.hit = true;
          this.loosen(pb.chunk, v2);
        } else {
          // Hit by loose debris or a prop: push it away from whatever struck it.
          if (otherBody) {
            const p = otherBody.translation();
            v2.set(c.x - p.x, c.y - p.y, c.z - p.z).normalize();
          } else v2.set(0, -1, 0);
          v2.multiplyScalar(Math.min((impulse / c.mass) * d.handoff, MAX_DEBRIS_KICK));
          this.loosen(pb.chunk, v2);
          orphans.push(pb.chunk);
        }
      }
      this.pendingBreaks.length = 0;

      // A chunk broken through a sandwich of debris still counts against the heavy body pushing it.
      for (const i of orphans) {
        const c = this.chunks[i];
        for (const h of this.hitters.values()) {
          const p = h.body.translation();
          // Near enough to be the far side of one chunk-thick sandwich.
          const near = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) < h.reach + c.radius * 2.5;
          if (near && h.pv.lengthSq() > 1) {
            h.cost += d.crunch;
            h.hit = true;
          }
        }
      }
    }

    // The fixed chunk swallowed the hitter's momentum for one step. Put it all back, then charge
    // the cost of the break as an impulse above its centre: it slows, and is knocked back a little.
    for (const h of this.hitters.values()) {
      if (!h.hit || !h.body.isDynamic()) continue;
      const speed = h.pv.length();
      if (speed < 1e-3) continue;
      h.body.setLinvel(h.pv, true);
      h.body.setAngvel(h.pw, true);
      // `cost` is in m/s: the speed lost to everything broken this step.
      const cost = h.body.mass() * Math.min(h.cost, speed);
      v1.copy(h.pv).multiplyScalar(-cost / speed);
      const p = h.body.translation();
      // Never outside the body itself: a ball has no head to be knocked back by.
      v2.set(p.x, p.y + Math.min(d.impactHeight, h.reach * 0.9), p.z);
      h.body.applyImpulseAtPoint(v1, v2, true);
    }
    this.brokeThisStep.length = 0;
  }

  /**
   * A foot (or a carried load) coming through: breaks every fixed chunk the shape overlaps
   * and boots loose ones out of the way (feet don't collide with chunks physically).
   * A foot coming down to land crushes what it lands on instead: brittle pieces and small
   * rubble go to dust, and only the sturdy lumps are left to stand on.
   * Returns how many fixed chunks broke.
   */
  stomp(
    shape: InstanceType<Sim['R']['Cuboid']>,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    velocity: THREE.Vector3,
    landing = false,
  ): number {
    const fixed: number[] = [];
    const loose: number[] = [];
    const bits: number[] = [];
    this.sim.world.intersectionsWithShape(
      position,
      rotation,
      shape,
      (collider) => {
        const i = this.byCollider.get(collider.handle);
        if (i === undefined) {
          const bit = this.rubble.at(collider.handle);
          if (bit >= 0) bits.push(bit);
          return true;
        }
        const state = this.chunks[i].state;
        if (state === ChunkState.Fixed) fixed.push(i);
        else if (state === ChunkState.Loose && !loose.includes(i)) loose.push(i);
        return true;
      },
      undefined,
      groups(ALL_GROUPS, Group.CHUNK),
    );
    const handoff = this.sim.tuning.destruction.handoff;
    v3.copy(velocity).multiplyScalar(handoff).clampLength(0, MAX_KICK);
    for (const i of fixed) this.loosen(i, v3);
    for (const bit of bits) {
      if (landing) this.rubble.crush(bit);
      else this.rubble.kick(bit, v3);
    }
    for (const i of loose) {
      const c = this.chunks[i];
      if (c.state !== ChunkState.Loose) continue;
      if (landing) {
        // Underfoot: anything that isn't sturdy is ground to dust.
        if (!c.sturdy) this.crumble(i);
        continue;
      }
      // Sturdy lumps stay where they are, to be stepped on; the rest is booted along.
      if (c.sturdy) continue;
      const body = c.body;
      v1.copy(v3);
      v1.y = Math.max(v1.y, 2);
      const v = body.linvel();
      // Only ever speed a piece up; a chunk already flying faster is left alone.
      if (v1.lengthSq() > v.x * v.x + v.y * v.y + v.z * v.z) body.setLinvel(v1, true);
    }
    return fixed.length;
  }

  /**
   * The top of the highest sturdy lump of rubble under a shape, or -Infinity if there is none.
   * It is what a landing foot ends up standing on.
   */
  footing(shape: InstanceType<Sim['R']['Cuboid']>, position: THREE.Vector3, rotation: THREE.Quaternion): number {
    let top = -Infinity;
    this.sim.world.intersectionsWithShape(
      position,
      rotation,
      shape,
      (collider) => {
        const i = this.byCollider.get(collider.handle);
        if (i === undefined) return true;
        const c = this.chunks[i];
        if (c.state !== ChunkState.Loose || !c.sturdy) return true;
        // Only rubble that has come to rest counts as ground.
        const v = c.body.linvel();
        if (v.x * v.x + v.y * v.y + v.z * v.z > 12) return true;
        // Height of its bounding box however it has ended up lying.
        const r = c.body.rotation();
        const yx = 2 * (r.x * r.y + r.w * r.z);
        const yy = 1 - 2 * (r.x * r.x + r.z * r.z);
        const yz = 2 * (r.y * r.z - r.w * r.x);
        const half = Math.abs(yx) * c.hx + Math.abs(yy) * c.hy + Math.abs(yz) * c.hz;
        top = Math.max(top, c.body.translation().y + half);
        return true;
      },
      undefined,
      groups(ALL_GROUPS, Group.CHUNK),
    );
    return top;
  }

  /** The ground has given way at a point: ground-floor chunks within reach come loose. */
  shake(x: number, z: number, radius: number): number {
    let broke = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (c.state !== ChunkState.Fixed || c.floor !== 0) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > radius + Math.max(c.hx, c.hz)) continue;
      v1.set((c.x - x) / Math.max(d, 0.1), 0.6, (c.z - z) / Math.max(d, 0.1)).multiplyScalar(4);
      this.loosen(i, v1);
      broke++;
    }
    return broke;
  }

  /**
   * A blast of air from a point (a sneeze): fixed chunks close in front break, and anything
   * loose within range is thrown along with it.
   */
  blast(origin: THREE.Vector3, dir: THREE.Vector3, range: number, spread: number, power: number): number {
    let broke = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (c.state === ChunkState.Gone) continue;
      const p = c.state === ChunkState.Fixed ? c : c.body.translation();
      v1.set(p.x - origin.x, p.y - origin.y, p.z - origin.z);
      const dist = v1.length();
      if (dist > range || dist < 0.01) continue;
      const along = (v1.x * dir.x + v1.z * dir.z) / dist;
      if (along < spread) continue;
      const fall = 1 - dist / range;
      v2.copy(dir).multiplyScalar(power * fall);
      v2.y = power * 0.35 * fall;
      if (c.state === ChunkState.Fixed) {
        // Only the nearest wall goes; the gale behind it shakes the rest.
        if (dist < range * 0.45) {
          this.loosen(i, v2);
          broke++;
        }
      } else {
        const v = c.body.linvel();
        c.body.setLinvel({ x: v.x + v2.x, y: v.y + v2.y, z: v.z + v2.z }, true);
      }
    }
    this.rubble.blast(origin, dir, range, spread, power);
    return broke;
  }

  /** Turns a fixed chunk dynamic and lets the collapse rules react. */
  loosen(index: number, velocity: THREE.Vector3 | null): void {
    const c = this.chunks[index];
    if (c.state !== ChunkState.Fixed) return;
    const { R, tuning, time } = this.sim;
    const d = tuning.destruction;
    c.state = ChunkState.Loose;
    c.releaseAt = -1;
    c.body.setBodyType(R.RigidBodyType.Dynamic, true);
    c.body.setLinearDamping(d.debrisLinearDamping);
    c.body.setAngularDamping(d.debrisAngularDamping);
    if (velocity) c.body.setLinvel(velocity, true);
    // A little spin so falling pieces tumble instead of dropping like a lift.
    const spin = velocity ? 0.6 : 0.25;
    c.body.setAngvel(
      { x: pseudo(index * 3 + 1) * spin, y: pseudo(index * 3 + 2) * spin, z: pseudo(index * 3 + 3) * spin },
      true,
    );
    this.fixedCount--;
    this.looseCount++;
    c.slot = this.looseOrder.length;
    c.looseAt = time;
    // Which pieces are brittle is fixed by the piece, not by chance on the day.
    c.brittle = !c.sturdy && (pseudo(index * 7 + 5) + 1) / 2 < d.crumbleChance;
    this.looseOrder.push(index);
    this.looseAt.push(time);
    this.brokeThisStep.push(index);
    this.damage.chunk(c.building);
    this.sim.emit('chunkBreak', { x: c.x, y: c.y, z: c.z, size: c.radius });
    const b = this.buildings[c.building];
    if (!velocity) {
      this.fellCount++;
      if (!b.fellFloors.includes(c.floor)) {
        b.fellFloors.push(c.floor);
        this.biggestCollapse = Math.max(this.biggestCollapse, b.fellFloors.length);
      }
    }

    // Anything resting on this chunk may now be under-supported.
    for (const di of c.dependents) {
      const dep = this.chunks[di];
      if (dep.state !== ChunkState.Fixed) continue;
      let area = 0;
      for (const s of dep.supports) if (this.chunks[s.chunk].state === ChunkState.Fixed) area += s.area;
      if (area / dep.footprint < (dep.needs ?? d.supportFraction)) this.schedule(di, time + d.collapseDelay);
    }

    // A floor that has lost too many pieces fails, and takes everything above with it.
    b.floorFixed[c.floor]--;
    if (c.floor < b.failedFrom && b.floorFixed[c.floor] / b.floorTotal[c.floor] < d.floorFailFraction) {
      b.failedFrom = c.floor;
      for (let i = b.first; i < b.first + b.count; i++) {
        const o = this.chunks[i];
        if (o.state === ChunkState.Fixed && o.floor >= c.floor) {
          this.schedule(i, time + d.collapseDelay * (o.floor - c.floor + 1));
        }
      }
    }
  }

  private schedule(index: number, at: number): void {
    const c = this.chunks[index];
    if (c.releaseAt < 0) {
      c.releaseAt = at;
      this.scheduled.push(index);
    } else if (at < c.releaseAt) c.releaseAt = at;
  }

  /** Takes a loose chunk out of the world at once. */
  private retire(index: number): void {
    const c = this.chunks[index];
    if (c.state !== ChunkState.Loose) return;
    this.sim.disown(c.body);
    for (const h of c.colliders) this.byCollider.delete(h);
    this.sim.world.removeRigidBody(c.body);
    this.field.release(index);
    c.state = ChunkState.Gone;
    this.looseCount--;
    if (c.slot >= 0) this.looseOrder[c.slot] = -1;
  }

  /**
   * A loose chunk goes to dust, leaving a little rubble behind (or none, if `clean`).
   * Does nothing to fixed chunks or sturdy ones.
   */
  crumble(index: number, clean = false): void {
    const c = this.chunks[index];
    if (c.state !== ChunkState.Loose || c.sturdy) return;
    const p = c.body.translation();
    const v = c.body.linvel();
    this.sim.emit('chunkCrumble', { x: p.x, y: p.y, z: p.z, size: c.radius });
    if (!clean) {
      const d = this.sim.tuning.destruction;
      const bits = Math.floor(d.rubbleBits + (pseudo(index * 13 + 1) + 1) / 2);
      for (let k = 0; k < bits; k++) {
        const size = Math.min(c.hx, c.hy, c.hz) * (0.35 + 0.3 * ((pseudo(index * 5 + k) + 1) / 2));
        this.rubble.spawn(
          p.x + pseudo(index + k * 3) * c.hx * 0.6,
          p.y + pseudo(index + k * 7) * c.hy * 0.4,
          p.z + pseudo(index + k * 11) * c.hz * 0.6,
          size,
          v.x * 0.5 + pseudo(index * 3 + k) * 3,
          v.y * 0.5 + 2,
          v.z * 0.5 + pseudo(index * 9 + k) * 3,
        );
      }
    }
    this.retire(index);
    this.crumbled++;
  }

  /**
   * Clears rubble the river has taken: anything carried beyond `limit` metres east or west,
   * and anything that has been bobbing about in the water (below `surface`, between the
   * banks) for more than `soak` seconds, which would otherwise pile up against the bridges.
   */
  sweepRiver(limit: number, z0: number, z1: number, surface: number, soak: number): void {
    const now = this.sim.time;
    for (let k = this.looseHead; k < this.looseOrder.length; k++) {
      const i = this.looseOrder[k];
      if (i < 0) continue;
      const c = this.chunks[i];
      if (c.state !== ChunkState.Loose) continue;
      const p = c.body.translation();
      const inWater = p.z > z0 && p.z < z1 && p.y < surface;
      if (Math.abs(p.x) > limit || (inWater && now - this.looseAt[k] > soak)) {
        this.looseOrder[k] = -1;
        this.retire(i);
      }
    }
  }

  // --- Debris budget ---

  private enforceBudget(dt: number): void {
    const d = this.sim.tuning.destruction;
    const cap = d.debrisCap;
    if (this.sim.tick % 10 === 0) {
      // Debris that has had its moment gets heavy damping, so rubble piles go quiet and sleep.
      while (this.settleHead < this.looseAt.length && this.looseAt[this.settleHead] < this.sim.time - d.settleAfter) {
        const i = this.looseOrder[this.settleHead++];
        if (i < 0) continue;
        const c = this.chunks[i];
        if (c.state !== ChunkState.Loose) continue;
        c.body.setLinearDamping(Math.max(d.debrisLinearDamping, 0.9));
        c.body.setAngularDamping(Math.max(d.debrisAngularDamping, 3));
      }
      let over = this.looseCount - this.shrinking.length - cap;
      // Oldest first; prefer pieces that have already come to rest.
      for (const pass of [0, 1]) {
        for (let k = this.looseHead; k < this.looseOrder.length && over > 0; k++) {
          const i = this.looseOrder[k];
          if (i < 0) continue;
          const c = this.chunks[i];
          if (pass === 0 && !c.body.isSleeping()) continue;
          this.looseOrder[k] = -1;
          this.shrinking.push({ chunk: i, t: 0 });
          over--;
        }
      }
      while (this.looseHead < this.looseOrder.length && this.looseOrder[this.looseHead] < 0) this.looseHead++;
    }
    if (this.shrinking.length) {
      let w = 0;
      for (const s of this.shrinking) {
        s.t += dt;
        const c = this.chunks[s.chunk];
        const index = s.chunk;
        if (s.t >= SHRINK_TIME) {
          this.retire(index);
        } else if (c.state !== ChunkState.Loose) {
          // Already gone some other way (washed downstream, crushed).
        } else {
          this.field.setShrink(index, 1 - s.t / SHRINK_TIME);
          this.shrinking[w++] = s;
        }
      }
      this.shrinking.length = w;
    }
  }
}

/** Cheap deterministic value in [-1, 1] from an integer. */
function pseudo(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

const RUBBLE_COLORS = [0x8f8a80, 0x9c968a, 0x7d786f, 0xa6a094];

/**
 * Small rubble: the bits left when a chunk crumbles. Light, quick to settle, kicked about
 * by feet in passing and ground to nothing by a foot landing on them. There is a fixed
 * pool; when it is full the oldest bit is recycled.
 */
class Rubble {
  private field: InstancedBodies;
  private bodies: (RigidBody | null)[] = [];
  private byCollider = new Map<number, number>();
  private next = 0;
  private capacity: number;
  count = 0;
  crushed = 0;

  constructor(private sim: Sim) {
    this.capacity = Math.max(1, Math.round(sim.tuning.destruction.rubbleCap));
    this.field = new InstancedBodies(
      sim,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      this.capacity,
    );
  }

  /** The rubble bit a collider belongs to, or -1. */
  at(collider: number): number {
    return this.byCollider.get(collider) ?? -1;
  }

  spawn(x: number, y: number, z: number, size: number, vx: number, vy: number, vz: number): void {
    if (this.sim.tuning.destruction.rubbleCap < 1) return;
    const { R, world } = this.sim;
    const slot = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.remove(slot);
    const s = Math.max(0.6, size);
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(x, Math.max(y, s), z)
        .setLinvel(vx, vy, vz)
        .setAngvel({ x: pseudo(slot * 3 + this.crushed) * 3, y: pseudo(slot * 5) * 3, z: pseudo(slot * 7) * 3 })
        .setLinearDamping(0.6)
        .setAngularDamping(1.5),
    );
    const collider = world.createCollider(
      R.ColliderDesc.cuboid(s, s * 0.7, s * 0.85)
        .setDensity(this.sim.tuning.destruction.chunkDensity)
        .setFriction(0.9)
        .setRestitution(0)
        .setCollisionGroups(groups(Group.CHUNK, ALL_GROUPS & ~Group.FOOT)),
      body,
    );
    this.byCollider.set(collider.handle, slot);
    const color = RUBBLE_COLORS[slot % RUBBLE_COLORS.length];
    if (slot < this.field.count) this.field.reuse(slot, body, s * 2, s * 1.4, s * 1.7, color);
    else this.field.add(body, s * 2, s * 1.4, s * 1.7, color);
    this.bodies[slot] = body;
    this.count++;
  }

  private remove(slot: number): void {
    const body = this.bodies[slot];
    if (!body) return;
    this.byCollider.delete(body.collider(0).handle);
    this.sim.disown(body);
    this.sim.world.removeRigidBody(body);
    this.field.release(slot);
    this.bodies[slot] = null;
    this.count--;
  }

  /** Ground to dust underfoot. */
  crush(slot: number): void {
    const body = this.bodies[slot];
    if (!body) return;
    const p = body.translation();
    this.sim.emit('chunkCrumble', { x: p.x, y: p.y, z: p.z, size: 2 });
    this.remove(slot);
    this.crushed++;
  }

  kick(slot: number, velocity: THREE.Vector3): void {
    const body = this.bodies[slot];
    if (!body) return;
    body.setLinvel({ x: velocity.x, y: Math.max(velocity.y, 3), z: velocity.z }, true);
  }

  blast(origin: THREE.Vector3, dir: THREE.Vector3, range: number, spread: number, power: number): void {
    for (const body of this.bodies) {
      if (!body) continue;
      const p = body.translation();
      const dx = p.x - origin.x;
      const dz = p.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 0.01 || (dx * dir.x + dz * dir.z) / dist < spread) continue;
      const fall = power * (1 - dist / range);
      body.setLinvel({ x: dir.x * fall, y: fall * 0.4, z: dir.z * fall }, true);
    }
  }

  postStep(): void {
    this.field.capture();
  }

  render(alpha: number): void {
    this.field.apply(alpha);
  }
}
