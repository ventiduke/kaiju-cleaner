import * as THREE from 'three';
import { generateCity, type CityLayout } from '../city/cityGen';
import { Damage } from '../city/damage';
import { ChunkField } from '../city/destruction';
import { PropField } from '../city/props';
import type { BallTool } from '../core/ball';
import { Kaiju } from '../kaiju/kaiju';
import type { Sim } from '../sim';
import { addEnvironment } from './common';

/** Asphalt, block slabs and lane dashes. Purely visual. */
function addStreets(sim: Sim, layout: CityLayout): void {
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.size, layout.size),
    new THREE.MeshLambertMaterial({ color: 0x4b4f58 }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0.03;
  asphalt.receiveShadow = true;
  sim.scene.add(asphalt);

  const slabMaterial = new THREE.MeshLambertMaterial({ color: 0xb9b6ad });
  for (const b of layout.blocks) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.25, b.d), slabMaterial);
    slab.position.set(b.x, 0.1, b.z);
    slab.receiveShadow = true;
    sim.scene.add(slab);
  }

  const dashes: THREE.Matrix4[] = [];
  const half = layout.size / 2;
  const m = new THREE.Matrix4();
  const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const none = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (const s of layout.streets) {
    for (let t = -half + 4; t < half - 4; t += 9) {
      const pos = s.along === 'z' ? new THREE.Vector3(s.center, 0.05, t) : new THREE.Vector3(t, 0.05, s.center);
      dashes.push(m.compose(pos, s.along === 'z' ? none : quarter, one).clone());
    }
  }
  const dashMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.4, 0.02, 4),
    new THREE.MeshBasicMaterial({ color: 0xd8d4c0 }),
    dashes.length,
  );
  dashes.forEach((d, i) => dashMesh.setMatrixAt(i, d));
  sim.scene.add(dashMesh);
}

/** Buildings, props and the damage tally for a layout. Shared by the city and the yard. */
export function populate(sim: Sim, layout: CityLayout): void {
  const damage = new Damage();
  sim.parts.damage = damage;
  sim.parts.layout = layout;
  const chunks = sim.add(new ChunkField(sim, damage, layout.buildings));
  sim.parts.chunks = chunks;
  const ball = sim.parts.ball as BallTool;
  ball.onSpawn = (body) => chunks.addHitter(body, sim.tuning.debug.ballRadius);
  ball.onRemove = (body) => chunks.removeHitter(body);
  sim.parts.props = sim.add(new PropField(sim, damage, layout.props));
  sim.parts.kaiju = sim.add(new Kaiju(sim, 0, layout.spawn, chunks));
}

export function buildCity(sim: Sim): void {
  const layout = generateCity(sim.tuning.city);
  addEnvironment(sim, Math.max(300, layout.size * 1.25));
  addStreets(sim, layout);
  populate(sim, layout);
}
