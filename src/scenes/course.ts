import * as THREE from 'three';
import { skybridgeFloor, type BridgeSpec, type BuildingSpec, type CityLayout, type Hazard, type PropSpec } from '../city/cityGen';
import type { Tuning } from '../core/tuning';
import { Course, type CourseSpec, type Point, type Section } from '../city/course';
import type { Damage } from '../city/damage';
import { Rng } from '../core/rng';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim } from '../sim';
import { populate } from './city';
import { addEnvironment } from './common';

/** Everything is laid out round this point, so that the course sits in the middle of the map. */
const OX = -20;
const OZ = -80;
const P = (x: number, z: number): Point => ({ x: x + OX, z: z + OZ });

const SIDEWALK = 2;
const LOT = 15;
const PALETTE = [0xc9b79c, 0xb5c4cf, 0xcfa98f, 0xa9b0b8, 0xd6c7a8, 0x9fa9b5, 0xc4a79a, 0xb7b29f, 0xbfa58a];
const CARS = [0xc23b22, 0x2a5caa, 0xe0a526, 0x2f7d4f, 0xe8e4da, 0x444a55];

/**
 * The test course: one run of about a kilometre through streets built to ask one thing each.
 * A wide boulevard to open up on, an avenue with parked cars, a street barely wider than the
 * kaiju, a pair of right-angle corners, a street crossed by skybridges too low to walk under,
 * and a stretch of ground that only takes a light step.
 */
export function courseSpec(): CourseSpec {
  const sections: Section[] = [
    { name: 'Boulevard 40m', brief: 'Wide and straight: open it up', width: 40, path: [P(0, 120)] },
    { name: 'Avenue 26m', brief: 'Parked cars down both sides', width: 26, path: [P(150, 120)] },
    { name: 'Squeeze 18m', brief: 'Barely wider than you are', width: 18, path: [P(150, -20)] },
    { name: 'Chicane 24m', brief: 'Two sharp corners', width: 24, path: [P(60, -20), P(60, -130)] },
    { name: 'Skybridges 28m', brief: 'Too low to walk under: crawl (C), or slide', width: 28, path: [P(-110, -130)] },
    { name: 'Thin ground 30m', brief: 'Cracked road and water mains: tiptoe (Shift)', width: 30, path: [P(-110, 50)] },
  ];
  return {
    name: 'Test course',
    start: P(0, 300),
    yaw: Math.PI,
    sections,
    crawlZones: [
      { ...P(0, -130), radius: 14 },
      { ...P(-55, -130), radius: 14 },
    ],
    tiptoeZones: [
      { ...P(-110, -70), radius: 20 },
      { ...P(-110, -10), radius: 20 },
    ],
  };
}

/**
 * The runner's course: short, and each leg asks for one of its moves. A straight to sprint
 * down, three low walls to jump, towers in the road to strafe round, and three low bridges
 * in a row, close enough together to take in one slide.
 */
export function runSpec(): CourseSpec {
  const sections: Section[] = [
    { name: 'Sprint 40m', brief: 'Shift to sprint', width: 40, path: [P(0, 140)] },
    { name: 'Hurdles 34m', brief: 'Low walls: jump them (Space)', width: 34, path: [P(0, -40)] },
    {
      name: 'Slalom 44m',
      brief: 'Towers in the road: strafe round them (A / D)',
      width: 44,
      path: [P(-175, -40)],
      line: [P(-34, -52), P(-68, -28), P(-102, -52), P(-136, -28), P(-175, -40)],
    },
    { name: 'Low bars 28m', brief: 'Three low bridges: crouch (C), or slide under all three at a sprint', width: 28, path: [P(-175, 150)] },
  ];
  return {
    name: 'Runner course',
    start: P(0, 270),
    yaw: Math.PI,
    sections,
    crawlZones: [
      { ...P(-175, 10), radius: 10 },
      { ...P(-175, 50), radius: 10 },
      { ...P(-175, 90), radius: 10 },
    ],
    tiptoeZones: [],
    hurdles: [P(0, 95), P(0, 45), P(0, -5)],
    pillars: [P(-34, -30), P(-68, -50), P(-102, -30), P(-136, -50)],
  };
}

interface Segment {
  a: Point;
  b: Point;
  width: number;
  section: number;
}

export function courseSegments(spec: CourseSpec): Segment[] {
  const out: Segment[] = [];
  let from = spec.start;
  spec.sections.forEach((s, section) => {
    for (const to of s.path) {
      out.push({ a: from, b: to, width: s.width, section });
      from = to;
    }
  });
  return out;
}

function distanceTo(seg: Segment, x: number, z: number): number {
  const dx = seg.b.x - seg.a.x;
  const dz = seg.b.z - seg.a.z;
  const t = THREE.MathUtils.clamp(((x - seg.a.x) * dx + (z - seg.a.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - seg.a.x - dx * t, z - seg.a.z - dz * t);
}

export function courseLayout(spec: CourseSpec, tuning: Tuning): CityLayout {
  const bridgeFloor = skybridgeFloor(tuning);
  const rng = new Rng(2026);
  const segments = courseSegments(spec);
  const buildings: BuildingSpec[] = [];
  const bridges: BridgeSpec[] = [];
  const props: PropSpec[] = [];
  const hazards: Hazard[] = [];

  /** A building goes in only if it is clear of every road and of every building already placed. */
  const place = (x: number, z: number, floors: number, own: Segment | null): number => {
    for (const seg of segments) {
      const clear = seg.width / 2 + LOT / 2 + (seg === own ? SIDEWALK - 0.1 : SIDEWALK + 1);
      if (distanceTo(seg, x, z) < clear) return -1;
    }
    if (Math.hypot(x - spec.start.x, z - spec.start.z) < 34) return -1;
    if (buildings.some((b) => Math.abs(b.x - x) < LOT + 1.5 && Math.abs(b.z - z) < LOT + 1.5)) return -1;
    buildings.push({ x, z, color: rng.pick(PALETTE), style: rng.chance(0.35) ? 'brick' : 'grid', tiers: [{ floors, w: LOT, d: LOT, nx: 2, nz: 2 }] });
    return buildings.length - 1;
  };

  // The skybridges first, each across whichever street it is on, between two buildings tall enough to carry it.
  for (const zone of spec.crawlZones) {
    const lane = segments.reduce((best, seg) => (distanceTo(seg, zone.x, zone.z) < distanceTo(best, zone.x, zone.z) ? seg : best), segments[0]);
    const off = lane.width / 2 + SIDEWALK + LOT / 2;
    const alongX = Math.abs(lane.b.x - lane.a.x) > Math.abs(lane.b.z - lane.a.z);
    const a = alongX ? place(zone.x, zone.z - off, bridgeFloor + 2, lane) : place(zone.x - off, zone.z, bridgeFloor + 2, lane);
    const b = alongX ? place(zone.x, zone.z + off, bridgeFloor + 2, lane) : place(zone.x + off, zone.z, bridgeFloor + 2, lane);
    const mid = alongX ? zone.z : zone.x;
    bridges.push({ kind: 'sky', a, b, along: alongX ? 'z' : 'x', from: mid - off + LOT / 2, to: mid + off - LOT / 2, center: alongX ? zone.x : zone.z, floor: bridgeFloor, width: 5, color: 0x8fc7d8 });
  }
  // Hurdles: a wall one floor high right across the road. Pillars: a small tower standing in it.
  for (const h of spec.hurdles ?? []) {
    const lane = segments.reduce((best, seg) => (distanceTo(seg, h.x, h.z) < distanceTo(best, h.x, h.z) ? seg : best), segments[0]);
    const alongX = Math.abs(lane.b.x - lane.a.x) > Math.abs(lane.b.z - lane.a.z);
    const cells = Math.max(2, Math.round(lane.width / 8));
    buildings.push({ x: h.x, z: h.z, color: 0xd9a441, style: 'grid', tiers: [{ floors: 1, w: alongX ? 4 : lane.width, d: alongX ? lane.width : 4, nx: alongX ? 1 : cells, nz: alongX ? cells : 1 }] });
  }
  for (const pillar of spec.pillars ?? []) {
    buildings.push({ x: pillar.x, z: pillar.z, color: rng.pick(PALETTE), style: 'grid', tiers: [{ floors: 3, w: 9, d: 9, nx: 1, nz: 1 }] });
  }

  // Then a row of buildings down each side of every street.
  for (const seg of segments) {
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    const length = Math.hypot(dx, dz);
    const ux = dx / length;
    const uz = dz / length;
    const off = seg.width / 2 + SIDEWALK + LOT / 2;
    for (let t = 8; t < length + 6; t += LOT + 4) {
      for (const side of [-1, 1]) {
        place(seg.a.x + ux * t + uz * side * off, seg.a.z + uz * t - ux * side * off, rng.int(3, 9), seg);
      }
    }
    const name = spec.sections[seg.section].name;
    const heading = Math.atan2(ux, uz);
    // Parked cars where the street is there to test steering round them.
    if (name.startsWith('Avenue') || name.startsWith('Chicane')) {
      let n = 0;
      for (let t = 20; t < length - 16; t += 13) {
        const side = n++ % 2 ? 1 : -1;
        const kerb = seg.width / 2 - 1.7;
        props.push({ kind: 'car', x: seg.a.x + ux * t + uz * side * kerb, z: seg.a.z + uz * t - ux * side * kerb, rotY: heading, color: rng.pick(CARS) });
      }
    }
    // Lamp posts down the boulevard.
    if (name.startsWith('Boulevard')) {
      for (let t = 25; t < length - 10; t += 28) {
        for (const side of [-1, 1]) {
          const kerb = seg.width / 2 + 0.9;
          props.push({ kind: 'lamp', x: seg.a.x + ux * t + uz * side * kerb, z: seg.a.z + uz * t - ux * side * kerb, rotY: heading, color: 0xffffff });
        }
      }
    }
  }

  // Thin ground: a band of cracked road right across the street, then a band of water mains.
  const [cracks, mains] = spec.tiptoeZones;
  for (const dxo of [-10, 0, 10]) {
    if (cracks) hazards.push({ kind: 'weak', x: cracks.x + dxo, z: cracks.z, radius: 7.5 });
    if (mains) hazards.push({ kind: 'main', x: mains.x + dxo, z: mains.z, radius: 2.1 });
  }

  return {
    sizeX: 360,
    sizeZ: 500,
    blocks: [],
    plazas: [],
    streets: [],
    buildings,
    bridges,
    props,
    hazards,
    jobs: [],
    sweeps: [],
    river: null,
    spawn: { x: spec.start.x, z: spec.start.z, yaw: spec.yaw },
  };
}

/** Paving, asphalt and a dashed centre line for each street, and a chequered line at the start. */
function addRoads(sim: Sim, spec: CourseSpec): void {
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x4b4f58 });
  const paving = new THREE.MeshLambertMaterial({ color: 0xb9b6ad });
  const paint = new THREE.MeshBasicMaterial({ color: 0xd8d4c0 });
  const dashes: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const seg of courseSegments(spec)) {
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    const length = Math.hypot(dx, dz);
    const heading = Math.atan2(dx, dz);
    const mid = new THREE.Vector3((seg.a.x + seg.b.x) / 2, 0, (seg.a.z + seg.b.z) / 2);
    const slab = (width: number, extra: number, y: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, length + extra), material);
      mesh.position.copy(mid).setY(y);
      mesh.rotation.y = heading;
      mesh.receiveShadow = true;
      sim.scene.add(mesh);
    };
    slab(seg.width + 2 * (SIDEWALK + LOT + 3), seg.width + 2 * (SIDEWALK + LOT + 3), -0.03, paving);
    slab(seg.width, seg.width, 0.0, asphalt);
    q.setFromAxisAngle(up, heading);
    for (let t = 6; t < length - 4; t += 9) {
      dashes.push(m.compose(new THREE.Vector3(seg.a.x + (dx / length) * t, 0.07, seg.a.z + (dz / length) * t), q, new THREE.Vector3(1, 1, 1)).clone());
    }
  }
  const dashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.02, 4), paint, dashes.length);
  dashes.forEach((d, i) => dashMesh.setMatrixAt(i, d));
  sim.scene.add(dashMesh);
  // The start line: chequers across the boulevard, a few metres ahead of where the kaiju stands.
  const first = spec.sections[0];
  const squares = Math.floor(first.width / 2);
  const line = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 0.04, 2), new THREE.MeshBasicMaterial({ color: 0xffffff }), squares * 2);
  const c = new THREE.Color();
  for (let i = 0; i < squares * 2; i++) {
    const row = i < squares ? 0 : 1;
    const col = i % squares;
    line.setMatrixAt(i, m.makeTranslation(spec.start.x - first.width / 2 + 1 + col * 2, 0.08, spec.start.z - 8 - row * 2));
    line.setColorAt(i, c.setHex((col + row) % 2 ? 0xf2f2f2 : 0x1c1f24));
  }
  sim.scene.add(line);
}

export function buildCourse(sim: Sim, spec: CourseSpec = courseSpec()): void {
  const layout = courseLayout(spec, sim.tuning);
  addEnvironment(sim, 420, null);
  addRoads(sim, spec);
  populate(sim, layout);
  sim.parts.course = sim.add(new Course(sim, spec, sim.parts.kaiju as Kaiju, sim.parts.damage as Damage));
}

export function buildRun(sim: Sim): void {
  buildCourse(sim, runSpec());
}
