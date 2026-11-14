import RAPIER from '@dimforge/rapier3d-compat';

export type Rapier = typeof RAPIER;
export type World = RAPIER.World;
export type RigidBody = RAPIER.RigidBody;
export type Collider = RAPIER.Collider;

export const FIXED_DT = 1 / 60;

let initPromise: Promise<void> | null = null;

/** Loads the Rapier WASM once. Safe to call from the browser and from Node tests. */
export async function initRapier(): Promise<Rapier> {
  initPromise ??= RAPIER.init();
  await initPromise;
  return RAPIER;
}

/** Collision group bits. */
export const Group = {
  GROUND: 1 << 0,
  CHUNK: 1 << 1,
  PROP: 1 << 2,
  BODY: 1 << 3,
  TAIL: 1 << 4,
  FOOT: 1 << 5,
  BALL: 1 << 6,
} as const;

export const ALL_GROUPS = 0xffff;

/** Packs Rapier interaction groups: what this collider is, and what it touches. */
export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}
