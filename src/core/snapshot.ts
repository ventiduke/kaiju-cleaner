import type { Approval } from '../city/approval';
import type { Damage } from '../city/damage';
import type { ChunkField } from '../city/destruction';
import type { Pieces } from '../city/pieces';
import type { Kaiju } from '../kaiju/kaiju';
import type { Nose } from '../kaiju/nose';
import type { Sim } from '../sim';

const r = (v: number, places = 1) => Math.round(v * 10 ** places) / 10 ** places;

/**
 * The state of the game as a small plain object: what a person would say if asked "what is
 * going on right now?". It exists so that a change can be checked by reading, before (or
 * instead of) looking at a picture: a screenshot shows that something is wrong, this says what.
 */
export function snapshot(sim: Sim): Record<string, unknown> {
  const kaiju = sim.parts.kaiju as Kaiju | undefined;
  const pieces = sim.parts.pieces as Pieces | undefined;
  const approval = sim.parts.approval as Approval | undefined;
  const damage = sim.parts.damage as Damage | undefined;
  const chunks = sim.parts.chunks as ChunkField | undefined;
  const nose = sim.parts.nose as Nose | undefined;
  const p = kaiju?.position();
  const held = pieces?.held;
  return {
    tick: sim.tick,
    seconds: r(sim.time),
    kaiju: kaiju && p
      ? {
          at: [r(p.x), r(p.y), r(p.z)],
          yawDeg: Math.round((kaiju.yaw * 180) / Math.PI),
          state: kaiju.state,
          mode: kaiju.mode,
          speed: r(kaiju.speed),
          leanDeg: Math.round((kaiju.tilt * 180) / Math.PI),
          stumbles: kaiju.stumbles,
          falls: kaiju.falls,
          saves: kaiju.saves,
          bows: kaiju.bows,
          onSlick: kaiju.traction < 0.5,
          wading: kaiju.wading > 0.05,
        }
      : null,
    holding: held
      ? { job: held.job.name ?? held.job.kind, state: held.state, marker: r(pieces!.marker, 2), prompt: pieces!.prompt, grip: r(pieces!.grip, 2), raised: r(pieces!.progress, 2) }
      : null,
    jobs: approval
      ? { done: approval.board.done, total: approval.board.total, list: approval.board.list().map((j) => `${j.done ? (j.sloppy ? '~' : 'x') : j.active ? '>' : ' '} ${j.name}: ${j.note}`) }
      : null,
    approval: approval ? r(approval.value) : null,
    finished: approval?.finished ? r(approval.finished.seconds) : null,
    damage: damage ? { chunks: damage.chunksBroken, buildings: damage.buildingsDamaged, props: damage.propsDisturbed, squashed: damage.citizensSquished } : null,
    nose: nose ? { tickle: r(nose.tickle, 2), sneezes: nose.sneezes } : null,
    physics: { ...sim.counts(), debris: chunks?.looseCount ?? 0, stepMs: r(sim.lastStepMs, 2) },
    hour: sim.tuning.gfx.hour,
  };
}
