import * as THREE from 'three';
import { verdict, type Approval } from '../city/approval';
import type { CityLayout } from '../city/cityGen';
import type { Citizens } from '../city/citizens';
import type { Damage } from '../city/damage';
import type { JobBoard, JobView } from '../city/jobs';
import type { Pieces } from '../city/pieces';
import type { Tuning } from '../core/tuning';
import type { Kaiju } from '../kaiju/kaiju';
import type { Nose } from '../kaiju/nose';
import type { Sim } from '../sim';

export interface HudDeps {
  sim: Sim;
  tuning: Tuning;
  camera: THREE.PerspectiveCamera;
  kaiju: Kaiju;
  board: JobBoard;
  approval: Approval;
  damage: Damage;
  layout: CityLayout;
  pieces?: Pieces;
  citizens?: Citizens;
  nose?: Nose;
  /** Start the scene again: the same city, or the next shift's. */
  restart: (next: boolean) => void;
  /** Called when the briefing is dismissed and play begins. */
  begin: () => void;
  /** Show the briefing first (off for automated runs). */
  intro: boolean;
  /** Other places to point at (the next gate on the test course): arrows and the map show them, the job list does not. */
  targets?: () => JobView[];
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const v = new THREE.Vector3();

interface Floater {
  node: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  age: number;
  delta: number;
  why: string;
}

/**
 * The game's own screen furniture: the briefing, the job list, the map, arrows to jobs that
 * are off screen, the little verdicts that float up from whatever the kaiju just did, the
 * coach's one-line hints, and the report card at the end of the shift.
 */
export class GameHud {
  private root = el('div', 'gh');
  private list = el('div', 'gh-jobs');
  private map = el('canvas', 'gh-map');
  private mapStatic = document.createElement('canvas');
  private arrows: HTMLDivElement[] = [];
  private floaters: Floater[] = [];
  private coach = el('div', 'gh-coach');
  private overlay = el('div', 'gh-overlay');
  /** True while a card (the briefing, the report) is up: it needs the mouse. */
  get showing(): boolean {
    return this.overlay.style.display === 'grid';
  }
  private said = new Set<string>();
  private coachTime = 0;
  private listTimer = 0;
  private jobs: JobView[] = [];
  private extra: JobView[] = [];
  private scale = 1;
  playing = false;

  constructor(private d: HudDeps) {
    document.body.appendChild(this.root);
    this.root.append(this.list, this.map, this.coach, this.overlay);
    this.map.width = this.map.height = 220;
    this.drawStaticMap();
    d.sim.on('approval', (e) => this.float(e.x, e.y, e.z, e.delta, e.why));
    d.sim.on('repairsDone', () => setTimeout(() => this.report(), 2400));
    if (d.intro) this.briefing();
    else {
      this.playing = true;
      d.begin();
    }
  }

  // --- Briefing and report card ---

  private card(build: (card: HTMLDivElement) => void): void {
    this.overlay.replaceChildren();
    const card = el('div', 'gh-card');
    build(card);
    this.overlay.appendChild(card);
    this.overlay.style.display = 'grid';
  }

  private briefing(): void {
    const jobs = this.d.board.list();
    const count = new Map<string, number>();
    for (const j of jobs) count.set(j.name, (count.get(j.name) ?? 0) + 1);
    this.card((card) => {
      card.append(el('div', 'gh-kicker', `SHIFT ${this.d.tuning.game.shift}`), el('h1', '', 'Kaiju Cleaners'));
      card.append(el('p', 'gh-lede', 'You are thirty metres tall, very sorry about the city, and here to help put it right. Try not to make it worse.'));
      const todo = el('div', 'gh-todo');
      todo.append(el('b', '', "Today's jobs"));
      for (const [name, n] of count) todo.append(el('span', '', `${n} × ${name}`));
      card.append(todo);
      const keys = el('div', 'gh-keys');
      const rows: [string, string][] = [
        ['W A S D', 'walk and turn'],
        ['Click', 'take hold / let go'],
        ['Shift', 'tiptoe'],
        ['Space', 'crawl'],
        ['V', 'bow (say sorry)'],
        ['F', 'hold your breath'],
        ['Drag / wheel', 'look around'],
        ['T', 'time of day'],
      ];
      for (const [k, what] of rows) keys.append(el('kbd', '', k), el('span', '', what));
      card.append(keys);
      const go = el('button', 'gh-go', 'Start the shift');
      const test = el('button', 'gh-go gh-quiet', 'Movement test course');
      test.addEventListener('click', () => (location.search = '?scene=course'));
      const run = el('button', 'gh-go gh-quiet', 'Runner course');
      run.addEventListener('click', () => (location.search = '?scene=run'));
      const row = el('div', 'gh-buttons');
      row.append(go, test, run);
      card.append(row, el('div', 'gh-small', 'Enter or click to start   ·   H: all controls   ·   ` : tuning and feedback tools'));
      const start = () => {
        if (this.playing) return;
        this.playing = true;
        this.overlay.style.display = 'none';
        window.removeEventListener('keydown', onKey);
        this.d.begin();
      };
      const onKey = (e: KeyboardEvent) => (e.code === 'Enter' || e.code === 'Space') && start();
      go.addEventListener('click', start);
      window.addEventListener('keydown', onKey);
    });
  }

  private report(): void {
    const { approval, damage, pieces, kaiju, nose, tuning } = this.d;
    const score = approval.finished?.approval ?? approval.value;
    const stars = score >= 90 ? 5 : score >= 72 ? 4 : score >= 52 ? 3 : score >= 30 ? 2 : 1;
    this.card((card) => {
      card.append(el('div', 'gh-kicker', `SHIFT ${tuning.game.shift} COMPLETE`), el('h1', '', `${Math.round(score)}% approval`));
      card.append(el('div', 'gh-stars', '★'.repeat(stars) + '☆'.repeat(5 - stars)), el('p', 'gh-lede', verdict(score)));
      const grid = el('div', 'gh-stats');
      const rows: [string, string | number][] = [
        ['Time', clock(approval.finished?.seconds ?? this.d.sim.time)],
        ['Repairs straight', pieces ? pieces.placed - pieces.crooked : 0],
        ['Repairs crooked', pieces?.crooked ?? 0],
        ['Buildings knocked about', damage.buildingsDamaged],
        ['People squashed', damage.citizensSquished],
        ['Apologies', kaiju.bows],
        ['Sneezes', nose?.sneezes ?? 0],
        ['Falls', kaiju.falls],
      ];
      for (const [k, val] of rows) grid.append(el('span', '', k), el('b', '', String(val)));
      card.append(grid);
      const next = el('button', 'gh-go', 'Next shift: a new city');
      const again = el('button', 'gh-go gh-quiet', 'Same city again');
      const keep = el('button', 'gh-go gh-quiet', 'Keep stomping about');
      next.addEventListener('click', () => this.d.restart(true));
      again.addEventListener('click', () => this.d.restart(false));
      keep.addEventListener('click', () => (this.overlay.style.display = 'none'));
      const buttons = el('div', 'gh-buttons');
      buttons.append(next, again, keep);
      card.append(buttons);
    });
  }

  // --- Verdicts that float up from the scene ---

  private float(x: number, y: number, z: number, delta: number, why: string): void {
    // Several of the same thing at once (a row of people) become one number.
    const twin = this.floaters.find((f) => f.why === why && f.age < 0.7 && Math.hypot(f.x - x, f.z - z) < 40);
    if (twin) {
      twin.delta += delta;
      twin.age = 0.15;
      this.label(twin);
      return;
    }
    const f: Floater = { node: el('div', 'gh-float'), x, y: y + 6, z, age: 0, delta, why };
    this.label(f);
    this.root.appendChild(f.node);
    this.floaters.push(f);
    if (this.floaters.length > 14) this.floaters.shift()!.node.remove();
  }

  private label(f: Floater): void {
    const n = Math.abs(f.delta) >= 9.5 || Number.isInteger(f.delta) ? Math.round(f.delta) : Math.round(f.delta * 10) / 10;
    f.node.textContent = `${f.delta > 0 ? '+' : ''}${n}  ${f.why}`;
    f.node.classList.toggle('gh-bad', f.delta < 0);
    f.node.classList.toggle('gh-big', Math.abs(f.delta) >= 5);
  }

  /** Where a world point lands on screen, in CSS pixels; `front` is false if it is behind the camera. */
  private project(x: number, y: number, z: number): { x: number; y: number; front: boolean } {
    v.set(x, y, z).project(this.d.camera);
    const front = v.z < 1;
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, front };
  }

  // --- The map ---

  private toMap(x: number, z: number): [number, number] {
    return [110 + x * this.scale, 110 + z * this.scale];
  }

  private drawStaticMap(): void {
    const L = this.d.layout;
    const c = this.mapStatic;
    c.width = c.height = 220;
    const g = c.getContext('2d')!;
    let reach = Math.max(L.sizeX, L.sizeZ) / 2 + 30;
    if (!L.blocks.length) reach = 140;
    this.scale = 106 / reach;
    g.fillStyle = '#5d7350';
    g.fillRect(0, 0, 220, 220);
    const rect = (x: number, z: number, w: number, dd: number, fill: string) => {
      const [px, pz] = this.toMap(x - w / 2, z - dd / 2);
      g.fillStyle = fill;
      g.fillRect(px, pz, Math.max(1, w * this.scale), Math.max(1, dd * this.scale));
    };
    if (L.sizeX) rect(0, 0, L.sizeX, L.sizeZ, '#4c5058');
    for (const b of L.blocks) rect(b.x, b.z, b.w, b.d, '#8a877f');
    for (const b of L.plazas) rect(b.x, b.z, b.w, b.d, '#c9c0aa');
    if (L.river) rect(0, (L.river.z0 + L.river.z1) / 2, 4000, L.river.z1 - L.river.z0, '#2f7fb0');
    for (const b of L.bridges) {
      if (b.kind !== 'road') continue;
      if (b.along === 'z') rect(b.center, (b.from + b.to) / 2, b.width, b.to - b.from, '#6a6e76');
      else rect((b.from + b.to) / 2, b.center, b.to - b.from, b.width, '#6a6e76');
    }
    for (const b of L.buildings) {
      const t = b.tiers[0];
      rect(b.x, b.z, t.w, t.d, '#d8d2c4');
    }
  }

  private drawMap(): void {
    const g = this.map.getContext('2d')!;
    g.clearRect(0, 0, 220, 220);
    g.drawImage(this.mapStatic, 0, 0);
    for (const h of this.d.layout.hazards) {
      const [x, z] = this.toMap(h.x, h.z);
      g.fillStyle = h.kind === 'oil' ? '#15131c' : h.kind === 'main' ? '#3f8cff' : '#3a3d44';
      g.beginPath();
      g.arc(x, z, Math.max(1.6, h.radius * this.scale * 0.7), 0, 6.3);
      g.fill();
    }
    for (const j of [...this.jobs, ...this.extra]) {
      if (j.done) continue;
      const [x, z] = this.toMap(j.x, j.z);
      g.fillStyle = hex(j.color);
      g.strokeStyle = '#111';
      g.lineWidth = 1.5;
      g.beginPath();
      const r = j.active ? 6 : 4.5;
      g.moveTo(x, z - r);
      g.lineTo(x + r, z);
      g.lineTo(x, z + r);
      g.lineTo(x - r, z);
      g.closePath();
      g.fill();
      g.stroke();
    }
    // The kaiju: an arrowhead pointing the way it faces.
    const p = this.d.kaiju.visual.position;
    const [kx, kz] = this.toMap(p.x, p.z);
    const yaw = this.d.kaiju.yaw;
    g.save();
    g.translate(Math.max(6, Math.min(214, kx)), Math.max(6, Math.min(214, kz)));
    g.rotate(Math.PI - yaw);
    g.fillStyle = '#7dff9a';
    g.strokeStyle = '#0b2a18';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(5.5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5.5, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  // --- The job list and the arrows ---

  private drawList(): void {
    const board = this.d.board;
    this.list.replaceChildren();
    if (!board.total) {
      this.list.style.display = 'none';
      return;
    }
    const head = el('div', 'gh-head');
    head.append(el('span', '', `SHIFT ${this.d.tuning.game.shift}  ·  ${clock(this.d.approval.finished?.seconds ?? this.d.sim.time)}`), el('b', '', `${board.done}/${board.total} jobs`));
    this.list.append(head);
    const k = this.d.kaiju.visual.position;
    const order = this.jobs.map((j, i) => ({ j, i, far: Math.hypot(j.x - k.x, j.z - k.z) })).sort((a, b) => Number(a.j.done) - Number(b.j.done) || a.far - b.far);
    for (const { j, far } of order) {
      const row = el('div', 'gh-row' + (j.done ? ' gh-done' : '') + (j.active ? ' gh-active' : ''));
      const dot = el('i');
      dot.style.background = hex(j.color);
      row.append(dot, el('span', '', j.name), el('em', '', j.done ? (j.sloppy ? '✓ crooked' : '✓') : j.active ? j.note : `${Math.round(far)} m`));
      this.list.append(row);
    }
  }

  private drawArrows(): void {
    const k = this.d.kaiju.visual.position;
    const open = [...this.jobs, ...this.extra].filter((j) => !j.done).map((j) => ({ j, far: Math.hypot(j.x - k.x, j.z - k.z) }));
    open.sort((a, b) => Number(b.j.active) - Number(a.j.active) || a.far - b.far);
    // Only the job in hand, or the three nearest: more than that is noise.
    const show = open[0]?.j.active ? open.slice(0, 1) : open.slice(0, 3);
    while (this.arrows.length < show.length) {
      const a = el('div', 'gh-arrow');
      a.append(el('i'), el('span'));
      this.root.appendChild(a);
      this.arrows.push(a);
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pad = 70;
    this.arrows.forEach((a, i) => {
      const item = show[i];
      if (!item || !this.playing) {
        a.style.display = 'none';
        return;
      }
      const s = this.project(item.j.x, 14, item.j.z);
      let { x, y } = s;
      if (!s.front) {
        // Behind the camera: mirror it, and push it off screen so that it clamps to an edge.
        x = w - x;
        y = h * 2;
      }
      const inside = s.front && x > pad && x < w - pad && y > pad && y < h - pad;
      // On screen the floating marker in the world does the pointing; close up, nothing is needed.
      if (inside) {
        a.style.display = item.far > 60 ? 'flex' : 'none';
        a.classList.remove('gh-edge');
        a.style.transform = `translate(${x}px, ${y - 46}px) translate(-50%, -100%)`;
      } else {
        const cx = w / 2;
        const cy = h / 2;
        const dx = x - cx;
        const dy = y - cy;
        const t = Math.min((cx - pad) / Math.max(1, Math.abs(dx)), (cy - pad) / Math.max(1, Math.abs(dy)));
        a.style.display = 'flex';
        a.classList.add('gh-edge');
        a.style.transform = `translate(${cx + dx * t}px, ${cy + dy * t}px) translate(-50%, -50%)`;
        (a.firstChild as HTMLElement).style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      }
      a.style.setProperty('--c', hex(item.j.color));
      (a.lastChild as HTMLElement).textContent = `${item.j.active ? item.j.note : item.j.name}  ${Math.round(item.far)} m`;
    });
  }

  // --- The coach ---

  private say(id: string, text: string): boolean {
    if (this.said.has(id) || this.coachTime > 0) return false;
    this.said.add(id);
    this.coach.textContent = text;
    this.coach.style.opacity = '1';
    this.coachTime = 7;
    return true;
  }

  private hints(dt: number): void {
    this.coachTime -= dt;
    if (this.coachTime <= 0) this.coach.style.opacity = '0';
    if (this.coachTime > -1.2) return;
    const { sim, kaiju, pieces, nose, citizens, board } = this.d;
    if (!board.total) return;
    const held = pieces?.held;
    if (sim.time > 1.5 && this.say('move', 'W / S to walk, A / D to turn. The arrows point at your jobs. Mind the buildings.')) return;
    if (held?.state === 'raising' && this.say('raise', 'Heave! Keep the gauge on the left in the green: shove the mouse the way it says.')) return;
    if (held && held.state !== 'raising' && this.say('carry', 'Got it. Carry it to the matching marker and click to set it down. Gentle turns keep the gauge quiet.')) return;
    if (!held && pieces?.nearest() && this.say('grab', 'Click (or E) to take hold of it.')) return;
    if (kaiju.stumbles > 0 && this.say('stumble', 'Wobbling? Ease off the turn. Going over? Steer into the fall to save it.')) return;
    if (nose && nose.tickle > 0.45 && this.say('dust', 'Dust up the nose. Hold F to hold your breath, or point the sneeze somewhere harmless.')) return;
    if (citizens && citizens.scared > 5 && this.say('bow', 'You are frightening people. Stop and press V to bow.')) return;
    if (this.d.approval.value < 38 && this.say('careful', 'The city is losing patience. Shift tiptoes; Space crawls under things.')) return;
    if (sim.time > 40 && this.say('modes', 'Shift: tiptoe past delicate things. Space: crawl under skybridges. T: change the time of day.')) return;
  }

  /** Once per drawn frame. */
  frame(dt: number): void {
    this.listTimer -= dt;
    if (this.listTimer <= 0) {
      this.listTimer = 0.2;
      this.jobs = this.d.board.list();
      this.extra = this.d.targets?.() ?? [];
      this.drawList();
    }
    this.drawMap();
    this.drawArrows();
    if (this.playing) this.hints(dt);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.age += dt;
      if (f.age > 2.4) {
        f.node.remove();
        this.floaters.splice(i, 1);
        continue;
      }
      const s = this.project(f.x, f.y + f.age * 5, f.z);
      f.node.style.display = s.front ? 'block' : 'none';
      f.node.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${Math.min(1, 0.6 + f.age * 4)})`;
      f.node.style.opacity = String(Math.min(1, (2.4 - f.age) * 1.6));
    }
  }
}
