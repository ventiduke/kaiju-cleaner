import * as THREE from 'three';
import type { Course, CourseResult, Point } from '../city/course';
import type { Kaiju } from '../kaiju/kaiju';
import type { Sim } from '../sim';

/** How the bot drives the course: keeping it tidy, or as fast as it can go. */
export type Effort = 'careful' | 'flatout';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Drives the test course the way a player who knows it would: down the middle of each
 * street, low under the skybridges, light over the thin ground. It is the measuring stick
 * for a movement style: the same driver, the same route, different handling.
 */
export class CourseBot {
  private kaiju: Kaiju;
  private points: Point[];
  private at = 0;
  private stuckAt = new THREE.Vector3();
  private stuckTime = 0;
  private backing = 0;
  stalls = 0;

  constructor(
    private sim: Sim,
    private course: Course,
    readonly effort: Effort,
  ) {
    this.kaiju = sim.parts.kaiju as Kaiju;
    this.points = course.spec.sections.flatMap((s) => s.path);
    this.stuckAt.copy(this.kaiju.position());
  }

  think(): void {
    const input = this.sim.players[0];
    const k = this.kaiju;
    const p = k.position();
    input.thrust = 0;
    input.turn = 0;
    input.crouch = false;
    input.tiptoe = false;
    input.jump = false;
    if (this.course.state === 'done') return;
    if (k.state === 'fallen' || k.state === 'getup' || k.state === 'falling') {
      input.thrust = 1;
      return;
    }
    if (this.backing > 0) {
      this.backing -= 1 / 60;
      input.thrust = -0.7;
      input.turn = this.stalls % 2 ? 0.7 : -0.7;
      return;
    }

    // Round a corner once it is within a few strides of it.
    const spec = this.course.spec;
    while (this.at < this.points.length - 1 && Math.hypot(this.points[this.at].x - p.x, this.points[this.at].z - p.z) < 11) this.at++;
    const to = this.points[this.at];
    const dist = Math.hypot(to.x - p.x, to.z - p.z);
    const err = wrap(Math.atan2(to.x - p.x, to.z - p.z) - k.yaw);
    input.turn = THREE.MathUtils.clamp(err * 2.4, -1, 1);
    const careful = this.effort === 'careful';
    let go = careful ? 0.75 : 1;
    // Facing the wrong way: turn first. A careful driver also eases off before a corner.
    go *= Math.abs(err) > 1.1 ? 0.15 : 1 - Math.abs(err) / 1.5;
    if (careful && this.at < this.points.length - 1) go = Math.min(go, 0.32 + dist / 70);
    if (careful && k.state === 'stumble') {
      go = 0;
      input.turn = 0;
    }
    input.thrust = go;

    // Low under the bridges. Getting down takes a moment, so start early when going fast.
    for (const zone of spec.crawlZones) {
      if (Math.hypot(zone.x - p.x, zone.z - p.z) < zone.radius + k.speed * 1.4) input.crouch = true;
    }
    // Light over the thin ground.
    for (const zone of spec.tiptoeZones) {
      if (Math.hypot(zone.x - p.x, zone.z - p.z) < zone.radius + k.speed * 0.4) input.tiptoe = true;
    }

    // Pushing and going nowhere: back out and try again.
    this.stuckTime += 1 / 60;
    if (this.stuckTime > 5) {
      if (p.distanceTo(this.stuckAt) < 3 && go > 0.2) {
        this.stalls++;
        this.backing = 1.3;
      }
      this.stuckAt.copy(p);
      this.stuckTime = 0;
    }
  }
}

/** Runs the course with a bot and returns the result (unfinished, if it ran out of time). */
export function runCourse(sim: Sim, effort: Effort, maxSeconds = 300): CourseResult & { stalls: number } {
  const course = sim.parts.course as Course;
  const bot = new CourseBot(sim, course, effort);
  sim.stepUntil(() => course.state === 'done', maxSeconds, () => bot.think());
  return { ...course.result(), stalls: bot.stalls };
}
