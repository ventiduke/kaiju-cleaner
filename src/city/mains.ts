import * as THREE from 'three';
import type { Hazard } from './cityGen';
import type { Citizens } from './citizens';
import type { PropField } from './props';
import type { Kaiju } from '../kaiju/kaiju';
import type { Nose } from '../kaiju/nose';
import type { Sim, System } from '../sim';

/** How long a burst main sprays, how long the road stays wet after, and how far the wet reaches. */
const SPRAY_SECONDS = 16;
const DRY_SECONDS = 9;
const WET_RADIUS = 15;
const WET_TRACTION = 0.3;
/** A foot has to land this close to the middle of the cover to burst it: near enough that walking over one always does. */
const TRIGGER_RADIUS = 7.5;
const DROPS = 70;
const m4 = new THREE.Matrix4();
const v = new THREE.Vector3();
const scl = new THREE.Vector3();
const none = new THREE.Quaternion();

export interface Main {
  x: number;
  z: number;
  /** Sim time it burst at, or -1 while it is still whole. */
  burstAt: number;
}

/**
 * Water mains: a blue cover in the road. A heavy foot on one bursts it (tiptoe is light
 * enough not to). Up goes a geyser, which throws about whatever is on top of it (cars,
 * people, the kaiju's balance) and leaves the road round it slippery until it dries.
 * It isn't all bad: standing in the spray washes the dust out of the kaiju's nose.
 */
export class WaterMains implements System {
  readonly mains: Main[];
  bursts = 0;
  private columns: THREE.Mesh[] = [];
  private pools: THREE.Mesh[] = [];
  private drops: THREE.InstancedMesh | null = null;
  private pulse = 0;
  private time = 0;

  constructor(
    private sim: Sim,
    hazards: Hazard[],
    private kaiju: Kaiju,
    private props: PropField | null,
    private citizens: Citizens | null,
    private nose: Nose | null,
  ) {
    this.mains = hazards.filter((h) => h.kind === 'main').map((h) => ({ x: h.x, z: h.z, burstAt: -1 }));
    if (!this.mains.length) return;

    const cover = new THREE.MeshLambertMaterial({ color: 0x2f6fd0 });
    const ring = new THREE.MeshBasicMaterial({ color: 0xbfe2ff });
    const water = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.55, depthWrite: false });
    const wet = new THREE.MeshBasicMaterial({ color: 0x2c4a66, transparent: true, opacity: 0.4, depthWrite: false });
    for (const main of this.mains) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.3, 16), cover);
      plate.position.set(main.x, 0.15, main.z);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(3, 0.3, 5, 18), ring);
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(main.x, 0.32, main.z);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.9, 1, 9, 1, true), water);
      column.position.set(main.x, 0, main.z);
      column.visible = false;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(WET_RADIUS, 22), wet);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(main.x, 0.08, main.z);
      pool.visible = false;
      sim.scene.add(plate, rim, column, pool);
      this.columns.push(column);
      this.pools.push(pool);
    }
    this.drops = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xe6f5ff, transparent: true, opacity: 0.8, depthWrite: false }),
      DROPS * this.mains.length,
    );
    this.drops.count = 0;
    this.drops.frustumCulled = false;
    sim.scene.add(this.drops);

    // Wet road grips badly.
    const base = sim.traction;
    sim.traction = (x, z) => {
      let t = base(x, z);
      for (const main of this.mains) {
        if (this.wetness(main) > 0 && Math.hypot(x - main.x, z - main.z) < WET_RADIUS) t = Math.min(t, WET_TRACTION);
      }
      return t;
    };

    sim.on('footfall', (e) => {
      // Tiptoe steps are too light to burst one.
      if (e.strength < 0.32) return;
      for (const main of this.mains) if (main.burstAt < 0 && Math.hypot(e.x - main.x, e.z - main.z) < TRIGGER_RADIUS) this.burst(main);
    });
    sim.on('kaijuFall', (e) => {
      for (const main of this.mains) if (main.burstAt < 0 && Math.hypot(e.x - main.x, e.z - main.z) < TRIGGER_RADIUS + 5) this.burst(main);
    });
  }

  /** 1 while it sprays, falling to 0 as the road dries; 0 for a main that is whole. */
  wetness(main: Main): number {
    if (main.burstAt < 0) return 0;
    const since = this.sim.time - main.burstAt;
    return since < SPRAY_SECONDS ? 1 : Math.max(0, 1 - (since - SPRAY_SECONDS) / DRY_SECONDS);
  }

  spraying(main: Main): boolean {
    return main.burstAt >= 0 && this.sim.time - main.burstAt < SPRAY_SECONDS;
  }

  burst(main: Main): void {
    if (main.burstAt >= 0) return;
    main.burstAt = this.sim.time;
    this.bursts++;
    this.sim.emit('mainBurst', { x: main.x, y: 0, z: main.z });
    this.props?.blast(main, null, 16, 0, 15);
    this.citizens?.jolt(main.x, main.z, 9, 16);
    // The kaiju is knocked off the cover it just stood on.
    const p = this.kaiju.body.translation();
    const d = Math.hypot(p.x - main.x, p.z - main.z);
    if (d < 14) {
      const ax = (p.x - main.x) / Math.max(d, 0.1);
      const az = (p.z - main.z) / Math.max(d, 0.1);
      this.kaiju.trip(ax, az, 1.2);
      // And up it goes, a little away from the middle of the spout.
      const up = this.sim.tuning.hazards.geyser;
      this.kaiju.launch(up * (1 - d / 40), ax * 6, az * 6);
    }
  }

  postStep(dt: number): void {
    if (!this.mains.length) return;
    this.pulse -= dt;
    const beat = this.pulse <= 0;
    if (beat) this.pulse = 0.45;
    const p = this.kaiju.body.translation();
    for (const main of this.mains) {
      if (!this.spraying(main)) continue;
      // Whatever sits on the geyser gets tossed again.
      if (beat) {
        this.props?.blast(main, null, 5, 0, 9);
        this.citizens?.jolt(main.x, main.z, 3.5, 13);
      }
      // A good rinse for a dusty nose.
      if (this.nose && Math.hypot(p.x - main.x, p.z - main.z) < 12) this.nose.tickle = Math.max(0, this.nose.tickle - 0.45 * dt);
    }
  }

  render(_alpha: number, frameDt: number): void {
    if (!this.drops) return;
    this.time += frameDt;
    let n = 0;
    this.mains.forEach((main, i) => {
      const wet = this.wetness(main);
      const spraying = this.spraying(main);
      this.pools[i].visible = wet > 0;
      (this.pools[i].material as THREE.MeshBasicMaterial).opacity = 0.4 * wet;
      const column = this.columns[i];
      column.visible = spraying;
      if (!spraying) return;
      // It comes up with a rush and sags as the pressure goes.
      const since = this.sim.time - main.burstAt;
      const height = 34 * Math.min(1, since * 3) * (1 - 0.6 * (since / SPRAY_SECONDS) ** 2) * (1 + 0.06 * Math.sin(this.time * 17 + i));
      column.scale.set(1, height, 1);
      column.position.y = height / 2;
      // Spray: droplets on fixed arcs, each on its own clock.
      for (let k = 0; k < DROPS; k++) {
        const life = 1.9;
        const u = ((this.time + k * 0.37 + i) % life) / life;
        const a = k * 2.399;
        const out = (4 + (k % 7) * 1.6) * u;
        v.set(main.x + Math.cos(a) * out, height * (0.35 + 0.65 * (1 - (2 * u - 0.9) ** 2)), main.z + Math.sin(a) * out);
        if (v.y < 0) continue;
        const size = 0.6 + (k % 3) * 0.35;
        this.drops!.setMatrixAt(n++, m4.compose(v, none, scl.setScalar(size)));
      }
    });
    this.drops.count = n;
    this.drops.instanceMatrix.needsUpdate = true;
  }
}
