import { it } from 'vitest';
import { runCourse, type Effort } from '../../src/bot/coursebot';
import { formatResult } from '../../src/city/course';
import { initRapier } from '../../src/core/physics';
import { applyStyle, makeTuning, STYLES } from '../../src/core/tuning';
import { createGame } from '../../src/scenes';

/**
 * `npm run course` drives the test course with a bot on every movement style, once keeping
 * it tidy and once flat out, and prints the time, the damage and where each was lost.
 * `npm run course -- 1 careful` runs one style (0, 1 or 2) and one effort.
 * `npm run course -- settings.json` runs the settings in a file (pasted from the game) both ways.
 */
it('course report', async () => {
  const args = (process.env.COURSE ?? '').split(' ').filter(Boolean);
  const R = await initRapier();
  const out: string[] = [];
  const summary: string[] = [];
  const efforts: Effort[] = args.includes('careful') ? ['careful'] : args.includes('flatout') ? ['flatout'] : ['careful', 'flatout'];
  const file = args.find((a) => a.endsWith('.json'));
  const styles = file ? [-1] : args.some((a) => /^[0-2]$/.test(a)) ? args.filter((a) => /^[0-2]$/.test(a)).map(Number) : STYLES.map((_, i) => i);
  for (const style of styles) {
    for (const effort of efforts) {
      let tuning = makeTuning();
      let name = 'custom';
      if (style >= 0) {
        applyStyle(tuning, style);
        name = STYLES[style].name;
      } else {
        const { readFileSync } = await import('node:fs');
        const data = JSON.parse(readFileSync(file!, 'utf8'));
        tuning = makeTuning(data.tuning ?? data);
      }
      const sim = createGame(R, 'course', tuning);
      const r = runCourse(sim, effort);
      out.push(formatResult(r, `${name}, ${effort}`) + (r.stalls ? `\n    (stuck ${r.stalls} times)` : ''));
      summary.push(`${name.padEnd(10)} ${effort.padEnd(8)} ${r.finished ? r.seconds.toFixed(1).padStart(6) : '   DNF'} s  +${String(r.penalty).padStart(3)}  = ${r.score.toFixed(1).padStart(6)}   ${String(r.buildings).padStart(2)} buildings  ${r.stumbles} stumbles  ${r.falls} falls`);
    }
  }
  console.log('\n' + out.join('\n\n') + '\n\nSUMMARY (time + penalty = score)\n' + summary.join('\n') + '\n');
});
