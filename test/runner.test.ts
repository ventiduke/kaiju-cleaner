import { describe, expect, it } from 'vitest';
import { CourseBot, runCourse } from '../src/bot/coursebot';
import type { Course } from '../src/city/course';
import { runSpec } from '../src/scenes/course';
import { STYLES } from '../src/core/tuning';
import defaults from '../src/tuning/defaults.json';
import { makeGame } from './helpers';

/** A game with the runner's body (the fourth style). */
const runner = (scene: 'plane' | 'course' | 'run' = 'plane', extra: Record<string, unknown> = {}) => makeGame(scene, { move: STYLES[3].move, ...extra });
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Up to speed, straight ahead: the start of most of these. */
async function running(sprint = false, extra: Record<string, unknown> = {}) {
  const g = await runner('plane', extra);
  const inp = g.sim.players[0];
  inp.look = g.kaiju.yaw;
  inp.thrust = 1;
  inp.sprint = sprint;
  g.sim.run(sprint ? 180 : 100);
  return g;
}

describe('the runner', () => {
  it('gets going quickly but not at once, and runs on a few strides when the key is let go', async () => {
    const g = await runner();
    const r = g.sim.tuning.runner;
    const k = g.kaiju;
    const inp = g.sim.players[0];
    inp.look = k.yaw;
    g.sim.run(30);
    expect(k.speed).toBeLessThan(0.5);
    inp.thrust = 1;
    // A fifth of a second in it is well under way and still gathering: there is weight in it...
    g.sim.run(12);
    expect(k.speed).toBeGreaterThan(r.speed * 0.3);
    expect(k.speed).toBeLessThan(r.speed * 0.8);
    // ...and it is at a run inside three quarters of a second: no more of "sluggish".
    const up = g.sim.stepUntil(() => k.speed > r.speed * 0.95, 3);
    expect(up.seconds + 0.2).toBeLessThan(0.75);
    g.sim.run(60);
    expect(k.speed).toBeCloseTo(r.speed, 0);
    const from = k.position().clone();
    inp.thrust = 0;
    const stop = g.sim.stepUntil(() => k.speed < 1, 3);
    expect(stop.seconds).toBeGreaterThan(0.2);
    expect(stop.seconds).toBeLessThan(0.6);
    const carried = k.position().distanceTo(from);
    expect(carried).toBeGreaterThan(3);
    expect(carried).toBeLessThan(9);
    // Standing still, it faces the way it was going: letting go does not turn it.
    expect(Math.abs(wrap(k.yaw - inp.look))).toBeLessThan(0.05);
    expect(k.stumbles + k.falls).toBe(0);
  });

  it('a sprint builds on top of the run, and brings its nose down', async () => {
    const g = await running();
    const r = g.sim.tuning.runner;
    const k = g.kaiju;
    const upright = k.nod;
    g.sim.players[0].sprint = true;
    g.sim.run(20);
    expect(k.speed).toBeGreaterThan(r.speed * 1.05);
    expect(k.speed).toBeLessThan(r.sprint * 0.9);
    g.sim.run(120);
    expect(k.speed).toBeCloseTo(r.sprint, 0);
    expect(k.nod).toBeGreaterThan(upright + 0.1);
  });

  it('goes where it is pointed by turning to face it: the keys are directions on the screen, not strafes', async () => {
    const g = await runner();
    const k = g.kaiju;
    const inp = g.sim.players[0];
    const view = k.yaw;
    inp.look = view;
    g.sim.run(20);
    // "Left on the screen", from a stand: it swings round to its left and runs that way.
    const from = k.position().clone();
    const left = k.left.clone();
    const ahead = k.forward.clone();
    inp.strafe = 1;
    const turned = g.sim.stepUntil(() => Math.abs(wrap(k.yaw - (view + Math.PI / 2))) < 0.1, 2);
    expect(turned.met).toBe(true);
    expect(turned.seconds).toBeLessThan(0.45);
    g.sim.run(60);
    const moved = k.position().clone().sub(from);
    expect(moved.dot(left)).toBeGreaterThan(15);
    // (It steps into the turn rather than spinning on the spot, so it gains a little ground ahead too.)
    expect(Math.abs(moved.dot(ahead))).toBeLessThan(8);
    expect(Math.abs(wrap(k.yaw - (view + Math.PI / 2)))).toBeLessThan(0.05);
    // "Toward the camera": it comes about and runs back at the view.
    inp.strafe = 0;
    inp.thrust = -1;
    g.sim.run(90);
    expect(Math.abs(wrap(k.yaw - (view + Math.PI)))).toBeLessThan(0.05);
    expect(k.forwardSpeed).toBeGreaterThan(20);
  });

  it('turns on an arc that widens with speed, leaning into it', async () => {
    const quarter = async (sprint: boolean) => {
      const g = await running(sprint);
      const k = g.kaiju;
      const inp = g.sim.players[0];
      const from = k.position().clone();
      const ahead = k.forward.clone();
      const goal = k.yaw + Math.PI / 2;
      inp.look = goal;
      let bank = 0;
      let facing = -1;
      let going = -1;
      let runout = 0;
      for (let i = 0; i < 180; i++) {
        g.sim.step();
        bank = Math.max(bank, k.bank);
        if (facing < 0 && Math.abs(wrap(k.yaw - goal)) < 0.1) facing = i / 60;
        const v = k.body.linvel();
        if (going < 0 && Math.abs(wrap(Math.atan2(v.x, v.z) - goal)) < 0.1) going = i / 60;
        runout = Math.max(runout, k.position().clone().sub(from).dot(ahead));
      }
      return { bank, facing, going, runout, skids: k.skids, falls: k.falls };
    };
    const run = await quarter(false);
    const sprint = await quarter(true);
    // Its body comes round in a fraction of a second, but the turn takes time: this is the
    // "actually turning" that an instant about-face on the mouse did not have.
    expect(run.facing).toBeGreaterThan(0.15);
    expect(run.facing).toBeLessThan(0.5);
    expect(run.going).toBeGreaterThan(run.facing);
    // It leans into it, to its left for a left turn, by something you can see.
    expect(run.bank).toBeGreaterThan(0.2);
    expect(run.bank).toBeLessThan(0.7);
    // The same turn at a sprint carries it much farther before it is going the new way...
    expect(run.runout).toBeGreaterThan(3);
    expect(run.runout).toBeLessThan(12);
    expect(sprint.runout).toBeGreaterThan(run.runout * 1.8);
    expect(sprint.going).toBeGreaterThan(run.going);
    // ...and that hard, its feet let go: a drift.
    expect(sprint.skids).toBeGreaterThanOrEqual(1);
    expect(run.falls + sprint.falls).toBe(0);
  });

  it('asked for the opposite way at a sprint, it digs in, skids, comes about and goes', async () => {
    const g = await running(true);
    const k = g.kaiju;
    const inp = g.sim.players[0];
    const from = k.position().clone();
    const ahead = k.forward.clone();
    let skidded = 0;
    g.sim.on('kaijuSkid', () => skidded++);
    inp.thrust = -1;
    let far = 0;
    let back = -1;
    let rearing = 0;
    for (let i = 0; i < 180; i++) {
      g.sim.step();
      const d = k.position().clone().sub(from).dot(ahead);
      far = Math.max(far, d);
      rearing = Math.min(rearing, k.nod);
      if (back < 0 && d < 0) back = i / 60;
    }
    expect(skidded).toBeGreaterThanOrEqual(1);
    // It could not stop dead: it slid on some way first, back on its heels...
    expect(far).toBeGreaterThan(5);
    expect(far).toBeLessThan(20);
    expect(rearing).toBeLessThan(-0.1);
    // ...and it is back past where it turned in about a second, going the other way.
    expect(back).toBeGreaterThan(0.5);
    expect(back).toBeLessThan(1.5);
    expect(k.forwardSpeed).toBeGreaterThan(g.sim.tuning.runner.speed);
    expect(Math.abs(wrap(k.yaw - (inp.look + Math.PI)))).toBeLessThan(0.05);
  });

  it('keeps its tail behind it through a turn (it used to be left pointing out in front)', async () => {
    // On the settings as shipped: the tail's own are soft, and are not the runner's to use.
    const g = await running(false, { tail: (defaults as { tail: object }).tail });
    const k = g.kaiju;
    const inp = g.sim.players[0];
    const off = () => {
      const tip = k.tail.tip();
      const p = k.position();
      return Math.abs(wrap(Math.atan2(tip.x - p.x, tip.z - p.z) - (k.yaw + Math.PI)));
    };
    expect(off()).toBeLessThan(0.3);
    inp.look = k.yaw + Math.PI / 2;
    let worst = 0;
    let settled = 0;
    for (let i = 0; i < 180; i++) {
      g.sim.step();
      worst = Math.max(worst, off());
      if (off() > 0.4) settled = (i + 1) / 60;
    }
    // It swings wide of the turn, as a tail should, but never comes round the side of the body.
    expect(worst).toBeGreaterThan(0.3);
    expect(worst).toBeLessThan(1.4);
    expect(settled).toBeLessThan(0.9);
  });

  it('jumps higher the longer the key is held, takes a press just before landing, and lands on its feet', async () => {
    const g = await running();
    const k = g.kaiju;
    const inp = g.sim.players[0];
    const ride = k.position().y;
    const jump = (ticks: number) => {
      // (Measured from where it left the ground: its stride carries it up and down by a metre.)
      const ride = k.position().y;
      inp.jump = true;
      let n = 0;
      let peak = 0;
      const air = g.sim.stepUntil(
        () => n > 3 && !k.airborne,
        5,
        () => {
          if (++n >= ticks) inp.jump = false;
          peak = Math.max(peak, k.position().y - ride);
        },
      );
      inp.jump = false;
      g.sim.run(40);
      return { peak, seconds: air.seconds };
    };
    const held = jump(90);
    const tapped = jump(3);
    expect(held.peak).toBeGreaterThan(g.sim.tuning.runner.jump * 0.8);
    expect(held.peak).toBeLessThan(g.sim.tuning.runner.jump * 1.3);
    expect(held.seconds).toBeLessThan(2.2);
    expect(tapped.peak).toBeLessThan(held.peak * 0.6);
    expect(tapped.peak).toBeGreaterThan(1.5);
    expect(k.jumps).toBe(2);
    expect(Math.abs(k.position().y - ride)).toBeLessThan(2.5);
    // Pressed a moment before the ground comes back: it goes again as it lands.
    inp.jump = true;
    g.sim.step();
    g.sim.stepUntil(() => k.body.linvel().y < -8 && k.position().y - ride < 2, 5);
    expect(k.airborne).toBe(true);
    inp.jump = false;
    g.sim.step();
    inp.jump = true;
    g.sim.run(12);
    expect(k.jumps).toBe(4);
    expect(k.falls).toBe(0);
  });

  it('crouches at once and creeps; and a crouch on the move is a slide, flat out and unmistakable', async () => {
    const g = await runner();
    const r = g.sim.tuning.runner;
    const k = g.kaiju;
    const inp = g.sim.players[0];
    inp.look = k.yaw;
    g.sim.run(20);
    const tall = k.position().y;
    // From a stand: down low in a quarter of a second, and no slide.
    inp.crouch = true;
    g.sim.run(15);
    expect(k.crawl).toBeGreaterThan(0.95);
    expect(k.position().y).toBeLessThan(tall * 0.75);
    expect(k.slides).toBe(0);
    inp.thrust = 1;
    g.sim.run(60);
    expect(k.speed).toBeCloseTo(r.speed * r.crouchSpeed, 0);
    expect(k.legs.striding).toBe(true);
    const creeping = k.position().y;

    // Up, to a plain run (no sprint needed), and drop into it.
    inp.crouch = false;
    g.sim.run(90);
    expect(k.speed).toBeCloseTo(r.speed, 0);
    let slid = 0;
    let scuffs = 0;
    g.sim.on('kaijuSlide', () => slid++);
    g.sim.on('kaijuScuff', () => scuffs++);
    const from = k.position().clone();
    inp.crouch = true;
    g.sim.run(10);
    expect(slid).toBe(1);
    expect(k.slides).toBe(1);
    expect(k.sliding).toBeGreaterThan(0);
    // Faster than it was running, flat on its belly (lower than a crouch), legs trailing: not a quick crawl.
    expect(k.speed).toBeGreaterThan(r.speed);
    expect(k.prone).toBeGreaterThan(0.9);
    g.sim.run(25);
    expect(k.position().y).toBeLessThan(creeping - 0.5);
    expect(k.legs.striding).toBe(false);
    expect(k.tail.tip().y).toBeGreaterThan(k.position().y);
    const ended = g.sim.stepUntil(() => k.sliding <= 0, 8);
    expect(ended.met).toBe(true);
    expect(ended.seconds + 35 / 60).toBeGreaterThan(0.7);
    expect(ended.seconds + 35 / 60).toBeLessThan(2.5);
    expect(k.position().distanceTo(from)).toBeGreaterThan(18);
    expect(scuffs).toBeGreaterThan(5);
    // It ends in a crouch, creeping on.
    g.sim.run(60);
    expect(k.mode).toBe('crawl');
    expect(k.speed).toBeLessThan(r.speed * r.crouchSpeed * 1.1);
    expect(k.legs.striding).toBe(true);

    // A jump gets it out of a slide, with its speed.
    inp.crouch = false;
    g.sim.run(90);
    inp.crouch = true;
    g.sim.run(12);
    expect(k.sliding).toBeGreaterThan(0);
    const fast = k.speed;
    inp.jump = true;
    inp.crouch = false;
    g.sim.run(6);
    expect(k.airborne).toBe(true);
    expect(k.sliding).toBe(0);
    expect(k.speed).toBeGreaterThan(fast * 0.85);
  });

  it('runs with a stride: both feet are off the ground between steps at a run, never at a creep', async () => {
    const flights = async (crouch: boolean) => {
      // (At the size it ships at: the reference giant's longer legs keep a foot down for longer.)
      const g = await runner('plane', { kaiju: (defaults as { kaiju: object }).kaiju });
      const k = g.kaiju;
      const inp = g.sim.players[0];
      inp.look = k.yaw;
      inp.thrust = 1;
      inp.crouch = crouch;
      g.sim.run(90);
      let both = 0;
      let steps = 0;
      g.sim.on('footfall', () => steps++);
      for (let i = 0; i < 240; i++) {
        g.sim.step();
        if (k.legs.feet.every((f) => f.swinging)) both++;
      }
      // (No foot is ever left farther from the body than a leg can reach.)
      for (const f of k.legs.feet) expect(Math.hypot(f.pos.x - k.position().x, f.pos.z - k.position().z)).toBeLessThan(k.legs.reach * 1.6);
      return { both: both / 240, steps: steps / 4 };
    };
    const run = await flights(false);
    const creep = await flights(true);
    expect(run.both).toBeGreaterThan(0.2);
    expect(creep.both).toBe(0);
    // A heavy animal's cadence: two to three and a half steps a second, not a patter.
    expect(run.steps).toBeGreaterThan(2);
    expect(run.steps).toBeLessThan(3.6);
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
    for (const f of k.legs.feet) expect(Math.hypot(f.pos.x - k.position().x, f.pos.z - k.position().z)).toBeLessThan(k.legs.reach * 1.6);
    g.sim.tuning.move.controller = 0;
    g.sim.run(180);
    expect(k.state).toBe('walk');
    expect(k.falls).toBe(0);
    for (const f of k.legs.feet) expect(Math.hypot(f.pos.x - k.position().x, f.pos.z - k.position().z)).toBeLessThan(k.legs.reach * 1.6);
    // The tail is its own again: still behind it, and not flung anywhere.
    const tip = k.tail.tip();
    expect(Math.hypot(tip.x - k.position().x, tip.z - k.position().z)).toBeLessThan(g.sim.tuning.tail.length * 1.2);
  });

  it('is the same run every time', async () => {
    const run = async () => {
      const g = await runner('course');
      const inp = g.sim.players[0];
      const k = g.kaiju;
      inp.look = k.yaw;
      inp.thrust = 1;
      inp.sprint = true;
      g.sim.run(90);
      inp.look += 1.2;
      g.sim.run(40);
      inp.crouch = true;
      g.sim.run(50);
      inp.jump = true;
      inp.crouch = false;
      g.sim.run(80);
      const p = k.position();
      const tip = k.tail.tip();
      return [p.x, p.y, p.z, k.yaw, k.bank, tip.x, tip.y, tip.z, g.damage.chunksBroken];
    };
    expect(await run()).toEqual(await run());
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
