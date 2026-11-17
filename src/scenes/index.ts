import { BallTool } from '../core/ball';
import type { Rapier } from '../core/physics';
import type { Tuning } from '../core/tuning';
import { Sim } from '../sim';
import { buildChicago } from './chicago';
import { buildCity } from './city';
import { buildCourse, buildRun } from './course';
import { buildPlane, buildYard } from './yard';

export type SceneName = 'city' | 'chicago' | 'course' | 'run' | 'yard' | 'plane';
export const SCENES: SceneName[] = ['city', 'chicago', 'course', 'run', 'yard', 'plane'];

export function createGame(R: Rapier, sceneName: SceneName, tuning: Tuning): Sim {
  const sim = new Sim(R, tuning);
  sim.parts.ball = new BallTool(sim);
  switch (sceneName) {
    case 'city':
      buildCity(sim);
      break;
    case 'chicago':
      buildChicago(sim);
      break;
    case 'course':
      buildCourse(sim);
      break;
    case 'run':
      buildRun(sim);
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
