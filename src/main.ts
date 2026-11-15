import * as THREE from 'three';
import type { Damage } from './city/damage';
import type { ChunkField } from './city/destruction';
import type { BallTool } from './core/ball';
import { buildTuningGui, Hud, makeNoteBox, makeToast } from './core/debug';
import { verdict, type Approval } from './city/approval';
import type { Citizens } from './city/citizens';
import type { Pieces } from './city/pieces';
import { GameAudio } from './core/audio';
import { FreeCamera } from './core/freeCamera';
import { InputManager } from './core/input';
import { Loop } from './core/loop';
import { initRapier } from './core/physics';
import { BUILD, SessionRecorder } from './core/session';
import { makeTuning, takeRestartStash } from './core/tuning';
import { FollowCamera } from './kaiju/camera';
import type { Kaiju } from './kaiju/kaiju';
import type { Nose } from './kaiju/nose';
import { createGame, SCENES, type SceneName } from './scenes';

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const requested = params.get('scene') as SceneName | null;
  const sceneName: SceneName = requested && SCENES.includes(requested) ? requested : 'city';

  const R = await initRapier();
  const tuning = makeTuning(takeRestartStash());
  const sim = createGame(R, sceneName, tuning);

  // The stencil buffer is what lets the kaiju show through buildings as an outline.
  const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(tuning.camera.fov, 1, 1, 3000);
  const freeCam = new FreeCamera(camera, renderer.domElement);
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const ball = sim.parts.ball as BallTool;
  const damage = sim.parts.damage as Damage;
  const chunks = sim.parts.chunks as ChunkField;
  const kaiju = sim.parts.kaiju as Kaiju | undefined;
  const citizens = sim.parts.citizens as Citizens | undefined;
  const pieces = sim.parts.pieces as Pieces | undefined;
  const nose = sim.parts.nose as Nose | undefined;
  const gauge = document.getElementById('gauge')!;
  const gaugeCanvas = gauge.querySelector('canvas')!;
  const gaugeCtx = gaugeCanvas.getContext('2d')!;
  const gaugeText = gauge.querySelector('div')!;
  let gaugeSaid = '';
  /**
   * The balance gauge, at the side of the screen while the kaiju has hold of something.
   * One marker, one green band to keep it in, and when it strays a big arrow saying which
   * way to move the mouse. It is meant to be read out of the corner of the eye.
   */
  const drawGauge = () => {
    const held = pieces?.held;
    gauge.style.display = held ? 'flex' : 'none';
    if (!held || !pieces) return;
    const c = gaugeCtx;
    const W = 64;
    const H = 300;
    const top = 16;
    const len = H - 32;
    const tol = tuning.carry.tolerance;
    const out = pieces.prompt !== 0;
    const y = (m: number) => top + ((1 - m) / 2) * len;
    c.clearRect(0, 0, W, H);
    c.fillStyle = out ? (pieces.grip < 0.4 ? 'rgba(170,30,20,0.85)' : 'rgba(150,95,10,0.85)') : 'rgba(20,24,32,0.7)';
    c.beginPath();
    c.roundRect(14, 4, 36, H - 8, 12);
    c.fill();
    // The band to keep it in.
    c.fillStyle = out ? 'rgba(125,255,154,0.45)' : 'rgba(125,255,154,0.85)';
    c.fillRect(18, y(tol), 28, y(-tol) - y(tol));
    // Grip left: a strip down the side that burns away from the top.
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(2, top, 6, len);
    c.fillStyle = pieces.grip > 0.6 ? '#7dff9a' : pieces.grip > 0.3 ? '#ffd23f' : '#ff5544';
    c.fillRect(2, top + len * (1 - Math.max(0, pieces.grip)), 6, len * Math.max(0, pieces.grip));
    // The marker.
    c.fillStyle = '#ffffff';
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(10, y(pieces.marker) - 7, 44, 14, 6);
    c.fill();
    c.stroke();
    const raising = held.state === 'raising';
    const said = out
      ? pieces.prompt > 0
        ? '▲\nMOUSE UP'
        : 'MOUSE DOWN\n▼'
      : raising
        ? `heaving… ${Math.round(pieces.progress * 100)}%`
        : 'steady';
    if (said !== gaugeSaid) {
      gaugeSaid = said;
      gaugeText.textContent = said;
      const hint = document.createElement('small');
      hint.textContent = raising ? 'keep it in the green until it is up   click: let go' : 'click: put down   Space: plant feet';
      gaugeText.appendChild(hint);
    }
    gaugeText.style.color = out ? (pieces.grip < 0.4 ? '#ff8a7a' : '#ffd23f') : '#b9ffc8';
    gaugeText.style.fontSize = out ? '30px' : '18px';
  };

  /** Mode badge and stamina bar: what the kaiju is doing, and how long it can keep it up. */
  const modeBar = document.getElementById('modebar')!;
  const modeLabel = modeBar.querySelector('span')!;
  const modeFill = modeBar.querySelector('i')!;
  const drawMode = () => {
    if (!kaiju) return;
    // The nose takes over the bar when a sneeze is brewing or the breath is being held.
    if (nose && (nose.tickle > 0.25 || nose.holding || nose.windup > 0 || nose.breath < 0.999)) {
      modeBar.style.display = 'flex';
      (modeFill.parentElement as HTMLElement).style.visibility = 'visible';
      if (nose.holding || (nose.breath < 0.999 && nose.tickle <= 0.25)) {
        modeLabel.textContent = nose.holding ? 'HOLDING BREATH' : 'catching breath';
        modeFill.style.width = `${Math.round(nose.breath * 100)}%`;
        modeFill.style.background = nose.breath < 0.3 ? '#ff5544' : '#8fd3ff';
      } else {
        modeLabel.textContent = nose.windup > 0 ? 'AH… AH…' : 'dust in the nose  (hold F to hold your breath)';
        modeFill.style.width = `${Math.round(nose.tickle * 100)}%`;
        modeFill.style.background = nose.tickle > 0.75 ? '#ff5544' : '#ffd23f';
      }
      return;
    }
    const tiring = kaiju.mode === 'tiptoe' || kaiju.toeMeter < 0.999;
    const show = kaiju.mode !== 'normal' || tiring;
    modeBar.style.display = show ? 'flex' : 'none';
    if (!show) return;
    modeLabel.textContent =
      kaiju.mode === 'tiptoe'
        ? 'TIPTOE'
        : kaiju.mode === 'crawl'
          ? 'CRAWLING (no limit)'
          : kaiju.toeLocked
            ? 'calves resting…'
            : 'tiptoe recovering';
    (modeFill.parentElement as HTMLElement).style.visibility = tiring ? 'visible' : 'hidden';
    modeFill.style.width = `${Math.round(kaiju.toeMeter * 100)}%`;
    modeFill.style.background = kaiju.toeLocked ? '#ff5544' : kaiju.toeMeter < 0.3 ? '#ffd23f' : '#7dff9a';
  };

  /** City approval: a bar along the top, and the verdict when the last repair goes in. */
  const approval = sim.parts.approval as Approval | undefined;
  const approvalBar = document.getElementById('approval')!;
  const approvalLabel = approvalBar.querySelector('span')!;
  const approvalFill = approvalBar.querySelector('i')!;
  const banner = document.getElementById('banner')!;
  let approvalShown = -1;
  const drawApproval = () => {
    if (!approval || !pieces?.pieces.length) return;
    const value = Math.round(approval.value);
    if (value === approvalShown) return;
    approvalShown = value;
    approvalBar.style.display = 'flex';
    approvalLabel.textContent = `city approval ${value}%`;
    approvalFill.style.width = `${value}%`;
    approvalFill.style.background = value >= 60 ? '#7dff9a' : value >= 35 ? '#ffd23f' : '#ff5544';
  };
  sim.on('repairsDone', (e) => {
    const t = Math.round(sim.time);
    banner.textContent = `ALL REPAIRS DONE\n${Math.round(e.approval)}% approval`;
    const detail = document.createElement('small');
    detail.textContent =
      `${verdict(e.approval)}\n` +
      `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}   ` +
      `${pieces?.crooked ?? 0} crooked   ${damage.buildingsDamaged} buildings knocked about   ${damage.citizensSquished} people squashed`;
    banner.appendChild(detail);
    banner.style.display = 'block';
    setTimeout(() => (banner.style.display = 'none'), 14000);
  });

  const recorder = sim.add(new SessionRecorder(sim, sceneName, kaiju, damage));
  const audio = new GameAudio(sim, kaiju);
  if (sceneName === 'city') {
    freeCam.distance = 300;
    freeCam.pitch = 0.7;
  }

  // Cameras: follow by default; C switches to a free orbit camera for looking around.
  const followCam = kaiju ? new FollowCamera(sim, camera, kaiju) : null;
  let follow = !!followCam && params.get('cam') !== 'free';
  freeCam.enabled = !follow;
  freeCam.onDrag = (dx, dy) => followCam?.drag(dx, dy);
  freeCam.onWheel = (dy) => followCam?.wheel(dy);
  freeCam.onDoubleClick = () => followCam?.reset();

  // A click takes hold of a piece or lets it go. In the free camera it throws a debug ball
  // where the mouse points instead, as B does anywhere.
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('pointermove', (e) => {
    mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  });
  const throwBall = (ndc: THREE.Vector2) => {
    raycaster.setFromCamera(ndc, camera);
    ball.throw(raycaster.ray.origin, raycaster.ray.direction);
    recorder.ballThrown(raycaster.ray.origin, raycaster.ray.direction);
  };
  const input = new InputManager(sim.players);
  freeCam.onClick = (ndc) => (follow ? input.click() : throwBall(ndc));

  const hud = new Hud();
  const toast = makeToast();
  let loop: Loop;
  const openNote = makeNoteBox(
    () => (loop.paused = true),
    (text) => {
      loop.paused = false;
      if (text) {
        recorder.addNote(text);
        toast(`Note saved (${recorder.notes.length} so far). "copy settings + notes" sends them to Claude.`);
      }
    },
  );
  buildTuningGui(tuning, { scene: sceneName, scenes: SCENES, recorder, addNote: openNote, toast });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'KeyC' && followCam) {
      follow = !follow;
      freeCam.enabled = !follow;
      if (!follow && kaiju) freeCam.target.copy(kaiju.visual.position).setY(8);
    } else if (e.code === 'KeyB') throwBall(mouse);
    else if (e.code === 'KeyN') {
      e.preventDefault();
      openNote();
    } else if (e.code === 'KeyM') {
      tuning.audio.muted = !tuning.audio.muted;
      toast(tuning.audio.muted ? 'Sound off' : 'Sound on');
    }
  });

  document.getElementById('help')!.textContent = [
    'W/S run   A/D turn   Shift: tiptoe   Space: crawl   F: hold breath   V: bow (say sorry)      going over? steer into the fall to save it',
    'CLICK (or E) by a marked piece: pick it up. Click again over its marker to put it back. A toppled one is stood up where it lies.',
    'while holding: watch the gauge on the left and move the mouse up or down when it says so. Space: plant your feet.',
    'mouse drag: look around   wheel: zoom   double-click: reset view   Q/Z: swing',
    'N: note for Claude   M: sound   C: free camera   B: throw ball',
  ].join('\n');
  document.getElementById('boot')?.remove();

  // Keep the shadow box centred on the action.
  const sun = sim.parts.sun as THREE.DirectionalLight;
  const sunOffset = sun.position.clone();

  loop = new Loop({
    step: () => {
      input.update();
      sim.step();
    },
    render: (alpha, frameDt) => {
      sim.render(alpha, frameDt);
      if (follow && followCam) followCam.update(frameDt);
      else freeCam.update();
      sun.position.copy(sunOffset).add(follow && kaiju ? kaiju.visual.position : freeCam.target);
      sun.target.position.copy(sun.position).sub(sunOffset);
      audio.update();
      drawGauge();
      drawApproval();
      drawMode();
      renderer.render(sim.scene, camera);
      hud.frame(sim.lastStepMs);
      hud.update(() => {
        const c = sim.counts();
        const k = kaiju
          ? [
              `kaiju: ${kaiju.state}${kaiju.mode === 'normal' ? '' : ' (' + kaiju.mode + ')'}   ${kaiju.speed.toFixed(1)} m/s   ` +
                `lean ${((kaiju.tilt * 180) / Math.PI).toFixed(0)}°` +
                (kaiju.traction < 0.1 ? '   ON OIL' : kaiju.traction < 0.5 ? '   WET ROAD' : '') +
                (kaiju.wading > 0.05 ? '   wading' : ''),
              `stumbles ${kaiju.stumbles}   saves ${kaiju.saves}   falls ${kaiju.falls}   ` +
                `tiptoe ${'▮'.repeat(Math.round(kaiju.toeMeter * 8)).padEnd(8, '▯')}`,
            ]
          : [];
        return [
          ...k,
          `damage: ${damage.chunksBroken} chunks   ${damage.propsDisturbed} props   ${damage.buildingsDamaged} buildings` +
            (citizens ? `   people: ${citizens.alive} left, ${damage.citizensSquished} squished` : ''),
          ...(pieces && pieces.pieces.length
            ? [
                `repairs: ${pieces.placed}/${pieces.pieces.length}` +
                  (pieces.crooked ? ` (${pieces.crooked} crooked)` : '') +
                  (pieces.held ? '   HOLDING: click to let go' : pieces.nearest() ? '   click (or E) to take hold' : ''),
              ]
            : []),
          `bodies ${c.bodies}   awake ${c.awake}   debris ${chunks.looseCount}   build ${BUILD}`,
        ];
      });
    },
  });
  loop.start();

  // Hook for headless checks and console poking.
  (window as unknown as { __game: unknown }).__game = {
    sim,
    tuning,
    loop,
    camera,
    freeCam,
    followCam,
    kaiju,
    recorder,
    THREE,
    ready: true,
  };
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('boot');
  if (el) el.textContent = 'Failed to start: ' + err;
});
