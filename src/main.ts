import * as THREE from 'three';
import type { Damage } from './city/damage';
import type { ChunkField } from './city/destruction';
import type { BallTool } from './core/ball';
import { buildTuningGui, Hud, makeNoteBox, makeToast } from './core/debug';
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
  const balance = document.getElementById('balance') as HTMLCanvasElement;
  const balanceCtx = balance.getContext('2d')!;
  /**
   * The balance dial, shown while carrying. The white dot is the load, wandering and being
   * shoved about; the ring is yours and follows the mouse. Keep the ring on the dot.
   * The arc round the rim is how much grip is left.
   */
  const drawBalance = () => {
    const held = pieces?.held;
    balance.style.display = held ? 'block' : 'none';
    if (!held || !pieces) return;
    const c = balanceCtx;
    const R = 62;
    const tol = tuning.carry.tolerance;
    c.clearRect(0, 0, 180, 180);
    c.translate(90, 90);
    c.fillStyle = 'rgba(20,24,32,0.6)';
    c.beginPath();
    c.arc(0, 0, R + 16, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.stroke();
    // Grip: a full ring when firm, burning down to nothing.
    const aligned = pieces.error <= tol;
    c.strokeStyle = pieces.grip > 0.6 ? '#7dff9a' : pieces.grip > 0.3 ? '#ffd23f' : '#ff5544';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(0, 0, R + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, pieces.grip));
    c.stroke();
    // Yours: a ring as wide as the tolerance, so "the dot is inside the ring" means aligned.
    c.strokeStyle = aligned ? '#7dff9a' : '#ffb347';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(pieces.target.x * R, -pieces.target.z * R, Math.max(9, tol * R), 0, Math.PI * 2);
    c.stroke();
    // The load.
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(pieces.sway.x * R, -pieces.sway.z * R, 7, 0, Math.PI * 2);
    c.fill();
    c.setTransform(1, 0, 0, 1, 0, 0);
  };

  /** Mode badge and stamina bar: what the kaiju is doing, and how long it can keep it up. */
  const modeBar = document.getElementById('modebar')!;
  const modeLabel = modeBar.querySelector('span')!;
  const modeFill = modeBar.querySelector('i')!;
  const drawMode = () => {
    if (!kaiju) return;
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
  // Left-drag looks around, unless the left button is busy holding a load; right-drag always does.
  freeCam.onDrag = (dx, dy, button) => {
    if (button === 0 && pieces?.held) return;
    followCam?.drag(dx, dy);
  };
  freeCam.onWheel = (dy) => followCam?.wheel(dy);
  freeCam.onDoubleClick = () => followCam?.reset();

  // Debug ball: click in the free camera, or B anywhere, throws one where the mouse points.
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
  freeCam.onClick = throwBall;

  const input = new InputManager(sim.players, renderer.domElement);
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
    'W/S run   A/D turn   Shift: tiptoe   Space: crawl      going over? steer into the fall to save it',
    'hold LEFT MOUSE (or E) by a piece: carry it. Keep your ring on the white dot with the mouse. Let go over its marker.',
    'mouse drag: look around (right-drag while carrying)   wheel: zoom   double-click: reset view   Q/Z: swing',
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
      drawBalance();
      drawMode();
      renderer.render(sim.scene, camera);
      hud.frame(sim.lastStepMs);
      hud.update(() => {
        const c = sim.counts();
        const k = kaiju
          ? [
              `kaiju: ${kaiju.state}${kaiju.mode === 'normal' ? '' : ' (' + kaiju.mode + ')'}   ${kaiju.speed.toFixed(1)} m/s   ` +
                `lean ${((kaiju.tilt * 180) / Math.PI).toFixed(0)}°` +
                (kaiju.traction < 0.5 ? '   ON OIL' : '') +
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
                  (pieces.held ? '   CARRYING: keep your ring on the dot' : pieces.nearest() ? '   hold left mouse (or E) to pick up' : ''),
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
