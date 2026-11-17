import { describe, expect, it } from 'vitest';
import type { Approval } from '../src/city/approval';
import { reachFloors, totalFloors } from '../src/city/cityGen';
import type { Pieces } from '../src/city/pieces';
import { makeTuning } from '../src/core/tuning';
import { chicagoLayout } from '../src/scenes/chicago';
import { makeGame } from './helpers';

/** Chicago as it ships: at the kaiju's shipped size, in its own streets. */
const shipped = makeTuning();
const layout = chicagoLayout(shipped);
const at = (name: string) => layout.landmarks.find((l) => l.name.startsWith(name))!;
const street = (name: string) => layout.streets.find((s) => s.name === name)!;

describe('Chicago, from the map', () => {
  it('has the real streets in their real order', () => {
    // West to east across the Loop, and out to the lake (research/chicago-map: longitudes at 41.88 N).
    const ns = layout.streets.filter((s) => s.along === 'z').sort((a, b) => a.center - b.center).map((s) => s.name);
    expect(ns).toEqual(['Canal Street', 'Wacker Drive', 'Wells Street', 'LaSalle Street', 'Clark Street', 'Dearborn Street', 'State Street', 'Wabash Avenue', 'Michigan Avenue', 'Columbus Drive', 'Lake Shore Drive']);
    // North to south (latitudes at 87.63 W): north is -z.
    const ew = layout.streets.filter((s) => s.along === 'x').sort((a, b) => a.center - b.center).map((s) => s.name);
    expect(ew).toEqual(['Chicago Avenue', 'Grand Avenue', 'Kinzie Street', 'Wacker Drive', 'Lake Street', 'Randolph Street', 'Madison Street', 'Adams Street', 'Jackson Street', 'Van Buren Street', 'Congress Parkway', 'Harrison Street']);
    // The wide ones are the ones that are wide: Michigan Avenue widest of all, and Congress the widest across.
    const widest = (along: 'x' | 'z') => layout.streets.filter((s) => s.along === along).sort((a, b) => b.width - a.width)[0].name;
    expect(widest('z')).toBe('Michigan Avenue');
    expect(widest('x')).toBe('Congress Parkway');
  });

  it('has water where the water is: the river and its fork, and the lake with Navy Pier in it', async () => {
    const g = await makeGame('chicago', { kaiju: shipped.kaiju, city: shipped.city });
    const ground = g.sim.ground;
    const wacker = street('Wacker Drive');
    const kinzie = street('Kinzie Street');
    const riverZ = (layout.streets.find((s) => s.along === 'x' && s.name === 'Wacker Drive')!.center + kinzie.center) / 2 + 10;
    // The main branch runs east-west between Kinzie and Wacker Drive, from the fork to the lake...
    expect(ground(street('State Street').center + 20, riverZ)).toBeLessThan(-3);
    expect(ground(street('Michigan Avenue').center + 20, riverZ)).toBeLessThan(-3);
    // ...and the branch it forks into runs north-south, west of (north-south) Wacker Drive, the whole way down.
    const branchX = (street('Canal Street').center + wacker.center) / 2 + 12;
    expect(wacker.along).toBe('z');
    for (const name of ['Madison Street', 'Jackson Street', 'Congress Parkway', 'Grand Avenue']) expect(ground(branchX, street(name).center)).toBeLessThan(-3);
    // West of the fork it is land again: the main branch stops there.
    expect(ground(street('Canal Street').center, riverZ)).toBe(0);
    // The Loop is dry land.
    for (const name of ['State Street', 'LaSalle Street', 'Michigan Avenue']) expect(ground(street(name).center, street('Madison Street').center)).toBe(0);
    // East of Lake Shore Drive is the lake, as far as anyone can go, except along Navy Pier at the foot of Grand Avenue.
    const lsd = street('Lake Shore Drive').center;
    expect(ground(lsd + 60, street('Madison Street').center)).toBeLessThan(-3);
    expect(ground(lsd + 300, street('Chicago Avenue').center)).toBeLessThan(-3);
    const pier = at('Navy Pier');
    expect(pier.x).toBeGreaterThan(lsd + 30);
    expect(Math.abs(pier.z - street('Grand Avenue').center)).toBeLessThan(1);
    expect(ground(pier.x, pier.z)).toBe(0);
    expect(ground(pier.x, pier.z + 30)).toBeLessThan(-3);
  });

  it('puts each landmark on its own corner', () => {
    const x = (name: string) => street(name).center;
    const z = (name: string) => layout.streets.find((s) => s.along === 'x' && s.name === name)!.center;
    const between = (v: number, a: number, b: number) => v > Math.min(a, b) && v < Math.max(a, b);
    // Willis Tower: Wacker to Wells (Franklin is left out), Adams to Jackson.
    expect(between(at('Willis').x, x('Wacker Drive'), x('Wells Street'))).toBe(true);
    expect(between(at('Willis').z, z('Adams Street'), z('Jackson Street'))).toBe(true);
    // The Board of Trade closes the south end of LaSalle Street, at Jackson.
    expect(Math.abs(at('Chicago Board of Trade').x - x('LaSalle Street'))).toBeLessThan(1);
    expect(at('Chicago Board of Trade').z).toBeGreaterThan(z('Jackson Street'));
    // Daley Center and Chase Tower: Clark to Dearborn. The library: State and Van Buren.
    for (const name of ['Daley', 'Chase']) expect(between(at(name).x, x('Clark Street'), x('Dearborn Street'))).toBe(true);
    expect(at('Daley').z).toBeLessThan(at('Chase').z);
    expect(between(at('Harold Washington').z, z('Van Buren Street'), z('Congress Parkway'))).toBe(true);
    // North of the river, from west to east along it: the Mart, Marina City, Trump, Wrigley, Tribune.
    const north = ['Merchandise Mart', 'Marina City (west)', 'Marina City (east)', 'Trump', 'Wrigley', 'Tribune'].map((n) => at(n));
    for (const l of north) expect(between(l.z, z('Kinzie Street'), z('Wacker Drive'))).toBe(true);
    for (let i = 1; i < north.length; i++) expect(north[i].x).toBeGreaterThan(north[i - 1].x);
    // Wrigley is on the west side of Michigan Avenue and the Tribune on the east.
    expect(at('Wrigley').x).toBeLessThan(x('Michigan Avenue'));
    expect(at('Tribune').x).toBeGreaterThan(x('Michigan Avenue'));
    // East of Michigan and south of the river: Aon, Prudential, Aqua, St. Regis; then the parks, with the Art Institute on Michigan.
    for (const name of ['Aon', 'Two Prudential', 'Aqua', 'St. Regis']) {
      expect(at(name).x).toBeGreaterThan(x('Michigan Avenue'));
      expect(between(at(name).z, z('Wacker Drive'), z('Randolph Street'))).toBe(true);
    }
    expect(between(at('Art Institute').x, x('Michigan Avenue'), x('Columbus Drive'))).toBe(true);
    expect(layout.parks.length).toBeGreaterThanOrEqual(8);
    for (const park of layout.parks) expect(park.x).toBeGreaterThan(x('Michigan Avenue'));
    // The Hancock is the northernmost, up Michigan Avenue past Chicago Avenue; Union Station is across the river to the west.
    expect(at('875 North Michigan').z).toBeLessThan(z('Chicago Avenue'));
    expect(at('Union Station').x).toBeLessThan(x('Wacker Drive') - 40);
    // No landmark stands in the water or on another.
    for (const l of layout.landmarks) {
      expect(layout.waters!.some((w) => l.x > w.x0 && l.x < w.x1 && l.z > w.z0 && l.z < w.z1), l.name).toBe(false);
      for (const o of layout.landmarks) if (o !== l) expect(Math.hypot(o.x - l.x, o.z - l.z), `${l.name} and ${o.name}`).toBeGreaterThan(12);
    }
  });

  it('keeps the skyline in order: the towers are not to scale, but the taller is always the taller', () => {
    const towers = layout.landmarks.filter((l) => l.metres >= 100).sort((a, b) => b.metres - a.metres);
    expect(towers[0].name).toBe('Willis Tower');
    for (let i = 1; i < towers.length; i++) expect(towers[i].floors, `${towers[i].name} against ${towers[i - 1].name}`).toBeLessThanOrEqual(towers[i - 1].floors);
    // And they stand out: the tallest ordinary building is shorter than any of the famous dozen.
    const named = new Set(layout.landmarks.map((l) => l.building));
    const ordinary = Math.max(...layout.buildings.filter((_, i) => !named.has(i)).map(totalFloors));
    expect(ordinary).toBeLessThan(towers.filter((t) => t.metres >= 250).at(-1)!.floors);
  });

  it('runs the L round the Loop, over Lake, Wabash, Van Buren and Wells, at a height to crouch under', () => {
    const el = layout.bridges.filter((b) => b.kind === 'road' && (b.y ?? 0) > 5);
    expect(el.length).toBe(4);
    const centers = (along: 'x' | 'z') => el.filter((b) => b.along === along).map((b) => b.center).sort((a, b) => a - b);
    expect(centers('z')).toEqual([street('Wells Street').center, street('Wabash Avenue').center]);
    expect(centers('x')).toEqual(['Lake Street', 'Van Buren Street'].map((n) => layout.streets.find((s) => s.along === 'x' && s.name === n)!.center));
    const k = shipped.kaiju;
    const underside = el[0].y! - el[0].thickness! / 2;
    // Clear of a crouching kaiju's back; well below a standing one's head.
    expect(underside).toBeGreaterThan(k.bodyRadius + shipped.modes.crawlClearance + k.bodyHalfHeight * Math.cos(shipped.modes.crawlPitch) + k.bodyRadius + 1);
    expect(underside).toBeLessThan(k.legLength + k.bodyRadius + k.bodyHalfHeight * 2);
    // And there are bridges over both branches of the river, one of them missing a leaf.
    const river = layout.bridges.filter((b) => b.kind === 'road' && (b.y ?? 0) < 1);
    expect(river.filter((b) => b.along === 'z').length).toBeGreaterThanOrEqual(6);
    expect(river.filter((b) => b.along === 'x').length).toBeGreaterThanOrEqual(4);
    expect(river.filter((b) => b.gap !== undefined).length).toBe(1);
  });

  it('has jobs that belong to the place, every one of which can be reached', async () => {
    const g = await makeGame('chicago', { kaiju: shipped.kaiju, city: shipped.city });
    const pieces = g.sim.parts.pieces as Pieces;
    const approval = g.sim.parts.approval as Approval;
    const names = approval.board.list().map((j) => j.name);
    for (const want of ['DuSable Bridge leaf', 'Cultural Center dome', 'Union Station skylight', 'Art Institute roof', 'Chicago Water Tower', 'L car on a roof', 'Cloud Gate (the Bean)']) expect(names).toContain(want);
    expect(names.filter((n) => n === 'Blocked road').length).toBe(2);
    const hands = g.kaiju.rideHeight + g.sim.tuning.carry.handHeight;
    for (const piece of pieces.pieces) {
      // No socket above the hands; no piece or socket in the water (the bridge leaf's place is over it).
      expect(piece.job.socket.y, piece.job.name).toBeLessThanOrEqual(hands);
      if (piece.job.kind === 'top') expect(piece.job.socket.y).toBeLessThanOrEqual(reachFloors(g.sim.tuning) * g.sim.tuning.city.floorHeight);
      expect(g.sim.ground(piece.job.start.x, piece.job.start.z), piece.job.name).toBe(0);
      if (piece.job.kind !== 'span') expect(g.sim.ground(piece.job.socket.x, piece.job.socket.z), piece.job.name).toBe(0);
    }
    // Buckingham Fountain is a water main, in the park by the lake.
    const fountain = g.layout.hazards.find((h) => h.kind === 'main')!;
    expect(fountain.x).toBeGreaterThan(street('Columbus Drive').center);
    // It starts on Michigan Avenue, facing north, and nothing stirs until it does.
    expect(Math.abs(g.kaiju.position().x - street('Michigan Avenue').center)).toBeLessThan(1);
    expect(g.kaiju.forward.z).toBeLessThan(-0.99);
    g.sim.run(120);
    expect(g.awakeOthers()).toBe(0);
    expect(g.damage.chunksBroken).toBe(0);
    expect(pieces.pieces.every((p) => p.state === 'loose')).toBe(true);
  });

  it('names the building when one of the famous ones is knocked about', async () => {
    const g = await makeGame('chicago', { kaiju: shipped.kaiju, city: shipped.city });
    const said: string[] = [];
    g.sim.on('approval', (e) => said.push(e.why));
    const wrigley = at('Wrigley');
    const record = g.chunks.buildings[wrigley.building];
    for (let i = record.first; i < record.first + 4; i++) g.chunks.loosen(i, null);
    g.sim.run(240);
    expect(said).toContain('That was the Wrigley Building!');
  });
});
