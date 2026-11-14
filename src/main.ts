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
  /** The balance dial, shown while carrying. */
  const drawBalance = () => {
    const held = pieces?.held;
    balance.style.display = held ? 'block' : 'none';
    if (!held || !pieces) return;
    const c = balanceCtx;
    const R = 56;
    c.clearRect(0, 0, 140, 140);
    c.translate(70, 70);
    c.fillStyle = 'rgba(20,24,32,0.55)';
    c.beginPath();
    c.arc(0, 0, R + 8, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.stroke();
    // The ring is the hands; the dot is where they need to be. Ring on the dot holds the load
    // steady, ring past the dot rights it.
    const share = held.tilt / tuning.carry.dropAngle;
    c.fillStyle = share > 0.7 ? '#ff5544' : share > 0.4 ? '#ffd23f' : '#7dff9a';
    c.beginPath();
    c.arc(pieces.needed.x * R, -pieces.needed.z * R, 8, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(pieces.hand.x * R, -pieces.hand.z * R, 13, 0, Math.PI * 2);
    c.stroke();
    c.setTransform(1, 0, 0, 1, 0, 0);
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
  freeCam.onDrag = (dx, dy) => followCam?.drag(dx, dy);
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

  const input = new InputManager(sim.players);
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
    'W/S run   A/D turn   Shift: tiptoe   Space: crouch      going over? steer into the fall to save it',
    'hold E: pick up / carry, keep the hands under it with the mouse (or IJKL); let go over its marker to place',
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
      drawBalance();
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
                  (pieces.held ? '   CARRYING: keep the hands under it' : pieces.nearest() ? '   hold E to pick up' : ''),
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
