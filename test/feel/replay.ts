import * as THREE from 'three';
import type { BallTool } from '../../src/core/ball';
import { initRapier } from '../../src/core/physics';
import type { SessionFile } from '../../src/core/session';
import { SessionRecorder } from '../../src/core/session';
import { makeTuning, mergeTuning } from '../../src/core/tuning';
import type { Damage } from '../../src/city/damage';
import type { Kaiju } from '../../src/kaiju/kaiju';
import { createGame, type SceneName } from '../../src/scenes';
import type { Sim } from '../../src/sim';

export interface Replay {
  sim: Sim;
  kaiju: Kaiju;
  recorder: SessionRecorder;
  /** Metres between where the replayed kaiju ended and where the recorded one did. */
  endError: number;
}

/**
 * Re-runs a saved session in the sim: same scene, same starting settings, the same
 * inputs and settings changes on the same ticks. On the build it was recorded with
 * this reproduces the run exactly; on a later build it shows how the same inputs play now.
 */
export async function replaySession(file: SessionFile, onStep?: (sim: Sim, kaiju: Kaiju) => void): Promise<Replay> {
  const R = await initRapier();
  const sim = createGame(R, file.scene as SceneName, makeTuning(file.initialTuning));
  const kaiju = sim.parts.kaiju as Kaiju;
  const ball = sim.parts.ball as BallTool;
  const recorder = sim.add(new SessionRecorder(sim, file.scene, kaiju, sim.parts.damage as Damage));
  let ii = 0;
  let ti = 0;
  let bi = 0;
  for (let tick = 0; tick < file.end.tick; tick++) {
    while (ti < file.tuningChanges.length && file.tuningChanges[ti].tick <= tick) {
      mergeTuning(sim.tuning as never, file.tuningChanges[ti++].tuning);
    }
    while (ii < file.inputs.length && file.inputs[ii][0] <= tick) {
      sim.players[0].thrust = file.inputs[ii][1];
      sim.players[0].turn = file.inputs[ii][2];
      sim.players[0].tiptoe = !!file.inputs[ii][3];
      sim.players[0].crouch = !!file.inputs[ii][4];
      sim.players[0].grab = !!file.inputs[ii][5];
      sim.players[0].balanceX = file.inputs[ii][6] ?? 0;
      sim.players[0].balanceZ = file.inputs[ii][7] ?? 0;
      sim.players[0].breath = !!file.inputs[ii][8];
      sim.players[0].bow = !!file.inputs[ii][9];
      sim.players[0].jump = !!file.inputs[ii][10];
      sim.players[0].strafe = file.inputs[ii][11] ?? 0;
      sim.players[0].look = file.inputs[ii][12] ?? 0;
      sim.players[0].sprint = !!file.inputs[ii][13];
      ii++;
    }
    while (bi < file.balls.length && file.balls[bi][0] <= tick) {
      const b = file.balls[bi++];
      ball.throw(new THREE.Vector3(b[1], b[2], b[3]), new THREE.Vector3(b[4], b[5], b[6]));
    }
    sim.step();
    onStep?.(sim, kaiju);
  }
  const p = kaiju.position();
  return { sim, kaiju, recorder, endError: Math.hypot(p.x - file.end.x, p.z - file.end.z) };
}
