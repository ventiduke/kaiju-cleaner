import type { Citizens } from './citizens';
import type { Damage } from './damage';
import type { Pieces } from './pieces';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim, System } from '../sim';

/** What each thing is worth, in points of approval (out of 100). All of it guesswork to be tuned by play. */
export const WORTH = {
  start: 50,
  straight: 14,
  crooked: 8,
  /** Per person won over by a bow, up to `forgivenMax` in all. */
  forgiven: 0.5,
  forgivenMax: 15,
  squished: -1,
  building: -1.2,
  chunk: -0.01,
};

export function verdict(approval: number): string {
  return approval >= 85
    ? "They're naming a park after you."
    : approval >= 60
      ? 'Mostly forgiven.'
      : approval >= 35
        ? 'Thanks… we think.'
        : 'Please stop helping.';
}

/**
 * What the city makes of the kaiju, from 0 to 100. It starts in the middle. Putting things
 * back raises it (more for a straight job than a crooked one), and so does bowing to
 * people it has just frightened. Knocking buildings about and squashing people lowers it.
 * When the last repair goes in, that is the verdict.
 */
export class Approval implements System {
  value = WORTH.start;
  /** How many frightened people a bow has won over. */
  forgiven = 0;
  /** Set once every repair is done: the time it took, and the score at that moment. */
  finished: { seconds: number; approval: number } | null = null;

  constructor(
    private sim: Sim,
    private damage: Damage,
    private pieces: Pieces | null,
    private citizens: Citizens | null,
    kaiju: Kaiju,
  ) {
    sim.on('kaijuBow', (e) => {
      // Sorry only counts if someone is there to hear it.
      this.forgiven += this.citizens?.calm(e.x, e.z, 70 + kaiju.speed) ?? 0;
    });
  }

  postStep(): void {
    const d = this.damage;
    const p = this.pieces;
    const straight = p ? p.placed - p.crooked : 0;
    const raw =
      WORTH.start +
      straight * WORTH.straight +
      (p?.crooked ?? 0) * WORTH.crooked +
      Math.min(WORTH.forgivenMax, this.forgiven * WORTH.forgiven) +
      d.citizensSquished * WORTH.squished +
      d.buildingsDamaged * WORTH.building +
      d.chunksBroken * WORTH.chunk;
    this.value = Math.max(0, Math.min(100, raw));
    if (p && !this.finished && p.allPlaced()) {
      this.finished = { seconds: this.sim.time, approval: this.value };
      const k = p.pieces[p.pieces.length - 1].body.translation();
      this.sim.emit('repairsDone', { x: k.x, y: k.y, z: k.z, approval: this.value });
    }
  }
}
