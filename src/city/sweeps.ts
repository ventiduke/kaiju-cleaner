import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SweepSpec } from './cityGen';
import type { PropField } from './props';
import type { RigidBody } from '../core/physics';
import type { Sim, System } from '../sim';

export interface Sweep {
  spec: SweepSpec;
  /** The lumps that started on this stretch, and how many are still on it. */
  lumps: RigidBody[];
  remaining: number;
  done: boolean;
  tape: THREE.Object3D;
  marker: THREE.Mesh;
}

/** A stretch counts as clear with this many lumps (or fewer) still on it. */
const LEFTOVER = 1;

/**
 * Blocked roads: stretches of street buried in lumps of rubble, taped off. The job is to
 * get the rubble off the road, by any means: shouldering through it, kicking it, a sweep
 * of the tail, or a well-aimed sneeze. Where it ends up is somebody else's problem.
 */
export class Sweeps implements System {
  readonly sweeps: Sweep[] = [];
  cleared = 0;
  private time = 0;

  constructor(
    private sim: Sim,
    specs: SweepSpec[],
    props: PropField,
  ) {
    const lumps = props.bodiesOf('rubble');
    for (const spec of specs) {
      const mine = lumps.filter((b) => {
        const p = b.translation();
        return Math.abs(p.x - spec.x) <= spec.hx && Math.abs(p.z - spec.z) <= spec.hz;
      });
      // Hazard tape round the stretch: a striped line on the road along each edge. All the dashes of
      // one colour are merged into a single mesh, so the tape costs two draws however long it is.
      const tape = new THREE.Group();
      const yellow = new THREE.MeshBasicMaterial({ color: spec.color });
      const black = new THREE.MeshBasicMaterial({ color: 0x1c1f24 });
      const dashes: THREE.BufferGeometry[][] = [[], []];
      const edge = (x: number, z: number, lx: number, lz: number) => {
        const n = Math.max(2, Math.round(Math.max(lx, lz) / 1.6));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n - 0.5;
          const dash = new THREE.BoxGeometry(lx > lz ? lx / n : 0.7, 0.12, lx > lz ? 0.7 : lz / n);
          dash.translate(x + (lx > lz ? t * lx : 0), 0.1, z + (lx > lz ? 0 : t * lz));
          dashes[i % 2].push(dash);
        }
      };
      edge(spec.x, spec.z - spec.hz, spec.hx * 2, 0);
      edge(spec.x, spec.z + spec.hz, spec.hx * 2, 0);
      edge(spec.x - spec.hx, spec.z, 0, spec.hz * 2);
      edge(spec.x + spec.hx, spec.z, 0, spec.hz * 2);
      tape.add(new THREE.Mesh(mergeGeometries(dashes[0]), yellow), new THREE.Mesh(mergeGeometries(dashes[1]), black));
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(2.2), yellow);
      marker.position.set(spec.x, 16, spec.z);
      sim.scene.add(tape, marker);
      this.sweeps.push({ spec, lumps: mine, remaining: mine.length, done: mine.length <= LEFTOVER, tape, marker });
    }
  }

  allDone(): boolean {
    return this.sweeps.every((s) => s.done);
  }

  postStep(): void {
    // A few times a second is plenty.
    if (this.sim.tick % 12 !== 0) return;
    for (const sweep of this.sweeps) {
      if (sweep.done) continue;
      const s = sweep.spec;
      let on = 0;
      for (const b of sweep.lumps) {
        const p = b.translation();
        if (Math.abs(p.x - s.x) <= s.hx && Math.abs(p.z - s.z) <= s.hz && p.y > -3) on++;
      }
      sweep.remaining = on;
      if (on <= LEFTOVER) {
        sweep.done = true;
        this.cleared++;
        this.sim.emit('sweepDone', { x: s.x, y: 0, z: s.z });
      }
    }
  }

  render(_alpha: number, frameDt: number): void {
    this.time += frameDt;
    for (const sweep of this.sweeps) {
      sweep.marker.visible = !sweep.done;
      sweep.tape.visible = !sweep.done;
      sweep.marker.position.y = 16 + Math.sin(this.time * 2.4) * 1.2;
      sweep.marker.rotation.y = this.time * 1.5;
    }
  }
}
