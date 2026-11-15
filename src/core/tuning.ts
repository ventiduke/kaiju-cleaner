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
    blocks: 8,
    blockSize: 30,
    /** One extra-wide street through the middle. */
    boulevardWidth: 44,
    avenueWidth: 30,
    sideStreetWidth: 24,
    sidewalk: 2,
    lotGap: 3,
    floorHeight: 4,
    minFloors: 2,
    maxFloors: 13,
    chunkSize: 8.5,
    /** A river through the middle, splitting the city in two. 0 for none. */
    riverWidth: 60,
    riverDepth: 13,
    /** How fast the river runs, west to east (m/s). */
    riverCurrent: 9,
    /** Covered walkways strung between buildings across a street, high enough to crawl under. */
    skybridges: 8,
    /** Oil spills on the roads: no grip at all. */
    oilSlicks: 6,
    /** Cracked patches of road over a tunnel: a heavy step brings them down. */
    weakSpots: 6,
    /** Water mains under the road: a heavy step bursts one into a geyser and a slippery flood. */
    waterMains: 5,
    /** Things to put back: tower tops lying in the road, and a bridge span. */
    repairJobs: 4,
    /** Toppled monuments to stand back up (there is one plaza to put them in). */
    monuments: 1,
    /** Buses to lift down off roofs, and stretches of road to sweep clear of rubble. */
    busJobs: 2,
    sweepJobs: 2,
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
    debrisCap: 300,
    debrisLinearDamping: 0.15,
    debrisAngularDamping: 0.6,
    /** Seconds after which loose debris gets heavily damped so piles stop jittering and sleep. */
    settleAfter: 3,
    /**
     * Crumbling. This share of loose pieces are brittle: the first knock harder than
     * `crumbleSpeed` (m/s, for a same-mass hit) turns them to dust and a few bits of rubble.
     * The sturdy rest stay as rubble big enough to stand on.
     */
    crumbleChance: 0.75,
    crumbleSpeed: 2.5,
    /** Bits of small rubble left by each piece that crumbles, on average, and the most kept at once. */
    rubbleBits: 1.3,
    rubbleCap: 240,
  },
  kaiju: {
    // Shape (needs restart)
    /**
     * Overall size, as a label: 1 is the original giant, thirty-nine metres to the top of its head.
     * The panel's size dial scales the body, legs and tail together and writes the result here.
     */
    size: 1,
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
    /** Share of its own acceleration that leans it (1: all of it). Set from the feel dials. */
    pitchShare: 1,
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
    /** How violently its feet go out from under it on oil (rad/s^2 at a run). Tiptoe barely slips. */
    oilSlip: 5,
    /** Share of steering and thrust it keeps while stumbling. Keep pushing and it goes over. */
    stumbleControl: 0.8,
    /** Seconds it has, once it is going over, to be caught by steering into the fall. */
    saveWindow: 0.9,
    /** How hard steering into a fall hauls it back upright. */
    saveStrength: 3,
    fallDuration: 1.4,
    getUpDuration: 1.3,
  },
  modes: {
    // Tiptoe (hold Shift): slow, narrow, quiet, and only for as long as the calves last.
    tiptoeSpeed: 0.35,
    tiptoeStance: 0.55,
    tiptoeFoot: 0.6,
    tiptoeLean: 0.5,
    tiptoeTurn: 0.7,
    /** How far it rises onto its toes (m). */
    tiptoeRise: 2.2,
    /** Seconds of tiptoe before it has to come down, and seconds to recover fully. */
    tiptoeSeconds: 7,
    tiptoeRecover: 4,
    // Crawl (hold Space): down on all fours. Slow, nearly impossible to topple, low enough to
    // pass under a skybridge, and it flattens whatever is under its belly. The view drops too.
    crawlSpeed: 0.32,
    /** How far forward it pitches (rad), and how high its belly rides off the ground (m). */
    crawlPitch: 1.38,
    crawlClearance: 2.5,
    crawlTurn: 0.6,
    /** How far the camera drops while crawling (share of its height). */
    crawlView: 0.5,
  },
  carry: {
    /** How close (m) a piece has to be to the hands to be grabbed. */
    reach: 16,
    /** How far in front of the belly, and how high above the body's centre, it is held (m). */
    holdForward: 11,
    handHeight: 1,
    liftTime: 0.5,
    /**
     * Keeping hold. A load works loose in the hands: over `holdSeconds` when it is carried
     * gently, sooner the more it is thrown about (`rough`: hard starts and stops, sharp
     * turns), and in lumps when it is knocked. Once the grip is down to `slipAt` the load
     * is slipping, and a bar comes up beside it: a marker runs back and forth along it, once
     * across every `sweep` seconds, and a press of the jump key while the marker is in the
     * zone in the middle (`zone`, as a share of the bar; up to `zoneStill` times wider
     * standing still or with feet planted) takes a firm hold again. A press anywhere else is
     * a fumble and costs `fumble` of the grip. Left alone, a slipping load is on the ground
     * `slipTime` seconds after it started to go.
     */
    holdSeconds: 9,
    rough: 1,
    slipAt: 0.3,
    slipTime: 3.4,
    sweep: 0.62,
    zone: 0.24,
    zoneStill: 1.6,
    fumble: 0.1,
    /** Standing a toppled piece back up: this many good heaves, each a press in the zone, before the grip (`heaveSeconds` of it) gives out. */
    heaves: 5,
    heaveSeconds: 16,
    /** Shares of normal speed, acceleration, turn rate and turn acceleration while carrying. */
    speed: 0.6,
    accel: 0.5,
    turn: 0.5,
    turnAccel: 0.4,
    /** Released within this distance (m) of where it belongs, a piece goes in. */
    snapRadius: 6,
    /** Within this distance (m), with a firm hold, it goes in straight; within `perfectRadius`, it could not be bettered. */
    straightRadius: 2.6,
    perfectRadius: 1,
  },
  sneeze: {
    /** How much each chunk breaking right beside it tickles (1 = a sneeze). Crumbling counts double. */
    dust: 0.014,
    /** How fast the tickle clears in clean air (per second). */
    clear: 0.05,
    /** Seconds after a sneeze in which its nose is clear and takes no dust (or one sneeze's wreckage would bring on the next). */
    rest: 25,
    /** Seconds between "ah... ah..." and the sneeze. */
    windup: 0.9,
    /** How hard it is thrown backwards (m/s). */
    kick: 13,
    /** How far the blast reaches (m) and how hard it throws things (m/s close up). */
    range: 80,
    power: 32,
  },
  citizens: {
    /** How many people stroll each block's sidewalks (x5). */
    density: 1,
  },
  audio: {
    volume: 0.6,
    muted: false,
  },
  tail: {
    /**
     * 1: the tail can smash buildings (when it is swung fast enough: see `wreckSpeed`). 0: never.
     * On the test course a tail that smashed whatever it touched did about half of all the damage,
     * from behind the player, where they could not see it.
     */
    wrecks: 0,
    /**
     * How fast a part of the tail has to be moving, relative to the kaiju, before it smashes what
     * it hits (m/s). Slower than this it passes walls by: dragged along a street it does nothing,
     * whipped round in a hard turn it takes the shopfronts off.
     */
    wreckSpeed: 38,
    /** How many chunks one part of the tail can break in one swing before it is spent (0: no limit). */
    bite: 3,
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
  /**
   * Moves beyond walking and turning. A movement style (see STYLES) sets these and the feel
   * dials together; each can still be changed by hand afterwards.
   */
  move: {
    /** Which style was last chosen: 0 lumbering, 1 steady, 2 wild, 3 the Runner (what it ships as). Only a label; the numbers are what count. */
    style: 1,
    /** How high it can leap, in metres (0: it cannot). It comes down hard. */
    jump: 0,
    /** 1: pressing crawl at a run throws it into a belly-slide, keeping its speed. */
    slide: 0,
    /** 1: the direction keys mean "that way on the screen" and the kaiju turns to go there. 0: A and D turn it, W and S drive it. */
    relative: 1,
    /** Extra gravity while in the air, so that a leap is quick rather than floaty (multiples of normal). */
    hangGravity: 2.6,
    /**
     * Which body it has. 0: the balancing one, that leans, wobbles and falls (all the styles above).
     * 1: the runner, a plain third-person character: always upright, goes where it is pointed.
     */
    controller: 0,
  },
  /**
   * The runner: a third-person animal. The mouse turns the view; W A S D mean "that way on the
   * screen", and it turns to go there on an arc that widens with its speed. It carries its
   * weight: it leans into turns, drifts when turned harder than its feet can hold, skids round
   * to reverse, and throws itself flat into a slide. It never loses its balance.
   */
  runner: {
    /** Running and sprinting speed (m/s). */
    speed: 30,
    sprint: 48,
    /** Seconds to reach running speed from rest, for a sprint to build on top of that, and to stop from a run. */
    accel: 0.42,
    sprintBuild: 0.9,
    stop: 0.34,
    /** How fast it can swing its body round (rad/s): standing still, and at a full sprint. */
    turn: 10,
    turnFast: 3.6,
    /** How long a turn takes to build and to die away (s): the weight in its steering. */
    turnEase: 0.07,
    /** Sideways acceleration its feet can hold (m/s^2). Turned harder than this at speed, it drifts. */
    grip: 90,
    /** How far it leans into turns and with its speed (1: as drawn; 0: bolt upright). */
    lean: 1,
    /** Share of its ground steering that works in the air. */
    airControl: 0.35,
    /** Jump height (m), and how much harder than normal gravity pulls it back down. */
    jump: 9,
    gravity: 2.4,
    /** Crouched, it moves at this share of running speed, and its steps are light. */
    crouchSpeed: 0.45,
    /** Crouching while faster than this share of running speed throws it into a slide. */
    slideFrom: 0.5,
    /** A slide gains this much speed as it starts (m/s), loses this much a second (m/s^2), and can be steered this fast (rad/s). */
    slideBoost: 6,
    slideFriction: 18,
    slideSteer: 1.3,
    /** Strides a second at running speed (a stride is two steps). Slower reads as heavier. */
    cadence: 1.25,
    /** How tightly its tail follows its body (a spring, 1/s^2). The tail's own settings are the balancing body's. */
    tail: 140,
    /** Camera: how far behind and how far above. */
    camDistance: 46,
    camHeight: 16,
    /** How fast the view swings round behind it when it runs across the screen and the mouse is still (rad/s; 0: never). */
    camFollow: 0.8,
    /** How fast the mouse turns the view. */
    sensitivity: 1,
  },
  /** Which shift this is: each one is a new city. */
  game: { shift: 1 },
  /** How it looks. None of this touches the simulation. */
  gfx: {
    /** Time of day, 6 to 22. T steps through the good ones. */
    hour: 17.4,
    /** Glow round bright things (0 off). */
    bloom: 0.38,
    clouds: 0.55,
    /** 1: antialiased float buffer, bloom and grading. 0: straight to the screen, for slow machines. */
    post: 1,
    /** The split-second hold on a big impact (1 on, 0 off). The camera shake has its own dial under camera. */
    hitStop: 1,
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
  // How much of its own speeding up and slowing down leans it. A slow kaiju leans into all of
  // it; a quick one would be thrown flat by its own start, so it feels less of it in proportion.
  k.pitchShare = round(Math.min(1, 18 / k.acceleration));
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

/**
 * Movement styles: whole characters to try, each a setting of the six feel dials plus which
 * extra moves it has. They are starting points for a playtester to pick between and then
 * adjust, not fixed modes: choosing one just writes these numbers.
 */
export const STYLES: { name: string; blurb: string; feel: Tuning['feel'] | null; move: { jump: number; slide: number; relative: number; controller: number } }[] = [
  {
    name: 'Lumbering',
    blurb: 'heavy, wobbly, slow to answer: how it was',
    feel: { speed: 32, pickup: 2.1, turning: 2, grip: 35.5, wobble: 0.77, balance: 0.75 },
    move: { jump: 0, slide: 0, relative: 0, controller: 0 },
  },
  {
    name: 'Steady',
    blurb: 'answers at once, corners cleanly, still falls if you ask for it',
    feel: { speed: 40, pickup: 0.8, turning: 2.9, grip: 62, wobble: 0.32, balance: 0.8 },
    move: { jump: 0, slide: 0, relative: 1, controller: 0 },
  },
  {
    name: 'Wild',
    blurb: 'fast, with a leap (Space) and a belly-slide (C at a run)',
    feel: { speed: 56, pickup: 0.55, turning: 3.5, grip: 70, wobble: 0.4, balance: 0.78 },
    move: { jump: 13, slide: 1, relative: 1, controller: 0 },
  },
  {
    // Not a setting of the feel dials at all: a different body. Its numbers are under "runner".
    name: 'Runner',
    blurb: 'a third-person animal: the mouse turns the view, W A S D run that way on the screen, Shift sprints, Space jumps, C crouches (on the move: slides)',
    feel: null,
    move: { jump: 0, slide: 0, relative: 0, controller: 1 },
  },
];

/** The giant the proportions are written for: the panel's size dial scales these. */
export const GIANT = { bodyRadius: 6.9, bodyHalfHeight: 8.1, legLength: 9.3, tailLength: 34, tailBase: 3.8, tailTip: 1.3 };

/**
 * Resizes the kaiju to `size` (1 is the giant), keeping whatever proportions it has now: a
 * tail that was made stubbier stays stubbier.
 */
export function applySize(t: Tuning, size: number): void {
  const k = t.kaiju;
  const ratio = size / (k.size || 1);
  const r = (v: number) => Math.round(v * ratio * 100) / 100;
  k.bodyRadius = r(k.bodyRadius);
  k.bodyHalfHeight = r(k.bodyHalfHeight);
  k.legLength = r(k.legLength);
  t.tail.length = r(t.tail.length);
  t.tail.baseRadius = r(t.tail.baseRadius);
  t.tail.tipRadius = r(t.tail.tipRadius);
  k.size = size;
}

/** Switches to a movement style: sets the feel dials and the extra moves, and works out the detailed numbers. */
export function applyStyle(t: Tuning, index: number): void {
  const style = STYLES[index];
  if (!style) return;
  if (style.feel) Object.assign(t.feel, style.feel);
  Object.assign(t.move, style.move, { style: index });
  applyFeel(t);
}

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
    speed: [4, 80, 0.5],
    pickup: [0.2, 6, 0.05],
    turning: [0.5, 5, 0.05],
    grip: [3, 120, 0.5],
    wobble: [0, 1, 0.01],
    balance: [0, 1, 0.01],
  },
  world: { gravity: [1, 30, 0.01] },
  debug: { ballSpeed: [5, 150, 1], ballRadius: [0.5, 8, 0.1], ballDensity: [0.5, 30, 0.5] },
  city: {
    seed: [0, 999, 1],
    blocks: [1, 12, 1],
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
    riverWidth: [0, 120, 2],
    riverDepth: [1, 24, 0.5],
    riverCurrent: [0, 30, 0.5],
    skybridges: [0, 16, 1],
    oilSlicks: [0, 20, 1],
    weakSpots: [0, 20, 1],
    waterMains: [0, 20, 1],
    repairJobs: [0, 10, 1],
    monuments: [0, 1, 1],
    busJobs: [0, 6, 1],
    sweepJobs: [0, 6, 1],
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
    crumbleChance: [0, 1, 0.05],
    crumbleSpeed: [0.5, 30, 0.5],
    rubbleBits: [0, 4, 0.1],
    rubbleCap: [0, 600, 10],
  },
  kaiju: {
    size: [0.3, 1.5, 0.01],
    bodyRadius: [2, 12, 0.1],
    bodyHalfHeight: [2, 16, 0.1],
    legLength: [2, 16, 0.1],
    density: [0.2, 12, 0.1],
    hoverFrequency: [0.3, 5, 0.05],
    hoverDamping: [0.05, 2, 0.05],
    uprightFrequency: [0.1, 2, 0.01],
    uprightDamping: [0.02, 2, 0.01],
    lean: [0, 0.8, 0.01],
    pitchShare: [0, 1, 0.01],
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
    oilSlip: [0, 15, 0.1],
    stumbleControl: [0, 1, 0.05],
    saveWindow: [0, 3, 0.05],
    saveStrength: [0, 10, 0.1],
    fallDuration: [0.5, 8, 0.1],
    getUpDuration: [0.3, 5, 0.1],
  },
  modes: {
    tiptoeSpeed: [0.1, 1, 0.05],
    tiptoeStance: [0.3, 1, 0.05],
    tiptoeFoot: [0.3, 1, 0.05],
    tiptoeLean: [0, 1, 0.05],
    tiptoeTurn: [0.2, 1, 0.05],
    tiptoeRise: [0, 6, 0.1],
    tiptoeSeconds: [1, 30, 0.5],
    tiptoeRecover: [0.5, 20, 0.5],
    crawlSpeed: [0.1, 1, 0.05],
    crawlPitch: [0.5, 1.55, 0.01],
    crawlClearance: [0, 8, 0.25],
    crawlTurn: [0.2, 1, 0.05],
    crawlView: [0, 0.8, 0.05],
  },
  carry: {
    reach: [4, 40, 0.5],
    holdForward: [4, 20, 0.5],
    handHeight: [-6, 8, 0.5],
    liftTime: [0.1, 2, 0.05],
    holdSeconds: [2, 40, 0.5],
    rough: [0, 4, 0.1],
    slipAt: [0.05, 0.8, 0.05],
    slipTime: [0.5, 10, 0.1],
    sweep: [0.2, 2, 0.02],
    zone: [0.05, 0.8, 0.01],
    zoneStill: [1, 3, 0.05],
    fumble: [0, 0.5, 0.01],
    heaves: [1, 12, 1],
    heaveSeconds: [4, 40, 1],
    speed: [0.2, 1, 0.05],
    accel: [0.1, 1, 0.05],
    turn: [0.1, 1, 0.05],
    turnAccel: [0.02, 1, 0.01],
    snapRadius: [1, 15, 0.5],
    straightRadius: [0.5, 8, 0.1],
    perfectRadius: [0.2, 4, 0.1],
  },
  sneeze: {
    dust: [0, 0.2, 0.002],
    clear: [0, 1, 0.01],
    rest: [0, 120, 1],
    windup: [0.1, 3, 0.05],
    kick: [0, 40, 0.5],
    range: [10, 200, 5],
    power: [0, 80, 1],
  },
  citizens: { density: [0, 4, 0.1] },
  audio: { volume: [0, 1, 0.01] },
  tail: {
    wrecks: [0, 1, 1],
    wreckSpeed: [0, 120, 1],
    bite: [0, 20, 1],
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
  move: { style: [0, 3, 1], jump: [0, 30, 0.5], slide: [0, 1, 1], relative: [0, 1, 1], hangGravity: [1, 5, 0.1], controller: [0, 1, 1] },
  runner: {
    speed: [5, 80, 0.5],
    sprint: [5, 120, 0.5],
    accel: [0.05, 1.5, 0.01],
    sprintBuild: [0.05, 3, 0.05],
    stop: [0.05, 1.5, 0.01],
    turn: [1, 30, 0.5],
    turnFast: [0.5, 15, 0.1],
    turnEase: [0.01, 0.4, 0.01],
    grip: [10, 300, 5],
    lean: [0, 2, 0.05],
    airControl: [0, 1, 0.05],
    jump: [0, 30, 0.5],
    gravity: [1, 5, 0.1],
    crouchSpeed: [0.1, 1, 0.05],
    slideFrom: [0.2, 1.5, 0.05],
    slideBoost: [0, 30, 0.5],
    slideFriction: [1, 40, 0.5],
    slideSteer: [0, 4, 0.05],
    cadence: [0.4, 3, 0.05],
    tail: [10, 400, 5],
    camDistance: [10, 150, 1],
    camHeight: [0, 60, 1],
    camFollow: [0, 3, 0.05],
    sensitivity: [0.2, 3, 0.05],
  },
  game: { shift: [1, 99, 1] },
  gfx: {
    hour: [6, 22, 0.1],
    bloom: [0, 1.5, 0.02],
    clouds: [0, 1, 0.05],
    post: [0, 1, 1],
    hitStop: [0, 1, 1],
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
  citizens: 'all',
  kaiju: ['size', 'bodyRadius', 'bodyHalfHeight', 'legLength', 'density'],
  tail: ['wrecks', 'segments', 'length', 'baseRadius', 'tipRadius', 'density'],
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
