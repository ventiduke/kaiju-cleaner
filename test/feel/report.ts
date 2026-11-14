import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { formatSession, type SessionFile } from '../../src/core/session';
import { diffTuning, makeTuning } from '../../src/core/tuning';
import { feelReport, formatReport } from './maneuvers';
import { replaySession } from './replay';

/**
 * `npm run feel` prints the handling numbers for the shipped defaults.
 * `npm run feel -- path/to/file.json` also reads a session file saved from the game
 * (or a settings JSON pasted from "copy settings + notes") and prints: what the
 * player wrote, what happened in their run, how their settings handle in the same
 * scripted maneuvers, and whether the run replays on this build.
 */
it('feel report', async () => {
  const out: string[] = [];
  out.push(formatReport(await feelReport(), 'DEFAULT SETTINGS'));

  const path = process.env.FEEL_FILE;
  if (path) {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const session: SessionFile | null = data.version === 1 && data.tuning ? data : null;
    const settings = session ? session.tuning : data;
    if (session) out.push('', formatSession(session));
    const tuning = makeTuning(settings);
    out.push('', `SETTINGS FROM ${path}`, `  differs from defaults in: ${JSON.stringify(diffTuning(tuning))}`);
    out.push(formatReport(await feelReport(settings), '  handling with these settings'));
    if (session && session.end.tick > 0) {
      const r = await replaySession(session);
      const s = r.recorder.stats();
      out.push(
        '',
        `REPLAY on this build: ended ${r.endError.toFixed(1)} m from the recorded position ` +
          `(${r.endError < 1 ? 'faithful' : 'diverged: the build or settings changed since it was recorded'})`,
        `  ${s.stumbles} stumbles, ${s.falls} falls, max lean ${s.maxTiltDeg} deg, ${s.chunksBroken} chunks`,
      );
    }
  }
  console.log('\n' + out.join('\n') + '\n');
}, 600000);
