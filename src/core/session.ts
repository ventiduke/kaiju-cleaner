import type { Damage } from '../city/damage';
import type { Pieces } from '../city/pieces';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim, System } from '../sim';
import { diffTuning, type Tuning } from './tuning';

/**
 * A play session, written down so someone who wasn't there can see how it went:
 * the settings (and every change to them), typed notes, a low-rate trace of what the
 * kaiju did, and the exact inputs, which are enough to replay the run in the sim.
 */
export interface SessionFile {
  version: 1;
  build: string;
  scene: string;
  savedAt: string;
  /** Seconds of simulated play in this run (since the last scene restart). */
  duration: number;
  /** Settings when the run started, and the values that differ from the shipped defaults now. */
  initialTuning: Tuning;
  tuning: Tuning;
  changed: Record<string, Record<string, unknown>>;
  /** Settings edits during the run: the full settings as of that tick. */
  tuningChanges: { tick: number; tuning: Tuning }[];
  notes: SessionNote[];
  stats: SessionStats;
  /** Rows of [seconds, x, z, yawDeg, speed, tiltDeg, state, thrust, turn, chunksBroken], 5 a second. */
  samples: number[][];
  events: { tick: number; type: string }[];
  /** [tick, thrust, turn, tiptoe, crouch, grab, balanceX, balanceZ, breath, bow, jump, strafe, look, sprint] whenever the input changed (older files are shorter). */
  inputs: number[][];
  /** [tick, ox, oy, oz, dx, dy, dz] for each debug ball thrown. */
  balls: number[][];
  /** Where the kaiju ended up, to check a replay against. */
  end: { x: number; z: number; tick: number };
}

export interface SessionNote {
  /** Seconds into the run it was written in, and the wall-clock time. */
  at: number;
  time: string;
  text: string;
  /** Settings that differed from the defaults when the note was written. */
  changed: Record<string, Record<string, unknown>>;
  /** What the kaiju was doing at that moment. */
  moment: { speed: number; tiltDeg: number; state: string; stumbles: number; falls: number; chunks: number };
}

export interface SessionStats {
  seconds: number;
  secondsMoving: number;
  distance: number;
  topSpeed: number;
  averageSpeedMoving: number;
  maxTiltDeg: number;
  averageTiltDegMoving: number;
  stumbles: number;
  falls: number;
  /** Falls caught by steering into them. */
  saves?: number;
  secondsOnTiptoe?: number;
  secondsCrouched?: number;
  citizensSquished?: number;
  /** Repair pieces set in place (and how many of those sit crooked), and pieces that slipped. */
  repairs?: number;
  repairsCrooked?: number;
  piecesDropped?: number;
  secondsCarrying?: number;
  sneezes?: number;
  groundCollapses?: number;
  mainsBurst?: number;
  bows?: number;
  /** City approval at the end, 0..100, and how long the repairs took if they were all finished. */
  approval?: number;
  repairsDoneSeconds?: number | null;
  secondsStumbling: number;
  secondsDown: number;
  secondsStalled: number;
  /** Share of moving time spent turning hard (stick past 70%). */
  hardTurnShare: number;
  chunksBroken: number;
  propsDisturbed: number;
  buildingsDamaged: number;
}

const STATES = ['walk', 'stumble', 'fallen', 'getup', 'falling'];
const SAMPLE_EVERY = 12;
const NOTES_KEY = 'kaiju-notes';

declare const __BUILD__: string | undefined;
export const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

function r(v: number, places = 1): number {
  const k = 10 ** places;
  return Math.round(v * k) / k;
}

export class SessionRecorder implements System {
  notes: SessionNote[] = [];
  private initial: Tuning;
  private tuningChanges: SessionFile['tuningChanges'] = [];
  private samples: number[][] = [];
  private events: SessionFile['events'] = [];
  private inputs: number[][] = [];
  private balls: number[][] = [];
  private lastThrust = NaN;
  private lastTurn = NaN;
  private lastHeld = -1;
  private lastState = 'walk';
  private lastPos: { x: number; z: number } | null = null;
  private acc = {
    moving: 0,
    distance: 0,
    topSpeed: 0,
    speedSum: 0,
    maxTilt: 0,
    tiltSum: 0,
    stumbling: 0,
    down: 0,
    stalled: 0,
    hardTurn: 0,
    tiptoe: 0,
    crouch: 0,
    carrying: 0,
  };

  constructor(
    private sim: Sim,
    private scene: string,
    private kaiju: Kaiju | undefined,
    private damage: Damage | undefined,
  ) {
    this.initial = structuredClone(sim.tuning);
    try {
      const saved = globalThis.sessionStorage?.getItem(NOTES_KEY);
      if (saved) this.notes = JSON.parse(saved);
    } catch {
      // No storage (tests, private mode): notes just live for this run.
    }
  }

  /** Call before each step, once the input for the step is final. */
  preStep(): void {
    const p = this.sim.players[0];
    const thrust = r(p.thrust, 2);
    const turn = r(p.turn, 2);
    // The balance input only matters (and is only logged) while something is being held.
    const holding = !!(this.sim.parts.pieces as { held: unknown } | undefined)?.held;
    const bx = 0;
    const bz = holding || p.grab ? r(p.balanceZ, 2) : 0;
    const held =
      (p.tiptoe ? 1 : 0) + (p.crouch ? 2 : 0) + (p.grab ? 4 : 0) + (p.breath ? 8 : 0) + (p.bow ? 16 : 0) + (p.jump ? 32 : 0) + (p.sprint ? 64 : 0) + (bz + 1) * 1000 + Math.round(p.strafe * 100) * 1e6 + Math.round(p.look * 1000) * 1e9;
    if (thrust !== this.lastThrust || turn !== this.lastTurn || held !== this.lastHeld) {
      this.inputs.push([this.sim.tick, thrust, turn, p.tiptoe ? 1 : 0, p.crouch ? 1 : 0, p.grab ? 1 : 0, bx, bz, p.breath ? 1 : 0, p.bow ? 1 : 0, p.jump ? 1 : 0, r(p.strafe, 2), r(p.look, 4), p.sprint ? 1 : 0]);
      this.lastThrust = thrust;
      this.lastTurn = turn;
      this.lastHeld = held;
    }
  }

  postStep(dt: number): void {
    const k = this.kaiju;
    if (!k) return;
    const pos = k.body.translation();
    const a = this.acc;
    if (k.state !== this.lastState) {
      this.events.push({ tick: this.sim.tick, type: k.state });
      this.lastState = k.state;
    }
    if (this.lastPos) a.distance += Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z);
    this.lastPos = { x: pos.x, z: pos.z };
    a.topSpeed = Math.max(a.topSpeed, k.speed);
    a.maxTilt = Math.max(a.maxTilt, k.state === 'walk' || k.state === 'stumble' ? k.tilt : 0);
    if (k.speed > 1) {
      a.moving += dt;
      a.speedSum += k.speed * dt;
      a.tiltSum += k.tilt * dt;
      if (Math.abs(this.sim.players[0].turn) > 0.7) a.hardTurn += dt;
    }
    if (k.state === 'stumble') a.stumbling += dt;
    if (k.state === 'fallen' || k.state === 'getup') a.down += dt;
    if (k.stall > 0.5) a.stalled += dt;
    if (k.mode === 'tiptoe') a.tiptoe += dt;
    if (k.mode === 'crawl') a.crouch += dt;
    if (k.carrying) a.carrying += dt;

    if (this.sim.tick % SAMPLE_EVERY === 0) {
      const p = this.sim.players[0];
      this.samples.push([
        r(this.sim.time),
        r(pos.x),
        r(pos.z),
        Math.round((k.yaw * 180) / Math.PI),
        r(k.speed),
        Math.round((k.tilt * 180) / Math.PI),
        STATES.indexOf(k.state),
        r(p.thrust, 2),
        r(p.turn, 2),
        this.damage?.chunksBroken ?? 0,
      ]);
    }
  }

  /** Record that a setting changed (from the panel). */
  tuningChanged(): void {
    const last = this.tuningChanges[this.tuningChanges.length - 1];
    const entry = { tick: this.sim.tick, tuning: structuredClone(this.sim.tuning) };
    if (last && last.tick === this.sim.tick) this.tuningChanges[this.tuningChanges.length - 1] = entry;
    else this.tuningChanges.push(entry);
  }

  ballThrown(origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }): void {
    this.balls.push([this.sim.tick, r(origin.x, 3), r(origin.y, 3), r(origin.z, 3), r(dir.x, 4), r(dir.y, 4), r(dir.z, 4)]);
  }

  addNote(text: string): void {
    const k = this.kaiju;
    this.notes.push({
      at: r(this.sim.time),
      time: new Date().toISOString(),
      text,
      changed: diffTuning(this.sim.tuning),
      moment: {
        speed: r(k?.speed ?? 0),
        tiltDeg: Math.round(((k?.tilt ?? 0) * 180) / Math.PI),
        state: k?.state ?? 'none',
        stumbles: k?.stumbles ?? 0,
        falls: k?.falls ?? 0,
        chunks: this.damage?.chunksBroken ?? 0,
      },
    });
    try {
      globalThis.sessionStorage?.setItem(NOTES_KEY, JSON.stringify(this.notes));
    } catch {
      // See constructor.
    }
  }

  clearNotes(): void {
    this.notes = [];
    try {
      globalThis.sessionStorage?.removeItem(NOTES_KEY);
    } catch {
      // See constructor.
    }
  }

  stats(): SessionStats {
    const a = this.acc;
    const moving = Math.max(a.moving, 1e-6);
    const pieces = this.sim.parts.pieces as Pieces | undefined;
    return {
      seconds: r(this.sim.time),
      secondsMoving: r(a.moving),
      distance: Math.round(a.distance),
      topSpeed: r(a.topSpeed),
      averageSpeedMoving: r(a.speedSum / moving),
      maxTiltDeg: Math.round((a.maxTilt * 180) / Math.PI),
      averageTiltDegMoving: r(((a.tiltSum / moving) * 180) / Math.PI),
      stumbles: this.kaiju?.stumbles ?? 0,
      falls: this.kaiju?.falls ?? 0,
      saves: this.kaiju?.saves ?? 0,
      secondsOnTiptoe: r(a.tiptoe),
      secondsCrouched: r(a.crouch),
      citizensSquished: this.damage?.citizensSquished ?? 0,
      repairs: pieces?.placed ?? 0,
      repairsCrooked: pieces?.crooked ?? 0,
      piecesDropped: pieces?.drops ?? 0,
      secondsCarrying: r(a.carrying),
      sneezes: (this.sim.parts.nose as { sneezes: number } | undefined)?.sneezes ?? 0,
      groundCollapses: ((this.sim.parts.weakSpots as { collapsed: boolean }[] | undefined) ?? []).filter((w) => w.collapsed).length,
      mainsBurst: (this.sim.parts.mains as { bursts: number } | undefined)?.bursts ?? 0,
      bows: this.kaiju?.bows ?? 0,
      approval: r((this.sim.parts.approval as { value: number } | undefined)?.value ?? 0),
      repairsDoneSeconds: (this.sim.parts.approval as { finished: { seconds: number } | null } | undefined)?.finished?.seconds ?? null,
      secondsStumbling: r(a.stumbling),
      secondsDown: r(a.down),
      secondsStalled: r(a.stalled),
      hardTurnShare: r(a.hardTurn / moving, 2),
      chunksBroken: this.damage?.chunksBroken ?? 0,
      propsDisturbed: this.damage?.propsDisturbed ?? 0,
      buildingsDamaged: this.damage?.buildingsDamaged ?? 0,
    };
  }

  file(): SessionFile {
    const pos = this.kaiju?.body.translation();
    return {
      version: 1,
      build: BUILD,
      scene: this.scene,
      savedAt: new Date().toISOString(),
      duration: r(this.sim.time),
      initialTuning: this.initial,
      tuning: structuredClone(this.sim.tuning),
      changed: diffTuning(this.sim.tuning),
      tuningChanges: this.tuningChanges,
      notes: this.notes,
      stats: this.stats(),
      samples: this.samples,
      events: this.events,
      inputs: this.inputs,
      balls: this.balls,
      end: { x: r(pos?.x ?? 0, 2), z: r(pos?.z ?? 0, 2), tick: this.sim.tick },
    };
  }

  /** A short plain-text version to paste straight into a chat. */
  report(): string {
    return formatSession(this.file());
  }
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatSession(f: SessionFile): string {
  const s = f.stats;
  const lines = [
    `KAIJU CLEANERS FEEDBACK  (build ${f.build}, scene ${f.scene}, ${clock(f.duration)} played, saved ${f.savedAt})`,
    '',
    'Settings changed from defaults:',
    Object.keys(f.changed).length ? JSON.stringify(f.changed) : '(none)',
    '',
    'Notes:',
    ...(f.notes.length
      ? f.notes.map(
          (n) =>
            `- [${clock(n.at)}] ${n.text}   (then: ${n.moment.state}, ${n.moment.speed} m/s, lean ${n.moment.tiltDeg} deg, ` +
            `${n.moment.stumbles} stumbles, ${n.moment.falls} falls; settings ${JSON.stringify(n.changed)})`,
        )
      : ['(none)']),
    '',
    'This run:',
    `  moving ${s.secondsMoving}s of ${s.seconds}s, ${s.distance} m, top ${s.topSpeed} m/s, average ${s.averageSpeedMoving} m/s`,
    `  lean: max ${s.maxTiltDeg} deg, average ${s.averageTiltDegMoving} deg while moving; hard turns ${Math.round(s.hardTurnShare * 100)}% of the time`,
    `  ${s.stumbles} stumbles (${s.secondsStumbling}s), ${s.saves ?? 0} saves, ${s.falls} falls (${s.secondsDown}s down), stalled ${s.secondsStalled}s`,
    `  tiptoe ${s.secondsOnTiptoe ?? 0}s, crawling ${s.secondsCrouched ?? 0}s, carrying ${s.secondsCarrying ?? 0}s`,
    `  repairs: ${s.repairs ?? 0} placed (${s.repairsCrooked ?? 0} crooked), ${s.piecesDropped ?? 0} pieces dropped`,
    `  hazards: ${s.sneezes ?? 0} sneezes, ${s.groundCollapses ?? 0} ground collapses, ${s.mainsBurst ?? 0} water mains burst`,
    `  approval: ${s.approval ?? '?'}% after ${s.bows ?? 0} bows` + (s.repairsDoneSeconds ? `; all repairs done in ${Math.round(s.repairsDoneSeconds)}s` : ''),
    `  damage: ${s.chunksBroken} chunks, ${s.propsDisturbed} props, ${s.buildingsDamaged} buildings, ${s.citizensSquished ?? 0} people squished`,
  ];
  return lines.join('\n');
}
