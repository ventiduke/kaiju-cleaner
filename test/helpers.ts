import type { BallTool } from '../src/core/ball';
import type { Damage } from '../src/city/damage';
import type { CityLayout } from '../src/city/cityGen';
import type { ChunkField } from '../src/city/destruction';
import type { PropField } from '../src/city/props';
import { initRapier } from '../src/core/physics';
import { makeTuning } from '../src/core/tuning';
import { createGame, type SceneName } from '../src/scenes';
import type { Sim } from '../src/sim';

export interface Game {
  sim: Sim;
  chunks: ChunkField;
  props: PropField;
  damage: Damage;
  layout: CityLayout;
  ball: BallTool;
}

export async function makeGame(scene: SceneName, overrides: unknown = {}): Promise<Game> {
  const R = await initRapier();
  const sim = createGame(R, scene, makeTuning(overrides));
  return {
    sim,
    chunks: sim.parts.chunks as ChunkField,
    props: sim.parts.props as PropField,
    damage: sim.parts.damage as Damage,
    layout: sim.parts.layout as CityLayout,
    ball: sim.parts.ball as BallTool,
  };
}

