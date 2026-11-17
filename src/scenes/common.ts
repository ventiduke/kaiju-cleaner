import * as THREE from 'three';
import type { River, Water } from '../city/cityGen';
import { WATER_SURFACE } from '../city/river';
import { ALL_GROUPS, Group, groups } from '../core/physics';
import { addHills } from '../gfx/backdrop';
import { Look } from '../gfx/look';
import { makeSky } from '../gfx/sky';
import { waterMaterial } from '../gfx/water';
import type { Sim } from '../sim';

/**
 * Sky, fog, lights and the ground: shared by every scene.
 * With a river, the ground is two banks and a lower bed, and `sim.ground` reports the drop.
 */
export function addEnvironment(sim: Sim, extent = 400, river: River | null = null, waters: Water[] = []): THREE.DirectionalLight {
  const { scene, world, R } = sim;
  const look = new Look(scene, extent);
  look.set(sim.tuning.gfx.hour);
  sim.parts.look = look;
  scene.add(makeSky(look));
  addHills(scene, extent);

  const sun = look.sun;
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const cam = sun.shadow.camera;
  // The shadow box follows the action (see main.ts), so it only needs to cover what is on screen.
  const box = 200;
  cam.left = -box;
  cam.right = box;
  cam.top = box;
  cam.bottom = -box;
  cam.near = 1;
  cam.far = extent * 2.4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.35;
  sim.parts.sun = sun;

  const far = extent * 3;
  const grass = new THREE.MeshLambertMaterial({ color: 0x7f9a62 });
  /** A slab of ground between two z values, with its top at `top`. */
  const slab = (z0: number, z1: number, top: number, material: THREE.Material) => {
    const depth = z1 - z0;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(far * 2, depth), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, top, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, top - 10, (z0 + z1) / 2));
    world.createCollider(
      R.ColliderDesc.cuboid(far, 10, depth / 2)
        .setFriction(0.9)
        .setCollisionGroups(groups(Group.GROUND, ALL_GROUPS)),
      body,
    );
  };

  if (waters.length) {
    addWaters(sim, look, far, waters, grass);
    return sun;
  }
  if (!river) {
    slab(-far, far, 0, grass);
    return sun;
  }

  slab(-far, river.z0, 0, grass);
  slab(river.z1, far, 0, grass);
  slab(river.z0, river.z1, -river.depth, new THREE.MeshLambertMaterial({ color: 0x33443f }));
  sim.ground = (_x, z) => (z > river.z0 && z < river.z1 ? -river.depth : 0);

  // Bank walls, then the water itself: see-through, so wreckage on the bed still shows.
  const wall = new THREE.MeshLambertMaterial({ color: 0x8b8a84, side: THREE.DoubleSide });
  for (const z of [river.z0, river.z1]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(far * 2, river.depth), wall);
    mesh.position.set(0, -river.depth / 2, z);
    scene.add(mesh);
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(far * 2, river.z1 - river.z0), waterMaterial(look, sim.tuning.city.riverCurrent));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WATER_SURFACE, (river.z0 + river.z1) / 2);
  water.renderOrder = 5;
  scene.add(water);
  return sun;
}

/**
 * Ground with rectangles of water let into it: a lake front, a river that forks. The plane is
 * cut into cells along every edge of every rectangle; a cell is either land (at 0) or the bed
 * of whichever water covers it. Each run of like cells is one slab, with a wall wherever land
 * meets water and a sheet of water over each rectangle.
 */
function addWaters(sim: Sim, look: Look, far: number, waters: Water[], grass: THREE.Material): void {
  const { scene, world, R } = sim;
  const cut = (pick: (w: Water) => [number, number]) =>
    [...new Set([-far, far, ...waters.flatMap((w) => pick(w).map((v) => THREE.MathUtils.clamp(v, -far, far)))])].sort((a, b) => a - b);
  const xs = cut((w) => [w.x0, w.x1]);
  const zs = cut((w) => [w.z0, w.z1]);
  const depthAt = (x: number, z: number) => {
    let d = 0;
    for (const w of waters) if (x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1) d = Math.max(d, w.depth);
    return d;
  };
  sim.ground = (x, z) => {
    const d = depthAt(x, z);
    return d ? -d : 0;
  };

  const bed = new THREE.MeshLambertMaterial({ color: 0x33443f });
  const wall = new THREE.MeshLambertMaterial({ color: 0x8b8a84, side: THREE.DoubleSide });
  const slab = (x0: number, x1: number, z0: number, z1: number, top: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), top < 0 ? bed : grass);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, top, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation((x0 + x1) / 2, top - 10, (z0 + z1) / 2));
    world.createCollider(
      R.ColliderDesc.cuboid((x1 - x0) / 2, 10, (z1 - z0) / 2)
        .setFriction(0.9)
        .setCollisionGroups(groups(Group.GROUND, ALL_GROUPS)),
      body,
    );
  };
  /** A wall down to the bed along one edge of a cell, where the cell beside it is higher. */
  const bank = (ax: number, az: number, bx: number, bz: number, depth: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(bx - ax, bz - az), depth), wall);
    mesh.position.set((ax + bx) / 2, -depth / 2, (az + bz) / 2);
    if (ax === bx) mesh.rotation.y = Math.PI / 2;
    scene.add(mesh);
  };
  for (let j = 0; j < zs.length - 1; j++) {
    let from = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      const d = depthAt((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2);
      // Walls: against the cell to the west, and the one to the north, if they differ.
      if (i > 0) {
        const west = depthAt((xs[i - 1] + xs[i]) / 2, (zs[j] + zs[j + 1]) / 2);
        if (west !== d) bank(xs[i], zs[j], xs[i], zs[j + 1], Math.max(west, d));
      }
      if (j > 0) {
        const north = depthAt((xs[i] + xs[i + 1]) / 2, (zs[j - 1] + zs[j]) / 2);
        if (north !== d) bank(xs[i], zs[j], xs[i + 1], zs[j], Math.max(north, d));
      }
      // One slab for each run of cells at the same level.
      const next = i + 1 < xs.length - 1 ? depthAt((xs[i + 1] + xs[i + 2]) / 2, (zs[j] + zs[j + 1]) / 2) : NaN;
      if (next !== d) {
        slab(xs[from], xs[i + 1], zs[j], zs[j + 1], -d);
        from = i + 1;
      }
    }
  }
  // The water itself: see-through, so wreckage on the bed still shows. It does not flow.
  const surface = waterMaterial(look, 0);
  for (const w of waters) {
    const x0 = Math.max(w.x0, -far);
    const x1 = Math.min(w.x1, far);
    const z0 = Math.max(w.z0, -far);
    const z1 = Math.min(w.z1, far);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), surface);
    water.rotation.x = -Math.PI / 2;
    water.position.set((x0 + x1) / 2, WATER_SURFACE, (z0 + z1) / 2);
    water.renderOrder = 5;
    scene.add(water);
  }
}
