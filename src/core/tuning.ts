import committed from '../tuning/defaults.json';

/**
 * Every tunable in the game lives here, one object per system.
 * Code defaults are the baseline; `src/tuning/defaults.json` (committed, pasted
 * from the in-game "Copy JSON" button) is merged on top, then any preset.
 */
export const codeDefaults = {
  /**
   * The short list. These six dials drive most of the `kaiju` numbers below
   * (see `applyFeel`); start here and only open Advanced to fine-tune.
   */
  feel: {
    /** Top speed in m/s. */
    speed: 24,
    /** Seconds to reach top speed. Lower is snappier. */
    pickup: 1.7,
    /** How fast it can spin round, in radians per second. */
    turning: 2,
    /** Cornering grip in m/s^2. High grip corners tight but tips over; low grip slides wide. */
    grip: 34,
    /** 0 = steady, 1 = drunk. How much it sways, staggers and rocks with each step. */
    wobble: 0.5,
    /** 0 = falls over in a breeze, 1 = very hard to topple. */
    balance: 0.5,
  },
  world: {
    gravity: 9.81,
  },
  debug: {
    ballSpeed: 70,
    ballRadius: 2.5,
    ballDensity: 6,
    physicsWireframe: false,
  },
  city: {
    seed: 7,
    blocks: 5,
    blockSize: 40,
    /** One extra-wide street through the middle. */
    boulevardWidth: 38,
    avenueWidth: 22,
    sideStreetWidth: 14,
    sidewalk: 2,
    lotGap: 3,
    floorHeight: 4,
    minFloors: 2,
    maxFloors: 13,
    chunkSize: 8.5,
    /** Covered walkways strung between buildings across a street. */
    skybridges: 4,
    /** Leave the centre block open as a plaza. */
    plaza: true,
    propDensity: 1,
  },
  destruction: {
    /** A same-mass object must hit at this speed (m/s) to break a chunk. */
    breakSpeed: 7,
    /**
     * Sustained pushing also breaks chunks: pressure builds up over about a sixth of a second,
     * and a chunk gives at this many times the single-hit threshold. Lower = crumbles when leaned on.
     */
    crush: 3,
    /** Share of the hitter's velocity handed to a chunk it breaks. */
    handoff: 0.75,
    /** Speed the kaiju loses for each chunk it breaks (m/s). */
    crunch: 0.14,
    /** How far above the hitter's centre the break cost lands (m). Bigger = knocked back harder. */
    impactHeight: 14,
    chunkDensity: 0.15,
    friction: 0.7,
    /** A chunk falls when less than this share of its footprint is supported. */
    supportFraction: 0.5,
    /** A floor fails, taking everything above with it, below this share of chunks. */
    floorFailFraction: 0.45,
    /** Seconds between a support breaking and the chunk above letting go. */
    collapseDelay: 0.12,
    debrisCap: 280,
    debrisLinearDamping: 0.15,
    debrisAngularDamping: 0.6,
    /** Seconds after which loose debris gets heavily damped so piles stop jittering and sleep. */
    settleAfter: 3,
  },
  kaiju: {
    // Shape (needs restart)
    bodyRadius: 6.9,
    bodyHalfHeight: 8.1,
    legLength: 9.3,
    density: 4,
    // Hover spring
    hoverFrequency: 3.2,
    hoverDamping: 0.6,
    // Balance (driven by feel.wobble and feel.balance)
    uprightFrequency: 0.5,
    uprightDamping: 0.45,
    /** How hard the body tips for each m/s^2 the feet push (rad/s^2 per m/s^2). */
    lean: 0.24,
    /** How strongly a lean pulls it that way (m/s^2 at 90 degrees). Leaning becomes staggering. */
    stagger: 4,
    /** Sideways roll kick on each footfall (rad/s). */
    footfallKick: 0.16,
    // Locomotion (driven by feel.speed, pickup, turning, grip)
    maxSpeed: 24,
    reverseSpeed: 15,
    acceleration: 14,
    braking: 12,
    /** Sideways grip in m/s^2. */
    grip: 20,
    maxTurnRate: 2,
    turnAcceleration: 5,
    /** Turn authority lost at top speed (0..1). */
    turnSpeedPenalty: 0.15,
    /** How much harder it can push once it has stalled against something (x acceleration). */
    pushBoost: 4.3,
    // Stumble and fall (angles driven by feel.balance)
    /** Past this tilt it stumbles, and its balance starts to give way. */
    stumbleAngle: 0.4,
    /** Past this tilt it is going over. */
    fallAngle: 0.85,
    stumbleDuration: 1,
    /** The stagger step of a stumble (m/s). */
    stumbleLurch: 3,
    /** Share of steering and thrust it keeps while stumbling. Keep pushing and it goes over. */
    stumbleControl: 0.8,
    fallDuration: 1.6,
    getUpDuration: 1.6,
  },
  tail: {
    segments: 5,
    length: 34,
    baseRadius: 3.8,
    tipRadius: 1.3,
    density: 2.8,
    stiffness: 14,
    damping: 3.5,
  },
  legs: {
    stanceWidth: 5.4,
    /** How far a planted foot may trail before it steps (m). */
    stepLength: 7.5,
    stepDuration: 0.5,
    stepHeight: 3.6,
    /** How far ahead of the hip a step lands, in seconds of velocity. */
    lookahead: 0.35,
    /** Random timing offset per step (0..1). The "offbeat". */
    offbeat: 0.25,
    footLength: 8,
    footWidth: 4.4,
    footHeight: 2.2,
  },
  camera: {
    distance: 100,
    height: 72,
    lookHeight: 16,
    followLag: 0.25,
    yawLag: 0.6,
    fov: 50,
    shake: 1,
    /** Show the kaiju as a tinted outline when a building hides it. */
    silhouette: true,
  },
};

export type Tuning = typeof codeDefaults;
export type TuningGroup = keyof Tuning;

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Turns the six feel dials into the detailed kaiju numbers.
 * The detailed numbers stay the source of truth for the sim, so an Advanced
 * slider can still override one afterwards.
 */
export function applyFeel(t: Tuning): void {
  const f = t.feel;
  const k = t.kaiju;
  k.maxSpeed = round(f.speed);
  k.reverseSpeed = round(f.speed * 0.6);
  // A little over speed/pickup, because leaning back into the start costs some push.
  k.acceleration = round(f.speed / (Math.max(0.2, f.pickup) * 0.82));
  k.braking = round(k.acceleration * 0.85);
  k.maxTurnRate = round(f.turning);
  k.turnAcceleration = round(f.turning * 2.5);
  k.grip = round(f.grip);
  // Wobble: looser damping, more lean per push, more stagger, a bigger rock on each step.
  k.uprightDamping = round(mix(1.1, 0.2, f.wobble));
  k.lean = round(mix(0.08, 0.22, f.wobble));
  k.stagger = round(mix(0, 8, f.wobble));
  k.footfallKick = round(mix(0.02, 0.3, f.wobble));
  // Balance: a stiffer spring and a later tipping point.
  k.uprightFrequency = round(mix(0.38, 0.62, f.balance));
  k.stumbleAngle = round(mix(0.24, 0.56, f.balance));
  k.fallAngle = round(Math.min(1.35, k.stumbleAngle * 2.1));
}

applyFeel(codeDefaults);

/** Plain-language labels for the feel dials. */
export const feelLabels: { [K in keyof Tuning['feel']]: string } = {
  speed: 'speed  (top speed, m/s)',
  pickup: 'pickup  (secs to top speed)',
  turning: 'turning  (spin rate)',
  grip: 'grip  (low slides, high tips)',
  wobble: 'wobble  (0 steady, 1 drunk)',
  balance: 'balance  (0 tippy, 1 solid)',
};

/** Slider ranges for the GUI: [min, max, step]. Missing keys get a guessed range. */
export const ranges: { [G in TuningGroup]?: { [K in keyof Tuning[G]]?: [number, number, number] } } = {
  feel: {
    speed: [4, 45, 0.5],
    pickup: [0.4, 6, 0.1],
    turning: [0.5, 4, 0.05],
    grip: [3, 50, 0.5],
    wobble: [0, 1, 0.01],
    balance: [0, 1, 0.01],
  },
  world: { gravity: [1, 30, 0.01] },
  debug: { ballSpeed: [5, 150, 1], ballRadius: [0.5, 8, 0.1], ballDensity: [0.5, 30, 0.5] },
  city: {
    seed: [0, 999, 1],
    blocks: [1, 8, 1],
    blockSize: [24, 120, 1],
    boulevardWidth: [10, 60, 1],
    avenueWidth: [8, 40, 0.5],
    sideStreetWidth: [6, 30, 0.5],
    sidewalk: [0, 8, 0.5],
    lotGap: [0, 10, 0.5],
    floorHeight: [2, 8, 0.5],
    minFloors: [1, 10, 1],
    maxFloors: [2, 24, 1],
    chunkSize: [4, 16, 0.5],
    skybridges: [0, 12, 1],
    propDensity: [0, 3, 0.1],
  },
  destruction: {
    breakSpeed: [1, 40, 0.5],
    crush: [1, 12, 0.25],
    handoff: [0, 1.5, 0.05],
    crunch: [0, 1.5, 0.01],
    impactHeight: [-12, 24, 0.5],
    chunkDensity: [0.05, 2, 0.05],
    friction: [0, 1.5, 0.05],
    supportFraction: [0, 1, 0.05],
    floorFailFraction: [0, 1, 0.05],
    collapseDelay: [0, 0.6, 0.01],
    debrisCap: [50, 800, 10],
    debrisLinearDamping: [0, 2, 0.05],
    debrisAngularDamping: [0, 4, 0.05],
    settleAfter: [0.5, 15, 0.5],
  },
  kaiju: {
    bodyRadius: [2, 12, 0.1],
    bodyHalfHeight: [2, 16, 0.1],
    legLength: [2, 16, 0.1],
    density: [0.2, 12, 0.1],
    hoverFrequency: [0.3, 5, 0.05],
    hoverDamping: [0.05, 2, 0.05],
    uprightFrequency: [0.1, 2, 0.01],
    uprightDamping: [0.02, 2, 0.01],
    lean: [0, 0.8, 0.01],
    stagger: [0, 20, 0.1],
    footfallKick: [0, 0.6, 0.01],
    maxSpeed: [1, 45, 0.5],
    reverseSpeed: [0, 30, 0.5],
    acceleration: [0.5, 40, 0.1],
    braking: [0.5, 40, 0.1],
    grip: [0.5, 50, 0.5],
    maxTurnRate: [0.2, 4, 0.05],
    turnAcceleration: [0.2, 15, 0.1],
    turnSpeedPenalty: [0, 1, 0.05],
    pushBoost: [1, 8, 0.1],
    stumbleAngle: [0.05, 1, 0.01],
    fallAngle: [0.2, 1.5, 0.01],
    stumbleDuration: [0.1, 3, 0.05],
    stumbleLurch: [0, 12, 0.1],
    stumbleControl: [0, 1, 0.05],
    fallDuration: [0.5, 8, 0.1],
    getUpDuration: [0.3, 5, 0.1],
  },
  tail: {
    segments: [2, 8, 1],
    length: [8, 60, 1],
    baseRadius: [1, 6, 0.1],
    tipRadius: [0.4, 4, 0.1],
    density: [0.1, 10, 0.1],
    stiffness: [0, 80, 0.5],
    damping: [0, 20, 0.1],
  },
  legs: {
    stanceWidth: [1, 10, 0.1],
    stepLength: [1, 16, 0.1],
    stepDuration: [0.15, 1.5, 0.01],
    stepHeight: [0.2, 8, 0.1],
    lookahead: [0, 1.5, 0.01],
    offbeat: [0, 1, 0.01],
    footLength: [2, 12, 0.1],
    footWidth: [1, 8, 0.1],
    footHeight: [0.5, 4, 0.1],
  },
  camera: {
    distance: [15, 220, 1],
    height: [5, 200, 1],
    lookHeight: [0, 40, 0.5],
    followLag: [0.02, 2, 0.01],
    yawLag: [0.02, 4, 0.01],
    fov: [25, 90, 1],
    shake: [0, 3, 0.05],
  },
};

/** Keys that only take effect when the scene is rebuilt. */
export const restartKeys: { [G in TuningGroup]?: readonly string[] | 'all' } = {
  city: 'all',
  kaiju: ['bodyRadius', 'bodyHalfHeight', 'legLength', 'density'],
  tail: ['segments', 'length', 'baseRadius', 'tipRadius', 'density'],
  legs: ['footLength', 'footWidth', 'footHeight'],
  destruction: ['chunkDensity', 'friction'],
};

type Json = { [key: string]: unknown };

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Copies values from `src` onto `dst` for keys `dst` already has with the same type. */
export function mergeTuning(dst: Json, src: unknown): void {
  if (!isObject(src)) return;
  for (const key of Object.keys(dst)) {
    const d = dst[key];
    const s = src[key];
    if (isObject(d)) mergeTuning(d, s);
    else if (s !== undefined && typeof s === typeof d) dst[key] = s;
  }
}

export function makeTuning(...overrides: unknown[]): Tuning {
  const t = structuredClone(codeDefaults);
  for (const o of [committed, ...overrides]) {
    if (!isObject(o)) continue;
    mergeTuning(t as unknown as Json, o);
    // Feel dials imply the detailed kaiju numbers, unless the same source spells those out too.
    if (isObject(o.feel)) {
      applyFeel(t);
      mergeTuning(t.kaiju as unknown as Json, o.kaiju);
    }
  }
  return t;
}

/**
 * Only the values that differ from the shipped defaults: short enough to paste into a chat.
 * Kaiju numbers that simply follow from the feel dials are left out; only hand-set ones show.
 * Feeding the result back through `makeTuning` rebuilds the same settings.
 */
export function diffTuning(t: Tuning): Record<string, Record<string, unknown>> {
  const defaults = makeTuning();
  const implied = makeTuning({ feel: t.feel });
  const out: Record<string, Record<string, unknown>> = {};
  for (const group of Object.keys(t) as TuningGroup[]) {
    const a = t[group] as Record<string, unknown>;
    const b = (group === 'kaiju' ? implied : defaults)[group] as Record<string, unknown>;
    for (const key of Object.keys(a)) {
      if (a[key] !== b[key]) (out[group] ??= {})[key] = a[key];
    }
  }
  return out;
}

// --- Presets (browser only; guarded so the sim can run under Node) ---

const PRESET_PREFIX = 'kaiju-preset:';
const RESTART_KEY = 'kaiju-restart-tuning';

function storage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export function listPresets(): string[] {
  const s = storage('local');
  if (!s) return [];
  const names: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(PRESET_PREFIX)) names.push(k.slice(PRESET_PREFIX.length));
  }
  return names.sort();
}

export function savePreset(name: string, t: Tuning): void {
  storage('local')?.setItem(PRESET_PREFIX + name, JSON.stringify(t));
}

export function loadPreset(name: string): unknown {
  const raw = storage('local')?.getItem(PRESET_PREFIX + name);
  return raw ? JSON.parse(raw) : null;
}

export function deletePreset(name: string): void {
  storage('local')?.removeItem(PRESET_PREFIX + name);
}

/** Stashes tuning so it survives the page reload used to rebuild a scene. */
export function stashForRestart(t: Tuning): void {
  storage('session')?.setItem(RESTART_KEY, JSON.stringify(t));
}

export function takeRestartStash(): unknown {
  const s = storage('session');
  const raw = s?.getItem(RESTART_KEY);
  if (!raw) return null;
  s?.removeItem(RESTART_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
