import * as THREE from 'three';
import type { River } from '../city/cityGen';
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
export function addEnvironment(sim: Sim, extent = 400, river: River | null = null): THREE.DirectionalLight {
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
