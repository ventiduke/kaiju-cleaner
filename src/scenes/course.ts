import * as THREE from 'three';
import type { BridgeSpec, BuildingSpec, CityLayout, Hazard, PropSpec } from '../city/cityGen';
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

export function courseLayout(spec: CourseSpec = courseSpec()): CityLayout {
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

  // The skybridges first, each between two buildings tall enough to carry it.
  const lane = segments.find((s) => spec.sections[s.section].name.startsWith('Skybridges'))!;
  for (const zone of spec.crawlZones) {
    const off = lane.width / 2 + SIDEWALK + LOT / 2;
    const north = place(zone.x, zone.z - off, 7, lane);
    const south = place(zone.x, zone.z + off, 7, lane);
    bridges.push({ kind: 'sky', a: north, b: south, along: 'z', from: zone.z - off + LOT / 2, to: zone.z + off - LOT / 2, center: zone.x, floor: 5, width: 5, color: 0x8fc7d8 });
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
    hazards.push({ kind: 'weak', x: cracks.x + dxo, z: cracks.z, radius: 7.5 });
    hazards.push({ kind: 'main', x: mains.x + dxo, z: mains.z, radius: 2.1 });
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

export function buildCourse(sim: Sim): void {
  const spec = courseSpec();
  const layout = courseLayout(spec);
  addEnvironment(sim, 420, null);
  addRoads(sim, spec);
  populate(sim, layout);
  sim.parts.course = sim.add(new Course(sim, spec, sim.parts.kaiju as Kaiju, sim.parts.damage as Damage));
}
