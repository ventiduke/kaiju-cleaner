import * as THREE from 'three';
import {
  addRubble,
  busJob,
  inWater,
  monumentJob,
  reachFloors,
  type BridgeSpec,
  type BuildingSpec,
  type CityLayout,
  type Hazard,
  type JobSpec,
  type PieceBox,
  type PropSpec,
  type Rect,
  type Street,
  type SweepSpec,
  type Tier,
  type Water,
} from '../city/cityGen';
import { Rng } from '../core/rng';
import { DIFFICULTY, type Tuning } from '../core/tuning';
import { addOutskirts } from '../gfx/backdrop';
import type { Look } from '../gfx/look';
import type { Sim } from '../sim';
import { addStreets, populate } from './city';
import { addEnvironment } from './common';

/**
 * Chicago: the Loop, the river and the lake front.
 *
 * It is drawn from a real map (see `research/chicago-map/`): the streets are the real ones in
 * their real order, the river forks where it forks, the lake is where the lake is, and each
 * landmark stands on the block it stands on. What is not real is the scale. The Loop is a
 * kilometre across and its towers are 300 to 440 m tall, which is no place for a 21 m kaiju,
 * so the map is drawn like a transit map: about one third size across the ground, with
 * streets widened enough to walk down, a few of the lesser streets left out (Franklin,
 * Washington, Monroe, and all but Grand of the streets between Kinzie and Chicago Avenue), and
 * towers at about one sixteenth of their height. Their order by height is kept.
 *
 * North is -z and east is +x, as in every scene.
 */

/** One stretch of an axis: a street, a row or column of blocks, or a strip of water. */
interface Span {
  kind: 'street' | 'block' | 'water' | 'verge';
  name: string;
  size: number;
}
interface Placed extends Span {
  from: number;
  to: number;
  center: number;
}

const st = (name: string, size: number): Span => ({ kind: 'street', name, size });
const bk = (name: string, size = 30): Span => ({ kind: 'block', name, size });

/** West to east. The block columns are lettered; the streets are the real ones. */
const COLUMNS: Span[] = [
  st('Canal', 24),
  bk('A'),
  { kind: 'water', name: 'branch', size: 40 },
  st('Wacker', 34),
  bk('B'),
  st('Wells', 24),
  bk('C'),
  st('LaSalle', 30),
  bk('D'),
  st('Clark', 22),
  bk('E'),
  st('Dearborn', 24),
  bk('F'),
  st('State', 34),
  bk('G'),
  st('Wabash', 24),
  bk('H'),
  st('Michigan', 44),
  bk('I', 34),
  st('Columbus', 30),
  bk('J', 34),
  st('Lake Shore', 36),
  { kind: 'verge', name: 'shore', size: 12 },
  // (Open lake, as far as Navy Pier reaches. Beyond the site it goes on to the horizon.)
  { kind: 'water', name: 'lake', size: 150 },
];

/** North to south. The block rows are numbered. */
const ROWS: Span[] = [
  bk('0'),
  st('Chicago', 30),
  bk('1'),
  st('Grand', 24),
  bk('2'),
  st('Kinzie', 22),
  bk('3'),
  { kind: 'water', name: 'river', size: 56 },
  st('Wacker Drive', 34),
  bk('4'),
  st('Lake', 24),
  bk('5'),
  st('Randolph', 24),
  bk('6'),
  st('Madison', 26),
  bk('7'),
  st('Adams', 24),
  bk('8'),
  st('Jackson', 26),
  bk('9'),
  st('Van Buren', 24),
  bk('10'),
  st('Congress', 40),
  bk('11'),
  st('Harrison', 26),
];

function lay(spans: Span[]): Placed[] {
  const total = spans.reduce((sum, s) => sum + s.size, 0);
  let cursor = -total / 2;
  return spans.map((s) => {
    const placed = { ...s, from: cursor, to: cursor + s.size, center: cursor + s.size / 2 };
    cursor += s.size;
    return placed;
  });
}

/** A landmark: which block it stands on, what it is made of, and what the real one is. */
interface Landmark {
  name: string;
  /** Block column and row (see `COLUMNS`, `ROWS`), and where on the block, as a share of it from the centre (-0.5..0.5). */
  col: string;
  row: string;
  dx?: number;
  dz?: number;
  /** Height of the real one (m), for the record and for keeping the order right. */
  metres: number;
  color: number;
  style?: BuildingSpec['style'];
  /** Bottom-up: floors, footprint (m), and chunks across and deep. */
  tiers: [number, number, number, number, number][];
}

const BLACK = 0x2a2d33;
const LANDMARKS: Landmark[] = [
  // The Loop.
  { name: 'Willis Tower', col: 'B', row: '8', metres: 442, color: BLACK, tiers: [[14, 26, 26, 3, 3], [7, 17.4, 17.4, 2, 2], [5, 8.7, 17.4, 1, 2], [3, 3, 3, 1, 1]] },
  { name: '311 South Wacker', col: 'B', row: '9', metres: 293, color: 0xc79a8f, tiers: [[15, 18, 18, 2, 2], [3, 9, 9, 1, 1]] },
  { name: 'Chicago Board of Trade', col: 'LaSalle', row: '9', metres: 184, color: 0xa8a39a, tiers: [[5, 26, 26, 3, 3], [5, 17.4, 17.4, 2, 2], [2, 8.7, 8.7, 1, 1]] },
  { name: 'The Rookery', col: 'D', row: '8', metres: 55, color: 0x7a4638, style: 'brick', tiers: [[4, 26, 26, 3, 3]] },
  { name: 'Daley Center', col: 'E', row: '6', dz: -0.22, metres: 198, color: 0x6b4a3a, tiers: [[12, 26, 14, 3, 2]] },
  { name: 'Chase Tower', col: 'E', row: '7', metres: 259, color: 0x8f9296, tiers: [[2, 26, 20, 3, 2], [14, 26, 13, 3, 2]] },
  { name: 'Harold Washington Library', col: 'F', row: '10', metres: 50, color: 0x9c4a3a, style: 'brick', tiers: [[4, 26, 26, 3, 3]] },
  { name: 'Chicago Cultural Center', col: 'H', row: '6', metres: 32, color: 0xbcb7ab, tiers: [[3, 26, 26, 3, 3]] },
  { name: 'Union Station', col: 'A', row: '8', metres: 35, color: 0xb0aba0, tiers: [[3, 26, 26, 3, 3]] },
  // East of Michigan Avenue.
  { name: 'Aon Center', col: 'J', row: '5', metres: 346, color: 0xe8e6df, tiers: [[22, 17.4, 17.4, 2, 2]] },
  { name: 'Two Prudential Plaza', col: 'I', row: '5', metres: 303, color: 0x9a9fa6, tiers: [[15, 17.4, 17.4, 2, 2], [3, 8.7, 8.7, 1, 1], [2, 3, 3, 1, 1]] },
  { name: 'Aqua', col: 'I', row: '4', metres: 262, color: 0xcfe3ea, tiers: [[16, 17.4, 17.4, 2, 2]] },
  { name: 'St. Regis Chicago', col: 'J', row: '4', metres: 363, color: 0x6fa7a8, tiers: [[14, 26, 14, 3, 2], [5, 17.4, 14, 2, 2], [4, 8.7, 14, 1, 2]] },
  { name: 'Art Institute of Chicago', col: 'I', row: '7', dx: -0.1, metres: 24, color: 0xb9b4a8, tiers: [[2, 24, 26, 3, 3]] },
  // North of the river.
  { name: 'Merchandise Mart', col: 'B', row: '3', metres: 104, color: 0xcdbf9f, tiers: [[6, 26, 26, 3, 3], [1, 8.7, 8.7, 1, 1]] },
  { name: 'Marina City (west)', col: 'F', row: '3', dx: -0.24, metres: 179, color: 0xd8c9a8, style: 'fine', tiers: [[11, 11, 11, 2, 2]] },
  { name: 'Marina City (east)', col: 'F', row: '3', dx: 0.24, metres: 179, color: 0xd8c9a8, style: 'fine', tiers: [[11, 11, 11, 2, 2]] },
  { name: 'Trump Tower', col: 'G', row: '3', metres: 423, color: 0x9db7c9, tiers: [[10, 26, 20, 3, 2], [8, 17.4, 20, 2, 2], [6, 8.7, 20, 1, 2], [3, 3, 3, 1, 1]] },
  { name: 'Wrigley Building', col: 'H', row: '3', metres: 130, color: 0xf2efe6, tiers: [[6, 26, 22, 3, 3], [3, 8.7, 8.7, 1, 1]] },
  { name: 'Tribune Tower', col: 'I', row: '3', dx: -0.12, metres: 141, color: 0xb8b3a6, tiers: [[8, 18, 18, 2, 2], [2, 9, 9, 1, 1]] },
  { name: '875 North Michigan (John Hancock Center)', col: 'I', row: '0', metres: 344, color: BLACK, tiers: [[7, 26, 20, 3, 2], [7, 20, 16, 2, 2], [5, 14, 12, 2, 2], [3, 3, 3, 1, 1]] },
];

/** Blocks that are open ground: the lake-front parks, and the plazas the landmarks stand back from. */
const PARKS: [string, string][] = [
  ['I', '6'], // Millennium Park (Cloud Gate)
  ['J', '6'],
  ['J', '7'], // Grant Park
  ['I', '8'],
  ['J', '8'],
  ['I', '9'],
  ['J', '9'],
  ['I', '10'],
  ['J', '10'], // Buckingham Fountain
  ['I', '11'],
  ['J', '11'],
];
/** Blocks left empty (off the edge of what this map covers). */
const EMPTY: [string, string][] = [
  ...['0', '1', '2', '3', '4', '5', '10', '11'].map((r): [string, string] => ['A', r]),
  ...['B', 'C', 'D', 'E', 'F'].map((c): [string, string] => [c, '0']),
  ['J', '0'],
  ['J', '1'],
  ['B', '11'],
  ['C', '11'],
  ['H', '11'],
];

/** The streets that are not "Something Street". */
const STREET_NAMES: Record<string, string> = {
  Wacker: 'Wacker Drive',
  'Wacker Drive': 'Wacker Drive',
  Michigan: 'Michigan Avenue',
  Wabash: 'Wabash Avenue',
  Columbus: 'Columbus Drive',
  'Lake Shore': 'Lake Shore Drive',
  Chicago: 'Chicago Avenue',
  Grand: 'Grand Avenue',
  Congress: 'Congress Parkway',
};

export interface ChicagoLayout extends CityLayout {
  /** The landmarks, by name, for the map, the tests and anything that wants to label them. */
  landmarks: NonNullable<CityLayout['landmarks']>;
  /** The rectangles of land (for the asphalt), and of park (for the grass). */
  paved: Rect[];
  parks: Rect[];
}

/** A carried piece in the shape of a building's top storey: a low drum on a square base. */
function crown(w: number, color: number, cap: number): { boxes: PieceBox[]; height: number } {
  const h = w / 4;
  const boxes: PieceBox[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxes.push({ x: sx * h, y: 1.5, z: sz * h, hx: h, hy: 1.5, hz: h, color });
  boxes.push({ x: 0, y: 4.5, z: 0, hx: h * 1.3, hy: 1.5, hz: h * 1.3, color: cap });
  boxes.push({ x: 0, y: 6.6, z: 0, hx: h * 0.7, hy: 0.6, hz: h * 0.7, color: cap });
  return { boxes, height: 7.2 };
}

/** Cloud Gate: a polished steel bean, twenty metres long in life and a good armful here. */
function bean(): { boxes: PieceBox[]; height: number } {
  const steel = [0xcfd6dd, 0xb9c2cb, 0xe3e8ec];
  return {
    boxes: [
      { x: 0, y: 2.9, z: 0, hx: 2.6, hy: 1.5, hz: 5.2, color: steel[0] },
      { x: 0, y: 4.5, z: 0, hx: 2.1, hy: 0.6, hz: 4.2, color: steel[2] },
      { x: 0, y: 1.0, z: -4.1, hx: 2.3, hy: 1.0, hz: 1.4, color: steel[1] },
      { x: 0, y: 1.0, z: 4.1, hx: 2.3, hy: 1.0, hz: 1.4, color: steel[1] },
    ],
    height: 5.1,
  };
}

export function chicagoLayout(tuning: Tuning): ChicagoLayout {
  const cfg = tuning.city;
  // (1837: the year the city was incorporated. A later shift changes the ordinary buildings, never the map.)
  const rng = new Rng(1837 + cfg.seed);
  // Harder levels pull the streets in here too: the narrow ones most.
  const level = DIFFICULTY[Math.round(tuning.game.difficulty)] ?? DIFFICULTY[0];
  const least = tuning.kaiju.bodyRadius * 2 + 6;
  const narrowed = (s: Span): Span =>
    s.kind === 'street' ? { ...s, size: Math.max(least, Math.round(s.size * level.streets[s.size >= 34 ? 0 : s.size >= 26 ? 1 : 2])) } : s;
  const cols = lay(COLUMNS.map(narrowed));
  const rows = lay(ROWS.map(narrowed));
  const col = (name: string) => cols.find((c) => c.name === name)!;
  const row = (name: string) => rows.find((r) => r.name === name)!;
  const X = (name: string) => col(name).center;
  const Z = (name: string) => row(name).center;
  const sizeX = cols[cols.length - 1].to - cols[0].from;
  const sizeZ = rows[rows.length - 1].to - rows[0].from;
  const west = cols[0].from;
  const north = rows[0].from;
  const south = rows[rows.length - 1].to;
  const FAR = 4000;

  // --- Water: the river's main branch, the north-south branch it forks into, and the lake.
  // (Deep enough to wade at the size the kaiju is, not the 13 m the first city's river was dug for a giant.)
  const depth = Math.min(cfg.riverDepth, Math.round(tuning.kaiju.legLength * 1.4));
  const branch = col('branch');
  const river = row('river');
  const shore = col('lake').from;
  // Navy Pier runs out into the lake from the foot of Grand Avenue.
  const pier = { x0: shore, x1: shore + 118, z0: Z('Grand') - 13, z1: Z('Grand') + 13 };
  const waters: Water[] = [
    { x0: branch.from, x1: branch.to, z0: -FAR, z1: FAR, depth },
    { x0: branch.to, x1: shore, z0: river.from, z1: river.to, depth },
    { x0: shore, x1: FAR, z0: -FAR, z1: pier.z0, depth },
    { x0: shore, x1: FAR, z0: pier.z1, z1: FAR, depth },
    { x0: pier.x1, x1: FAR, z0: pier.z0, z1: pier.z1, depth },
  ];
  const span = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });
  const paved: Rect[] = [
    span(west, branch.from, north, south),
    span(branch.to, shore, north, river.from),
    span(branch.to, shore, river.to, south),
    span(pier.x0, pier.x1, pier.z0, pier.z1),
  ];

  // --- Streets. (Each runs the length of the map; the water and the parks interrupt them on the ground.)
  const streets: Street[] = [];
  const called = (name: string) => (STREET_NAMES[name] ?? `${name} Street`);
  for (const c of cols) if (c.kind === 'street') streets.push({ along: 'z', center: c.center, width: c.size, name: called(c.name) });
  for (const r of rows) if (r.kind === 'street') streets.push({ along: 'x', center: r.center, width: r.size, name: called(r.name) });

  // --- Blocks.
  const is = (list: [string, string][], c: string, r: string) => list.some(([lc, lr]) => lc === c && lr === r);
  const blocks: Rect[] = [];
  const plazas: Rect[] = [];
  const parks: Rect[] = [];
  const buildings: BuildingSpec[] = [];
  const props: PropSpec[] = [];
  const landmarks: ChicagoLayout['landmarks'] = [];
  const CAR = [0xd9482b, 0x2f6fb5, 0xf2c230, 0xf4f1ea, 0x39393f, 0x4d9a5b, 0xe07b39];
  const STONE = [0xc9b79c, 0xb5c4cf, 0xd6c3b0, 0xa9b8a4, 0xcfa98f, 0xbfb6cc, 0xd8d2c4, 0x9fb3c8, 0xc7a9a0, 0x8f9aa6, 0xb0a48f];
  const tiersOf = (list: Landmark['tiers']): Tier[] => list.map(([floors, w, d, nx, nz]) => ({ floors, w, d, nx, nz }));

  for (const c of cols) {
    if (c.kind !== 'block') continue;
    for (const r of rows) {
      if (r.kind !== 'block') continue;
      if (is(EMPTY, c.name, r.name)) continue;
      const rect: Rect = { x: c.center, z: r.center, w: c.size, d: r.size };
      if (is(PARKS, c.name, r.name)) {
        parks.push(rect);
        // Trees, in loose rows, clear of the middle (where the park's own thing stands).
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2 + rng.range(-0.2, 0.2);
          props.push({ kind: 'tree', x: rect.x + Math.cos(a) * c.size * 0.36, z: rect.z + Math.sin(a) * r.size * 0.36, rotY: a, color: 0xffffff });
        }
        continue;
      }
      blocks.push(rect);
      const here = LANDMARKS.filter((l) => l.col === c.name && l.row === r.name);
      const inner = Math.min(c.size, r.size) - 2 * cfg.sidewalk;
      if (here.length) {
        for (const l of here) {
          const x = rect.x + (l.dx ?? 0) * c.size;
          const z = rect.z + (l.dz ?? 0) * r.size;
          const tiers = tiersOf(l.tiers);
          landmarks.push({ name: l.name, x, z, floors: tiers.reduce((n, t) => n + t.floors, 0), metres: l.metres, building: buildings.length });
          buildings.push({ x, z, tiers, color: l.color, style: l.style ?? 'grid' });
        }
      } else {
        // An ordinary block: one building. The Loop's are taller than the rest, and none
        // comes near the towers that are meant to stand out.
        const loop = 'BCDEFGH'.includes(c.name) && Number(r.name) >= 4 && Number(r.name) <= 10;
        const lo = loop ? 4 : 2;
        const hi = loop ? 10 : 7;
        const kind = rng.next();
        const floors = lo + Math.floor(Math.pow(rng.next(), 1.5) * (hi - lo + 1));
        const trim = rng.range(0, 3);
        let tiers: Tier[];
        if (kind < 0.45) tiers = [{ floors: Math.min(floors, 7), w: inner - trim, d: inner - trim, nx: 3, nz: 3 }];
        else if (kind < 0.8) {
          const acrossX = rng.chance(0.5);
          tiers = [{ floors, w: acrossX ? inner - trim : inner * 0.66, d: acrossX ? inner * 0.66 : inner - trim, nx: acrossX ? 3 : 2, nz: acrossX ? 2 : 3 }];
        } else tiers = [{ floors: Math.min(hi + 1, floors + 2), w: inner * 0.66, d: inner * 0.66, nx: 2, nz: 2 }];
        const cells = tiers[0].floors * tiers[0].nx * tiers[0].nz;
        const roll = rng.next();
        buildings.push({ x: rect.x, z: rect.z, tiers, color: rng.pick(STONE), style: roll < 0.3 ? 'brick' : roll < 0.5 && cells <= 40 ? 'puzzle' : 'grid' });
      }
      // Kerb-side: a lamp at the middle of each side, and the odd parked car.
      for (const [ex, ez] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = rect.x + ex * (c.size / 2 - 0.8);
        const z = rect.z + ez * (r.size / 2 - 0.8);
        props.push({ kind: 'lamp', x, z, rotY: Math.atan2(ez, ex), color: 0xffffff });
        if (rng.chance(0.35 * cfg.propDensity)) {
          const along = rng.range(-0.3, 0.3);
          props.push({ kind: 'car', x: rect.x + ex * (c.size / 2 + 1.8) + ez * along * c.size, z: rect.z + ez * (r.size / 2 + 1.8) + ex * along * r.size, rotY: ex ? 0 : Math.PI / 2, color: rng.pick(CAR) });
        }
      }
    }
  }
  // The Board of Trade stands square across the foot of LaSalle Street, which ends at its doors.
  {
    const l = LANDMARKS.find((m) => m.name === 'Chicago Board of Trade')!;
    const tiers = tiersOf(l.tiers);
    landmarks.push({ name: l.name, x: X('LaSalle'), z: Z('9'), floors: tiers.reduce((n, t) => n + t.floors, 0), metres: l.metres, building: buildings.length });
    buildings.push({ x: X('LaSalle'), z: Z('9'), tiers, color: l.color, style: 'grid' });
  }
  // Navy Pier: a long brick shed with a tower at the lake end.
  blocks.push(span(pier.x0 + 4, pier.x1 - 4, pier.z0 + 2, pier.z1 - 2));
  landmarks.push({ name: 'Navy Pier', x: pier.x0 + 52, z: Z('Grand'), floors: 2, metres: 30, building: buildings.length });
  buildings.push({ x: pier.x0 + 52, z: Z('Grand'), tiers: [{ floors: 2, w: 68, d: 14, nx: 8, nz: 2 }], color: 0xa5563f, style: 'brick' });
  buildings.push({ x: pier.x1 - 14, z: Z('Grand'), tiers: [{ floors: 3, w: 14, d: 14, nx: 2, nz: 2 }, { floors: 2, w: 7, d: 7, nx: 1, nz: 1 }], color: 0xb86a4c, style: 'brick' });
  // Plazas: Daley Plaza (where the Picasso stands), and the square the Water Tower stands in.
  plazas.push({ x: X('E'), z: Z('6') + 7, w: 30, d: 16 });
  plazas.push({ x: X('H'), z: Z('1'), w: 30, d: 30 });
  // (The Water Tower's block has no building: take the one the loop above put there back out.)
  {
    const at = buildings.findIndex((b) => b.x === X('H') && b.z === Z('1'));
    if (at >= 0) {
      buildings.splice(at, 1);
      for (const l of landmarks) if (l.building > at) l.building--;
    }
  }

  // --- Bridges. Over the main branch, the real ones from the lake to the fork; over the south
  // branch, the Loop's. They hold cars, not kaiju.
  const bridges: BridgeSpec[] = [];
  const steel = 0x7d4a3c; // (Chicago's bridges are painted "Chicago maroon".)
  const road = (along: 'x' | 'z', center: number, from: number, to: number, width: number, gap?: number): BridgeSpec => ({
    kind: 'road',
    a: -1,
    b: -1,
    along,
    from,
    to,
    center,
    floor: 1,
    y: -0.35,
    thickness: 1.5,
    pierDepth: depth,
    width,
    color: steel,
    gap,
  });
  const jobs: JobSpec[] = [];
  const MARK = [0xffd23f, 0x3fd0ff, 0xff7ad9, 0x8cff66, 0xff9a3f, 0xb69cff, 0x66ffd9, 0xff6b6b];
  for (const name of ['Lake Shore', 'Columbus', 'Michigan', 'State', 'Dearborn', 'Clark', 'LaSalle', 'Wells']) {
    const s = col(name);
    const width = Math.min(s.size - 10, 12);
    let gap: number | undefined;
    if (name === 'Michigan') {
      // The DuSable Bridge has lost a leaf: it is lying on Wacker Drive.
      const pieces = Math.max(2, Math.round((river.to - river.from) / cfg.chunkSize));
      const length = (river.to - river.from - 0.6) / pieces;
      gap = Math.floor(pieces / 2);
      jobs.push({
        kind: 'span',
        name: 'DuSable Bridge leaf',
        boxes: [{ x: 0, y: 0.75, z: 0, hx: length / 2 - 0.1, hy: 0.75, hz: width / 2, color: steel }],
        height: 1.5,
        start: { x: s.center + 6, z: Z('Wacker Drive') + 2, yaw: 0.45 },
        socket: { x: s.center, y: -1.1, z: river.from + 0.3 + length * (gap + 0.5), yaw: Math.PI / 2 },
        symmetry: Math.PI,
        color: MARK[jobs.length],
      });
    }
    bridges.push(road('z', s.center, river.from, river.to, width, gap));
  }
  for (const name of ['Lake', 'Madison', 'Adams', 'Jackson', 'Congress']) bridges.push(road('x', Z(name), branch.from, branch.to, 11));

  // --- The L: the elevated loop that the Loop is named for, over Lake, Wabash, Van Buren and
  // Wells. Its deck is just above a crouching kaiju's back: under it at a crouch or a slide, or
  // through it standing up.
  const k = tuning.kaiju;
  const m = tuning.modes;
  const crouched = k.bodyRadius + m.crawlClearance + k.bodyHalfHeight * Math.cos(m.crawlPitch) + k.bodyRadius;
  const deck = crouched + 2.4;
  const el = (along: 'x' | 'z', center: number, from: number, to: number): BridgeSpec => ({
    kind: 'road',
    a: -1,
    b: -1,
    along,
    from,
    to,
    center,
    floor: 1,
    y: deck,
    thickness: 1.2,
    pierDepth: 0.4,
    width: 6.5,
    color: 0x565d68,
  });
  const elBox = { w: X('Wells'), e: X('Wabash'), n: Z('Lake'), s: Z('Van Buren') };
  bridges.push(el('x', elBox.n, elBox.w + 5, elBox.e - 5), el('x', elBox.s, elBox.w + 5, elBox.e - 5), el('z', elBox.w, elBox.n + 5, elBox.s - 5), el('z', elBox.e, elBox.n + 5, elBox.s - 5));

  // --- Jobs: things knocked off real places, to put back.
  const top = (name: string, landmark: string, from: { x: number; z: number }, cap: number) => {
    const l = landmarks.find((mk) => mk.name === landmark)!;
    const b = buildings[l.building];
    // The stump is cut to what the kaiju can reach over.
    b.tiers = [{ ...b.tiers[0], floors: Math.min(b.tiers[0].floors, reachFloors(tuning)) }];
    b.style = 'grid';
    l.floors = b.tiers[0].floors;
    const piece = crown(14, b.color, cap);
    jobs.push({ kind: 'top', name, boxes: piece.boxes, height: piece.height, start: { x: from.x, z: from.z, yaw: 0.5 }, socket: { x: b.x, y: cfg.floorHeight * b.tiers[0].floors, z: b.z, yaw: 0 }, symmetry: Math.PI / 2, color: MARK[jobs.length] });
  };
  top('Cultural Center dome', 'Chicago Cultural Center', { x: X('Michigan'), z: Z('Madison') }, 0x7fb7a8);
  top('Union Station skylight', 'Union Station', { x: X('Canal'), z: Z('Jackson') }, 0x9fc4d6);
  top('Art Institute roof', 'Art Institute of Chicago', { x: X('Columbus'), z: Z('Adams') }, 0x8a9a7c);
  // The Water Tower, which outlasted the Great Fire, has gone over in its square.
  jobs.push({ ...monumentJob(X('H'), Z('1'), MARK[jobs.length]), name: 'Chicago Water Tower' });
  // An L car has ended up on a roof on State Street; it belongs on the ground by the tracks.
  {
    const roof = buildings.find((b) => b.x === X('G') && b.z === Z('8'))!;
    roof.tiers = [{ floors: 2, w: 26, d: 26, nx: 3, nz: 3 }];
    roof.style = 'grid';
    const car = busJob(roof.x, cfg.floorHeight * 2, roof.z, 0.4, X('State'), Z('Adams'), MARK[jobs.length]);
    for (const box of car.boxes) if (box.color === 0xf2b705 || box.color === 0xffd966) box.color = 0xb9c2cb;
    jobs.push({ ...car, name: 'L car on a roof' });
  }
  // And Cloud Gate has been rolled out of Millennium Park, down Michigan Avenue.
  {
    const piece = bean();
    jobs.push({ kind: 'bus', name: 'Cloud Gate (the Bean)', boxes: piece.boxes, height: piece.height, start: { x: X('Michigan') - 8, z: Z('9'), yaw: 1.1 }, socket: { x: X('I') - 4, y: 0, z: Z('6'), yaw: Math.PI / 2 }, symmetry: Math.PI, color: MARK[jobs.length] });
  }
  // Two streets are buried: State Street, "that great street", and LaSalle, the canyon.
  const sweeps: SweepSpec[] = [
    { x: X('State'), z: Z('5'), hx: col('State').size / 2 - 4, hz: 11, color: 0xff6b6b },
    { x: X('LaSalle'), z: Z('7'), hx: col('LaSalle').size / 2 - 4, hz: 11, color: 0xc0c8ff },
  ];
  const rubble = new Rng(29);
  for (const sweep of sweeps) addRubble(sweep, props, rubble);

  // --- Hazards. Buckingham Fountain is a water main with a plaza round it: step on it and up
  // you go. Lower Wacker Drive runs under the riverfront, so the road above is thin in places.
  const fountain = { x: X('J'), z: Z('10') };
  plazas.push({ x: fountain.x, z: fountain.z, w: 26, d: 26 });
  const hazards: Hazard[] = [
    { kind: 'main', x: fountain.x, z: fountain.z, radius: 2.1 },
    { kind: 'main', x: X('Dearborn'), z: Z('Madison'), radius: 2.1 },
    { kind: 'main', x: X('Wacker'), z: Z('Jackson'), radius: 2.1 },
    { kind: 'weak', x: X('D'), z: Z('Wacker Drive'), radius: 8 },
    { kind: 'weak', x: X('G'), z: Z('Wacker Drive'), radius: 8 },
    { kind: 'oil', x: X('Clark'), z: Z('Randolph'), radius: 9 },
    { kind: 'oil', x: X('State'), z: Z('Congress'), radius: 10 },
    { kind: 'oil', x: X('State'), z: Z('Grand'), radius: 9 },
    { kind: 'oil', x: X('Wacker'), z: Z('Adams'), radius: 9 },
  ];

  // Nothing loose may start in the water, on a hazard, or where a job's piece lies.
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    if (p.kind === 'rubble') continue;
    const blocked = inWater(waters, p.x, p.z, 1) || jobs.some((j) => Math.hypot(j.start.x - p.x, j.start.z - p.z) < 14 || Math.hypot(j.socket.x - p.x, j.socket.z - p.z) < 12) || hazards.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < h.radius + 3);
    if (blocked) props.splice(i, 1);
  }

  return {
    sizeX,
    sizeZ,
    blocks,
    plazas,
    streets,
    buildings,
    bridges,
    props,
    hazards,
    jobs,
    sweeps,
    river: null,
    waters,
    // On Michigan Avenue at Congress, by Grant Park, facing north up the avenue.
    spawn: { x: X('Michigan'), z: Z('Congress') + 4, yaw: Math.PI },
    landmarks,
    paved,
    parks,
  };
}

export function buildChicago(sim: Sim): void {
  const layout = chicagoLayout(sim.tuning);
  addEnvironment(sim, Math.max(layout.sizeX, layout.sizeZ) * 1.25, null, layout.waters);
  addStreets(sim, layout, layout.paved);
  // The parks: grass over the asphalt, a little proud of it.
  const grass = new THREE.MeshLambertMaterial({ color: 0x6f9a55 });
  for (const park of layout.parks) {
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(park.w, 0.3, park.d), grass);
    lawn.position.set(park.x, 0.1, park.z);
    lawn.receiveShadow = true;
    sim.scene.add(lawn);
  }
  // The town beyond, on three sides: to the east there is only the lake.
  const shore = layout.waters![2].x0;
  addOutskirts(sim, sim.parts.look as Look, layout.sizeX, layout.sizeZ, null, (x, z) => x > shore - 20 || inWater(layout.waters, x, z, 24));
  populate(sim, layout);
}
