import { describe, expect, it } from 'vitest';
import { Approval, WORTH, verdict } from '../src/city/approval';
import type { Citizens } from '../src/city/citizens';
import type { WaterMains } from '../src/city/mains';
import type { Pieces } from '../src/city/pieces';
import type { Nose } from '../src/kaiju/nose';
import { makeGame, type Game } from './helpers';

/** Slides the kaiju (tail and all) to a spot. It keeps facing -z. */
function moveTo(g: Game, x: number, z: number): void {
  const k = g.kaiju;
  const p = k.position();
  for (const b of [k.body, ...k.tail.segments]) {
    const q = b.translation();
    b.setTranslation({ x: q.x + x - p.x, y: q.y, z: q.z + z - p.z }, true);
  }
  g.sim.run(30);
}

function tap(g: Game, key: 'bow' | 'grab'): void {
  g.sim.players[0][key] = true;
  g.sim.step();
  g.sim.players[0][key] = false;
}

describe('the apology bow', () => {
  it('bends right over, holds it, and straightens up again without a stumble', async () => {
    const g = await makeGame('plane');
    g.sim.run(60);
    let bows = 0;
    g.sim.on('kaijuBow', () => bows++);
    tap(g, 'bow');
    let deepest = 0;
    for (let i = 0; i < 60; i++) {
      g.sim.step();
      deepest = Math.max(deepest, g.kaiju.bow);
    }
    expect(deepest).toBe(1);
    expect(bows).toBe(1);
    // Its spine really is tipped well forward (it faces -z).
    const r = g.kaiju.body.rotation();
    const upZ = 2 * (r.y * r.z - r.w * r.x);
    expect(upZ).toBeLessThan(-0.6);
    // It will not walk off mid-bow.
    g.sim.players[0].thrust = 1;
    g.sim.run(30);
    expect(g.kaiju.speed).toBeLessThan(1.5);
    g.sim.players[0].thrust = 0;
    g.sim.run(150);
    expect(g.kaiju.bow).toBe(0);
    expect(g.kaiju.tilt).toBeLessThan(0.12);
    expect(g.kaiju.state).toBe('walk');
    expect(g.kaiju.stumbles).toBe(0);
    expect(g.kaiju.falls).toBe(0);
    expect(g.kaiju.bows).toBe(1);
    // And then it can go about its business.
    g.sim.players[0].thrust = 1;
    g.sim.run(120);
    expect(g.kaiju.speed).toBeGreaterThan(8);
  });

  it('wins over the people it has just frightened, and that shows in the approval', async () => {
    const g = await makeGame('city');
    const citizens = g.sim.parts.citizens as Citizens;
    const approval = g.sim.parts.approval as Approval;
    // Charge down the street until a crowd is running.
    g.sim.players[0].thrust = 1;
    for (let i = 0; i < 60 * 12 && citizens.scared < 6; i++) g.sim.step();
    expect(citizens.scared).toBeGreaterThanOrEqual(6);
    g.sim.players[0].thrust = 0;
    g.sim.run(50);
    const scared = citizens.scared;
    expect(scared).toBeGreaterThan(0);
    const before = approval.value;
    let cheers = 0;
    g.sim.on('citizenCheer', () => cheers++);
    tap(g, 'bow');
    g.sim.run(60);
    expect(approval.forgiven).toBeGreaterThan(0);
    expect(approval.forgiven).toBeLessThanOrEqual(scared);
    expect(cheers).toBe(1);
    expect(citizens.cheering()).toBe(approval.forgiven);
    expect(approval.value).toBeGreaterThan(before);
    // Bowing to an empty street earns nothing more.
    g.sim.run(400);
    const settled = approval.forgiven;
    tap(g, 'bow');
    g.sim.run(120);
    expect(approval.forgiven).toBe(settled);
  });
});

describe('water mains', () => {
  it('a heavy foot bursts one: things fly, the road is slippery for a while, then it dries', async () => {
    const g = await makeGame('yard');
    const mains = g.sim.parts.mains as WaterMains;
    expect(mains.mains.length).toBe(1);
    const main = mains.mains[0];
    expect(g.sim.traction(main.x + 6, main.z)).toBe(1);
    // Tiptoe across: nothing.
    moveTo(g, main.x, main.z + 40);
    g.sim.players[0].thrust = 1;
    g.sim.players[0].tiptoe = true;
    g.sim.run(60 * 9);
    expect(g.kaiju.position().z).toBeLessThan(main.z - 10);
    expect(mains.bursts).toBe(0);
    // Now stamp across it.
    g.sim.players[0].tiptoe = false;
    g.sim.players[0].thrust = 0;
    g.sim.run(30);
    moveTo(g, main.x, main.z + 40);
    let burst = 0;
    g.sim.on('mainBurst', () => burst++);
    const stumbles = g.kaiju.stumbles + g.kaiju.falls;
    g.sim.players[0].thrust = 1;
    for (let i = 0; i < 60 * 6 && !burst; i++) g.sim.step();
    g.sim.players[0].thrust = 0;
    expect(burst).toBe(1);
    expect(mains.bursts).toBe(1);
    expect(mains.spraying(main)).toBe(true);
    g.sim.run(90);
    expect(g.kaiju.stumbles + g.kaiju.falls).toBeGreaterThan(stumbles);
    // Wet road round it, dry road beyond.
    expect(g.sim.traction(main.x + 6, main.z)).toBeLessThan(0.5);
    expect(g.sim.traction(main.x + 30, main.z)).toBe(1);
    // It can't burst twice, and in time it is all over.
    g.sim.run(60 * 27);
    expect(mains.bursts).toBe(1);
    expect(mains.spraying(main)).toBe(false);
    expect(g.sim.traction(main.x + 6, main.z)).toBe(1);
  });

  it('standing in the spray rinses the dust out of its nose', async () => {
    const g = await makeGame('yard');
    const mains = g.sim.parts.mains as WaterMains;
    const nose = g.sim.parts.nose as Nose;
    const main = mains.mains[0];
    moveTo(g, main.x, main.z + 10.5);
    expect(mains.bursts).toBe(0);
    nose.tickle = 0.9;
    g.sim.run(60);
    const dry = nose.tickle;
    mains.burst(main);
    g.sim.run(60);
    // Far faster than it clears by itself.
    expect(dry - nose.tickle).toBeGreaterThan((0.9 - dry) * 4);
    expect(nose.tickle).toBeLessThan(0.5);
  });

  it('the city has some, on the roads, and they sit quietly until stepped on', async () => {
    const g = await makeGame('city');
    const mains = g.sim.parts.mains as WaterMains;
    expect(mains.mains.length).toBe(g.sim.tuning.city.waterMains);
    for (const m of mains.mains) {
      // On a road: not inside any block.
      expect(g.layout.blocks.some((b) => Math.abs(m.x - b.x) < b.w / 2 && Math.abs(m.z - b.z) < b.d / 2)).toBe(false);
    }
    g.sim.run(120);
    expect(mains.bursts).toBe(0);
    expect(g.awakeOthers()).toBe(0);
  });
});

describe('city approval', () => {
  it('starts in the middle, falls with damage and rises with repairs; a straight job is worth more', async () => {
    const g = await makeGame('yard', { city: { propDensity: 0 } });
    const approval = g.sim.parts.approval as Approval;
    const pieces = g.sim.parts.pieces as Pieces;
    g.sim.step();
    expect(approval.value).toBe(WORTH.start);
    // Knock a building about.
    const tower = g.chunks.buildings[1];
    for (let i = tower.first; i < tower.first + 4; i++) g.chunks.loosen(i, null);
    g.sim.run(240);
    expect(g.damage.buildingsDamaged).toBeGreaterThan(0);
    const damaged = approval.value;
    expect(damaged).toBeLessThan(WORTH.start);
    expect(approval.finished).toBe(null);
    // Put the tower top back, square.
    let done: number | null = null;
    g.sim.on('repairsDone', (e) => (done = e.approval));
    const top = pieces.pieces[0];
    const s = top.job.socket;
    const k = g.kaiju;
    const d = g.sim.tuning.kaiju.bodyRadius + g.sim.tuning.carry.holdForward;
    moveTo(g, s.x - k.forward.x * d, s.z - k.forward.z * d);
    const before = approval.value;
    pieces.grab(top);
    g.sim.run(45);
    tap(g, 'grab');
    g.sim.run(5);
    expect(top.fit).toBe('straight');
    expect(approval.value).toBeCloseTo(before + WORTH.straight, 1);
    expect(done).toBe(null);
    // Stand the clock tower up, and that is the lot.
    const clock = pieces.pieces[1];
    moveTo(g, clock.job.socket.x + 12 - k.forward.x * d, clock.job.socket.z - k.forward.z * d);
    tap(g, 'grab');
    for (let i = 0; i < 60 * 15 && clock.state === 'raising'; i++) {
      g.sim.players[0].balanceZ = pieces.prompt * 0.1;
      g.sim.step();
    }
    g.sim.step();
    expect(pieces.allPlaced()).toBe(true);
    expect(approval.finished).not.toBe(null);
    expect(done).toBeCloseTo(approval.value, 5);
    expect(approval.finished!.approval).toBeGreaterThan(before + WORTH.straight);
  });

  it('has a verdict for every score', () => {
    expect(verdict(100)).not.toBe(verdict(70));
    expect(verdict(70)).not.toBe(verdict(40));
    expect(verdict(40)).not.toBe(verdict(5));
  });
});
