import type { Pieces } from './pieces';
import type { Sweeps } from './sweeps';

/** One line of the job list. */
export interface JobView {
  name: string;
  color: number;
  done: boolean;
  /** Done, but not well (a piece set in crooked). */
  sloppy: boolean;
  /** In hand right now. */
  active: boolean;
  /** Where to go next for it: the thing itself, or where it belongs once it is in hand. */
  x: number;
  z: number;
  /** A word or two on how it stands: "2 lumps left", "carry to marker". */
  note: string;
}

const NAMES: Record<string, string> = { top: 'Tower top', span: 'Bridge span', raise: 'Toppled clock tower', bus: 'Bus on a roof' };

/** Everything there is to do this shift, of whatever kind, as one list. */
export class JobBoard {
  constructor(
    private pieces: Pieces | null,
    private sweeps: Sweeps | null,
  ) {}

  get total(): number {
    return (this.pieces?.pieces.length ?? 0) + (this.sweeps?.sweeps.length ?? 0);
  }

  get done(): number {
    return (this.pieces?.placed ?? 0) + (this.sweeps?.sweeps.filter((s) => s.done).length ?? 0);
  }

  allDone(): boolean {
    return this.total > 0 && this.done === this.total;
  }

  list(): JobView[] {
    const out: JobView[] = [];
    for (const piece of this.pieces?.pieces ?? []) {
      const held = piece.state === 'held' || piece.state === 'lifting' || piece.state === 'raising';
      const carried = held && piece.state !== 'raising';
      const p = piece.body.translation();
      out.push({
        name: piece.job.name ?? NAMES[piece.job.kind],
        color: piece.job.color,
        done: piece.state === 'placed',
        sloppy: piece.fit === 'crooked',
        active: held,
        x: carried ? piece.job.socket.x : p.x,
        z: carried ? piece.job.socket.z : p.z,
        note: piece.state === 'placed' ? (piece.fit === 'crooked' ? 'crooked' : 'done') : piece.state === 'raising' ? 'heave!' : carried ? 'carry to its marker' : piece.job.kind === 'raise' ? 'stand it up' : 'pick it up',
      });
    }
    for (const sweep of this.sweeps?.sweeps ?? []) {
      out.push({
        name: 'Blocked road',
        color: sweep.spec.color,
        done: sweep.done,
        sloppy: false,
        active: false,
        x: sweep.spec.x,
        z: sweep.spec.z,
        note: sweep.done ? 'done' : `${sweep.remaining} lumps to clear`,
      });
    }
    return out;
  }
}
