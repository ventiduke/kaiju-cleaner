import type { Kaiju } from '../kaiju/kaiju';
import type { Sim } from '../sim';

/**
 * Sound, all synthesised on the spot: no audio files to load.
 * Browsers only let audio start after a click or key press, so this wakes on the first one.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastCrunch = 0;
  private lastScream = 0;

  constructor(
    private sim: Sim,
    private kaiju: Kaiju | undefined,
  ) {
    const wake = () => this.wake();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);

    sim.on('footfall', (e) => {
      const g = this.near(e) * e.strength;
      if (e.wet) this.burst({ gain: 0.5 * g, time: 0.45, from: 1800, to: 500, q: 0.7 });
      else {
        this.tone({ gain: 0.9 * g, time: 0.28, from: 95, to: 38, type: 'sine' });
        this.burst({ gain: 0.25 * g, time: 0.12, from: 420, to: 160, q: 0.8 });
      }
    });
    sim.on('chunkBreak', (e) => {
      // Collapses break dozens of chunks a second; let a steady crackle stand in for all of them.
      const now = performance.now();
      if (now - this.lastCrunch < 55) return;
      this.lastCrunch = now;
      const pitch = 0.75 + Math.random() * 0.6;
      this.burst({ gain: 0.42 * this.near(e), time: 0.2 + Math.random() * 0.15, from: 900 * pitch, to: 220 * pitch, q: 1.2 });
    });
    sim.on('kaijuFall', () => {
      this.tone({ gain: 1, time: 0.9, from: 70, to: 26, type: 'sine' });
      this.burst({ gain: 0.6, time: 0.7, from: 600, to: 90, q: 0.6 });
    });
    sim.on('kaijuStumble', () => this.tone({ gain: 0.25, time: 0.3, from: 300, to: 190, type: 'triangle' }));
    sim.on('kaijuSave', () => {
      this.tone({ gain: 0.3, time: 0.14, from: 330, to: 440, type: 'triangle' });
      this.tone({ gain: 0.3, time: 0.22, from: 495, to: 660, type: 'triangle', delay: 0.13 });
    });
    sim.on('citizenSplat', (e) => this.burst({ gain: 0.45 * this.near(e), time: 0.18, from: 2600, to: 300, q: 0.5 }));
    sim.on('citizenCheer', () => {
      for (let i = 0; i < 5; i++) this.tone({ gain: 0.12, time: 0.25, from: 500 + i * 90, to: 700 + i * 120, type: 'triangle', delay: i * 0.09 });
    });
    sim.on('oilSlip', () => this.tone({ gain: 0.35, time: 0.6, from: 900, to: 180, type: 'sine' }));
    sim.on('chunkCrumble', (e) => {
      const now = performance.now();
      if (now - this.lastCrunch < 70) return;
      this.lastCrunch = now;
      this.burst({ gain: 0.3 * this.near(e), time: 0.3, from: 2200, to: 500, q: 0.4 });
    });
    sim.on('groundCollapse', () => {
      this.tone({ gain: 1, time: 1.2, from: 55, to: 22, type: 'sine' });
      this.burst({ gain: 0.7, time: 1, from: 400, to: 60, q: 0.5 });
    });
    sim.on('sneezeWindup', () => {
      // "Ah... ah..."
      this.tone({ gain: 0.3, time: 0.3, from: 240, to: 330, type: 'sawtooth' });
      this.tone({ gain: 0.35, time: 0.35, from: 280, to: 420, type: 'sawtooth', delay: 0.4 });
    });
    sim.on('sneeze', () => {
      // "...CHOO."
      this.burst({ gain: 1, time: 0.7, from: 3200, to: 300, q: 0.4 });
      this.tone({ gain: 0.6, time: 0.5, from: 520, to: 90, type: 'sawtooth' });
    });
    sim.on('pieceGrab', () => this.tone({ gain: 0.3, time: 0.25, from: 180, to: 320, type: 'triangle' }));
    sim.on('pieceDrop', (e) => {
      this.tone({ gain: 0.7 * this.near(e), time: 0.5, from: 110, to: 40, type: 'sine' });
      this.burst({ gain: 0.4 * this.near(e), time: 0.35, from: 700, to: 150, q: 0.8 });
    });
    sim.on('piecePlace', (e) => {
      // A clean fit gets a proper chime; a crooked one gets the chime with a sour last note.
      this.tone({ gain: 0.6, time: 0.4, from: 80, to: 50, type: 'sine' });
      this.tone({ gain: 0.3, time: 0.2, from: 523, to: 523, type: 'triangle', delay: 0.05 });
      this.tone({ gain: 0.3, time: 0.2, from: 659, to: 659, type: 'triangle', delay: 0.2 });
      this.tone({ gain: 0.3, time: 0.45, from: e.straight ? 784 : 740, to: e.straight ? 784 : 690, type: 'triangle', delay: 0.35 });
    });
    // The balance gauge wants attention: a rising blip for "mouse up", a falling one for "mouse down".
    sim.on('gaugePrompt', (e) => {
      this.tone({ gain: 0.3, time: 0.14, from: e.up ? 520 : 780, to: e.up ? 780 : 520, type: 'square' });
    });
    sim.on('mainBurst', (e) => {
      this.tone({ gain: 0.8 * this.near(e), time: 0.5, from: 90, to: 40, type: 'sine' });
      this.burst({ gain: 0.8 * this.near(e), time: 2.5, from: 5000, to: 1800, q: 0.3 });
    });
    sim.on('kaijuBow', () => {
      this.tone({ gain: 0.3, time: 0.35, from: 330, to: 262, type: 'triangle' });
      this.tone({ gain: 0.3, time: 0.5, from: 262, to: 196, type: 'triangle', delay: 0.3 });
    });
    sim.on('repairsDone', () => {
      [523, 659, 784, 1047].forEach((f, i) => this.tone({ gain: 0.4, time: i === 3 ? 0.9 : 0.22, from: f, to: f, type: 'triangle', delay: 0.6 + i * 0.2 }));
    });
    sim.on('citizenSquish', (e) => this.tone({ gain: 0.35 * this.near(e), time: 0.16, from: 1500, to: 520, type: 'square' }));
    sim.on('citizenScare', (e) => {
      const now = performance.now();
      if (now - this.lastScream < 260) return;
      this.lastScream = now;
      const f = 900 + Math.random() * 500;
      this.tone({ gain: 0.13 * this.near(e), time: 0.35, from: f, to: f * 1.5, type: 'sawtooth' });
    });
  }

  private wake(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, len);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Call once a frame: applies the volume setting. */
  update(): void {
    if (!this.master) return;
    const a = this.sim.tuning.audio;
    this.master.gain.value = a.muted ? 0 : a.volume;
  }

  /** Quieter the farther from the kaiju it happened. */
  private near(at: { x: number; z: number }): number {
    if (!this.kaiju) return 1;
    const p = this.kaiju.visual.position;
    return 1 / (1 + Math.hypot(at.x - p.x, at.z - p.z) / 70);
  }

  private envelope(gain: number, time: number, delay: number): GainNode | null {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return null;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + time);
    g.connect(this.master);
    return g;
  }

  /** A pitched blip that glides from one frequency to another. */
  private tone(o: { gain: number; time: number; from: number; to: number; type: OscillatorType; delay?: number }): void {
    const env = this.envelope(o.gain, o.time, o.delay ?? 0);
    if (!env || !this.ctx) return;
    const t = this.ctx.currentTime + (o.delay ?? 0);
    const osc = this.ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.from, t);
    osc.frequency.exponentialRampToValueAtTime(o.to, t + o.time);
    osc.connect(env);
    osc.start(t);
    osc.stop(t + o.time + 0.05);
  }

  /** A burst of filtered noise, its tone sweeping from one frequency to another. */
  private burst(o: { gain: number; time: number; from: number; to: number; q: number }): void {
    const env = this.envelope(o.gain, o.time, 0);
    if (!env || !this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loopStart = Math.random() * 0.5;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = o.q;
    filter.frequency.setValueAtTime(o.from, t);
    filter.frequency.exponentialRampToValueAtTime(o.to, t + o.time);
    src.connect(filter);
    filter.connect(env);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.time + 0.05);
  }
}
