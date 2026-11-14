import { BallTool } from '../core/ball';
import type { Rapier } from '../core/physics';
import type { Tuning } from '../core/tuning';
import { Sim } from '../sim';
import { buildCity } from './city';
import { buildPlane, buildYard } from './yard';

export type SceneName = 'city' | 'yard' | 'plane';
export const SCENES: SceneName[] = ['city', 'yard', 'plane'];

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
    case 'plane':
      buildPlane(sim);
      break;
  }
  return sim;
}
