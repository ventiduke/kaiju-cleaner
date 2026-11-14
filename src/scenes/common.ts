import * as THREE from 'three';
import { ALL_GROUPS, Group, groups } from '../core/physics';
import type { Sim } from '../sim';

export const SKY = 0x9fc4e8;

/** Sky, fog, lights and the ground: shared by every scene. */
export function addEnvironment(sim: Sim, extent = 400): THREE.DirectionalLight {
  const { scene, world, R } = sim;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, extent * 0.9, extent * 2.6);

  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b6f5a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sun.position.set(-extent * 0.35, extent * 0.7, extent * 0.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -extent * 0.5;
  cam.right = extent * 0.5;
  cam.top = extent * 0.5;
  cam.bottom = -extent * 0.5;
  cam.near = 1;
  cam.far = extent * 2;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.3;
  scene.add(sun);
  scene.add(sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 6, extent * 6),
    new THREE.MeshLambertMaterial({ color: 0x7d8a6a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -5, 0));
  world.createCollider(
    R.ColliderDesc.cuboid(extent * 3, 5, extent * 3)
      .setFriction(0.9)
      .setCollisionGroups(groups(Group.GROUND, ALL_GROUPS)),
    body,
  );
  return sun;
}
