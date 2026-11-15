import * as THREE from 'three';
import type { Sim, System } from '../sim';

/** A material for puffs of dust and smoke: spheres that fade out toward their edges, so they read as soft. */
export function puffMaterial(color: number, opacity: number): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color, transparent: true, opacity, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      diffuseColor.a *= pow(clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 1.7);`,
    );
  };
  material.customProgramCacheKey = () => 'puff';
  return material;
}

const PER_SOURCE = 10;
const LIFE = 9;
const m = new THREE.Matrix4();
const p = new THREE.Vector3();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();

/**
 * Columns of smoke from wherever something is still broken: a slow, leaning plume that can
 * be seen from across the city. Purely for show (and for finding the jobs).
 */
export class Smoke implements System {
  private mesh: THREE.InstancedMesh;
  private time = 0;

  constructor(
    sim: Sim,
    private sources: () => { x: number; y: number; z: number }[],
    max = 12,
  ) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), puffMaterial(0x4a4a50, 0.5), max * PER_SOURCE);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    sim.scene.add(this.mesh);
  }

  render(_alpha: number, frameDt: number): void {
    this.time += frameDt;
    let n = 0;
    const max = this.mesh.instanceMatrix.count;
    this.sources().forEach((src, k) => {
      for (let i = 0; i < PER_SOURCE && n < max; i++) {
        const t = ((this.time + (i / PER_SOURCE) * LIFE + k * 1.7) % LIFE) / LIFE;
        const wobble = Math.sin(this.time * 0.7 + i * 2.1 + k) * 1.5;
        p.set(src.x + t * t * 26 + wobble * t, src.y + 1 + t * 46, src.z + wobble * t * 0.6);
        // Small and dense at the bottom; big and thin (shrinking to nothing) at the top.
        const size = (1.6 + t * 8) * Math.min(1, t * 8) * Math.min(1, (1 - t) * 3);
        this.mesh.setMatrixAt(n++, m.compose(p, q, s.setScalar(size)));
      }
    });
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
