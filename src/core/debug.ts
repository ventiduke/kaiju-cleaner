import GUI from 'lil-gui';
import {
  codeDefaults,
  deletePreset,
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

/** Builds the lil-gui tuning panel straight from the tuning object. */
export function buildTuningGui(tuning: Tuning, opts: { scene: string; scenes: string[] }): GUI {
  const gui = new GUI({ title: 'Tuning', width: 320 });

  const restart = () => {
    stashForRestart(tuning);
    location.reload();
  };

  const session = {
    scene: opts.scene,
    restart,
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
    copyJson: async () => {
      const json = JSON.stringify(tuning, null, 2);
      try {
        await navigator.clipboard.writeText(json);
      } catch {
        window.prompt('Copy the tuning JSON:', json);
      }
    },
    importJson: () => {
      const raw = window.prompt('Paste tuning JSON:');
      if (!raw) return;
      try {
        mergeTuning(tuning as never, JSON.parse(raw));
        restart();
      } catch (err) {
        window.alert('Not valid JSON: ' + err);
      }
    },
    reset: () => {
      mergeTuning(tuning as never, makeTuning());
      restart();
    },
  };

  gui
    .add(session, 'scene', opts.scenes)
    .name('scene')
    .onChange((s: string) => {
      const url = new URL(location.href);
      url.searchParams.set('scene', s);
      stashForRestart(tuning);
      location.href = url.toString();
    });
  gui.add(session, 'restart').name('⟳ restart scene (applies ⟳ values)');

  const presets = gui.addFolder('Presets').close();
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
  presets.add(session, 'copyJson').name('copy JSON (paste into defaults.json)');
  presets.add(session, 'importJson').name('import JSON');
  presets.add(session, 'reset').name('reset to defaults');

  for (const group of Object.keys(codeDefaults) as TuningGroup[]) {
    const folder = gui.addFolder(group).close();
    const values = tuning[group] as Record<string, number | boolean>;
    const groupRanges = (ranges[group] ?? {}) as Record<string, [number, number, number]>;
    const needsRestart = restartKeys[group];
    for (const key of Object.keys(values)) {
      const label = needsRestart === 'all' || needsRestart?.includes(key) ? `${key} ⟳` : key;
      const v = values[key];
      if (typeof v === 'number') {
        const r = groupRanges[key] ?? [0, Math.max(1, Math.abs(v) * 4), Math.abs(v) / 100 || 0.01];
        folder.add(values, key, r[0], r[1], r[2]).name(label);
      } else {
        folder.add(values, key).name(label);
      }
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
