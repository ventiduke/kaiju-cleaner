import * as THREE from 'three';
import { Rng } from '../core/rng';
import { ALL_GROUPS, Group, groups } from '../core/physics';
import type { Sim } from '../sim';
import { Face, facadeMaterial } from './facade';
import type { Look } from './look';

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Hills on the horizon, all the way round: far enough off that the haze does half the work. */
export function addHills(scene: THREE.Scene, extent: number): void {
  const rng = new Rng(81);
  const material = new THREE.MeshLambertMaterial({ color: 0x5f7358, flatShading: true });
  const count = 46;
  const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7, 1), material, count);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.range(-0.05, 0.05);
    const far = i % 2 === 0;
    const dist = extent * (far ? rng.range(3.6, 4.4) : rng.range(2.7, 3.2));
    const height = extent * (far ? rng.range(0.5, 1.05) : rng.range(0.22, 0.5));
    const width = extent * rng.range(0.9, 1.5);
    p.set(Math.cos(a) * dist, height / 2 - 4, Math.sin(a) * dist);
    q.setFromAxisAngle(UP, rng.range(0, 6.28));
    mesh.setMatrixAt(i, m.compose(p, q, s.set(width, height, width * rng.range(0.7, 1.2))));
    mesh.setColorAt(i, c.setHex(far ? 0x7f8f86 : 0x66785c).multiplyScalar(rng.range(0.85, 1.1)));
  }
  mesh.frustumCulled = false;
  scene.add(mesh);
}

/**
 * The rest of the town, beyond the job site: a few hundred plain buildings that cannot be
 * walked to or knocked down, thinning out with distance. Between them and the site runs a
 * striped barrier, with a wall the kaiju cannot cross along it (only the kaiju: rubble and
 * the river pass straight through).
 */
export function addOutskirts(
  sim: Sim,
  look: Look,
  sizeX: number,
  sizeZ: number,
  river: { z0: number; z1: number } | null,
  /** For a level with a lake front: true where there is open water, and so no town and no barrier posts. */
  open: (x: number, z: number) => boolean = () => false,
): void {
  const { scene, world, R } = sim;
  const rng = new Rng(4711);
  const hx = sizeX / 2 + 70;
  const hz = sizeZ / 2 + 70;

  // The barrier, and the wall behind it.
  const stripes = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const posts: THREE.Matrix4[] = [];
  const tones: number[] = [];
  const along = (x0: number, z0: number, x1: number, z1: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(length / 9);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const z = z0 + (z1 - z0) * t;
      if (river && z > river.z0 - 4 && z < river.z1 + 4) continue;
      if (open(x0 + (x1 - x0) * t, z)) continue;
      p.set(x0 + (x1 - x0) * t, 1.6, z);
      q.setFromAxisAngle(UP, Math.atan2(x1 - x0, z1 - z0));
      posts.push(m.compose(p, q, s.set(1.2, 3.2, 8.6)).clone());
      tones.push(i % 2 === 0 ? 0xff7a1a : 0xf4f1ea);
    }
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation((x0 + x1) / 2, 60, (z0 + z1) / 2));
    world.createCollider(
      R.ColliderDesc.cuboid(Math.abs(x1 - x0) / 2 + 3, 90, Math.abs(z1 - z0) / 2 + 3).setCollisionGroups(
        groups(Group.GROUND, Group.BODY | Group.TAIL),
      ),
      body,
    );
  };
  along(-hx, -hz, hx, -hz);
  along(-hx, hz, hx, hz);
  along(-hx, -hz, -hx, hz);
  along(hx, -hz, hx, hz);
  const barrier = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stripes, posts.length);
  posts.forEach((mat, i) => {
    barrier.setMatrixAt(i, mat);
    barrier.setColorAt(i, c.setHex(tones[i]));
  });
  barrier.castShadow = true;
  scene.add(barrier);

  // The town beyond: rings of blocks on a loose grid, taller near the site.
  const boxes: { x: number; z: number; w: number; d: number; h: number; color: number }[] = [];
  const COLORS = [0xc9b79c, 0xb5c4cf, 0xcfa98f, 0xa9b0b8, 0xd6c7a8, 0x9fa9b5, 0xc4a79a, 0xb7b29f];
  const reach = Math.max(sizeX, sizeZ) * 1.9;
  const pitch = 46;
  for (let x = -reach; x <= reach; x += pitch) {
    for (let z = -reach; z <= reach; z += pitch) {
      const out = Math.max(Math.abs(x) - hx, Math.abs(z) - hz);
      if (out < 55) continue;
      if (river && z > river.z0 - 26 && z < river.z1 + 26) continue;
      if (open(x, z)) continue;
      const fade = 1 - out / (reach - Math.min(hx, hz));
      if (!rng.chance(0.3 + 0.55 * fade)) continue;
      const w = rng.range(16, 30);
      const d = rng.range(16, 30);
      const floors = Math.max(2, Math.round(rng.range(2, 6) + 12 * fade * rng.next() * rng.next()));
      boxes.push({ x: x + rng.range(-9, 9), z: z + rng.range(-9, 9), w, d, h: floors * 4, color: rng.pick(COLORS) });
    }
  }
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const faces = new Float32Array(boxes.length * 2);
  const town = new THREE.InstancedMesh(geometry, facadeMaterial(look), boxes.length);
  boxes.forEach((b, i) => {
    town.setMatrixAt(i, m.compose(p.set(b.x, b.h / 2, b.z), q.identity(), s.set(b.w, b.h, b.d)));
    town.setColorAt(i, c.setHex(b.color).multiplyScalar(rng.range(0.8, 1.05)));
    faces[i * 2] = Face.PX | Face.NX | Face.PZ | Face.NZ | Face.ROOF | Face.STREET;
    faces[i * 2 + 1] = rng.int(0, 99);
  });
  geometry.setAttribute('aFace', new THREE.InstancedBufferAttribute(faces, 2));
  town.frustumCulled = false;
  scene.add(town);
  // (They neither cast nor take the sun's shadow: its shadow box only covers the site.)
}

// Kept so that importing this file for its types costs nothing at run time.
export const BACKDROP_GROUPS = groups(Group.GROUND, ALL_GROUPS);
