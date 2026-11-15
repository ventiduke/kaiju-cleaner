import { Rng } from '../core/rng';
import type { BuildingSpec, Tier } from './cityGen';

/** How a building is put together. */
export type BuildStyle = 'grid' | 'brick' | 'fine' | 'puzzle';

/** One box, in world space. */
export interface BoxSpec {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
}

/**
 * One breakable piece of a building: one box, or a few joined into an L or a slab.
 * `x, y, z` is its centre and `hx, hy, hz` its bounding half-size. Support indices are
 * into the building's own chunk list.
 */
export interface ChunkSpec extends BoxSpec {
  /** Lowest floor it occupies. */
  floor: number;
  boxes: BoxSpec[];
  /** Chunks directly underneath, with the footprint area resting on each. Empty on the ground floor. */
  supports: { chunk: number; area: number }[];
  color: number;
  /** Sturdy pieces survive as rubble big enough to stand on; the rest can crumble. */
  sturdy: boolean;
}

export function shade(hex: number, factor: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((hex & 255) * factor));
  return (r << 16) | (g << 8) | b;
}

function overlap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
}

interface Draft {
  floor: number;
  boxes: BoxSpec[];
  tone: number;
}

/** The plain kind: one box per cell, `split` times finer than the tier's own grid. */
function gridTier(spec: BuildingSpec, tier: Tier, base: number, floorHeight: number, split: number, out: Draft[]): void {
  const nx = tier.nx * split;
  const nz = tier.nz * split;
  const cw = tier.w / nx;
  const cd = tier.d / nz;
  for (let f = 0; f < tier.floors; f++) {
    const floor = base + f;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        out.push({
          floor,
          tone: (floor === 0 ? 0.8 : floor % 2 === 0 ? 1.0 : 0.92) * ((i + j) % 2 === 0 ? 1 : 0.96),
          boxes: [
            {
              x: spec.x - tier.w / 2 + cw * (i + 0.5),
              y: floorHeight * (floor + 0.5),
              z: spec.z - tier.d / 2 + cd * (j + 0.5),
              hx: cw / 2,
              hy: floorHeight / 2,
              hz: cd / 2,
            },
          ],
        });
      }
    }
  }
}

/** Brickwork: every other floor is shifted half a block along, so each block sits across two. */
function brickTier(spec: BuildingSpec, tier: Tier, base: number, floorHeight: number, out: Draft[]): void {
  const cw = tier.w / tier.nx;
  const cd = tier.d / tier.nz;
  const x0 = spec.x - tier.w / 2;
  for (let f = 0; f < tier.floors; f++) {
    const floor = base + f;
    const shifted = floor % 2 === 1;
    // Edges of the blocks along x for this course.
    const edges: number[] = [0];
    if (shifted) edges.push(cw / 2);
    for (let e = shifted ? cw * 1.5 : cw; e < tier.w - 0.01; e += cw) edges.push(e);
    edges.push(tier.w);
    for (let i = 0; i < edges.length - 1; i++) {
      for (let j = 0; j < tier.nz; j++) {
        const w = edges[i + 1] - edges[i];
        out.push({
          floor,
          tone: (floor === 0 ? 0.8 : shifted ? 0.9 : 1.0) * ((i + j) % 2 === 0 ? 1 : 0.95),
          boxes: [
            {
              x: x0 + edges[i] + w / 2,
              y: floorHeight * (floor + 0.5),
              z: spec.z - tier.d / 2 + cd * (j + 0.5),
              hx: w / 2,
              hy: floorHeight / 2,
              hz: cd / 2,
            },
          ],
        });
      }
    }
  }
}

/**
 * Puzzle work: a fine grid of cells joined up at random into slabs, columns and L-shapes
 * (flat and upright), so the pieces lock together and come apart irregularly.
 */
function puzzleTier(spec: BuildingSpec, tier: Tier, base: number, floorHeight: number, rng: Rng, out: Draft[]): void {
  const nx = tier.nx * 2;
  const nz = tier.nz * 2;
  const nf = tier.floors;
  const cw = tier.w / nx;
  const cd = tier.d / nz;
  const taken = new Uint8Array(nx * nz * nf);
  const at = (i: number, j: number, f: number) => i + nx * (j + nz * f);
  const free = (i: number, j: number, f: number) => i >= 0 && i < nx && j >= 0 && j < nz && f >= 0 && f < nf && !taken[at(i, j, f)];
  /** A box covering cells (i0..i1, j0..j1, f0..f1), all inclusive. */
  const box = (i0: number, i1: number, j0: number, j1: number, f0: number, f1: number): BoxSpec => ({
    x: spec.x - tier.w / 2 + (cw * (i0 + i1 + 1)) / 2,
    y: (floorHeight * (2 * base + f0 + f1 + 1)) / 2,
    z: spec.z - tier.d / 2 + (cd * (j0 + j1 + 1)) / 2,
    hx: (cw * (i1 - i0 + 1)) / 2,
    hy: (floorHeight * (f1 - f0 + 1)) / 2,
    hz: (cd * (j1 - j0 + 1)) / 2,
  });
  const claim = (cells: [number, number, number][]) => {
    for (const [i, j, f] of cells) taken[at(i, j, f)] = 1;
  };
  for (let f = 0; f < nf; f++) {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        if (taken[at(i, j, f)]) continue;
        const roll = rng.next();
        const tone = (base + f === 0 ? 0.82 : 1) * rng.range(0.84, 1.04);
        const floor = base + f;
        if (roll < 0.2 && free(i + 1, j, f)) {
          // A slab two cells long.
          claim([[i, j, f], [i + 1, j, f]]);
          out.push({ floor, tone, boxes: [box(i, i + 1, j, j, f, f)] });
        } else if (roll < 0.38 && free(i, j + 1, f)) {
          claim([[i, j, f], [i, j + 1, f]]);
          out.push({ floor, tone, boxes: [box(i, i, j, j + 1, f, f)] });
        } else if (roll < 0.52 && free(i, j, f + 1)) {
          // A column two floors tall.
          claim([[i, j, f], [i, j, f + 1]]);
          out.push({ floor, tone, boxes: [box(i, i, j, j, f, f + 1)] });
        } else if (roll < 0.66 && free(i + 1, j, f) && free(i, j + 1, f)) {
          // A flat L.
          claim([[i, j, f], [i + 1, j, f], [i, j + 1, f]]);
          out.push({ floor, tone, boxes: [box(i, i + 1, j, j, f, f), box(i, i, j + 1, j + 1, f, f)] });
        } else if (roll < 0.78 && free(i + 1, j, f) && free(i, j, f + 1)) {
          // An upright L: a slab with a block standing on one end.
          claim([[i, j, f], [i + 1, j, f], [i, j, f + 1]]);
          out.push({ floor, tone, boxes: [box(i, i + 1, j, j, f, f), box(i, i, j, j, f + 1, f + 1)] });
        } else if (roll < 0.86 && free(i + 1, j, f) && free(i + 1, j + 1, f) && free(i, j + 1, f)) {
          // A two-by-two slab.
          claim([[i, j, f], [i + 1, j, f], [i, j + 1, f], [i + 1, j + 1, f]]);
          out.push({ floor, tone, boxes: [box(i, i + 1, j, j + 1, f, f)] });
        } else {
          claim([[i, j, f]]);
          out.push({ floor, tone, boxes: [box(i, i, j, j, f, f)] });
        }
      }
    }
  }
}

/**
 * Splits a building into chunks and builds its support graph.
 * A chunk rests on every other chunk whose top touches the underside of one of its boxes.
 */
export function buildingChunks(spec: BuildingSpec, floorHeight: number): ChunkSpec[] {
  const style: BuildStyle = spec.style ?? 'grid';
  const rng = new Rng(Math.round(spec.x * 31 + spec.z * 17) + 99);
  const drafts: Draft[] = [];
  let base = 0;
  for (const tier of spec.tiers) {
    if (style === 'brick') brickTier(spec, tier, base, floorHeight, drafts);
    else if (style === 'puzzle') puzzleTier(spec, tier, base, floorHeight, rng, drafts);
    else gridTier(spec, tier, base, floorHeight, style === 'fine' ? 2 : 1, drafts);
    base += tier.floors;
  }

  // Index every box by the height of its top, to find what sits on what.
  const tops = new Map<number, { chunk: number; box: BoxSpec }[]>();
  const level = (y: number) => Math.round(y * 100);
  drafts.forEach((d, chunk) => {
    for (const box of d.boxes) {
      const key = level(box.y + box.hy);
      let list = tops.get(key);
      if (!list) tops.set(key, (list = []));
      list.push({ chunk, box });
    }
  });

  return drafts.map((d, index) => {
    const under = new Map<number, number>();
    for (const b of d.boxes) {
      for (const other of tops.get(level(b.y - b.hy)) ?? []) {
        if (other.chunk === index) continue;
        const o = other.box;
        const area = overlap(b.x - b.hx, b.x + b.hx, o.x - o.hx, o.x + o.hx) * overlap(b.z - b.hz, b.z + b.hz, o.z - o.hz, o.z + o.hz);
        if (area > 0.01) under.set(other.chunk, (under.get(other.chunk) ?? 0) + area);
      }
    }
    // Centre it on its bulk, and box it in.
    let volume = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const b of d.boxes) {
      const v = b.hx * b.hy * b.hz;
      volume += v;
      cx += b.x * v;
      cy += b.y * v;
      cz += b.z * v;
    }
    cx /= volume;
    cy /= volume;
    cz /= volume;
    let hx = 0;
    let hy = 0;
    let hz = 0;
    for (const b of d.boxes) {
      hx = Math.max(hx, Math.abs(b.x - cx) + b.hx);
      hy = Math.max(hy, Math.abs(b.y - cy) + b.hy);
      hz = Math.max(hz, Math.abs(b.z - cz) + b.hz);
    }
    return {
      floor: d.floor,
      boxes: d.boxes,
      x: cx,
      y: cy,
      z: cz,
      hx,
      hy,
      hz,
      supports: [...under].map(([chunk, area]) => ({ chunk, area })),
      color: shade(spec.color, d.tone),
      sturdy: rng.chance(0.25),
    };
  });
}
