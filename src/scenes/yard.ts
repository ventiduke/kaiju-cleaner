import * as THREE from 'three';
import { ALL_GROUPS, Group, groups } from '../core/physics';
import type { Sim } from '../sim';
import { addEnvironment } from './common';

/** The test yard: a flat plane with a few things to knock about. The permanent tuning scene. */
export function buildYard(sim: Sim): void {
  addEnvironment(sim);
  const { R, world } = sim;

  // A box that drops in at start: the "is physics alive" check.
  const size = 6;
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(0, 40, -30)
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
