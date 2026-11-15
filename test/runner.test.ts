import { describe, expect, it } from 'vitest';
import { CourseBot, runCourse } from '../src/bot/coursebot';
import type { Course } from '../src/city/course';
import { runSpec } from '../src/scenes/course';
import { STYLES } from '../src/core/tuning';
import { makeGame } from './helpers';

/** A game with the runner's body (the fourth style). */
const runner = (scene: 'plane' | 'course' | 'run' = 'plane', extra: Record<string, unknown> = {}) => makeGame(scene, { move: STYLES[3].move, ...extra });

describe('the runner', () => {
  it('goes when the key is pressed and stops when it is let go, in a fraction of a second', async () => {
    const g = await runner();
    const r = g.sim.tuning.runner;
    const k = g.kaiju;
    g.sim.players[0].look = k.yaw;
    g.sim.run(30);
    expect(k.speed).toBeLessThan(0.5);
    g.sim.players[0].thrust = 1;
    const up = g.sim.stepUntil(() => k.speed > r.speed * 0.95, 3);
    expect(up.met).toBe(true);
    expect(up.seconds).toBeLessThan(0.5);
    g.sim.run(60);
    expect(k.speed).toBeCloseTo(r.speed, 0);
    g.sim.players[0].thrust = 0;
    const stop = g.sim.stepUntil(() => k.speed < 1, 3);
    expect(stop.seconds).toBeLessThan(0.4);
    // No wobble, no stumble, no fall: not that kind of kaiju.
    expect(k.tilt).toBe(0);
    expect(k.stumbles + k.falls).toBe(0);
  });

  it('strafes without turning, turns to face where it is told to look, and sprints faster than it runs', async () => {
    const g = await runner();
    const r = g.sim.tuning.runner;
    const k = g.kaiju;
    const inp = g.sim.players[0];
    const yaw = k.yaw;
    inp.look = yaw;
    const from = k.position().clone();
    inp.strafe = 1;
    g.sim.run(60);
    // Went to its left, facing the same way throughout.
    const moved = k.position().clone().sub(from);
    expect(moved.dot(k.left)).toBeGreaterThan(r.speed * 0.6);
    expect(Math.abs(moved.dot(k.forward))).toBeLessThan(2);
    expect(Math.abs(k.yaw - yaw)).toBeLessThan(0.01);
    inp.strafe = 0;
    // Look a quarter turn to the left: it has come round in well under half a second.
    inp.look = yaw + Math.PI / 2;
    g.sim.run(20);
    expect(Math.abs(Math.atan2(Math.sin(k.yaw - inp.look), Math.cos(k.yaw - inp.look)))).toBeLessThan(0.05);
    inp.thrust = 1;
    g.sim.run(60);
    const run = k.speed;
    inp.sprint = true;
    g.sim.run(60);
    expect(k.speed).toBeGreaterThan(run * 1.3);
    expect(k.speed).toBeCloseTo(r.sprint, 0);
  });

  it('jumps about as high as its setting, lands on its feet, and can do it again', async () => {
    const g = await runner();
    const k = g.kaiju;
    const inp = g.sim.players[0];
    inp.look = k.yaw;
    inp.thrust = 1;
    g.sim.run(60);
    const ride = k.position().y;
    for (let n = 1; n <= 2; n++) {
      inp.jump = true;
      g.sim.step();
      inp.jump = false;
      expect(k.airborne).toBe(true);
      let peak = 0;
      const air = g.sim.stepUntil(() => !k.airborne, 5, () => (peak = Math.max(peak, k.position().y - ride)));
      expect(air.met).toBe(true);
      expect(air.seconds).toBeLessThan(2);
      expect(peak).toBeGreaterThan(g.sim.tuning.runner.jump * 0.75);
      expect(peak).toBeLessThan(g.sim.tuning.runner.jump * 1.3);
      g.sim.run(30);
      expect(Math.abs(k.position().y - ride)).toBeLessThan(1.5);
      expect(k.jumps).toBe(n);
    }
  });

  it('crouches at once, and a crouch at a sprint is a slide: faster at first, then down to a creep', async () => {
    const g = await runner();
    const r = g.sim.tuning.runner;
    const k = g.kaiju;
    const inp = g.sim.players[0];
    inp.look = k.yaw;
    g.sim.run(20);
    const tall = k.position().y;
    inp.crouch = true;
    g.sim.run(18);
    // Down low in under a third of a second (it used to take most of one).
    expect(k.crawl).toBeGreaterThan(0.95);
    expect(k.position().y).toBeLessThan(tall * 0.75);
    expect(k.slides).toBe(0);
    inp.thrust = 1;
    g.sim.run(60);
    expect(k.speed).toBeCloseTo(r.speed * r.crouchSpeed, 0);
    // Up, sprint, and drop into it.
    inp.crouch = false;
    inp.sprint = true;
    g.sim.run(90);
    expect(k.speed).toBeGreaterThan(r.sprint * 0.95);
    inp.crouch = true;
    g.sim.run(6);
    expect(k.slides).toBe(1);
    expect(k.sliding).toBeGreaterThan(0);
    expect(k.speed).toBeGreaterThan(r.sprint);
    const ended = g.sim.stepUntil(() => k.sliding <= 0, 8);
    expect(ended.met).toBe(true);
    expect(ended.seconds).toBeGreaterThan(1.5);
    g.sim.run(60);
    expect(k.mode).toBe('crawl');
    expect(k.speed).toBeLessThan(r.speed * r.crouchSpeed * 1.1);
  });

  it('gets round the test course with the bot, and flat out is quicker than careful', async () => {
    const careful = runCourse((await runner('course')).sim, 'careful', 200);
    const flat = runCourse((await runner('course')).sim, 'flatout', 200);
    expect(careful.finished).toBe(true);
    expect(flat.finished).toBe(true);
    expect(careful.falls + flat.falls).toBe(0);
    expect(flat.seconds).toBeLessThan(careful.seconds);
    // The boulevard is clean either way.
    expect(careful.legs[0].buildings).toBe(0);
  });

  it('can be switched to and from in the middle of a run without anything going wrong', async () => {
    const g = await makeGame('plane');
    const k = g.kaiju;
    g.sim.players[0].thrust = 1;
    g.sim.run(120);
    g.sim.tuning.move.controller = 1;
    g.sim.players[0].look = k.yaw;
    g.sim.run(120);
    expect(Number.isFinite(k.position().x + k.position().y + k.position().z)).toBe(true);
    expect(k.speed).toBeGreaterThan(10);
    g.sim.tuning.move.controller = 0;
    g.sim.run(180);
    expect(k.state).toBe('walk');
    expect(k.falls).toBe(0);
  });
});

describe("the runner's course", () => {
  it('has a sprint, three hurdles, four towers to go round and three low bridges, and sits still until the start', async () => {
    const spec = runSpec();
    expect(spec.sections.length).toBe(4);
    expect(spec.hurdles!.length).toBe(3);
    expect(spec.pillars!.length).toBe(4);
    expect(spec.crawlZones.length).toBe(3);
    const g = await runner('run');
    expect(g.layout.bridges.length).toBe(3);
    g.sim.run(120);
    expect(g.awakeOthers()).toBe(0);
    expect(g.damage.chunksBroken).toBe(0);
    expect((g.sim.parts.course as Course).state).toBe('ready');
  });

  it('a careful runner clears every hurdle; one that never jumps goes through them', async () => {
    const clean = runCourse((await runner('run')).sim, 'careful', 120);
    expect(clean.finished).toBe(true);
    expect(clean.seconds).toBeLessThan(60);
    expect(clean.legs[1].name).toMatch(/Hurdles/);
    expect(clean.legs[1].buildings).toBe(0);

    const g = await runner('run');
    const course = g.sim.parts.course as Course;
    const bot = new CourseBot(g.sim, course, 'careful');
    g.sim.stepUntil(() => course.leg >= 2, 120, () => {
      bot.think();
      g.sim.players[0].jump = false;
    });
    expect(course.legs[1].buildings).toBeGreaterThanOrEqual(2);
  });

  it('flat out, the runner is far quicker round it than when it is being careful', async () => {
    const careful = runCourse((await runner('run')).sim, 'careful', 120);
    const flat = runCourse((await runner('run')).sim, 'flatout', 120);
    expect(flat.finished).toBe(true);
    expect(flat.seconds).toBeLessThan(careful.seconds * 0.7);
    expect(flat.falls).toBe(0);
  });
});
