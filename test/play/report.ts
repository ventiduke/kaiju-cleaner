import { it } from 'vitest';
import { formatBotReport, playShift, type BotStyle } from '../../src/bot/playbot';
import { initRapier } from '../../src/core/physics';
import { makeTuning } from '../../src/core/tuning';
import { createGame, type SceneName } from '../../src/scenes';

/**
 * `npm run playbot` plays whole shifts with the scripted players, on the shipped settings,
 * and prints how each went: which jobs got done and how long they took, where the bot got
 * stuck, what it broke. `npm run playbot -- city careful 3` picks the scene, the style and
 * how many cities (seeds) to try.
 */
it('playtest bot report', async () => {
  const [scene = '', style = '', seeds = '1'] = (process.env.PLAYBOT ?? '').split(' ');
  const runs: [SceneName, BotStyle, number][] = scene
    ? [[scene as SceneName, (style || 'careful') as BotStyle, Number(seeds)]]
    : [
        ['yard', 'careful', 1],
        ['yard', 'reckless', 1],
        ['city', 'careful', 1],
        ['city', 'reckless', 1],
      ];
  const R = await initRapier();
  const out: string[] = [];
  for (const [sceneName, botStyle, count] of runs) {
    for (let n = 0; n < count; n++) {
      const tuning = makeTuning();
      tuning.city.seed += n;
      const sim = createGame(R, sceneName, tuning);
      const started = Date.now();
      const report = playShift(sim, botStyle, sceneName === 'city' ? 900 : 360);
      out.push(formatBotReport(report, `${sceneName} (seed ${tuning.city.seed}), ${botStyle}`) + `\n  (${((Date.now() - started) / 1000).toFixed(0)}s to simulate)`);
    }
  }
  console.log('\n' + out.join('\n\n') + '\n');
});
