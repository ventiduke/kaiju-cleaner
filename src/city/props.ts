import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ALL_GROUPS, Group, groups, type RigidBody } from '../core/physics';
import type { Sim, System } from '../sim';
import type { PropKind, PropSpec } from './cityGen';
import type { Damage } from './damage';
import { InstancedBodies } from './instanced';

/** Gives a geometry a flat vertex colour, optionally moved into place. */
function part(geometry: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

interface Box {
  hx: number;
  hy: number;
  hz: number;
  y: number;
}

interface KindDef {
  geometry: () => THREE.BufferGeometry;
  /** Collision boxes, relative to the prop's base at ground level. */
  boxes: Box[];
  density: number;
}

// All props are modelled with their origin on the ground, +z pointing "forward".
const KINDS: Record<PropKind, KindDef> = {
  car: {
    geometry: () =>
      mergeGeometries([
        part(new THREE.BoxGeometry(2, 0.9, 4.5), 0xffffff, 0, 0.75, 0),
        part(new THREE.BoxGeometry(1.8, 0.7, 2.3), 0xcfd8dc, 0, 1.5, -0.2),
      ]),
    boxes: [{ hx: 1, hy: 0.75, hz: 2.25, y: 0.75 }],
    density: 0.5,
  },
  lamp: {
    geometry: () =>
      mergeGeometries([
        part(new THREE.CylinderGeometry(0.18, 0.24, 7, 6), 0x4a4f57, 0, 3.5, 0),
        part(new THREE.BoxGeometry(0.5, 0.3, 1.6), 0xf5e9a8, 0, 7, 0.5),
      ]),
    boxes: [{ hx: 0.22, hy: 3.5, hz: 0.22, y: 3.5 }],
    density: 0.8,
  },
  tree: {
    geometry: () =>
      mergeGeometries([
        part(new THREE.CylinderGeometry(0.35, 0.45, 3.2, 6), 0x7a5a3a, 0, 1.6, 0),
        part(new THREE.IcosahedronGeometry(2.4, 0), 0x4f9a4a, 0, 4.8, 0),
      ]),
    boxes: [
      { hx: 0.4, hy: 1.6, hz: 0.4, y: 1.6 },
      { hx: 1.3, hy: 1.6, hz: 1.3, y: 4.8 },
    ],
    density: 0.25,
  },
  rubble: {
    // A lump of fallen wall: broken concrete with a few bent bars sticking out.
    geometry: () =>
      mergeGeometries([
        part(new THREE.BoxGeometry(3.3, 2.2, 2.8), 0xa7a39a, 0, 1.15, 0),
        part(new THREE.BoxGeometry(1.9, 1.3, 2.0).rotateY(0.5), 0x8f8b84, 0.9, 2.5, 0.2),
        part(new THREE.BoxGeometry(1.6, 1.0, 1.2).rotateY(-0.4), 0xb9b4a8, -1.2, 0.5, 1.3),
        part(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 4).rotateZ(0.9), 0x8a4a2a, -1.4, 2.3, -0.5),
        part(new THREE.CylinderGeometry(0.09, 0.09, 2.0, 4).rotateX(0.8), 0x8a4a2a, 0.6, 2.9, 1.1),
      ]),
    boxes: [{ hx: 1.65, hy: 1.1, hz: 1.4, y: 1.15 }],
    density: 0.5,
  },
  cart: {
    geometry: () =>
      mergeGeometries([
        part(new THREE.BoxGeometry(2.2, 1.4, 1.4), 0xffffff, 0, 1, 0),
        part(new THREE.ConeGeometry(1.9, 0.9, 8), 0xf4f1ea, 0, 2.9, 0),
        part(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 4), 0x4a4f57, 0, 2.1, 0),
      ]),
    boxes: [{ hx: 1.1, hy: 0.9, hz: 0.7, y: 0.9 }],
    density: 0.4,
  },
};

const DISTURBED_DISTANCE = 1.2;
/** Props hover a hair above the ground so they start asleep instead of settling for seconds. */
const REST_GAP = 0.03;

/** Cars, lamp posts, trees and carts: light dynamic bodies that scatter easily. */
export class PropField implements System {
  readonly total: number;
  private fields = new Map<PropKind, { field: InstancedBodies; home: Float32Array; disturbed: Uint8Array }>();

  constructor(
    private sim: Sim,
    private damage: Damage,
    specs: PropSpec[],
  ) {
    const { R, world } = sim;
    this.total = specs.length;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();
    for (const kind of Object.keys(KINDS) as PropKind[]) {
      const mine = specs.filter((s) => s.kind === kind);
      if (!mine.length) continue;
      const def = KINDS[kind];
      const field = new InstancedBodies(sim, def.geometry(), material, mine.length);
      const home = new Float32Array(mine.length * 2);
      mine.forEach((s, i) => {
        q.setFromAxisAngle(up, s.rotY);
        const body = world.createRigidBody(
          R.RigidBodyDesc.dynamic()
            .setTranslation(s.x, 0, s.z)
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
            .setLinearDamping(0.1)
            .setAngularDamping(0.4)
            .setSleeping(true),
        );
        for (const b of def.boxes) {
          world.createCollider(
            R.ColliderDesc.cuboid(b.hx, b.hy, b.hz)
              .setTranslation(0, b.y + REST_GAP, 0)
              .setDensity(def.density)
              .setFriction(0.6)
              .setCollisionGroups(groups(Group.PROP, ALL_GROUPS)),
            body,
          );
        }
        field.add(body, 1, 1, 1, s.color);
        home.set([s.x, s.z], i * 2);
      });
      this.fields.set(kind, { field, home, disturbed: new Uint8Array(mine.length) });
    }
  }

  postStep(): void {
    for (const { field, home, disturbed } of this.fields.values()) {
      field.capture();
      if (this.sim.tick % 6 !== 0) continue;
      for (const i of field.activeIndices()) {
        if (disturbed[i]) continue;
        const p = field.bodies[i]!.translation();
        if (Math.hypot(p.x - home[i * 2], p.z - home[i * 2 + 1]) > DISTURBED_DISTANCE || p.y > 1 || p.y < -0.5) {
          disturbed[i] = 1;
          this.damage.propsDisturbed++;
        }
      }
    }
  }

  /**
   * Throws props about. With a direction it is a blast (a sneeze): everything in a cone goes
   * with it. Without one it is a jolt from a point (the ground giving way): everything near
   * is tossed up and outward.
   */
  blast(origin: { x: number; z: number }, dir: { x: number; z: number } | null, range: number, spread: number, power: number): void {
    for (const { field } of this.fields.values()) {
      for (const body of field.bodies) {
        if (!body) continue;
        const p = body.translation();
        const dx = p.x - origin.x;
        const dz = p.z - origin.z;
        const dist = Math.hypot(dx, dz);
        if (dist > range) continue;
        if (dir && (dist < 0.01 || (dx * dir.x + dz * dir.z) / dist < spread)) continue;
        const fall = power * (1 - dist / range);
        const ux = dir ? dir.x : dx / Math.max(dist, 0.01);
        const uz = dir ? dir.z : dz / Math.max(dist, 0.01);
        body.setLinvel({ x: ux * fall, y: fall * 0.45, z: uz * fall }, true);
        body.setAngvel({ x: uz * 2, y: 1, z: -ux * 2 }, true);
      }
    }
  }

  /** The bodies of every prop of one kind, in the order they were listed. */
  bodiesOf(kind: PropKind): RigidBody[] {
    return (this.fields.get(kind)?.field.bodies.filter((b) => !!b) ?? []) as RigidBody[];
  }

  render(alpha: number): void {
    for (const { field } of this.fields.values()) field.apply(alpha);
  }
}
