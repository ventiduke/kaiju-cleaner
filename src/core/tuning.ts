import committed from '../tuning/defaults.json';

/**
 * Every tunable in the game lives here, one object per system.
 * Code defaults are the baseline; `src/tuning/defaults.json` (committed, pasted
 * from the in-game "Copy JSON" button) is merged on top, then any preset.
 */
export const codeDefaults = {
  world: {
    gravity: 9.81,
  },
  debug: {
    ballSpeed: 55,
    ballRadius: 2.5,
    ballDensity: 6,
    physicsWireframe: false,
  },
  city: {
    seed: 7,
    blocks: 3,
    blockSize: 60,
    avenueWidth: 20,
    sideStreetWidth: 12,
    sidewalk: 3,
    lotGap: 3,
    floorHeight: 4,
    minFloors: 2,
    maxFloors: 12,
    chunkSize: 8,
    propDensity: 1,
  },
  destruction: {
    /** A same-mass object must hit at this speed (m/s) to break a chunk. */
    breakSpeed: 9,
    /** Share of the hitter's velocity handed to a chunk it breaks. */
    handoff: 0.75,
    /** How much momentum each broken chunk costs the hitter (0 = free). */
    breakDrag: 0.6,
    /** How much of a collision's tipping kick the hitter keeps (0 = glides through, 1 = full). */
    impactTilt: 0.5,
    chunkDensity: 0.35,
    friction: 0.7,
    /** A chunk falls when less than this share of its footprint is supported. */
    supportFraction: 0.5,
    /** A floor fails, taking everything above with it, below this share of chunks. */
    floorFailFraction: 0.45,
    /** Seconds between a support breaking and the chunk above letting go. */
    collapseDelay: 0.12,
    debrisCap: 260,
    debrisLinearDamping: 0.15,
    debrisAngularDamping: 0.6,
  },
  kaiju: {
    // Shape (needs restart)
    bodyRadius: 5.5,
    bodyHalfHeight: 7,
    legLength: 7,
    density: 1.6,
    // Hover spring
    hoverFrequency: 1.1,
    hoverDamping: 0.6,
    // Balance
    uprightFrequency: 0.44,
    uprightDamping: 0.28,
    // Locomotion
    maxSpeed: 9,
    reverseSpeed: 4,
    acceleration: 3.2,
    braking: 4.2,
    /** Sideways grip in m/s^2. Low = hockey player on stilts. */
    grip: 7,
    /** How far below the centre of mass the feet push (m). Bigger = more lean. */
    driveOffset: 11,
    maxTurnRate: 1.15,
    turnAcceleration: 2.2,
    /** Turn authority lost at top speed (0..1). */
    turnSpeedPenalty: 0.25,
    /** Sideways roll kick on each footfall (rad/s). */
    footfallKick: 0.09,
    // Stumble and fall
    stumbleAngle: 0.3,
    fallAngle: 0.85,
    stumbleDuration: 0.9,
    stumbleLurch: 3.5,
    stumbleControl: 0.3,
    fallDuration: 2.6,
    getUpDuration: 1.8,
  },
  tail: {
    segments: 5,
    length: 30,
    baseRadius: 3.2,
    tipRadius: 1.2,
    density: 1.1,
    stiffness: 14,
    damping: 3.5,
  },
  legs: {
    stanceWidth: 4.6,
    stepLength: 6.5,
    stepDuration: 0.55,
    stepHeight: 3.2,
    /** How far ahead of the hip a step lands, in seconds of velocity. */
    lookahead: 0.42,
    /** Random timing offset per step (0..1). The "offbeat". */
    offbeat: 0.25,
    footLength: 7,
    footWidth: 3.8,
    footHeight: 2,
    /** Effective mass of a stomping foot as a share of the kaiju's mass. */
    stompMass: 0.5,
  },
  camera: {
    distance: 74,
    height: 50,
    lookHeight: 14,
    followLag: 0.35,
    yawLag: 0.9,
    fov: 50,
    shake: 1,
  },
};

export type Tuning = typeof codeDefaults;
export type TuningGroup = keyof Tuning;

/** Slider ranges for the GUI: [min, max, step]. Missing keys get a guessed range. */
export const ranges: { [G in TuningGroup]?: { [K in keyof Tuning[G]]?: [number, number, number] } } = {
  world: { gravity: [1, 30, 0.01] },
  debug: { ballSpeed: [5, 150, 1], ballRadius: [0.5, 8, 0.1], ballDensity: [0.5, 30, 0.5] },
  city: {
    seed: [0, 999, 1],
    blocks: [1, 5, 1],
    blockSize: [30, 120, 1],
    avenueWidth: [8, 40, 0.5],
    sideStreetWidth: [6, 30, 0.5],
    sidewalk: [0, 8, 0.5],
    lotGap: [0, 10, 0.5],
    floorHeight: [2, 8, 0.5],
    minFloors: [1, 10, 1],
    maxFloors: [2, 24, 1],
    chunkSize: [4, 16, 0.5],
    propDensity: [0, 3, 0.1],
  },
  destruction: {
    breakSpeed: [1, 40, 0.5],
    handoff: [0, 1.5, 0.05],
    breakDrag: [0, 2, 0.05],
    impactTilt: [0, 1, 0.05],
    chunkDensity: [0.05, 2, 0.05],
    friction: [0, 1.5, 0.05],
    supportFraction: [0, 1, 0.05],
    floorFailFraction: [0, 1, 0.05],
    collapseDelay: [0, 0.6, 0.01],
    debrisCap: [50, 800, 10],
    debrisLinearDamping: [0, 2, 0.05],
    debrisAngularDamping: [0, 4, 0.05],
  },
  kaiju: {
    bodyRadius: [2, 10, 0.1],
    bodyHalfHeight: [2, 14, 0.1],
    legLength: [2, 14, 0.1],
    density: [0.2, 6, 0.1],
    hoverFrequency: [0.3, 4, 0.05],
    hoverDamping: [0.05, 2, 0.05],
    uprightFrequency: [0.1, 3, 0.01],
    uprightDamping: [0.02, 2, 0.01],
    maxSpeed: [1, 30, 0.5],
    reverseSpeed: [0, 20, 0.5],
    acceleration: [0.5, 15, 0.1],
    braking: [0.5, 20, 0.1],
    grip: [0.5, 30, 0.5],
    driveOffset: [0, 20, 0.5],
    maxTurnRate: [0.2, 4, 0.05],
    turnAcceleration: [0.2, 10, 0.1],
    turnSpeedPenalty: [0, 1, 0.05],
    footfallKick: [0, 0.6, 0.01],
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
    density: [0.1, 5, 0.1],
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
    stompMass: [0, 2, 0.05],
  },
  camera: {
    distance: [15, 160, 1],
    height: [5, 140, 1],
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
  mergeTuning(t as unknown as Json, committed);
  for (const o of overrides) mergeTuning(t as unknown as Json, o);
  return t;
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
