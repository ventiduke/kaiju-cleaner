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

export interface CityLayout {
  /** Side length of the paved square, including the perimeter road. */
  size: number;
  blocks: Rect[];
  streets: Street[];
  buildings: BuildingSpec[];
  props: PropSpec[];
  /** Where a kaiju starts: at the south end of the main avenue, facing north (-z). */
  spawn: { x: number; z: number; yaw: number };
}

const BUILDING_COLORS = [0xc9b79c, 0xb5c4cf, 0xd6c3b0, 0xa9b8a4, 0xcfa98f, 0xbfb6cc, 0xd8d2c4, 0x9fb3c8, 0xc7a9a0];
const CAR_COLORS = [0xd9482b, 0x2f6fb5, 0xf2c230, 0xf4f1ea, 0x39393f, 0x4d9a5b, 0xe07b39];

export function totalFloors(b: BuildingSpec): number {
  return b.tiers.reduce((n, t) => n + t.floors, 0);
}

export function chunkCount(b: BuildingSpec): number {
  return b.tiers.reduce((n, t) => n + t.floors * t.nx * t.nz, 0);
}

/** Generates the city as plain data. No physics, no rendering. */
export function generateCity(cfg: Tuning['city']): CityLayout {
  const rng = new Rng(cfg.seed);
  const n = Math.max(1, Math.round(cfg.blocks));
  const perimeter = cfg.avenueWidth;

  // Interior streets alternate avenue / side street, the same on both axes.
  const interior: number[] = [];
  for (let i = 0; i < n - 1; i++) interior.push(i % 2 === 0 ? cfg.avenueWidth : cfg.sideStreetWidth);
  const span = n * cfg.blockSize + interior.reduce((a, b) => a + b, 0);
  const starts: number[] = [];
  const streetCenters: { center: number; width: number }[] = [];
  let cursor = -span / 2;
  for (let i = 0; i < n; i++) {
    starts.push(cursor);
    cursor += cfg.blockSize;
    if (i < n - 1) {
      streetCenters.push({ center: cursor + interior[i] / 2, width: interior[i] });
      cursor += interior[i];
    }
  }

  const streets: Street[] = [];
  for (const s of streetCenters) {
    streets.push({ along: 'z', center: s.center, width: s.width });
    streets.push({ along: 'x', center: s.center, width: s.width });
  }
  for (const side of [-1, 1]) {
    const c = side * (span / 2 + perimeter / 2);
    streets.push({ along: 'z', center: c, width: perimeter });
    streets.push({ along: 'x', center: c, width: perimeter });
  }

  const blocks: Rect[] = [];
  const buildings: BuildingSpec[] = [];
  const props: PropSpec[] = [];
  const density = cfg.propDensity;

  for (let bi = 0; bi < n; bi++) {
    for (let bj = 0; bj < n; bj++) {
      const bx = starts[bi];
      const bz = starts[bj];
      const size = cfg.blockSize;
      blocks.push({ x: bx + size / 2, z: bz + size / 2, w: size, d: size });

      // Lots
      const lots = size >= 50 ? 2 : 1;
      const lotSize = (size - 2 * cfg.sidewalk - (lots - 1) * cfg.lotGap) / lots;
      for (let li = 0; li < lots; li++) {
        for (let lj = 0; lj < lots; lj++) {
          const cx = bx + cfg.sidewalk + lotSize / 2 + li * (lotSize + cfg.lotGap);
          const cz = bz + cfg.sidewalk + lotSize / 2 + lj * (lotSize + cfg.lotGap);
          if (rng.chance(0.1)) {
            // A pocket park instead of a building.
            const trees = Math.round(rng.int(3, 5) * density);
            const placed: { x: number; z: number }[] = [];
            for (let attempt = 0; attempt < trees * 8 && placed.length < trees; attempt++) {
              const x = cx + rng.range(-lotSize * 0.38, lotSize * 0.38);
              const z = cz + rng.range(-lotSize * 0.38, lotSize * 0.38);
              // Canopies must not overlap, or the trees start awake and shove each other.
              if (placed.some((o) => Math.hypot(o.x - x, o.z - z) < 5.5)) continue;
              placed.push({ x, z });
              props.push({ kind: 'tree', x, z, rotY: rng.range(0, Math.PI * 2), color: 0xffffff });
            }
            continue;
          }
          const w = lotSize - rng.range(0, 5);
          const d = lotSize - rng.range(0, 5);
          const nx = Math.max(1, Math.round(w / cfg.chunkSize));
          const nz = Math.max(1, Math.round(d / cfg.chunkSize));
          const lo = Math.min(cfg.minFloors, cfg.maxFloors);
          const hi = Math.max(cfg.minFloors, cfg.maxFloors);
          const floors = lo + Math.floor(Math.pow(rng.next(), 1.5) * (hi - lo + 1));
          const tiers: Tier[] = [];
          if (floors >= 7 && nx >= 2 && nz >= 2 && rng.chance(0.6)) {
            const upper = Math.max(2, Math.round(floors * rng.range(0.3, 0.5)));
            tiers.push({ floors: floors - upper, w, d, nx, nz });
            tiers.push({ floors: upper, w: (w * (nx - 1)) / nx, d: (d * (nz - 1)) / nz, nx: nx - 1, nz: nz - 1 });
          } else {
            tiers.push({ floors, w, d, nx, nz });
          }
          buildings.push({ x: cx, z: cz, tiers, color: rng.pick(BUILDING_COLORS) });
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
        for (let s = 6; s < size - 3; s += 12) {
          const kind: PropKind | null = (s / 12) % 2 < 1 ? 'lamp' : rng.chance(0.6 * density) ? 'tree' : null;
          if (!kind) continue;
          props.push({
            kind,
            x: e.ox + e.dx * s - e.nx * kerb,
            z: e.oz + e.dz * s - e.nz * kerb,
            rotY: along,
            color: 0xffffff,
          });
        }
        // Parked cars on the road, just outside the kerb.
        for (let s = 8; s < size - 6; s += 8) {
          if (!rng.chance(0.42 * density)) continue;
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
      if (rng.chance(0.5 * density)) {
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

  const avenue = streetCenters.find((s) => s.width === cfg.avenueWidth) ?? { center: 0, width: cfg.avenueWidth };
  return {
    size: span + 2 * perimeter,
    blocks,
    streets,
    buildings,
    props,
    spawn: { x: avenue.center, z: span / 2 + perimeter * 0.5, yaw: Math.PI },
  };
}
