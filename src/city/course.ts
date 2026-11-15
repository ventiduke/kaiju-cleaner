import * as THREE from 'three';
import type { Damage } from './damage';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim, System } from '../sim';

export interface Point {
  x: number;
  z: number;
}

/** One leg of the course: where it ends, how wide the road is, and what it is there to test. */
export interface Section {
  name: string;
  /** What the leg asks of the player, in a few words, shown as they enter it. */
  brief: string;
  /** Road width between the kerbs (m). */
  width: number;
  /** The corner points of this leg's centre line, ending at its gate. */
  path: Point[];
  /** The line to drive, where that is not straight down the middle (a slalom). Ends at the gate too. */
  line?: Point[];
}

export interface CourseSpec {
  name: string;
  start: Point;
  /** Heading at the start (0 faces +z). */
  yaw: number;
  sections: Section[];
  /** Stretches where staying low is the point (skybridges), and where stepping lightly is (thin ground). */
  crawlZones: { x: number; z: number; radius: number }[];
  tiptoeZones: { x: number; z: number; radius: number }[];
  /** Low walls across the road, to be jumped (or walked through, at a price). */
  hurdles?: Point[];
  /** Towers standing in the road, to be gone round. */
  pillars?: Point[];
}

export interface Leg {
  name: string;
  seconds: number;
  chunks: number;
  buildings: number;
  props: number;
  stumbles: number;
  falls: number;
}

export interface CourseResult {
  finished: boolean;
  /** Clock time for the run, and what it comes to once the damage is charged for. */
  seconds: number;
  penalty: number;
  score: number;
  legs: Leg[];
  buildings: number;
  chunks: number;
  falls: number;
  stumbles: number;
}

/** Seconds added to the clock for each building knocked about, and for each fall. */
export const PENALTY = { building: 2, fall: 3 };

const COLORS = [0x3fd0ff, 0xffd23f, 0xff7ad9, 0x8cff66, 0xff9a3f, 0xb69cff, 0xffffff];

/**
 * A timed run through a fixed route: a start line, then a gate at the end of each leg. It
 * keeps the clock, and what was broken on each leg, so that a change to how the kaiju moves
 * can be judged by numbers as well as by feel: a faster time is only better if the street
 * is still standing.
 */
export class Course implements System {
  state: 'ready' | 'running' | 'done' = 'ready';
  /** Which leg the kaiju is on (the index of the next gate). */
  leg = 0;
  readonly legs: Leg[] = [];
  private startTick = 0;
  private endTick = 0;
  private legStart = 0;
  private mark = { chunks: 0, buildings: 0, props: 0, stumbles: 0, falls: 0 };
  private pylons: THREE.Mesh[][] = [];
  private time = 0;

  constructor(
    private sim: Sim,
    readonly spec: CourseSpec,
    private kaiju: Kaiju,
    private damage: Damage,
  ) {
    // A pair of tall lights at each gate, one on either kerb, and a bar across the road between them.
    spec.sections.forEach((section, i) => {
      const end = section.path[section.path.length - 1];
      const before = section.path[section.path.length - 2] ?? spec.start;
      const dx = end.x - before.x;
      const dz = end.z - before.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dz / len;
      const nz = -dx / len;
      const color = COLORS[i % COLORS.length];
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const pair: THREE.Mesh[] = [];
      for (const side of [-1, 1]) {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 46, 1.2), material);
        pylon.position.set(end.x + nx * side * (section.width / 2 + 1), 23, end.z + nz * side * (section.width / 2 + 1));
        sim.scene.add(pylon);
        pair.push(pylon);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(section.width, 0.14, 2.2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }));
      bar.position.set(end.x, 0.12, end.z);
      bar.rotation.y = Math.atan2(nx, nz) + Math.PI / 2;
      sim.scene.add(bar);
      pair.push(bar);
      this.pylons.push(pair);
    });
  }

  /** Where the next gate is, or null once the run is over. */
  next(): (Point & { radius: number; name: string; color: number }) | null {
    const section = this.spec.sections[this.leg];
    if (!section || this.state === 'done') return null;
    const end = section.path[section.path.length - 1];
    return { x: end.x, z: end.z, radius: section.width / 2 + 3, name: section.name, color: COLORS[this.leg % COLORS.length] };
  }

  /** Seconds on the clock: 0 before the start, frozen at the finish. */
  seconds(): number {
    if (this.state === 'ready') return 0;
    return ((this.state === 'done' ? this.endTick : this.sim.tick) - this.startTick) / 60;
  }

  private snapshot() {
    return { chunks: this.damage.chunksBroken, buildings: this.damage.buildingsDamaged, props: this.damage.propsDisturbed, stumbles: this.kaiju.stumbles, falls: this.kaiju.falls };
  }

  postStep(): void {
    if (this.state === 'done') return;
    const p = this.kaiju.position();
    if (this.state === 'ready') {
      // The clock starts the moment it leaves the line.
      if (Math.hypot(p.x - this.spec.start.x, p.z - this.spec.start.z) > 6) {
        this.state = 'running';
        this.startTick = this.sim.tick;
        this.legStart = this.sim.tick;
        this.mark = this.snapshot();
      }
      return;
    }
    const gate = this.next();
    if (!gate || Math.hypot(p.x - gate.x, p.z - gate.z) > gate.radius) return;
    const now = this.snapshot();
    this.legs.push({
      name: gate.name,
      seconds: (this.sim.tick - this.legStart) / 60,
      chunks: now.chunks - this.mark.chunks,
      buildings: now.buildings - this.mark.buildings,
      props: now.props - this.mark.props,
      stumbles: now.stumbles - this.mark.stumbles,
      falls: now.falls - this.mark.falls,
    });
    this.mark = now;
    this.legStart = this.sim.tick;
    this.leg++;
    this.sim.emit('courseGate', { x: gate.x, y: 10, z: gate.z, leg: this.leg, seconds: this.seconds() });
    if (this.leg >= this.spec.sections.length) {
      this.state = 'done';
      this.endTick = this.sim.tick;
      const r = this.result();
      this.sim.emit('courseDone', { x: gate.x, y: 10, z: gate.z, seconds: r.seconds, score: r.score });
    }
  }

  result(): CourseResult {
    const sum = (key: 'chunks' | 'buildings' | 'falls' | 'stumbles') => this.legs.reduce((n, l) => n + l[key], 0);
    const seconds = this.seconds();
    const penalty = sum('buildings') * PENALTY.building + sum('falls') * PENALTY.fall;
    return {
      finished: this.state === 'done',
      seconds,
      penalty,
      score: seconds + penalty,
      legs: this.legs.map((l) => ({ ...l })),
      buildings: sum('buildings'),
      chunks: sum('chunks'),
      falls: sum('falls'),
      stumbles: sum('stumbles'),
    };
  }

  render(_alpha: number, frameDt: number): void {
    this.time += frameDt;
    this.pylons.forEach((pair, i) => {
      // The next gate pulses; the ones behind go dim.
      const on = i === this.leg && this.state !== 'done';
      const fade = i < this.leg ? 0.15 : on ? 0.75 + 0.25 * Math.sin(this.time * 6) : 0.45;
      for (const mesh of pair) (mesh.material as THREE.MeshBasicMaterial).opacity = fade * (mesh === pair[2] ? 0.6 : 1);
    });
  }
}

export function formatResult(r: CourseResult, title: string): string {
  const lines = [
    `${title}: ${r.finished ? '' : 'DID NOT FINISH, '}${r.seconds.toFixed(1)} s + ${r.penalty} s penalty = ${r.score.toFixed(1)}   (${r.buildings} buildings, ${r.chunks} chunks, ${r.stumbles} stumbles, ${r.falls} falls)`,
  ];
  for (const l of r.legs) {
    lines.push(`    ${l.name.padEnd(16)} ${l.seconds.toFixed(1).padStart(5)} s   ${String(l.buildings).padStart(2)} buildings  ${String(l.chunks).padStart(4)} chunks  ${l.props} props` + (l.falls ? `  ${l.falls} falls` : '') + (l.stumbles ? `  ${l.stumbles} stumbles` : ''));
  }
  return lines.join('\n');
}
