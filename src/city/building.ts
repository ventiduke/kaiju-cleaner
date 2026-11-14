import type { BuildingSpec } from './cityGen';

/** One box of a building, plus what it rests on. Indices are into the building's own chunk list. */
export interface ChunkSpec {
  floor: number;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  /** Chunks directly underneath, with the overlapping footprint area. Empty on the ground floor. */
  supports: { chunk: number; area: number }[];
  color: number;
}

function shade(hex: number, factor: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((hex & 255) * factor));
  return (r << 16) | (g << 8) | b;
}

function overlap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
}

/**
 * Splits a building into chunks and builds its support graph.
 * A chunk rests on every chunk of the floor below whose footprint it overlaps.
 */
export function buildingChunks(spec: BuildingSpec, floorHeight: number): ChunkSpec[] {
  const chunks: ChunkSpec[] = [];
  let floor = 0;
  let below: number[] = [];
  for (const tier of spec.tiers) {
    const cw = tier.w / tier.nx;
    const cd = tier.d / tier.nz;
    for (let f = 0; f < tier.floors; f++) {
      const current: number[] = [];
      for (let i = 0; i < tier.nx; i++) {
        for (let j = 0; j < tier.nz; j++) {
          const x = spec.x - tier.w / 2 + cw * (i + 0.5);
          const z = spec.z - tier.d / 2 + cd * (j + 0.5);
          const supports: ChunkSpec['supports'] = [];
          for (const b of below) {
            const o = chunks[b];
            const area =
              overlap(x - cw / 2, x + cw / 2, o.x - o.hx, o.x + o.hx) *
              overlap(z - cd / 2, z + cd / 2, o.z - o.hz, o.z + o.hz);
            if (area > 0.01) supports.push({ chunk: b, area });
          }
          // Stripe the floors and checker the pieces so chunks read as separate at a glance.
          const tone = (floor === 0 ? 0.8 : floor % 2 === 0 ? 1.0 : 0.92) * ((i + j) % 2 === 0 ? 1 : 0.96);
          current.push(chunks.length);
          chunks.push({
            floor,
            x,
            y: floorHeight * (floor + 0.5),
            z,
            hx: cw / 2,
            hy: floorHeight / 2,
            hz: cd / 2,
            supports,
            color: shade(spec.color, tone),
          });
        }
      }
      below = current;
      floor++;
    }
  }
  return chunks;
}
