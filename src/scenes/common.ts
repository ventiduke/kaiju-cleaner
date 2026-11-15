import * as THREE from 'three';
import type { River } from '../city/cityGen';
import { WATER_SURFACE } from '../city/river';
import { ALL_GROUPS, Group, groups } from '../core/physics';
import type { Sim } from '../sim';

export const SKY = 0x9fc4e8;

/**
 * Sky, fog, lights and the ground: shared by every scene.
 * With a river, the ground is two banks and a lower bed, and `sim.ground` reports the drop.
 */
export function addEnvironment(sim: Sim, extent = 400, river: River | null = null): THREE.DirectionalLight {
  const { scene, world, R } = sim;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, extent * 0.9, extent * 2.6);

  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b6f5a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sun.position.set(-extent * 0.35, extent * 0.7, extent * 0.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  // The shadow box follows the action (see main.ts), so it only needs to cover what is on screen.
  const box = 190;
  cam.left = -box;
  cam.right = box;
  cam.top = box;
  cam.bottom = -box;
  cam.near = 1;
  cam.far = extent * 2;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.3;
  scene.add(sun);
  scene.add(sun.target);
  sim.parts.sun = sun;

  const far = extent * 3;
  const grass = new THREE.MeshLambertMaterial({ color: 0x7d8a6a });
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
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(far * 2, river.z1 - river.z0),
    new THREE.MeshLambertMaterial({ color: 0x2f7fb0, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WATER_SURFACE, (river.z0 + river.z1) / 2);
  water.renderOrder = 5;
  scene.add(water);
  return sun;
}
