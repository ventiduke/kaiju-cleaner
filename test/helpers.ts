import type { BallTool } from '../src/core/ball';
import type { Damage } from '../src/city/damage';
import type { CityLayout } from '../src/city/cityGen';
import type { ChunkField } from '../src/city/destruction';
import type { PropField } from '../src/city/props';
import type { Kaiju } from '../src/kaiju/kaiju';
import { initRapier } from '../src/core/physics';
import { makeTuning } from '../src/core/tuning';
import { createGame, type SceneName } from '../src/scenes';
import { REF } from './feel/maneuvers';
import type { Sim } from '../src/sim';

export interface Game {
  sim: Sim;
  kaiju: Kaiju;
  /** How many bodies are awake, not counting the kaiju's own (body, tail, feet). */
  awakeOthers(): number;
  chunks: ChunkField;
  props: PropField;
  damage: Damage;
  layout: CityLayout;
  ball: BallTool;
}

export async function makeGame(scene: SceneName, overrides: unknown = {}): Promise<Game> {
  const R = await initRapier();
  const sim = createGame(R, scene, makeTuning(REF, overrides));
  const kaiju = sim.parts.kaiju as Kaiju;
  return {
    sim,
    kaiju,
    awakeOthers: () => {
      const own = new Set([kaiju.body, ...kaiju.tail.segments, ...kaiju.legs.feet.map((f) => f.body)].map((b) => b.handle));
      let n = 0;
      sim.world.forEachActiveRigidBody((b) => {
        if (!own.has(b.handle)) n++;
      });
      return n;
    },
    chunks: sim.parts.chunks as ChunkField,
    props: sim.parts.props as PropField,
    damage: sim.parts.damage as Damage,
    layout: sim.parts.layout as CityLayout,
    ball: sim.parts.ball as BallTool,
  };
}

