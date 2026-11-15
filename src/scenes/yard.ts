import * as THREE from 'three';
import { addRubble, busJob, monumentJob, reachFloors, type CityLayout, type PropSpec, type SweepSpec } from '../city/cityGen';
import { Rng } from '../core/rng';
import { ALL_GROUPS, Group, groups } from '../core/physics';
import type { Sim } from '../sim';
import { populate } from './city';
import { addEnvironment } from './common';

/** Hand-placed test pieces: a low block, a slim tower, a topless tower to repair, and a row of props. */
/** @param stumpFloors how tall the topless tower's stump is: no higher than the kaiju's hands (see `reachFloors`) */
export function yardLayout(stumpFloors = 5): CityLayout {
  const props: PropSpec[] = [];
  const colors = [0xd9482b, 0x2f6fb5, 0xf2c230, 0xf4f1ea, 0x4d9a5b];
  for (let i = 0; i < 8; i++) {
    props.push({ kind: 'car', x: -42 + i * 7, z: -12, rotY: Math.PI / 2, color: colors[i % colors.length] });
  }
  for (let i = 0; i < 5; i++) props.push({ kind: 'lamp', x: 30 + i * 10, z: -12, rotY: 0, color: 0xffffff });
  for (let i = 0; i < 5; i++) props.push({ kind: 'tree', x: 30 + i * 10, z: 4, rotY: i, color: 0xffffff });
  props.push({ kind: 'cart', x: 20, z: -12, rotY: 0.4, color: 0xe07b39 });
  const yardSweep: SweepSpec = { x: -70, z: 90, hx: 10, hz: 8, color: 0x8cff66 };
  addRubble(yardSweep, props, new Rng(5));
  return {
    sizeX: 0,
    sizeZ: 0,
    blocks: [],
    plazas: [],
    streets: [],
    // A skybridge between the low block and the slim tower, to practise on.
    bridges: [{ kind: 'sky', a: 0, b: 1, along: 'x', from: -37, to: -8, center: -57, floor: 2, width: 5, color: 0x8fc7d8 }],
    buildings: [
      { x: -45, z: -55, color: 0xcfa98f, tiers: [{ floors: 3, w: 16, d: 16, nx: 2, nz: 2 }] },
      { x: 0, z: -60, color: 0xb5c4cf, tiers: [{ floors: 8, w: 16, d: 16, nx: 2, nz: 2 }] },
      {
        x: 50,
        z: -60,
        color: 0xc9b79c,
        tiers: [{ floors: stumpFloors, w: 17, d: 17, nx: 2, nz: 2 }],
      },
    ],
    props,
    // An oil slick off to one side for practising slides, a patch of weak ground on the other,
    // and a water main to burst.
    hazards: [
      { kind: 'oil', x: -60, z: 30, radius: 12 },
      { kind: 'weak', x: 70, z: 45, radius: 8 },
      { kind: 'main', x: -75, z: -10, radius: 2.1 },
    ],
    // A repair job to practise on: the stepped tower's top, sitting in the open.
    jobs: [
      {
        kind: 'top',
        boxes: [
          { x: -4.25, y: 2, z: -4.25, hx: 4.25, hy: 2, hz: 4.25, color: 0xc9b79c },
          { x: 4.25, y: 2, z: -4.25, hx: 4.25, hy: 2, hz: 4.25, color: 0xc1b096 },
          { x: -4.25, y: 2, z: 4.25, hx: 4.25, hy: 2, hz: 4.25, color: 0xc1b096 },
          { x: 4.25, y: 2, z: 4.25, hx: 4.25, hy: 2, hz: 4.25, color: 0xc9b79c },
          { x: -4.25, y: 6, z: -4.25, hx: 4.25, hy: 2, hz: 4.25, color: 0xb9a98f },
          { x: 4.25, y: 6, z: -4.25, hx: 4.25, hy: 2, hz: 4.25, color: 0xb2a289 },
          { x: -4.25, y: 6, z: 4.25, hx: 4.25, hy: 2, hz: 4.25, color: 0xb2a289 },
          { x: 4.25, y: 6, z: 4.25, hx: 4.25, hy: 2, hz: 4.25, color: 0xb9a98f },
          { x: 0, y: 8.6, z: 0, hx: 5, hy: 0.6, hz: 5, color: 0x8d8170 },
        ],
        height: 9.2,
        start: { x: 40, z: 20, yaw: 0.6 },
        socket: { x: 50, y: 4 * stumpFloors, z: -60, yaw: 0 },
        symmetry: Math.PI / 2,
        color: 0xffd23f,
      },
      // And a toppled clock tower to stand back up.
      monumentJob(-35, 40, 0x3fd0ff),
      // A bus that has ended up on the low block, to lift down onto the open ground beside it.
      busJob(-45, 12, -55, 0.4, -75, -45, 0xff7ad9),
    ],
    // A stretch of ground buried in rubble, to sweep clear.
    sweeps: [yardSweep],
    river: null,
    spawn: { x: 0, z: 70, yaw: Math.PI },
  };
}

/** Nothing but ground and a kaiju: for judging movement on its own, and for the movement tests. */
export function buildPlane(sim: Sim): void {
  addEnvironment(sim);
  populate(sim, {
    sizeX: 0,
    sizeZ: 0,
    blocks: [],
    plazas: [],
    streets: [],
    buildings: [],
    bridges: [],
    props: [],
    hazards: [],
    jobs: [],
    sweeps: [],
    river: null,
    spawn: { x: 0, z: 0, yaw: 0 },
  });
}

/** The test yard: a flat plane with a few things to knock about. The permanent tuning scene. */
export function buildYard(sim: Sim): void {
  addEnvironment(sim);
  populate(sim, yardLayout(reachFloors(sim.tuning)));
  const { R, world } = sim;

  // A box that drops in at start: the "is physics alive" check.
  const size = 6;
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(-80, 40, 10)
      .setAngvel({ x: 0.6, y: 0.3, z: 0.2 }),
  );
  world.createCollider(
    R.ColliderDesc.cuboid(size / 2, size / 2, size / 2)
      .setDensity(0.5)
      .setFriction(0.7)
      .setCollisionGroups(groups(Group.PROP, ALL_GROUPS)),
    body,
  );
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshLambertMaterial({ color: 0xe8b04a }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  sim.track(body, mesh);
  sim.parts.dropBox = body;
}
