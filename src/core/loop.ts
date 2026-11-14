import { FIXED_DT } from './physics';

export interface LoopHooks {
  /** One fixed physics step. */
  step(): void;
  /** Draw a frame. `alpha` is how far we are between the last two physics steps (0..1). */
  render(alpha: number, frameDt: number): void;
}

const MAX_STEPS_PER_FRAME = 4;

/** Fixed-timestep loop with render interpolation. */
export class Loop {
  paused = false;
  private accumulator = 0;
  private last = 0;
  private raf = 0;

  constructor(private hooks: LoopHooks) {}

  start(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const frameDt = Math.min((now - this.last) / 1000, 0.25);
      this.last = now;
      if (!this.paused) {
        this.accumulator += frameDt;
        let steps = 0;
        while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
          this.hooks.step();
          this.accumulator -= FIXED_DT;
          steps++;
        }
        // Too slow to keep up: drop the backlog instead of spiralling.
        if (this.accumulator > FIXED_DT) this.accumulator = 0;
      }
      this.hooks.render(this.paused ? 1 : this.accumulator / FIXED_DT, frameDt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
}
