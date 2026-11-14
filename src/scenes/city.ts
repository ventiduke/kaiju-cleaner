import * as THREE from 'three';
import { generateCity, type CityLayout } from '../city/cityGen';
import { Damage } from '../city/damage';
import { Citizens } from '../city/citizens';
import { ChunkField } from '../city/destruction';
import { Pieces } from '../city/pieces';
import { PropField } from '../city/props';
import type { BallTool } from '../core/ball';
import { Dust } from '../core/dust';
import { Kaiju } from '../kaiju/kaiju';
import type { Sim } from '../sim';
import { addEnvironment } from './common';

/** Asphalt, block slabs and lane dashes. Purely visual. */
function addStreets(sim: Sim, layout: CityLayout): void {
  // Asphalt under everything, in one piece or one per bank.
  const asphaltMaterial = new THREE.MeshLambertMaterial({ color: 0x4b4f58 });
  const r = layout.river;
  const bands: [number, number][] = r
    ? [
        [-layout.sizeZ / 2, r.z0],
        [r.z1, layout.sizeZ / 2],
      ]
    : [[-layout.sizeZ / 2, layout.sizeZ / 2]];
  for (const [z0, z1] of bands) {
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(layout.sizeX, z1 - z0), asphaltMaterial);
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.set(0, 0.03, (z0 + z1) / 2);
    asphalt.receiveShadow = true;
    sim.scene.add(asphalt);
  }

  const slabMaterial = new THREE.MeshLambertMaterial({ color: 0xb9b6ad });
  for (const b of layout.blocks) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.25, b.d), slabMaterial);
    slab.position.set(b.x, 0.1, b.z);
    slab.receiveShadow = true;
    sim.scene.add(slab);
  }

  const plazaMaterial = new THREE.MeshLambertMaterial({ color: 0xd6cdb8 });
  for (const b of layout.plazas) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(b.w - 3, 0.3, b.d - 3), plazaMaterial);
    slab.position.set(b.x, 0.12, b.z);
    slab.receiveShadow = true;
    sim.scene.add(slab);
  }

  const dashes: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const none = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (const s of layout.streets) {
    const half = (s.along === 'z' ? layout.sizeZ : layout.sizeX) / 2;
    for (let t = -half + 4; t < half - 4; t += 9) {
      // No lane markings on the water.
      if (r && s.along === 'z' && t > r.z0 - 2 && t < r.z1 + 2) continue;
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

/** Oil slicks: dark patches where nothing grips. */
function addHazards(sim: Sim, layout: CityLayout): void {
  const oil = layout.hazards.filter((h) => h.kind === 'oil');
  if (!oil.length) return;
  const material = new THREE.MeshBasicMaterial({ color: 0x15131c, transparent: true, opacity: 0.88, depthWrite: false });
  const sheen = new THREE.MeshBasicMaterial({ color: 0x6b4fa8, transparent: true, opacity: 0.35, depthWrite: false });
  for (const h of oil) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(h.radius, 20), material);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(h.x, 0.07, h.z);
    pool.scale.set(1, 0.8, 1);
    const gloss = new THREE.Mesh(new THREE.RingGeometry(h.radius * 0.35, h.radius * 0.6, 20, 1, 0.4, 2.2), sheen);
    gloss.rotation.x = -Math.PI / 2;
    gloss.position.set(h.x, 0.09, h.z);
    sim.scene.add(pool, gloss);
  }
  sim.traction = (x, z) => {
    for (const h of oil) if (Math.hypot(x - h.x, (z - h.z) / 0.8) < h.radius) return 0.06;
    return 1;
  };
}

/** Buildings, props and the damage tally for a layout. Shared by the city and the yard. */
export function populate(sim: Sim, layout: CityLayout): void {
  const damage = new Damage();
  sim.parts.damage = damage;
  sim.parts.layout = layout;
  const chunks = sim.add(new ChunkField(sim, damage, layout.buildings, layout.bridges));
  sim.parts.chunks = chunks;
  const ball = sim.parts.ball as BallTool;
  ball.onSpawn = (body) => chunks.addHitter(body, sim.tuning.debug.ballRadius);
  ball.onRemove = (body) => chunks.removeHitter(body);
  sim.parts.props = sim.add(new PropField(sim, damage, layout.props));
  addHazards(sim, layout);
  const kaiju = sim.add(new Kaiju(sim, 0, layout.spawn, chunks));
  sim.parts.kaiju = kaiju;
  sim.parts.citizens = sim.add(new Citizens(sim, layout, kaiju, damage));
  sim.parts.pieces = sim.add(new Pieces(sim, layout.jobs, kaiju));
  sim.add(new Dust(sim));
}

export function buildCity(sim: Sim): void {
  const layout = generateCity(sim.tuning.city);
  addEnvironment(sim, Math.max(300, Math.max(layout.sizeX, layout.sizeZ) * 1.25), layout.river);
  addStreets(sim, layout);
  populate(sim, layout);
}
