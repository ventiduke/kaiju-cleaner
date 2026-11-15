import type { SimEvents } from '../sim';

/** How big a moment is. Everything that reacts to it (camera, time, particles, sound) scales from this. */
export type Tier = 'small' | 'medium' | 'large';

/**
 * What each size of moment gets:
 *   trauma  how hard the camera is shaken (it shakes by trauma squared, and trauma decays)
 *   stop    seconds the game holds its breath: the simulation pauses, the picture and sound do not
 *   burst   particles thrown, for the events that throw any
 *   pitch   how far a repeated sound may wander either side of its pitch (0.07 = 7%)
 */
export const TIERS: Record<Tier, { trauma: number; stop: number; burst: number; pitch: number }> = {
  small: { trauma: 0.06, stop: 0, burst: 0, pitch: 0.08 },
  medium: { trauma: 0.25, stop: 0.035, burst: 24, pitch: 0.05 },
  large: { trauma: 0.65, stop: 0.08, burst: 70, pitch: 0.03 },
};

/**
 * Every event that gets feedback, and how big it is. `scale` trims the camera shake for
 * that event; `stop: false` is for things that are big but not sudden (a geyser, a finished
 * shift), where freezing the game would feel like a hitch rather than an impact.
 *
 * Rules this table is kept to (see the juice-pass skill): one size per event; nothing here
 * hides the kaiju or the job in hand; the shake is the camera's, never the physics body's.
 */
export const FEEDBACK: { [E in keyof SimEvents]?: { tier: Tier; scale?: number; stop?: boolean } } = {
  footfall: { tier: 'small', scale: 1.6 },
  chunkBreak: { tier: 'small', scale: 0.8 },
  citizenSquish: { tier: 'small', scale: 0.5 },
  pieceGrab: { tier: 'small' },
  kaijuStumble: { tier: 'medium', scale: 0.5, stop: false },
  kaijuSave: { tier: 'medium', scale: 0.8, stop: false },
  oilSlip: { tier: 'medium', scale: 0.6, stop: false },
  pieceDrop: { tier: 'medium' },
  sweepDone: { tier: 'medium', stop: false },
  kaijuFall: { tier: 'large' },
  sneeze: { tier: 'large', scale: 1.2 },
  groundCollapse: { tier: 'large' },
  mainBurst: { tier: 'large', scale: 0.8, stop: false },
  piecePlace: { tier: 'large', scale: 0.35 },
  repairsDone: { tier: 'large', scale: 0.2, stop: false },
};

/**
 * Hit-stop: a few hundredths of a second in which the game holds still at the moment of a
 * big impact, so the eye catches it. It runs on real time, it never stacks (a second impact
 * during a stop can lengthen it to its own length, not add to it), and it is capped, so a
 * chain of impacts cannot freeze the game.
 */
export class HitStop {
  private left = 0;
  /** Longest the game will ever hold, however many things happen at once. */
  static readonly LIMIT = 0.12;

  hit(seconds: number): void {
    this.left = Math.min(HitStop.LIMIT, Math.max(this.left, seconds));
  }

  /** Call once per drawn frame with real elapsed time. True while the simulation should hold. */
  holding(frameDt: number): boolean {
    if (this.left <= 0) return false;
    this.left -= frameDt;
    return true;
  }

  get remaining(): number {
    return Math.max(0, this.left);
  }
}

/** A pitch multiplier for a repeated sound, so that twenty footsteps do not sound like one sample. */
export function vary(tier: Tier, random: number): number {
  return 1 + (random * 2 - 1) * TIERS[tier].pitch;
}
