import * as THREE from 'three';
import { ALL_GROUPS, Group, groups } from './physics';
import type { Sim, Tracked } from '../sim';

const MAX_BALLS = 10;

/** Debug tool: throws heavy balls to test breaking before (and after) the kaiju exists. */
export class BallTool {
  private balls: Tracked[] = [];
  private material = new THREE.MeshLambertMaterial({ color: 0xd9482b });

  constructor(private sim: Sim) {}

  throw(origin: THREE.Vector3, direction: THREE.Vector3): void {
    const { R, world, tuning } = this.sim;
    const { ballRadius, ballSpeed, ballDensity } = tuning.debug;
    const v = direction.clone().normalize().multiplyScalar(ballSpeed);
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(origin.x, origin.y, origin.z)
        .setLinvel(v.x, v.y, v.z)
        .setCcdEnabled(true),
    );
    world.createCollider(
      R.ColliderDesc.ball(ballRadius)
        .setDensity(ballDensity)
        .setRestitution(0.1)
        .setCollisionGroups(groups(Group.BALL, ALL_GROUPS)),
      body,
    );
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(ballRadius, 20, 14), this.material);
    mesh.castShadow = true;
    this.balls.push(this.sim.track(body, mesh));
    if (this.balls.length > MAX_BALLS) {
      const old = this.balls.shift()!;
      this.sim.untrack(old);
      world.removeRigidBody(old.body);
      (old.object as THREE.Mesh).geometry.dispose();
    }
  }
}
