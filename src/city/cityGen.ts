import { Rng } from '../core/rng';
import type { Tuning } from '../core/tuning';

/** One stacked section of a building. Tiers are centred on the building and listed bottom-up. */
export interface Tier {
  floors: number;
  w: number;
  d: number;
  nx: number;
  nz: number;
}

export interface BuildingSpec {
  x: number;
  z: number;
  tiers: Tier[];
  color: number;
}

export type PropKind = 'car' | 'lamp' | 'tree' | 'cart';

export interface PropSpec {
  kind: PropKind;
  x: number;
  z: number;
  rotY: number;
  color: number;
}

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Street {
  /** The axis the street runs along. */
  along: 'x' | 'z';
  /** Its centre on the other axis. */
  center: number;
  width: number;
}

/**
 * A span of chunks: a covered walkway strung between two buildings, or a road bridge
 * over the river standing on its own piers.
 */
export interface BridgeSpec {
  kind: 'sky' | 'road';
  /** Indices into `buildings` of the two ends, or -1 where it rests on the bank. */
  a: number;
  b: number;
  /** The axis the bridge runs along. */
  along: 'x' | 'z';
  /** Its start and end on that axis (the two building faces), and its centre on the other. */
  from: number;
  to: number;
  center: number;
  /** Which floor it hangs at (skybridges). */
  floor: number;
  /** Height of the deck's centre and its thickness (road bridges). */
  y?: number;
  thickness?: number;
  /** How far down the piers go (road bridges). */
  pierDepth?: number;
  width: number;
  color: number;
}

export interface Hazard {
  kind: 'oil';
  x: number;
  z: number;
  radius: number;
}

/** A band of water across the whole map, between two z values. */
export interface River {
  z0: number;
  z1: number;
  depth: number;
}

export interface CityLayout {
  /** Extent of the paved area, including the perimeter road. */
  sizeX: number;
  sizeZ: number;
  blocks: Rect[];
  /** Blocks left open, drawn as paved squares. */
  plazas: Rect[];
  streets: Street[];
  buildings: BuildingSpec[];
  bridges: BridgeSpec[];
  props: PropSpec[];
  hazards: Hazard[];
  river: River | null;
  /** Where a kaiju starts: at the south end of the widest street, facing north (-z). */
  spawn: { x: number; z: number; yaw: number };
}

const BUILDING_COLORS = [0xc9b79c, 0xb5c4cf, 0xd6c3b0, 0xa9b8a4, 0xcfa98f, 0xbfb6cc, 0xd8d2c4, 0x9fb3c8, 0xc7a9a0];
const CAR_COLORS = [0xd9482b, 0x2f6fb5, 0xf2c230, 0xf4f1ea, 0x39393f, 0x4d9a5b, 0xe07b39];
const BRIDGE_COLOR = 0x8fc7d8;

export function totalFloors(b: BuildingSpec): number {
  return b.tiers.reduce((n, t) => n + t.floors, 0);
}

export function chunkCount(b: BuildingSpec): number {
  return b.tiers.reduce((n, t) => n + t.floors * t.nx * t.nz, 0);
}

interface Axis {
  starts: number[];
  streets: { center: number; width: number }[];
  span: number;
}

/** Lays blocks and the streets between them along one axis, centred on zero. */
function layAxis(n: number, blockSize: number, widths: number[]): Axis {
  const span = n * blockSize + widths.reduce((a, b) => a + b, 0);
  const starts: number[] = [];
  const streets: Axis['streets'] = [];
  let cursor = -span / 2;
  for (let i = 0; i < n; i++) {
    starts.push(cursor);
    cursor += blockSize;
    if (i < n - 1) {
      streets.push({ center: cursor + widths[i] / 2, width: widths[i] });
      cursor += widths[i];
    }
  }
  return { starts, streets, span };
}

/** Generates the city as plain data. No physics, no rendering. */
export function generateCity(cfg: Tuning['city']): CityLayout {
  const rng = new Rng(cfg.seed);
  const n = Math.max(1, Math.round(cfg.blocks));
  const perimeter = cfg.avenueWidth;
  const size = cfg.blockSize;
  const density = cfg.propDensity;
  const mid = Math.floor((n - 1) / 2);

  // North-south streets get a boulevard through the middle; the rest alternate avenue / side street.
  const acrossX: number[] = [];
  const acrossZ: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    acrossX.push(i === mid ? cfg.boulevardWidth : (i + (i > mid ? 1 : 0)) % 2 === 0 ? cfg.sideStreetWidth : cfg.avenueWidth);
    acrossZ.push(i % 2 === 0 ? cfg.avenueWidth : cfg.sideStreetWidth);
  }
  // The river takes the place of the middle east-west street, with a quay road on each bank.
  const quay = cfg.sideStreetWidth;
  const riverRow = cfg.riverWidth > 0 && n >= 2 ? Math.floor((n - 2) / 2) : -1;
  if (riverRow >= 0) acrossZ[riverRow] = cfg.riverWidth + 2 * quay;
  const ax = layAxis(n, size, acrossX);
  const az = layAxis(n, size, acrossZ);

  const streets: Street[] = [];
  for (const s of ax.streets) streets.push({ along: 'z', center: s.center, width: s.width });
  let river: River | null = null;
  az.streets.forEach((s, i) => {
    if (i === riverRow) {
      river = { z0: s.center - cfg.riverWidth / 2, z1: s.center + cfg.riverWidth / 2, depth: cfg.riverDepth };
      streets.push({ along: 'x', center: river.z0 - quay / 2, width: quay });
      streets.push({ along: 'x', center: river.z1 + quay / 2, width: quay });
    } else streets.push({ along: 'x', center: s.center, width: s.width });
  });
  for (const side of [-1, 1]) {
    streets.push({ along: 'z', center: side * (ax.span / 2 + perimeter / 2), width: perimeter });
    streets.push({ along: 'x', center: side * (az.span / 2 + perimeter / 2), width: perimeter });
  }

  const blocks: Rect[] = [];
  const plazas: Rect[] = [];
  const buildings: BuildingSpec[] = [];
  const props: PropSpec[] = [];
  /** Which block each building stands in, for stringing skybridges between neighbours. */
  const blockOf: { i: number; j: number }[] = [];
  const plazaBlock = cfg.plaza && n >= 3 ? { i: mid + (n % 2 === 0 ? 1 : 0), j: Math.floor(n / 2) } : null;

  const addBuilding = (cx: number, cz: number, lotW: number, lotD: number, bi: number, bj: number, tall: boolean) => {
    const w = lotW - rng.range(0, 3);
    const d = lotD - rng.range(0, 3);
    // Slim lots still get split in two across, so even the thinnest tower can lose a corner.
    const split = (len: number) => Math.max(len >= cfg.chunkSize * 1.15 ? 2 : 1, Math.round(len / cfg.chunkSize));
    const nx = split(w);
    const nz = split(d);
    const lo = Math.min(cfg.minFloors, cfg.maxFloors);
    const hi = Math.max(cfg.minFloors, cfg.maxFloors);
    // Big footprints stay lower; slim lots get the towers.
    const top = tall ? hi : Math.max(lo, Math.round(lo + (hi - lo) * 0.6));
    const floors = lo + Math.floor(Math.pow(rng.next(), 1.4) * (top - lo + 1));
    const tiers: Tier[] = [];
    if (floors >= 7 && nx >= 2 && nz >= 2 && rng.chance(0.55)) {
      const upper = Math.max(2, Math.round(floors * rng.range(0.3, 0.5)));
      tiers.push({ floors: floors - upper, w, d, nx, nz });
      tiers.push({ floors: upper, w: (w * (nx - 1)) / nx, d: (d * (nz - 1)) / nz, nx: nx - 1, nz: nz - 1 });
    } else {
      tiers.push({ floors, w, d, nx, nz });
    }
    buildings.push({ x: cx, z: cz, tiers, color: rng.pick(BUILDING_COLORS) });
    blockOf.push({ i: bi, j: bj });
  };

  for (let bi = 0; bi < n; bi++) {
    for (let bj = 0; bj < n; bj++) {
      const bx = ax.starts[bi];
      const bz = az.starts[bj];
      const rect = { x: bx + size / 2, z: bz + size / 2, w: size, d: size };
      blocks.push(rect);
      const inner = size - 2 * cfg.sidewalk;
      const half = (inner - cfg.lotGap) / 2;
      const near = cfg.sidewalk + half / 2;
      const far = cfg.sidewalk + half + cfg.lotGap + half / 2;

      if (plazaBlock && bi === plazaBlock.i && bj === plazaBlock.j) {
        // The plaza: open paving, a ring of trees, a couple of carts.
        plazas.push(rect);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          props.push({ kind: 'tree', x: rect.x + Math.cos(a) * size * 0.38, z: rect.z + Math.sin(a) * size * 0.38, rotY: a, color: 0xffffff });
        }
        for (let k = 0; k < Math.round(3 * density); k++) {
          props.push({ kind: 'cart', x: rect.x + (k - 1) * 5, z: rect.z + rng.range(-4, 4), rotY: rng.int(0, 3) * (Math.PI / 2), color: rng.pick(CAR_COLORS) });
        }
      } else {
        const kind = rng.next();
        if (kind < 0.08) {
          // A pocket park.
          const placed: { x: number; z: number }[] = [];
          const trees = Math.round(rng.int(5, 8) * density);
          for (let attempt = 0; attempt < trees * 8 && placed.length < trees; attempt++) {
            const x = rect.x + rng.range(-inner * 0.42, inner * 0.42);
            const z = rect.z + rng.range(-inner * 0.42, inner * 0.42);
            // Canopies must not overlap, or the trees start awake and shove each other.
            if (placed.some((o) => Math.hypot(o.x - x, o.z - z) < 5.5)) continue;
            placed.push({ x, z });
            props.push({ kind: 'tree', x, z, rotY: rng.range(0, Math.PI * 2), color: 0xffffff });
          }
        } else if (size < 30 || kind < 0.3) {
          // One big building.
          addBuilding(rect.x, rect.z, inner, inner, bi, bj, false);
        } else if (kind < 0.6) {
          // Two slabs, split one way or the other.
          const alongX = rng.chance(0.5);
          for (const o of [near, far]) {
            if (alongX) addBuilding(rect.x, bz + o, inner, half, bi, bj, true);
            else addBuilding(bx + o, rect.z, half, inner, bi, bj, true);
          }
        } else {
          // Four slim towers.
          for (const ox of [near, far]) for (const oz of [near, far]) addBuilding(bx + ox, bz + oz, half, half, bi, bj, true);
        }
      }

      // Kerb-side props along each of the block's four edges.
      const edges: { ox: number; oz: number; dx: number; dz: number; nx: number; nz: number }[] = [
        { ox: bx, oz: bz, dx: 1, dz: 0, nx: 0, nz: -1 },
        { ox: bx, oz: bz + size, dx: 1, dz: 0, nx: 0, nz: 1 },
        { ox: bx, oz: bz, dx: 0, dz: 1, nx: -1, nz: 0 },
        { ox: bx + size, oz: bz, dx: 0, dz: 1, nx: 1, nz: 0 },
      ];
      for (const e of edges) {
        const along = Math.atan2(e.dx, e.dz);
        // Lamps and trees on the sidewalk, just inside the kerb and clear of the building faces.
        const kerb = Math.min(1.2, cfg.sidewalk * 0.3);
        for (let s = 5; s < size - 3; s += 10) {
          const kind: PropKind | null = (s / 10) % 2 < 1 ? 'lamp' : rng.chance(0.6 * density) ? 'tree' : null;
          if (!kind) continue;
          props.push({ kind, x: e.ox + e.dx * s - e.nx * kerb, z: e.oz + e.dz * s - e.nz * kerb, rotY: along, color: 0xffffff });
        }
        // Parked cars on the road, just outside the kerb. None on the boulevard: its lanes stay clear.
        const facing = e.nx !== 0 ? ax.streets[e.nx < 0 ? bi - 1 : bi] : undefined;
        const onBoulevard = !!facing && facing.width === cfg.boulevardWidth && cfg.boulevardWidth > cfg.avenueWidth;
        for (let s = 7; s < size - 5; s += 7.5) {
          if (onBoulevard || !rng.chance(0.4 * density)) continue;
          props.push({
            kind: 'car',
            x: e.ox + e.dx * s + e.nx * 1.8,
            z: e.oz + e.dz * s + e.nz * 1.8,
            rotY: along + (rng.chance(0.5) ? Math.PI : 0),
            color: rng.pick(CAR_COLORS),
          });
        }
      }
      // The odd food cart on a corner.
      if (rng.chance(0.4 * density)) {
        props.push({
          kind: 'cart',
          x: bx + (rng.chance(0.5) ? 0.6 : size - 0.6),
          z: bz + (rng.chance(0.5) ? 0.6 : size - 0.6),
          rotY: rng.int(0, 3) * (Math.PI / 2),
          color: rng.pick(CAR_COLORS),
        });
      }
    }
  }

  // A line of trees down the middle of the boulevard: pick a side, or flatten them.
  const boulevard = ax.streets.find((s) => s.width === cfg.boulevardWidth && cfg.boulevardWidth > cfg.avenueWidth);
  if (boulevard) {
    for (let z = -az.span / 2 + 6; z < az.span / 2 - 4; z += 13) {
      // Leave the crossings (and the river) clear.
      if (az.streets.some((s) => Math.abs(z - s.center) < s.width / 2 + 2)) continue;
      if (rng.chance(0.85 * Math.min(1, density))) props.push({ kind: 'tree', x: boulevard.center, z, rotY: rng.range(0, 6), color: 0xffffff });
    }
  }

  // Skybridges: join buildings that face each other across a street, a few floors up.
  const bridges: BridgeSpec[] = [];
  const candidates: BridgeSpec[] = [];
  for (let a = 0; a < buildings.length; a++) {
    for (let b = 0; b < buildings.length; b++) {
      const A = buildings[a];
      const B = buildings[b];
      const di = blockOf[b].i - blockOf[a].i;
      const dj = blockOf[b].j - blockOf[a].j;
      if (!((di === 1 && dj === 0) || (di === 0 && dj === 1))) continue;
      const along: 'x' | 'z' = di === 1 ? 'x' : 'z';
      const ta = A.tiers[0];
      const tb = B.tiers[0];
      const [aHalf, bHalf, aSide, bSide, aPos, bPos, aCross, bCross] =
        along === 'x' ? [ta.w / 2, tb.w / 2, ta.d / 2, tb.d / 2, A.x, B.x, A.z, B.z] : [ta.d / 2, tb.d / 2, ta.w / 2, tb.w / 2, A.z, B.z, A.x, B.x];
      const from = aPos + aHalf;
      const to = bPos - bHalf;
      const gap = to - from;
      // Only across a real street, not the gap between lots, and not across the boulevard.
      if (gap < cfg.sideStreetWidth || gap > cfg.avenueWidth + 2 * cfg.sidewalk + 4) continue;
      const lo = Math.max(aCross - aSide, bCross - bSide) + 3;
      const hi = Math.min(aCross + aSide, bCross + bSide) - 3;
      if (hi < lo) continue;
      const top = Math.min(ta.floors, tb.floors) - 1;
      if (top < 3) continue;
      candidates.push({ kind: 'sky', a, b, along, from, to, center: (lo + hi) / 2, floor: Math.min(top, rng.int(3, 4)), width: 5, color: BRIDGE_COLOR });
    }
  }
  const used = new Set<number>();
  while (bridges.length < cfg.skybridges && candidates.length) {
    const pick = candidates.splice(Math.floor(rng.next() * candidates.length), 1)[0];
    if (used.has(pick.a) || used.has(pick.b)) continue;
    used.add(pick.a);
    used.add(pick.b);
    bridges.push(pick);
  }

  // Road bridges carry the wider streets over the river. They hold cars, not kaiju.
  const theRiver = river as River | null;
  if (theRiver) {
    for (const s of ax.streets) {
      if (s.width <= cfg.sideStreetWidth) continue;
      bridges.push({
        kind: 'road',
        a: -1,
        b: -1,
        along: 'z',
        from: theRiver.z0,
        to: theRiver.z1,
        // On the boulevard the bridge takes the west carriageway, leaving the east one to wade.
        center: s === boulevard ? s.center - s.width / 4 : s.center,
        floor: 1,
        y: -0.35,
        thickness: 1.5,
        pierDepth: theRiver.depth,
        width: Math.min(s.width - 8, 12),
        color: 0x9a9690,
      });
    }
  }

  // Oil spills, dotted about the roads away from the start.
  const hazards: Hazard[] = [];
  for (let attempt = 0; attempt < cfg.oilSlicks * 12 && hazards.length < cfg.oilSlicks; attempt++) {
    const sx = rng.pick(ax.streets);
    const z = rng.range(-az.span / 2 + 10, az.span / 2 - 40);
    if (theRiver && z > theRiver.z0 - 16 && z < theRiver.z1 + 16) continue;
    const radius = Math.min(rng.range(7, 10), sx.width / 2 - 1);
    const x = sx.center + rng.range(-1, 1) * (sx.width / 2 - radius);
    if (hazards.some((h) => Math.hypot(h.x - x, h.z - z) < 40)) continue;
    hazards.push({ kind: 'oil', x, z, radius });
  }

  const main = boulevard ?? ax.streets.find((s) => s.width === cfg.avenueWidth) ?? { center: 0, width: cfg.avenueWidth };
  return {
    sizeX: ax.span + 2 * perimeter,
    sizeZ: az.span + 2 * perimeter,
    blocks,
    plazas,
    streets,
    buildings,
    bridges,
    props,
    hazards,
    river: theRiver,
    // Just off the centre line, so the kaiju doesn't start on top of the boulevard's trees.
    spawn: { x: main.center + (boulevard ? boulevard.width / 4 + 0.75 : 0), z: az.span / 2 + perimeter * 0.5, yaw: Math.PI },
  };
}
