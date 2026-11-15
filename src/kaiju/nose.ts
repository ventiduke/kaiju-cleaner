import * as THREE from 'three';
import type { ChunkField } from '../city/destruction';
import type { Pieces } from '../city/pieces';
import type { PropField } from '../city/props';
import type { Sim, System } from '../sim';
import type { Kaiju } from './kaiju';

const origin = new THREE.Vector3();
const dir = new THREE.Vector3();

/**
 * Dust gets up the kaiju's nose. Every chunk that breaks or crumbles nearby adds to the
 * tickle; let it build and the kaiju sneezes: it is thrown backwards, and a gale goes out
 * the front that flattens the nearest wall and sends everything loose (rubble, cars,
 * people) flying. There is no stopping one once it is coming: there is only the moment of
 * "ah... ah..." in which to point it somewhere it will do no harm (or some good: it clears
 * a blocked road as well as anything).
 */
export class Nose implements System {
  /** How close to a sneeze: 0 clear, 1 it is coming. */
  tickle = 0;
  /** Seconds until the sneeze, once it has started (0 when none is coming). */
  windup = 0;
  sneezes = 0;

  constructor(
    private sim: Sim,
    private kaiju: Kaiju,
    private chunks: ChunkField | null,
    private props: PropField | null,
  ) {
    const dust = (amount: number) => (e: { x: number; y: number; z: number }) => {
      const p = kaiju.body.translation();
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      this.tickle = Math.min(1, this.tickle + (sim.tuning.sneeze.dust * amount) / (1 + (d / 30) ** 2));
    };
    sim.on('chunkBreak', dust(1));
    sim.on('chunkCrumble', dust(2));
  }

  preStep(dt: number): void {
    const t = this.sim.tuning.sneeze;
    const k = this.kaiju;
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) this.sneeze();
      return;
    }
    const up = k.state === 'walk' || k.state === 'stumble';
    if (this.tickle >= 1 && up) {
      this.windup = t.windup;
      const p = k.body.translation();
      k.startle(t.windup);
      this.sim.emit('sneezeWindup', { x: p.x, y: p.y, z: p.z });
      return;
    }
    // It only clears while it isn't right on the brink (flat on its back, say, waiting to get up).
    if (this.tickle < 1) this.tickle = Math.max(0, this.tickle - t.clear * dt);
  }

  /** Lets one go, right now. (Also what the wind-up ends in.) */
  sneeze(): void {
    const t = this.sim.tuning.sneeze;
    const k = this.kaiju;
    const body = k.body;
    const p = body.translation();
    const tk = this.sim.tuning.kaiju;
    dir.copy(k.forward);
    // Out of the snout: up at head height, a body-radius in front.
    origin.set(p.x, p.y + tk.bodyHalfHeight * (1 - k.crawl), p.z).addScaledVector(dir, tk.bodyRadius);

    // The kaiju goes backwards, and its top goes back further.
    const mass = body.mass();
    body.applyImpulse({ x: -dir.x * mass * t.kick, y: 0, z: -dir.z * mass * t.kick }, true);
    k.trip(-dir.x, -dir.z, 1.3);

    this.chunks?.blast(origin, dir, t.range, 0.72, t.power);
    this.props?.blast(origin, dir, t.range, 0.72, t.power);
    const pieces = this.sim.parts.pieces as Pieces | undefined;
    pieces?.blast(origin, dir, t.range, 0.72, t.power);

    this.tickle = 0;
    this.windup = 0;
    this.sneezes++;
    this.sim.emit('sneeze', { x: origin.x, y: origin.y, z: origin.z, dx: dir.x, dz: dir.z });
  }
}
