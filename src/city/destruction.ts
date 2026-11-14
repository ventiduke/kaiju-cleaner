import * as THREE from 'three';
import { ALL_GROUPS, FIXED_DT, Group, groups, type RigidBody } from '../core/physics';
import type { Sim, System } from '../sim';
import { buildingChunks } from './building';
import { chunkCount, totalFloors, type BuildingSpec } from './cityGen';
import type { Damage } from './damage';
import { InstancedBodies } from './instanced';

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
  /** Bounding radius, for cheap "is it near" tests. */
  radius: number;
  body: RigidBody;
  collider: number;
  mass: number;
  state: ChunkState;
  supports: { chunk: number; area: number }[];
  dependents: number[];
  footprint: number;
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
  ) {
    const capacity = specs.reduce((n, b) => n + chunkCount(b), 0);
    this.field = new InstancedBodies(
      sim,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      capacity,
    );
    for (const spec of specs) this.addBuilding(spec);
    sim.onContactForce((a, b, force) => this.onForce(a, b, force));
  }

  private addBuilding(spec: BuildingSpec): void {
    const { R, world, tuning } = this.sim;
    const d = tuning.destruction;
    const first = this.chunks.length;
    const floors = totalFloors(spec);
    const record: BuildingRecord = {
      first,
      count: 0,
      floorTotal: new Array(floors).fill(0),
      floorFixed: new Array(floors).fill(0),
      failedFrom: Infinity,
      fellFloors: [],
    };
    const building = this.buildings.length;
    for (const c of buildingChunks(spec, tuning.city.floorHeight)) {
      const mass = 8 * c.hx * c.hy * c.hz * d.chunkDensity;
      const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(c.x, c.y, c.z));
      const collider = world.createCollider(
        R.ColliderDesc.cuboid(c.hx - 0.03, c.hy - 0.03, c.hz - 0.03)
          .setDensity(d.chunkDensity)
          .setFriction(d.friction)
          .setRestitution(0)
          .setCollisionGroups(groups(Group.CHUNK, ALL_GROUPS))
          .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
          .setContactForceEventThreshold((mass * EVENT_SPEED) / FIXED_DT),
        body,
      );
      const index = this.chunks.length;
      const supports = c.supports.map((s) => ({ chunk: first + s.chunk, area: s.area }));
      for (const s of supports) this.chunks[s.chunk].dependents.push(index);
      this.chunks.push({
        building,
        floor: c.floor,
        x: c.x,
        y: c.y,
        z: c.z,
        radius: Math.hypot(c.hx, c.hy, c.hz),
        body,
        collider: collider.handle,
        mass,
        state: ChunkState.Fixed,
        supports,
        dependents: [],
        footprint: supports.reduce((a, s) => a + s.area, 0),
        releaseAt: -1,
        stress: 0,
        stressTick: 0,
      });
      this.byCollider.set(collider.handle, index);
      this.field.add(body, c.hx * 2 - GROOVE, c.hy * 2 - GROOVE, c.hz * 2 - GROOVE, c.color);
      record.floorTotal[c.floor]++;
      record.floorFixed[c.floor]++;
      record.count++;
      this.fixedCount++;
    }
    this.buildings.push(record);
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
    if (ia !== undefined && this.chunks[ia].state === ChunkState.Fixed) this.pendingBreaks.push({ chunk: ia, other: b, force });
    if (ib !== undefined && this.chunks[ib].state === ChunkState.Fixed) this.pendingBreaks.push({ chunk: ib, other: a, force });
  }

  postStep(dt: number): void {
    this.resolveBreaks(dt);
    this.field.capture();
    this.enforceBudget(dt);
  }

  render(alpha: number): void {
    this.field.apply(alpha);
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
          hitter.cost += d.breakDrag * d.breakSpeed * c.mass;
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
          const near = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) < h.reach + c.radius + 2;
          if (near && h.pv.lengthSq() > 1) {
            h.cost += d.breakDrag * d.breakSpeed * c.mass;
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
      const cost = Math.min(h.cost, h.body.mass() * speed);
      v1.copy(h.pv).multiplyScalar(-cost / speed);
      const p = h.body.translation();
      v2.set(p.x, p.y + d.impactHeight, p.z);
      h.body.applyImpulseAtPoint(v1, v2, true);
    }
    this.brokeThisStep.length = 0;
  }

  /** Breaks every fixed chunk a kinematic shape (a foot) overlaps. Returns how many broke. */
  stomp(
    shape: InstanceType<Sim['R']['Cuboid']>,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    velocity: THREE.Vector3,
  ): number {
    const hits: number[] = [];
    this.sim.world.intersectionsWithShape(
      position,
      rotation,
      shape,
      (collider) => {
        const i = this.byCollider.get(collider.handle);
        if (i !== undefined && this.chunks[i].state === ChunkState.Fixed) hits.push(i);
        return true;
      },
      undefined,
      groups(ALL_GROUPS, Group.CHUNK),
    );
    const handoff = this.sim.tuning.destruction.handoff;
    for (const i of hits) this.loosen(i, v3.copy(velocity).multiplyScalar(handoff).clampLength(0, MAX_KICK));
    return hits.length;
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
      if (area / dep.footprint < d.supportFraction) this.schedule(di, time + d.collapseDelay);
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
          this.sim.disown(c.body);
          this.byCollider.delete(c.collider);
          this.sim.world.removeRigidBody(c.body);
          this.field.release(index);
          c.state = ChunkState.Gone;
          this.looseCount--;
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
