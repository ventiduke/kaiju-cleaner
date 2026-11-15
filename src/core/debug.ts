import GUI from 'lil-gui';
import type { SessionRecorder } from './session';
import {
  applyFeel,
  applySize,
  codeDefaults,
  deletePreset,
  feelLabels,
  listPresets,
  loadPreset,
  makeTuning,
  mergeTuning,
  ranges,
  restartKeys,
  savePreset,
  stashForRestart,
  type Tuning,
  type TuningGroup,
} from './tuning';

export interface PanelOptions {
  scene: string;
  scenes: string[];
  recorder: SessionRecorder;
  /** Opens the note box. */
  addNote: () => void;
  toast: (text: string) => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard blocked (no focus, insecure context): fall back to a box they can copy from.
    window.prompt('Copy this:', text);
    return false;
  }
}

function download(name: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * The tuning panel. Up top: six feel dials and the feedback buttons.
 * Everything else lives under Advanced.
 */
export function buildTuningGui(tuning: Tuning, opts: PanelOptions): GUI {
  const gui = new GUI({ title: 'Kaiju Cleaners', width: 330 });
  const { recorder } = opts;
  const changed = () => recorder.tuningChanged();

  const restart = () => {
    stashForRestart(tuning);
    location.reload();
  };

  // --- Feel: the short list ---
  const feel = gui.addFolder('Feel');
  const feelRanges = ranges.feel!;
  for (const key of Object.keys(tuning.feel) as (keyof Tuning['feel'])[]) {
    const r = feelRanges[key]!;
    feel
      .add(tuning.feel, key, r[0], r[1], r[2])
      .name(feelLabels[key])
      .onChange(() => {
        applyFeel(tuning);
        // Show the detailed numbers moving, so it is clear what each dial drives.
        for (const c of advanced.controllersRecursive()) c.updateDisplay();
        changed();
      });
  }

  // Size is one dial too: it scales body, legs and tail together (and needs a restart to rebuild them).
  const sizing = { size: tuning.kaiju.size };
  feel
    .add(sizing, 'size', 0.3, 1.5, 0.01)
    .name('size  (1 = the old giant)  ⟳')
    .onFinishChange((v: number) => {
      applySize(tuning, v);
      for (const c of advanced.controllersRecursive()) c.updateDisplay();
      changed();
      opts.toast('Size changed: press "restart scene" to rebuild the kaiju at its new size.');
    });

  // The runner (style 4) is a different body with its own short list.
  const runnerFolder = gui.addFolder('Runner  (style 4)');
  const runnerRanges = ranges.runner as Record<string, [number, number, number]>;
  const runnerLabels: Partial<Record<keyof Tuning['runner'], string>> = {
    speed: 'run speed  (m/s)',
    sprint: 'sprint speed  (m/s)',
    accel: 'secs to get going',
    stop: 'secs to stop',
    turn: 'turning: standing  (rad/s)',
    turnFast: 'turning: at a sprint',
    grip: 'grip  (less: more drift)',
    lean: 'lean into turns',
    jump: 'jump height  (m)',
    slideBoost: 'slide: kick at the start',
    slideFriction: 'slide: how fast it slows',
    cadence: 'strides a second',
    tail: 'tail: how tightly it follows',
    camDistance: 'camera distance',
    camFollow: 'camera swings behind  (0: never)',
    sensitivity: 'mouse sensitivity',
  };
  for (const key of Object.keys(runnerLabels) as (keyof Tuning['runner'])[]) {
    const r = runnerRanges[key];
    runnerFolder.add(tuning.runner, key, r[0], r[1], r[2]).name(runnerLabels[key]!).onChange(changed);
  }
  if (tuning.move.controller === 1) feel.close();
  else runnerFolder.close();

  // --- Feedback ---
  const actions = {
    note: opts.addNote,
    copy: async () => {
      const ok = await copyText(recorder.report());
      if (ok) opts.toast('Copied. Paste it into the chat with Claude.');
    },
    save: () => {
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
      download(`kaiju-session-${stamp}.json`, JSON.stringify(recorder.file()));
      opts.toast('Session file saved. Attach it to the chat, or add it to feedback/ in the repo.');
    },
    reset: () => {
      mergeTuning(tuning as never, makeTuning());
      restart();
    },
    restart,
    scene: opts.scene,
  };
  const feedback = gui.addFolder('Feedback for Claude');
  feedback.add(actions, 'note').name('add a note  (N)');
  feedback.add(actions, 'copy').name('copy settings + notes');
  feedback.add(actions, 'save').name('save full session file');

  gui
    .add(actions, 'scene', opts.scenes)
    .name('scene')
    .onChange((s: string) => {
      const url = new URL(location.href);
      url.searchParams.set('scene', s);
      stashForRestart(tuning);
      location.href = url.toString();
    });
  gui.add(actions, 'restart').name('⟳ restart scene');
  gui.add(actions, 'reset').name('reset everything to defaults');

  // --- Advanced: every number ---
  const advanced = gui.addFolder('Advanced').close();

  const session = {
    preset: '',
    name: 'my-feel',
    save: () => {
      savePreset(session.name, tuning);
      refreshPresets();
    },
    load: () => {
      const p = loadPreset(session.preset);
      if (!p) return;
      mergeTuning(tuning as never, p);
      restart();
    },
    remove: () => {
      deletePreset(session.preset);
      refreshPresets();
    },
    copyJson: () => void copyText(JSON.stringify(tuning, null, 2)),
    importJson: () => {
      const raw = window.prompt('Paste tuning JSON (a full export, or just the changed values):');
      if (!raw) return;
      try {
        mergeTuning(tuning as never, makeTuning(JSON.parse(raw)));
        restart();
      } catch (err) {
        window.alert('Not valid JSON: ' + err);
      }
    },
  };
  const presets = advanced.addFolder('Presets').close();
  presets.add(session, 'name').name('name');
  presets.add(session, 'save').name('save preset');
  let presetList = presets.add(session, 'preset', listPresets()).name('saved');
  const loadBtn = presets.add(session, 'load').name('load selected');
  const refreshPresets = () => {
    const names = listPresets();
    session.preset = names.includes(session.preset) ? session.preset : (names[0] ?? '');
    presetList = presetList.options(names).name('saved');
    // lil-gui appends the rebuilt controller at the end; keep it above the load button.
    loadBtn.domElement.before(presetList.domElement);
  };
  refreshPresets();
  presets.add(session, 'remove').name('delete selected');
  presets.add(session, 'copyJson').name('copy all settings as JSON');
  presets.add(session, 'importJson').name('import JSON');

  for (const group of Object.keys(codeDefaults) as TuningGroup[]) {
    if (group === 'feel') continue;
    const folder = advanced.addFolder(group).close();
    const values = tuning[group] as Record<string, number | boolean>;
    const groupRanges = (ranges[group] ?? {}) as Record<string, [number, number, number]>;
    const needsRestart = restartKeys[group];
    for (const key of Object.keys(values)) {
      const label = needsRestart === 'all' || needsRestart?.includes(key) ? `${key} ⟳` : key;
      const v = values[key];
      const c =
        typeof v === 'number'
          ? folder.add(
              values,
              key,
              ...(groupRanges[key] ?? [0, Math.max(1, Math.abs(v) * 4), Math.abs(v) / 100 || 0.01]),
            )
          : folder.add(values, key);
      c.name(label).onChange(changed);
    }
  }
  return gui;
}

/** Small text HUD in the corner. */
export class Hud {
  private el = document.getElementById('hud')!;
  private frames = 0;
  private since = performance.now();
  private fps = 0;
  private stepMs = 0;

  frame(stepMs: number): void {
    this.frames++;
    this.stepMs = Math.max(this.stepMs * 0.95, stepMs);
  }

  /** Refreshes the text a few times a second. `lines` supplies the game-specific rows. */
  update(lines: () => string[]): void {
    const now = performance.now();
    if (now - this.since < 250) return;
    this.fps = (this.frames * 1000) / (now - this.since);
    this.frames = 0;
    this.since = now;
    this.el.textContent = [`${this.fps.toFixed(0)} fps   physics ${this.stepMs.toFixed(1)} ms`, ...lines()].join('\n');
  }
}

/** A line of text that fades after a few seconds. */
export function makeToast(): (text: string) => void {
  const el = document.getElementById('toast')!;
  let timer = 0;
  return (text) => {
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(timer);
    timer = window.setTimeout(() => (el.style.opacity = '0'), 3500);
  };
}

/** The note box: pauses the game while you type, Enter saves, Escape cancels. */
export function makeNoteBox(onOpen: () => void, onClose: (text: string | null) => void): () => void {
  const wrap = document.getElementById('note')!;
  const input = wrap.querySelector('input')!;
  const close = (text: string | null) => {
    wrap.style.display = 'none';
    input.blur();
    onClose(text);
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') close(input.value.trim() || null);
    else if (e.key === 'Escape') close(null);
  });
  return () => {
    onOpen();
    input.value = '';
    wrap.style.display = 'block';
    input.focus();
  };
}
