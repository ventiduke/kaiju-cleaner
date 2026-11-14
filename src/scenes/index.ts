import { BallTool } from '../core/ball';
import type { Rapier } from '../core/physics';
import type { Tuning } from '../core/tuning';
import { Sim } from '../sim';
import { buildCity } from './city';
import { buildYard } from './yard';

export type SceneName = 'yard' | 'city';
export const SCENES: SceneName[] = ['yard', 'city'];

export function createGame(R: Rapier, sceneName: SceneName, tuning: Tuning): Sim {
  const sim = new Sim(R, tuning);
  sim.parts.ball = new BallTool(sim);
  switch (sceneName) {
    case 'city':
      buildCity(sim);
      break;
    case 'yard':
      buildYard(sim);
      break;
  }
  return sim;
}
