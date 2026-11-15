import type { Citizens } from './citizens';
import type { Damage } from './damage';
import { JobBoard } from './jobs';
import type { Pieces } from './pieces';
import type { Sweeps } from './sweeps';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim, System } from '../sim';

/**
 * What each thing is worth, in points of approval (out of 100). The city starts undecided at
 * 50. Doing every job well earns the other 50, shared equally between the jobs, however many
 * there are. The costs are set so that the careful playtest bot, which finishes a nine-job
 * shift having scraped about fifty buildings and a hundred people, lands near the middle
 * (`npm run playbot`): a person taking more care should end well above it, and a rampage
 * well below.
 */
export const WORTH = {
  start: 50,
  /** Shared between all the jobs of a shift. */
  jobs: 50,
  /** A crooked repair earns this share of a straight one. */
  crookedShare: 0.6,
  /** Per person won over by a bow, up to `forgivenMax` in all. */
  forgiven: 0.4,
  forgivenMax: 8,
  squished: -0.2,
  building: -0.45,
  chunk: -0.004,
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
 * What the city makes of the kaiju, from 0 to 100. It starts in the middle. Finishing jobs
 * raises it (more for a straight repair than a crooked one), and so does bowing to people
 * it has just frightened. Knocking buildings about and squashing people lowers it. When the
 * last job is done, that is the verdict.
 *
 * Every time the score moves it says so (`approval` event), with a reason and the place it
 * happened, so the game can show the player what they just did.
 */
export class Approval implements System {
  value = WORTH.start;
  /** How many frightened people a bow has won over. */
  forgiven = 0;
  /** Set once every job is done: the time it took, and the score at that moment. */
  finished: { seconds: number; approval: number } | null = null;
  private last = { straight: 0, crooked: 0, swept: 0, forgiven: 0, squished: 0, buildings: 0 };
  private at = {
    job: { x: 0, y: 0, z: 0 },
    squish: { x: 0, y: 0, z: 0 },
    damage: { x: 0, y: 0, z: 0 },
    kaiju: { x: 0, y: 0, z: 0 },
  };

  constructor(
    private sim: Sim,
    private damage: Damage,
    private pieces: Pieces | null,
    private citizens: Citizens | null,
    private kaiju: Kaiju,
    private sweeps: Sweeps | null = null,
  ) {
    const board = new JobBoard(pieces, sweeps);
    this.board = board;
    sim.on('kaijuBow', (e) => {
      // Sorry only counts if someone is there to hear it.
      this.forgiven += this.citizens?.calm(e.x, e.z, 70 + kaiju.speed) ?? 0;
    });
    const note = (key: 'job' | 'squish' | 'damage') => (e: { x: number; y: number; z: number }) => {
      this.at[key] = { x: e.x, y: e.y, z: e.z };
    };
    sim.on('piecePlace', note('job'));
    sim.on('pieceDrop', note('job'));
    sim.on('sweepDone', note('job'));
    sim.on('citizenSquish', note('squish'));
    sim.on('citizenSplat', note('squish'));
    sim.on('chunkBreak', note('damage'));
  }

  readonly board: JobBoard;

  /** What one job done well is worth this shift. */
  get perJob(): number {
    return WORTH.jobs / Math.max(1, this.board.total);
  }

  postStep(): void {
    const d = this.damage;
    const p = this.pieces;
    const now = {
      straight: p ? p.placed - p.crooked : 0,
      crooked: p?.crooked ?? 0,
      swept: this.sweeps?.sweeps.filter((s) => s.done).length ?? 0,
      forgiven: Math.min(WORTH.forgivenMax, this.forgiven * WORTH.forgiven),
      squished: d.citizensSquished,
      buildings: d.buildingsDamaged,
    };
    const each = this.perJob;
    const raw =
      WORTH.start +
      (now.straight + now.swept + now.crooked * WORTH.crookedShare) * each +
      now.forgiven +
      now.squished * WORTH.squished +
      now.buildings * WORTH.building +
      d.chunksBroken * WORTH.chunk;
    this.value = Math.max(0, Math.min(100, raw));

    // Say what changed.
    const k = this.kaiju.body.translation();
    this.at.kaiju = { x: k.x, y: k.y + 14, z: k.z };
    const last = this.last;
    const tell = (delta: number, why: string, at: { x: number; y: number; z: number }) => {
      if (Math.abs(delta) > 0.01) this.sim.emit('approval', { x: at.x, y: at.y, z: at.z, delta, why });
    };
    const jobs = (now.straight - last.straight + (now.crooked - last.crooked) * WORTH.crookedShare) * each;
    tell(jobs, jobs < 0 ? 'Knocked it off again' : now.crooked > last.crooked ? 'Close enough…' : 'Good as new!', this.at.job);
    tell((now.swept - last.swept) * each, 'Road clear!', this.at.job);
    tell(now.forgiven - last.forgiven, 'Apology accepted', this.at.kaiju);
    tell((now.squished - last.squished) * WORTH.squished, 'Squashed!', this.at.squish);
    tell((now.buildings - last.buildings) * WORTH.building, 'That was somebody\'s building', this.at.damage);
    this.last = now;

    if (!this.finished && this.board.allDone()) {
      this.finished = { seconds: this.sim.time, approval: this.value };
      this.sim.emit('repairsDone', { x: this.at.job.x, y: this.at.job.y, z: this.at.job.z, approval: this.value });
    }
  }
}
