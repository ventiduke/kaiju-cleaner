import type { Kaiju } from '../../src/kaiju/kaiju';
import { initRapier } from '../../src/core/physics';
import { makeTuning } from '../../src/core/tuning';
import { createGame } from '../../src/scenes';
import type { Sim } from '../../src/sim';

/**
 * Scripted "feel" maneuvers. Each one drives a fresh kaiju on an empty plane with
 * fixed inputs and returns numbers that describe how it handled. They are how an
 * agent (or a test) sees feel without a player: the same script, any settings.
 */

/**
 * A fixed set of feel dials for tests to pin behaviour against. The shipped defaults
 * move every time the feel is tuned; the rules the tests check should not move with them.
 */
export const REF = {
  feel: { speed: 24, pickup: 1.7, turning: 2, grip: 34, wobble: 0.5, balance: 0.5 },
  // The reference is the original giant, in the original streets, whatever size and city ship.
  kaiju: { size: 1, bodyRadius: 6.9, bodyHalfHeight: 8.1, legLength: 9.3, density: 4, hoverFrequency: 3.2, oilSlip: 5, fallDuration: 1.4, getUpDuration: 1.3 },
  tail: { wrecks: 0, wreckSpeed: 38, bite: 3, segments: 5, length: 34, baseRadius: 3.8, tipRadius: 1.3, density: 2.8, stiffness: 14, damping: 3.5 },
  city: { boulevardWidth: 44, avenueWidth: 30, sideStreetWidth: 24 },
  // (The balancing body: it is what most of these tests are about. The Runner, which the game
  // now ships with, has its own in test/runner.test.ts.)
  move: { style: 1, jump: 0, slide: 0, relative: 1, controller: 0 },
};

export interface Rig {
  sim: Sim;
  k: Kaiju;
}

export async function rig(...overrides: unknown[]): Promise<Rig> {
  const R = await initRapier();
  const sim = createGame(R, 'plane', makeTuning(...overrides));
  return { sim, k: sim.parts.kaiju as Kaiju };
}

interface Trace {
  maxTilt: number;
  stumbleAt: number | null;
  fallAt: number | null;
}

/** Steps for `seconds`, recording the worst tilt and when it first stumbled or fell. */
function drive(r: Rig, seconds: number, input: { thrust?: number; turn?: number }, trace?: Trace, t0 = 0): void {
  const p = r.sim.players[0];
  if (input.thrust !== undefined) p.thrust = input.thrust;
  if (input.turn !== undefined) p.turn = input.turn;
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    r.sim.step();
    if (!trace) continue;
    trace.maxTilt = Math.max(trace.maxTilt, r.k.tilt);
    const t = t0 + (i + 1) / 60;
    if (trace.stumbleAt === null && r.k.stumbles > 0) trace.stumbleAt = t;
    if (trace.fallAt === null && r.k.falls > 0) trace.fallAt = t;
  }
}

const deg = (rad: number) => Math.round((rad * 180) / Math.PI);
const r1 = (v: number) => Math.round(v * 10) / 10;

export type Outcome = 'steady' | 'stumble' | 'fall';

function outcome(t: Trace): Outcome {
  return t.fallAt !== null ? 'fall' : t.stumbleAt !== null ? 'stumble' : 'steady';
}

export interface TurnResult {
  outcome: Outcome;
  /** Seconds into the turn. */
  stumbleAt: number | null;
  fallAt: number | null;
  maxTiltDeg: number;
  /** How far it slid sideways off its original line before the turn took (m). */
  turnedDeg: number;
}

/** Get up to a share of top speed, then hold a turn for a while. */
export async function turnAtSpeed(
  speedShare: number,
  turn: number,
  hold: number,
  ...overrides: unknown[]
): Promise<TurnResult> {
  const r = await rig(...overrides);
  drive(r, 5, { thrust: speedShare });
  const yaw0 = r.k.yaw;
  const trace: Trace = { maxTilt: 0, stumbleAt: null, fallAt: null };
  drive(r, hold, { turn }, trace);
  let turned = r.k.yaw - yaw0;
  while (turned < -Math.PI) turned += Math.PI * 2;
  const stumbles = r.k.stumbles;
  // Let go and see whether it saves itself.
  drive(r, 2.5, { turn: 0, thrust: 0 }, trace, hold);
  void stumbles;
  return {
    outcome: outcome(trace),
    stumbleAt: trace.stumbleAt === null ? null : r1(trace.stumbleAt),
    fallAt: trace.fallAt === null ? null : r1(trace.fallAt),
    maxTiltDeg: deg(trace.maxTilt),
    turnedDeg: deg(turned),
  };
}

export interface FeelReport {
  /** Seconds from rest to 95% of top speed, and from top speed to a stop. */
  pickup: number;
  stop: number;
  /** Metres covered while stopping. */
  stopDistance: number;
  /** Worst lean while speeding up and while braking (degrees). */
  startLeanDeg: number;
  brakeLeanDeg: number;
  /** Idle sway and straight-line sway at top speed (degrees). */
  swayDeg: number;
  /** Radius of a full-lock circle at 40% speed (m): the tightest comfortable turn. */
  slowTurnRadius: number;
  turns: Record<string, TurnResult>;
  /** Hard turn at full speed the moment after slamming the brakes: the "off balance" case. */
  brakeTurn: Outcome;
  /** Rapid left-right-left at full speed. */
  slalom: Outcome;
  /** Seconds from being knocked flat to walking again. */
  getUp: number;
}

export async function feelReport(...overrides: unknown[]): Promise<FeelReport> {
  // Straight line: pickup, sway, stop.
  let r = await rig(...overrides);
  const max = r.sim.tuning.kaiju.maxSpeed;
  const start: Trace = { maxTilt: 0, stumbleAt: null, fallAt: null };
  r.sim.players[0].thrust = 1;
  let pickup = Infinity;
  for (let i = 0; i < 60 * 12; i++) {
    r.sim.step();
    start.maxTilt = Math.max(start.maxTilt, r.k.tilt);
    if (r.k.speed > max * 0.95) {
      pickup = (i + 1) / 60;
      break;
    }
  }
  const cruise: Trace = { maxTilt: 0, stumbleAt: null, fallAt: null };
  drive(r, 2, {});
  drive(r, 4, {}, cruise);
  const z0 = r.k.position().z;
  const brake: Trace = { maxTilt: 0, stumbleAt: null, fallAt: null };
  r.sim.players[0].thrust = 0;
  let stop = Infinity;
  for (let i = 0; i < 60 * 12; i++) {
    r.sim.step();
    brake.maxTilt = Math.max(brake.maxTilt, r.k.tilt);
    if (r.k.speed < 0.3) {
      stop = (i + 1) / 60;
      break;
    }
  }
  const stopDistance = r.k.position().z - z0;

  // Slow full-lock circle.
  r = await rig(...overrides);
  drive(r, 4, { thrust: 0.4 });
  drive(r, 6, { turn: 1 });
  const av = Math.abs(r.k.body.angvel().y);
  const slowTurnRadius = av > 0.05 ? r.k.speed / av : Infinity;

  const turns: Record<string, TurnResult> = {
    'full speed, full turn, held 2s': await turnAtSpeed(1, 1, 2, ...overrides),
    'full speed, full turn, tapped 0.3s': await turnAtSpeed(1, 1, 0.3, ...overrides),
    'full speed, half turn, held 2s': await turnAtSpeed(1, 0.5, 2, ...overrides),
    'full speed, quarter turn, held 2s': await turnAtSpeed(1, 0.25, 2, ...overrides),
    '70% speed, full turn, held 2s': await turnAtSpeed(0.7, 1, 2, ...overrides),
    '40% speed, full turn, held 2s': await turnAtSpeed(0.4, 1, 2, ...overrides),
  };

  // Brake and turn together.
  r = await rig(...overrides);
  drive(r, 5, { thrust: 1 });
  const bt: Trace = { maxTilt: 0, stumbleAt: null, fallAt: null };
  drive(r, 1.2, { thrust: -1, turn: 1 }, bt);
  drive(r, 2.5, { thrust: 0, turn: 0 }, bt);

  // Slalom.
  r = await rig(...overrides);
  drive(r, 5, { thrust: 1 });
  const sl: Trace = { maxTilt: 0, stumbleAt: null, fallAt: null };
  for (let i = 0; i < 6; i++) drive(r, 0.45, { turn: i % 2 ? -1 : 1 }, sl);
  drive(r, 2.5, { turn: 0, thrust: 0 }, sl);

  // Knock it flat and time the recovery.
  r = await rig(...overrides);
  drive(r, 1, {});
  r.k.knockDown();
  let getUp = Infinity;
  let fell = false;
  for (let i = 0; i < 60 * 20; i++) {
    r.sim.step();
    if (r.k.state === 'fallen') fell = true;
    if (fell && r.k.state === 'walk') {
      getUp = (i + 1) / 60;
      break;
    }
  }

  return {
    pickup: r1(pickup),
    stop: r1(stop),
    stopDistance: r1(stopDistance),
    startLeanDeg: deg(start.maxTilt),
    brakeLeanDeg: deg(brake.maxTilt),
    swayDeg: deg(cruise.maxTilt),
    slowTurnRadius: r1(slowTurnRadius),
    turns,
    brakeTurn: outcome(bt),
    slalom: outcome(sl),
    getUp: r1(getUp),
  };
}

/** A fixed-width text table of a report, for the console and for chat. */
export function formatReport(rep: FeelReport, title = 'Feel report'): string {
  const lines = [
    title,
    `  pickup            ${rep.pickup} s to top speed (lean ${rep.startLeanDeg} deg)`,
    `  stop              ${rep.stop} s, ${rep.stopDistance} m (lean ${rep.brakeLeanDeg} deg)`,
    `  sway at speed     ${rep.swayDeg} deg`,
    `  slow turn radius  ${rep.slowTurnRadius} m`,
  ];
  for (const [name, t] of Object.entries(rep.turns)) {
    const when =
      t.outcome === 'fall'
        ? ` (stumble ${t.stumbleAt}s, fall ${t.fallAt}s)`
        : t.outcome === 'stumble'
          ? ` (stumble ${t.stumbleAt}s)`
          : '';
    lines.push(`  ${name.padEnd(36)} ${t.outcome}${when}, max lean ${t.maxTiltDeg} deg, turned ${t.turnedDeg} deg`);
  }
  lines.push(`  brake + turn at full speed           ${rep.brakeTurn}`);
  lines.push(`  slalom at full speed                 ${rep.slalom}`);
  lines.push(`  get up after a fall                  ${rep.getUp} s`);
  return lines.join('\n');
}
