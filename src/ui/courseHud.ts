import { PENALTY, formatResult, type Course, type CourseResult } from '../city/course';
import { STYLES, type Tuning } from '../core/tuning';
import type { Sim } from '../sim';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const RUNS_KEY = 'kaiju-course-runs';

interface Run {
  course?: string;
  style: string;
  seconds: number;
  penalty: number;
  score: number;
  buildings: number;
  falls: number;
  feel: Tuning['feel'];
}

/** What to call the current settings: a style's name if they are exactly that style, otherwise "custom". */
export function styleName(t: Tuning): string {
  const s = STYLES[t.move.style];
  if (!s) return 'custom';
  const feel = s.feel;
  const same = (!feel || (Object.keys(feel) as (keyof Tuning['feel'])[]).every((k) => feel[k] === t.feel[k])) && s.move.jump === t.move.jump && s.move.slide === t.move.slide && s.move.controller === t.move.controller;
  return same ? s.name : `custom (from ${s.name})`;
}

/**
 * The test course's screen furniture: a clock, the name and point of the leg you are on, the
 * legs behind you, and at the finish a card with the run, what it cost, and how it compares
 * with the other runs made in this browser.
 */
export class CourseHud {
  private root = el('div', 'ch');
  private time = el('div', 'ch-clock', '0:00.0');
  private leg = el('div', 'ch-leg');
  private splits = el('div', 'ch-splits');
  private overlay = el('div', 'gh-overlay');
  private shownLeg = -1;
  /** True while the results card is up (it needs the mouse). */
  get showing(): boolean {
    return this.overlay.style.display === 'grid';
  }

  constructor(
    sim: Sim,
    private tuning: Tuning,
    private course: Course,
    private restart: () => void,
    private toast: (text: string) => void,
  ) {
    document.body.appendChild(this.root);
    const top = el('div', 'ch-top');
    top.append(this.time, this.leg);
    this.root.append(top, this.splits, this.overlay);
    sim.on('courseDone', () => setTimeout(() => this.finish(), 900));
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyR') this.restart();
    });
  }

  private runs(): Run[] {
    try {
      return JSON.parse(localStorage.getItem(RUNS_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  private finish(): void {
    const r = this.course.result();
    const mine: Run = { course: this.course.spec.name, style: styleName(this.tuning), seconds: r.seconds, penalty: r.penalty, score: r.score, buildings: r.buildings, falls: r.falls, feel: { ...this.tuning.feel } };
    const all = [mine, ...this.runs()].slice(0, 30);
    // Only runs of this course are comparable.
    const runs = all.filter((x) => (x.course ?? 'Test course') === mine.course).slice(0, 10);
    try {
      localStorage.setItem(RUNS_KEY, JSON.stringify(all));
    } catch {
      // No storage: the card still shows this run.
    }
    const card = el('div', 'gh-card ch-card');
    card.append(el('div', 'gh-kicker', `${this.course.spec.name.toUpperCase()} · ${mine.style.toUpperCase()}`), el('h1', '', clock(r.seconds)));
    card.append(el('p', 'gh-lede', `+ ${r.penalty} s for ${r.buildings} buildings and ${r.falls} falls  =  ${r.score.toFixed(1)}  (${PENALTY.building} s a building, ${PENALTY.fall} s a fall)`));
    const table = el('div', 'ch-table');
    table.append(el('b', '', 'Leg'), el('b', '', 'Time'), el('b', '', 'Buildings'), el('b', '', 'Stumbles'));
    for (const l of r.legs) table.append(el('span', '', l.name), el('span', '', l.seconds.toFixed(1)), el('span', '', String(l.buildings)), el('span', '', String(l.stumbles + l.falls)));
    card.append(table);
    if (runs.length > 1) {
      const best = Math.min(...runs.map((x) => x.score));
      const history = el('div', 'ch-table ch-history');
      history.append(el('b', '', 'Runs in this browser'), el('b', '', 'Time'), el('b', '', 'Penalty'), el('b', '', 'Score'));
      runs.forEach((x, i) => {
        const cls = x.score === best ? 'ch-best' : i === 0 ? 'ch-now' : '';
        history.append(el('span', cls, (i === 0 ? '▸ ' : '') + x.style), el('span', cls, x.seconds.toFixed(1)), el('span', cls, `+${x.penalty}`), el('span', cls, x.score.toFixed(1)));
      });
      card.append(history);
    }
    const again = el('button', 'gh-go', 'Run it again (R)');
    const copy = el('button', 'gh-go gh-quiet', 'Copy results for Claude');
    const look = el('button', 'gh-go gh-quiet', 'Close');
    again.addEventListener('click', () => this.restart());
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(this.report(r, runs));
      this.toast('Results copied: paste them into the chat.');
    });
    look.addEventListener('click', () => (this.overlay.style.display = 'none'));
    const buttons = el('div', 'gh-buttons');
    buttons.append(again, copy, look);
    card.append(buttons, el('div', 'gh-small', '1 / 2 / 3 / 4 change the movement style, ` opens the dials: change something, then R to run it again.'));
    this.overlay.replaceChildren(card);
    this.overlay.style.display = 'grid';
  }

  /** The run as text, with the settings that made it, for pasting into a chat. */
  private report(r: CourseResult, runs: Run[]): string {
    const t = this.tuning;
    return [
      formatResult(r, `${this.course.spec.name}, ${styleName(t)}`),
      `settings: ${JSON.stringify(t.move.controller === 1 ? { runner: t.runner, move: t.move, kaiju: { size: t.kaiju.size } } : { feel: t.feel, move: t.move, kaiju: { size: t.kaiju.size }, tail: { wrecks: t.tail.wrecks, wreckSpeed: t.tail.wreckSpeed, bite: t.tail.bite } })}`,
      'earlier runs (newest first):',
      ...runs.slice(1).map((x) => `  ${x.style}: ${x.seconds.toFixed(1)} s + ${x.penalty} = ${x.score.toFixed(1)}  feel ${JSON.stringify(x.feel)}`),
    ].join('\n');
  }

  frame(): void {
    const c = this.course;
    this.time.textContent = clock(c.seconds());
    this.time.classList.toggle('ch-done', c.state === 'done');
    // (Redrawn when the leg changes, and when the clock starts or stops.)
    const key = c.leg * 3 + (c.state === 'ready' ? 0 : c.state === 'running' ? 1 : 2);
    if (key !== this.shownLeg) {
      this.shownLeg = key;
      const section = c.spec.sections[c.leg];
      this.leg.textContent = c.state === 'ready' ? 'Cross the line to start the clock' : section ? `${c.leg + 1}/${c.spec.sections.length}  ${section.name}: ${section.brief}` : 'Finished';
      this.splits.replaceChildren(...c.legs.map((l) => el('span', l.buildings ? 'ch-hit' : '', `${l.name.split(' ')[0]} ${l.seconds.toFixed(1)}${l.buildings ? ` · ${l.buildings} hit` : ''}`)));
    }
  }
}
