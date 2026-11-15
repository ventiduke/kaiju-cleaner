import { describe, expect, it } from 'vitest';
import { CourseBot, runCourse } from '../src/bot/coursebot';
import type { Course } from '../src/city/course';
import { PENALTY } from '../src/city/course';
import { ChunkState } from '../src/city/destruction';
import type { WeakSpot } from '../src/scenes/city';
import { courseSegments, courseSpec } from '../src/scenes/course';
import { STYLES } from '../src/core/tuning';
import { makeGame } from './helpers';

const onStyle = (index: number) => makeGame('course', { feel: STYLES[index].feel, move: STYLES[index].move });

describe('the test course', () => {
  it('is about a kilometre of streets, each a different width, and nothing stirs before the start', async () => {
    const spec = courseSpec();
    const length = courseSegments(spec).reduce((n, s) => n + Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z), 0);
    expect(length).toBeGreaterThan(800);
    expect(length).toBeLessThan(1300);
    expect(new Set(spec.sections.map((s) => s.width)).size).toBeGreaterThanOrEqual(5);
    const g = await onStyle(1);
    const course = g.sim.parts.course as Course;
    expect(g.layout.buildings.length).toBeGreaterThan(60);
    expect(g.layout.bridges.length).toBe(2);
    g.sim.run(120);
    expect(g.awakeOthers()).toBe(0);
    expect(g.damage.chunksBroken).toBe(0);
    // The clock waits for the kaiju to leave the line.
    expect(course.state).toBe('ready');
    expect(course.seconds()).toBe(0);
  });

  it('every style gets round it with a careful driver, in under a minute and a half', async () => {
    for (let i = 0; i < STYLES.length; i++) {
      const g = await onStyle(i);
      const r = runCourse(g.sim, 'careful', 200);
      expect(r.finished, STYLES[i].name).toBe(true);
      expect(r.legs.length).toBe(6);
      expect(r.seconds, STYLES[i].name).toBeLessThan(90);
      expect(r.falls, STYLES[i].name).toBe(0);
      // The wide boulevard is clean for everyone.
      expect(r.legs[0].buildings, STYLES[i].name).toBe(0);
      expect(r.score).toBeCloseTo(r.seconds + r.buildings * PENALTY.building + r.falls * PENALTY.fall, 5);
    }
  });

  it('the quicker styles are quicker round it, and going flat out costs buildings', async () => {
    const time = async (i: number, effort: 'careful' | 'flatout') => runCourse((await onStyle(i)).sim, effort, 200);
    const slow = await time(0, 'careful');
    const steady = await time(1, 'careful');
    const flat = await time(1, 'flatout');
    expect(steady.seconds).toBeLessThan(slow.seconds - 5);
    expect(flat.seconds).toBeLessThan(steady.seconds - 5);
    expect(flat.buildings).toBeGreaterThan(steady.buildings);
  });

  it('walking tall into the skybridges brings them down; going under on all fours does not', async () => {
    const bridgeChunks = (g: Awaited<ReturnType<typeof onStyle>>) => {
      const first = g.layout.buildings.length;
      return g.chunks.buildings.slice(first).flatMap((b) => g.chunks.chunks.slice(b.first, b.first + b.count));
    };
    const low = await onStyle(1);
    runCourse(low.sim, 'careful', 200);
    expect(bridgeChunks(low).length).toBeGreaterThan(2);
    expect(bridgeChunks(low).every((c) => c.state === ChunkState.Fixed)).toBe(true);

    // The same driver, with the crawl key pulled out.
    const tall = await onStyle(1);
    const course = tall.sim.parts.course as Course;
    const bot = new CourseBot(tall.sim, course, 'careful');
    tall.sim.stepUntil(() => course.state === 'done', 200, () => {
      bot.think();
      tall.sim.players[0].crouch = false;
    });
    expect(bridgeChunks(tall).some((c) => c.state !== ChunkState.Fixed)).toBe(true);
  });

  it('the thin ground holds for a light step and gives way under a heavy one', async () => {
    const light = await onStyle(1);
    runCourse(light.sim, 'careful', 200);
    const spots = light.sim.parts.weakSpots as WeakSpot[];
    expect(spots.length).toBe(3);
    expect(spots.every((s) => !s.collapsed)).toBe(true);

    const heavy = await onStyle(1);
    const course = heavy.sim.parts.course as Course;
    const bot = new CourseBot(heavy.sim, course, 'careful');
    heavy.sim.stepUntil(() => course.state === 'done', 200, () => {
      bot.think();
      heavy.sim.players[0].tiptoe = false;
    });
    expect((heavy.sim.parts.weakSpots as WeakSpot[]).some((s) => s.collapsed)).toBe(true);
  });
});
