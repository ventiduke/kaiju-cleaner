import { Sweeps } from '../city/sweeps';
import { addOutskirts } from '../gfx/backdrop';
import type { Look } from '../gfx/look';
import { Approval } from '../city/approval';
import { WaterMains } from '../city/mains';
import * as THREE from 'three';
import { generateCity, type CityLayout } from '../city/cityGen';
import { Damage } from '../city/damage';
import { Citizens } from '../city/citizens';
import { ChunkField } from '../city/destruction';
import { Pieces } from '../city/pieces';
import { PropField } from '../city/props';
import { RiverFlow } from '../city/river';
import type { BallTool } from '../core/ball';
import { Dust } from '../core/dust';
import { Kaiju } from '../kaiju/kaiju';
import { Nose } from '../kaiju/nose';
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

/** A patch of weak ground, and whether it has gone yet. */
export interface WeakSpot {
  x: number;
  z: number;
  radius: number;
  collapsed: boolean;
}

/**
 * Oil slicks (dark patches where nothing grips) and weak ground (cracked road over a
 * tunnel: a heavy footfall brings it down, tripping the kaiju and shaking loose whatever
 * stands nearby; tiptoe is light enough to cross).
 */
function addHazards(sim: Sim, layout: CityLayout, kaiju: Kaiju, chunks: ChunkField, props: PropField): WeakSpot[] {
  const oil = layout.hazards.filter((h) => h.kind === 'oil');
  if (oil.length) {
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

  const spots: WeakSpot[] = layout.hazards
    .filter((h) => h.kind === 'weak')
    .map((h) => ({ x: h.x, z: h.z, radius: h.radius, collapsed: false }));
  if (!spots.length) return spots;

  // Cracks: a few jagged lines across a slightly paler patch of road.
  const crackMaterial = new THREE.LineBasicMaterial({ color: 0x17181c });
  const patchMaterial = new THREE.MeshBasicMaterial({ color: 0x6b6f76, transparent: true, opacity: 0.55, depthWrite: false });
  const pitMaterial = new THREE.MeshBasicMaterial({ color: 0x0c0c10 });
  const rimMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3d44 });
  const visuals = spots.map((spot, n) => {
    const group = new THREE.Group();
    const patch = new THREE.Mesh(new THREE.CircleGeometry(spot.radius, 14), patchMaterial);
    patch.rotation.x = -Math.PI / 2;
    patch.position.y = 0.06;
    const points: THREE.Vector3[] = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + n;
      let px = 0;
      let pz = 0;
      for (let seg = 1; seg <= 4; seg++) {
        const r = (spot.radius * seg) / 4;
        const jitter = Math.sin(n * 7.1 + k * 3.3 + seg * 1.7) * 0.5;
        const nx = Math.cos(a + jitter * 0.4) * r;
        const nz = Math.sin(a + jitter * 0.4) * r;
        points.push(new THREE.Vector3(px, 0.1, pz), new THREE.Vector3(nx, 0.1, nz));
        px = nx;
        pz = nz;
      }
    }
    const cracks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), crackMaterial);
    const pit = new THREE.Mesh(new THREE.CircleGeometry(spot.radius, 14), pitMaterial);
    pit.rotation.x = -Math.PI / 2;
    pit.position.y = 0.11;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(spot.radius, 0.7, 5, 14), rimMaterial);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.2;
    pit.visible = rim.visible = false;
    group.add(patch, cracks, pit, rim);
    group.position.set(spot.x, 0, spot.z);
    sim.scene.add(group);
    return { patch, cracks, pit, rim };
  });

  // A foot in a pit stands lower.
  const baseGround = sim.ground;
  sim.ground = (x, z) => {
    for (const spot of spots) {
      if (spot.collapsed && Math.hypot(x - spot.x, z - spot.z) < spot.radius) return baseGround(x, z) - 5;
    }
    return baseGround(x, z);
  };

  const collapse = (spot: WeakSpot, n: number) => {
    spot.collapsed = true;
    const v = visuals[n];
    v.patch.visible = v.cracks.visible = false;
    v.pit.visible = v.rim.visible = true;
    sim.emit('groundCollapse', { x: spot.x, y: 0, z: spot.z, radius: spot.radius });
    chunks.shake(spot.x, spot.z, spot.radius + 9);
    props.blast(spot, null, spot.radius + 14, 0, 11);
    // The kaiju pitches toward the hole.
    const p = kaiju.body.translation();
    if (Math.hypot(p.x - spot.x, p.z - spot.z) < spot.radius + 20) kaiju.trip(spot.x - p.x, spot.z - p.z, 1.5);
  };
  sim.on('footfall', (e) => {
    // Tiptoe steps are too light to bring it down.
    if (e.strength < 0.32) return;
    spots.forEach((spot, n) => {
      if (!spot.collapsed && Math.hypot(e.x - spot.x, e.z - spot.z) < spot.radius) collapse(spot, n);
    });
  });
  sim.on('kaijuFall', (e) => {
    spots.forEach((spot, n) => {
      if (!spot.collapsed && Math.hypot(e.x - spot.x, e.z - spot.z) < spot.radius + 6) collapse(spot, n);
    });
  });
  return spots;
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
  const props = sim.add(new PropField(sim, damage, layout.props));
  sim.parts.props = props;
  const kaiju = sim.add(new Kaiju(sim, 0, layout.spawn, chunks));
  sim.parts.kaiju = kaiju;
  sim.parts.weakSpots = addHazards(sim, layout, kaiju, chunks, props);
  sim.parts.nose = sim.add(new Nose(sim, kaiju, chunks, props));
  sim.parts.citizens = sim.add(new Citizens(sim, layout, kaiju, damage));
  const citizens = sim.parts.citizens as Citizens;
  const pieces = sim.add(new Pieces(sim, layout.jobs, kaiju, chunks));
  sim.parts.pieces = pieces;
  sim.parts.mains = sim.add(new WaterMains(sim, layout.hazards, kaiju, props, citizens, sim.parts.nose as Nose));
  const sweeps = sim.add(new Sweeps(sim, layout.sweeps, props));
  sim.parts.sweeps = sweeps;
  const approval = sim.add(new Approval(sim, damage, pieces, citizens, kaiju, sweeps));
  sim.parts.approval = approval;
  sim.parts.jobs = approval.board;
  if (layout.river) {
    const flow = sim.add(new RiverFlow(sim, layout.river, chunks, layout.sizeX));
    flow.exclude(kaiju.body);
    sim.parts.river = flow;
  }
  sim.add(new Dust(sim));
}

export function buildCity(sim: Sim): void {
  const layout = generateCity(sim.tuning.city);
  addEnvironment(sim, Math.max(300, Math.max(layout.sizeX, layout.sizeZ) * 1.25), layout.river);
  addStreets(sim, layout);
  addOutskirts(sim, sim.parts.look as Look, layout.sizeX, layout.sizeZ, layout.river);
  populate(sim, layout);
}
