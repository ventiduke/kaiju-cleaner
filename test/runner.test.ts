import { describe, expect, it } from 'vitest';
import { CourseBot, runCourse } from '../src/bot/coursebot';
import type { Course } from '../src/city/course';
import * as THREE from 'three';
import type { WaterMains } from '../src/city/mains';
import type { Pieces } from '../src/city/pieces';
import type { Nose } from '../src/kaiju/nose';
import { runSpec } from '../src/scenes/course';
import { Stage } from '../src/core/states';
import { STYLES } from '../src/core/tuning';
import defaults from '../src/tuning/defaults.json';
import { makeGame } from './helpers';

/** A game with the runner's body (the fourth style). */
const runner = (scene: 'plane' | 'course' | 'run' | 'yard' = 'plane', extra: Record<string, unknown> = {}) => makeGame(scene, { move: STYLES[3].move, ...extra });
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

  it('with its hands full: no jumping or crawling; Space is for the grip bar, and C plants its feet and aims by the view', async () => {
    const g = await runner('yard', { city: { propDensity: 0 } });
    const pieces = g.sim.parts.pieces as Pieces;
    const k = g.kaiju;
    const inp = g.sim.players[0];
    const piece = pieces.pieces[0];
    const reach = g.sim.tuning.kaiju.bodyRadius + g.sim.tuning.carry.holdForward;
    // Walk up to the tower top lying in the yard, and take hold of it.
    const to = piece.job.start;
    const walked = g.sim.stepUntil(
      () => Math.hypot(to.x - k.position().x, to.z - k.position().z) < reach + 1 && k.speed < 1,
      30,
      () => {
        const d = Math.hypot(to.x - k.position().x, to.z - k.position().z);
        inp.look = Math.atan2(to.x - k.position().x, to.z - k.position().z);
        inp.thrust = d > reach + 0.5 ? Math.min(1, Math.max(0.15, (d - reach) / 20)) : 0;
      },
    );
    expect(walked.met).toBe(true);
    inp.thrust = 0;
    expect(pieces.nearest()).toBe(piece);
    inp.grab = true;
    g.sim.step();
    inp.grab = false;
    g.sim.run(45);
    expect(pieces.held).toBe(piece);
    expect(k.carrying).toBe(1);
    // Space does not jump...
    inp.jump = true;
    g.sim.run(3);
    inp.jump = false;
    expect(k.airborne).toBe(false);
    expect(k.jumps).toBe(0);
    // ...it runs slower, and cannot sprint or slide.
    inp.look = 0;
    inp.thrust = 1;
    inp.sprint = true;
    g.sim.run(120);
    expect(k.speed).toBeLessThan(g.sim.tuning.runner.speed * g.sim.tuning.carry.speed * 1.05);
    expect(k.speed).toBeGreaterThan(g.sim.tuning.runner.speed * g.sim.tuning.carry.speed * 0.9);
    // The mouse aims it. Standing, turning the view turns the kaiju, and the load swings round with it...
    inp.sprint = false;
    inp.thrust = 0;
    g.sim.run(60);
    expect(k.aiming).toBe(true);
    const stood = k.position().clone();
    inp.look = -0.9;
    const swung = g.sim.stepUntil(() => Math.abs(wrap(k.yaw - -0.9)) < 0.05, 3);
    expect(swung.met).toBe(true);
    // (Heavily: a quarter turn takes a moment, not an instant.)
    expect(swung.seconds).toBeGreaterThan(0.12);
    expect(k.position().distanceTo(stood)).toBeLessThan(1);
    g.sim.run(45);
    const load = piece.body.translation();
    expect(Math.hypot(load.x - (k.position().x + k.forward.x * reach), load.z - (k.position().z + k.forward.z * reach))).toBeLessThan(1);
    // ...and the keys step it about without turning it: A is a sidestep to its left, S a step back.
    // (A fresh hold first: this is about its feet, not its grip.)
    pieces.grip = 1;
    pieces.slipping = false;
    const facing = k.yaw;
    const left = k.left.clone();
    const ahead = k.forward.clone();
    inp.strafe = 1;
    g.sim.run(60);
    let moved = k.position().clone().sub(stood);
    expect(moved.dot(left)).toBeGreaterThan(4);
    expect(Math.abs(moved.dot(ahead))).toBeLessThan(1.5);
    expect(Math.abs(wrap(k.yaw - facing))).toBeLessThan(0.05);
    inp.strafe = 0;
    inp.thrust = -1;
    g.sim.run(60);
    moved = k.position().clone().sub(stood);
    expect(moved.dot(ahead)).toBeLessThan(-3);
    expect(Math.abs(wrap(k.yaw - facing))).toBeLessThan(0.05);
    inp.thrust = 0;
    g.sim.run(40);
    // C plants its feet: it stays upright (no crawl), will not step, and still turns to the view.
    pieces.grip = 1;
    pieces.slipping = false;
    expect(pieces.held).toBe(piece);
    inp.crouch = true;
    g.sim.run(60);
    expect(k.slides).toBe(0);
    expect(k.planted).toBe(true);
    expect(k.mode).toBe('normal');
    expect(k.crawl).toBeLessThan(0.05);
    expect(k.speed).toBeLessThan(1);
    const at = k.position().clone();
    inp.look = 1.2;
    g.sim.run(60);
    expect(Math.abs(wrap(k.yaw - 1.2))).toBeLessThan(0.05);
    expect(k.position().distanceTo(at)).toBeLessThan(1.5);
    // The load is squared to the kaiju, out in front of it.
    const p = piece.body.translation();
    expect(Math.hypot(p.x - (k.position().x + k.forward.x * reach), p.z - (k.position().z + k.forward.z * reach))).toBeLessThan(1);
    // When it slips, Space on the bar catches it.
    inp.crouch = false;
    pieces.grip = g.sim.tuning.carry.slipAt + 0.01;
    g.sim.stepUntil(() => pieces.slipping, 5);
    g.sim.stepUntil(() => pieces.inZone(0.3), 5);
    inp.jump = true;
    g.sim.step();
    inp.jump = false;
    expect(pieces.slipping).toBe(false);
    expect(pieces.catches).toBe(1);
    expect(k.jumps).toBe(0);
    expect(pieces.held).toBe(piece);
  });

  it('stays where it is put when a script picks it up and turns it about (its tail goes with it)', async () => {
    // (Named states, screenshots and tests all do this. Its tail used to chase its old shape
    // across the map and haul the body after it at a hundred metres a second.)
    const g = await runner('yard', { city: { propDensity: 0 } });
    const k = g.kaiju;
    g.sim.run(30);
    const stage = new Stage(g.sim);
    stage.face(k.yaw + Math.PI, 0);
    const at = k.position().clone();
    let fastest = 0;
    for (let i = 0; i < 90; i++) {
      g.sim.step();
      fastest = Math.max(fastest, k.speed);
    }
    expect(k.position().distanceTo(at)).toBeLessThan(0.5);
    expect(fastest).toBeLessThan(2);
    // Its tail is behind it, the new way round.
    const tip = k.tail.tip();
    expect((tip.x - k.position().x) * k.forward.x + (tip.z - k.position().z) * k.forward.z).toBeLessThan(-5);
    stage.moveTo(at.x + 60, at.z + 40);
    g.sim.run(60);
    expect(Math.hypot(k.position().x - (at.x + 60), k.position().z - (at.z + 40))).toBeLessThan(0.5);
  });

  it('bows: it stops, bends over, says sorry once, and straightens up', async () => {
    const g = await running();
    const k = g.kaiju;
    const inp = g.sim.players[0];
    let sorry = 0;
    g.sim.on('kaijuBow', () => sorry++);
    inp.bow = true;
    g.sim.step();
    inp.bow = false;
    // Still being told to run, it stops to do it.
    g.sim.run(50);
    expect(k.speed).toBeLessThan(2);
    expect(k.bow).toBe(1);
    expect(sorry).toBe(1);
    expect(k.bows).toBe(1);
    const down = k.body.rotation();
    expect(Math.abs(down.x) + Math.abs(down.z)).toBeGreaterThan(0.3);
    g.sim.run(120);
    expect(k.bow).toBe(0);
    expect(sorry).toBe(1);
    // And off it goes again.
    expect(k.speed).toBeGreaterThan(g.sim.tuning.runner.speed * 0.9);
  });

  describe('can be floored', () => {
    // (As shipped: the tests' reference settings leave these off.)
    const HAZARDS = { city: { propDensity: 0 }, sneeze: { floors: 1 }, hazards: { geyser: 24, oilSpeed: 0.5 } };

    it('a sneeze puts it flat on its back: it lies there, gets up, and has dropped what it was holding', async () => {
      const g = await runner('yard', HAZARDS);
      const k = g.kaiju;
      const pieces = g.sim.parts.pieces as Pieces;
      const nose = g.sim.parts.nose as Nose;
      const inp = g.sim.players[0];
      const stage = new Stage(g.sim);
      const piece = pieces.pieces[0];
      stage.handsOver(piece.job.start.x, piece.job.start.z, 0);
      pieces.grab(piece);
      g.sim.run(60);
      expect(pieces.held).toBe(piece);
      let fell = 0;
      g.sim.on('kaijuFall', () => fell++);
      const at = k.position().clone();
      nose.sneeze();
      g.sim.run(20);
      expect(fell).toBe(1);
      expect(k.falls).toBe(1);
      expect(k.state).toBe('fallen');
      expect(k.flat).toBeGreaterThan(0.9);
      // On its back: its body is laid right over, low to the ground, and it was thrown backwards.
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(k.body.rotation().x, k.body.rotation().y, k.body.rotation().z, k.body.rotation().w));
      expect(up.y).toBeLessThan(0.3);
      expect(up.dot(k.forward)).toBeLessThan(-0.8);
      expect(k.position().y).toBeLessThan(k.rideHeight * 0.6);
      expect(k.position().clone().sub(at).dot(k.forward)).toBeLessThan(-0.5);
      expect(pieces.held).toBe(null);
      expect(pieces.drops).toBe(1);
      // Nothing the player does gets it going while it is down.
      inp.look = k.yaw;
      inp.thrust = 1;
      inp.jump = true;
      g.sim.run(30);
      expect(k.state).not.toBe('walk');
      expect(k.speed).toBeLessThan(3);
      expect(k.jumps).toBe(0);
      inp.jump = false;
      // A couple of seconds, all told, and it is up and off.
      const up2 = g.sim.stepUntil(() => k.state === 'walk', 5);
      expect(up2.met).toBe(true);
      expect(up2.seconds + 50 / 60).toBeLessThan(g.sim.tuning.kaiju.fallDuration + g.sim.tuning.kaiju.getUpDuration + 1);
      g.sim.run(90);
      expect(k.flat).toBe(0);
      expect(k.speed).toBeGreaterThan(g.sim.tuning.runner.speed * 0.9);
      expect(Math.abs(k.position().y - k.rideHeight)).toBeLessThan(2);
    });

    it('a bursting water main throws it into the air, and it comes down in a heap', async () => {
      const g = await runner('yard', HAZARDS);
      const k = g.kaiju;
      const mains = g.sim.parts.mains as WaterMains;
      const main = mains.mains[0];
      const stage = new Stage(g.sim);
      // Beside the cover (on it, its own footsteps would burst the main before the test did).
      stage.face(0, 0);
      stage.moveTo(main.x, main.z + 12);
      expect(mains.bursts).toBe(0);
      const ride = k.position().y;
      mains.burst(main);
      let peak = 0;
      const air = g.sim.stepUntil(() => !k.airborne && g.sim.time > 0.3 && peak > 1, 6, () => (peak = Math.max(peak, k.position().y - ride)));
      expect(air.met).toBe(true);
      // Well up: more than a hop, less than over the rooftops.
      expect(peak).toBeGreaterThan(4);
      expect(peak).toBeLessThan(25);
      expect(k.jumps).toBe(0);
      g.sim.run(5);
      expect(k.state).toBe('fallen');
      expect(k.falls).toBe(1);
      const up = g.sim.stepUntil(() => k.state === 'walk', 6);
      expect(up.met).toBe(true);
    });

    it('oil at a run takes its feet from under it and it slides right across; at a crouch it gets over', async () => {
      const cross = async (crouched: boolean) => {
        const g = await runner('yard', HAZARDS);
        const k = g.kaiju;
        const inp = g.sim.players[0];
        const oil = g.layout.hazards.find((h) => h.kind === 'oil')!;
        const stage = new Stage(g.sim);
        // Come at the slick from the open side, with a run-up.
        stage.face(Math.PI / 2, 0);
        stage.moveTo(oil.x - oil.radius - 45, oil.z);
        let slipped = 0;
        g.sim.on('oilSlip', () => slipped++);
        inp.look = Math.PI / 2;
        inp.thrust = 1;
        inp.crouch = crouched;
        let fastestDown = 0;
        const over = g.sim.stepUntil(
          () => k.position().x > oil.x + oil.radius + 8 && k.state === 'walk',
          20,
          () => {
            if (k.state === 'fallen') fastestDown = Math.max(fastestDown, k.speed);
          },
        );
        return { over: over.met, seconds: over.seconds, falls: k.falls, slipped, fastestDown, slides: k.slides, run: g.sim.tuning.runner.speed };
      };
      const fast = await cross(false);
      expect(fast.slipped).toBe(1);
      expect(fast.falls).toBe(1);
      // It keeps most of its speed across the oil, on its back.
      expect(fast.fastestDown).toBeGreaterThan(fast.run * 0.7);
      expect(fast.over).toBe(true);
      const slow = await cross(true);
      expect(slow.slipped).toBe(1);
      expect(slow.falls).toBe(0);
      expect(slow.over).toBe(true);
    });
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
