import * as THREE from 'three';
import type { Damage } from './city/damage';
import type { ChunkField } from './city/destruction';
import type { BallTool } from './core/ball';
import { buildTuningGui, Hud, makeNoteBox, makeToast } from './core/debug';
import type { Approval } from './city/approval';
import type { Citizens } from './city/citizens';
import type { Pieces } from './city/pieces';
import { GameAudio } from './core/audio';
import { FreeCamera } from './core/freeCamera';
import { InputManager } from './core/input';
import { FEEDBACK, TIERS } from './core/juice';
import { Loop } from './core/loop';
import { snapshot } from './core/snapshot';
import { setState } from './core/states';
import { initRapier } from './core/physics';
import { BUILD, SessionRecorder } from './core/session';
import { applyStyle, makeTuning, stashForRestart, STYLES, takeRestartStash } from './core/tuning';
import type { CityLayout } from './city/cityGen';
import type { Course } from './city/course';
import { CourseHud } from './ui/courseHud';
import { GameHud } from './ui/gameHud';
import { HOURS, type Look } from './gfx/look';
import { Post } from './gfx/post';
import { FollowCamera } from './kaiju/camera';
import type { Kaiju } from './kaiju/kaiju';
import type { Nose } from './kaiju/nose';
import { createGame, SCENES, type SceneName } from './scenes';

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const requested = params.get('scene') as SceneName | null;
  const sceneName: SceneName = requested && SCENES.includes(requested) ? requested : 'city';

  const R = await initRapier();
  const stash = takeRestartStash();
  const tuning = makeTuning(stash);
  // The runner's course opens as the runner (unless it was restarted as something else on purpose).
  if (sceneName === 'run' && !stash) applyStyle(tuning, 3);
  const sim = createGame(R, sceneName, tuning);

  // The stencil buffer is what lets the kaiju show through buildings as an outline.
  const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  // Graphics quality steps down by itself if the machine cannot keep up: 0 full, 1 fewer pixels, 2 no finishing passes.
  let quality = 0;
  const pixelRatio = () => Math.min(window.devicePixelRatio, quality === 0 ? 1.5 : 1);
  renderer.setPixelRatio(pixelRatio());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.info.autoReset = false;
  // Which graphics chip is drawing this: a headless run draws in software, and its frame rate means nothing.
  const gpuInfo = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
  const gpu: string = gpuInfo ? renderer.getContext().getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
  document.body.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(tuning.camera.fov, 1, 1, 9000);
  const look = sim.parts.look as Look;
  const post = new Post(renderer, sim.scene, camera);
  const freeCam = new FreeCamera(camera, renderer.domElement);
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
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
  let approvalShown = -1;
  const drawApproval = () => {
    if (!approval || !approval.board.total) return;
    const value = Math.round(approval.value);
    if (value === approvalShown) return;
    approvalShown = value;
    approvalBar.style.display = 'flex';
    approvalLabel.textContent = `CITY APPROVAL  ${value}%`;
    approvalFill.style.width = `${value}%`;
    approvalFill.style.background = value >= 60 ? '#7dff9a' : value >= 35 ? '#ffd23f' : '#ff5544';
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
  freeCam.onDrag = (dx, dy) => {
    if (isRunner()) {
      if (document.pointerLockElement !== renderer.domElement) lookWith(dx, dy);
    } else followCam?.drag(dx, dy);
  };
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
  // Steering by the screen needs to know which way the camera and the kaiju are facing.
  const lookDir = new THREE.Vector3();
  const isRunner = () => tuning.move.controller === 1 && follow && !!kaiju;
  const input = new InputManager(
    sim.players,
    () => {
      if (!tuning.move.relative || !follow || !kaiju) return null;
      camera.getWorldDirection(lookDir);
      return { camera: Math.atan2(lookDir.x, lookDir.z), kaiju: kaiju.yaw };
    },
    isRunner,
    () => kaiju?.yaw ?? 0,
    () => tuning.runner.sensitivity,
  );
  // The runner's view: the captured mouse (or a drag) turns it and tips it.
  const canvas = renderer.domElement;
  const lookWith = (dx: number, dy: number) => {
    input.lookBy(dx);
    if (followCam) followCam.pitch = THREE.MathUtils.clamp(followCam.pitch + dy * 0.0022 * tuning.runner.sensitivity, -0.5, 1);
  };
  document.addEventListener('pointermove', (e) => {
    if (document.pointerLockElement === canvas && isRunner()) lookWith(e.movementX, e.movementY);
  });
  freeCam.onClick = (ndc) => {
    // The runner's first click captures the mouse; after that a click is a click.
    if (isRunner() && document.pointerLockElement !== canvas) void canvas.requestPointerLock();
    else if (follow) input.click();
    else throwBall(ndc);
  };

  const hud = new Hud();
  const toast = makeToast();
  let loop: Loop;
  let hudFrame: (dt: number) => void = () => {};
  let gameHud: GameHud | null = null;
  let slow = 0.016;
  const lastDraw = { calls: 0, triangles: 0 };
  let settled = 0;
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
  const gui = buildTuningGui(tuning, { scene: sceneName, scenes: SCENES, recorder, addNote: openNote, toast });
  const hint = document.getElementById('hint')!;
  /** After settings are changed from the keyboard: show the new numbers in the panel, log them, and name the style. */
  const refreshPanel = () => {
    for (const c of gui.controllersRecursive()) c.updateDisplay();
    recorder.tuningChanged();
    hint.textContent =
      `1/2/3/4: movement style (now ${STYLES[tuning.move.style]?.name ?? 'custom'})   ` +
      (tuning.move.controller === 1 ? 'click: capture mouse' : `X: steering (${tuning.move.relative ? 'by screen' : 'tank'})`) +
      '   H: controls   N: note   `: tuning panel';
  };
  refreshPanel();
  // The tuning panel is a dev tool: tucked away until the ` key asks for it.
  document.querySelector('.lil-gui')?.classList.add('dev-tool');

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (digit >= 0) {
      // A whole movement style at a keypress.
      applyStyle(tuning, digit);
      refreshPanel();
      if (!isRunner()) document.exitPointerLock();
      else if (followCam) followCam.pitch = 0;
      toast(`${STYLES[digit].name}: ${STYLES[digit].blurb}` + (isRunner() ? '. Click the game to capture the mouse; Esc frees it.' : ''));
    } else if (e.code === 'KeyX') {
      tuning.move.relative = tuning.move.relative ? 0 : 1;
      refreshPanel();
      toast(tuning.move.relative ? 'Steering: by the screen (the kaiju turns to go where you point)' : 'Steering: tank (A and D turn, W and S drive)');
    } else if (e.code === 'Backslash' && followCam) {
      follow = !follow;
      freeCam.enabled = !follow;
      if (!follow && kaiju) freeCam.target.copy(kaiju.visual.position).setY(8);
    } else if (e.code === 'KeyB') throwBall(mouse);
    else if (e.code === 'KeyN') {
      e.preventDefault();
      openNote();
    } else if (e.code === 'Backquote') document.body.classList.toggle('dev-off');
    else if (e.code === 'KeyH') document.body.classList.toggle('help-off');
    else if (e.code === 'KeyT') {
      // Step to the next time of day worth looking at.
      const at = HOURS.findIndex((h) => Math.abs(h - tuning.gfx.hour) < 0.05);
      tuning.gfx.hour = HOURS[(at + 1) % HOURS.length];
      toast(`Time of day: ${Math.floor(tuning.gfx.hour)}:${String(Math.round((tuning.gfx.hour % 1) * 60)).padStart(2, '0')}`);
    } else if (e.code === 'KeyM') {
      tuning.audio.muted = !tuning.audio.muted;
      toast(tuning.audio.muted ? 'Sound off' : 'Sound on');
    }
  });

  document.getElementById('help')!.textContent = [
    'W/A/S/D move   Shift: tiptoe   C: crawl (at a run, in Wild style: slide)   Space: leap (Wild style)   F: hold breath   V: bow',
    '1 / 2 / 3: movement style (Lumbering, Steady, Wild)   X: steer by the screen, or like a tank',
    '4: Runner, a plain third-person body: mouse looks (click to capture), W A S D move and strafe, Shift sprints, Space jumps, C crouches; C at a sprint slides',
    'CLICK (or E) by a marked piece: take hold; click again over its marker to put it back. C while holding plants your feet.',
    'blocked road: shove, kick, tail-sweep or sneeze the rubble off it.      going over? steer into the fall to save it',
    'mouse drag: look around   wheel: zoom   double-click: reset view   Q/Z: swing   T: time of day',
    'N: note for Claude   M: sound   B: throw ball   \\: free camera   `: tuning and feedback panel   H: hide this',
  ].join('\n');
  document.getElementById('boot')?.remove();

  // Keep the shadow box centred on the action.
  const sun = look.sun;
  const sunOffset = look.sunOffset;

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
      hudFrame(frameDt);
      drawMode();
      look.set(tuning.gfx.hour);
      look.uniforms.uTime.value += frameDt;
      look.uniforms.uCloudCover.value = tuning.gfx.clouds;
      renderer.toneMappingExposure = look.exposure;
      // Keeping up? Judge it on a steady run of frames, not on a hitch.
      if (gameHud?.playing !== false && frameDt < 0.25) {
        slow += (frameDt - slow) * 0.02;
        settled += frameDt;
        if (settled > 5 && slow > 0.03 && quality < 2) {
          quality++;
          settled = 0;
          slow = 0.016;
          renderer.setPixelRatio(pixelRatio());
          resize();
          if (quality === 2) sun.shadow.mapSize.set(2048, 2048), sun.shadow.map?.dispose(), (sun.shadow.map = null);
          toast(quality === 1 ? 'Graphics lowered a notch to keep things smooth.' : 'Graphics lowered again (no bloom) to keep things smooth.');
        }
      }
      if (tuning.gfx.post && quality < 2) post.render(tuning.gfx.bloom * (0.6 + 0.9 * look.uniforms.uLit.value));
      else renderer.render(sim.scene, camera);
      // (Counted over the whole frame, finishing passes included, then cleared for the next.)
      lastDraw.calls = renderer.info.render.calls;
      lastDraw.triangles = renderer.info.render.triangles;
      renderer.info.reset();
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
  // Big impacts hold the game still for a few hundredths of a second (never while a card is up).
  for (const name of Object.keys(FEEDBACK) as (keyof typeof FEEDBACK)[]) {
    const f = FEEDBACK[name]!;
    const seconds = f.stop === false ? 0 : TIERS[f.tier].stop;
    if (seconds > 0) sim.on(name, () => tuning.gfx.hitStop && loop.hitStop.hit(seconds));
  }

  // The game's own HUD: briefing, jobs, map, arrows, verdicts, report card.
  const automated = navigator.webdriver || params.has('nointro');
  gameHud =
    kaiju && approval
      ? new GameHud({
          sim,
          tuning,
          camera,
          kaiju,
          board: approval.board,
          approval,
          damage,
          layout: sim.parts.layout as CityLayout,
          pieces,
          citizens,
          nose,
          intro: (params.has('intro') || !automated) && sceneName === 'city',
          targets: () => {
            const gate = course?.next();
            return gate ? [{ name: gate.name, color: gate.color, done: false, sloppy: false, active: true, x: gate.x, z: gate.z, note: 'next gate' }] : [];
          },
          begin: () => (loop.paused = false),
          restart: (next) => {
            if (next) {
              tuning.city.seed += 1;
              tuning.game.shift += 1;
            }
            stashForRestart(tuning);
            location.reload();
          },
        })
      : null;
  const theHud = gameHud;
  // The test course: its own clock and results, and the tuning panel open from the start.
  const course = sim.parts.course as Course | undefined;
  const restartScene = () => {
    stashForRestart(tuning);
    location.reload();
  };
  const courseHud = course ? new CourseHud(sim, tuning, course, restartScene, toast) : null;
  if (course) document.body.classList.add('panel-on');
  hudFrame = (dt) => {
    theHud?.frame(dt);
    courseHud?.frame();
  };
  loop.start();
  // The briefing holds the game until it is dismissed (one frame is drawn behind it first).
  if (theHud && !theHud.playing) setTimeout(() => !theHud.playing && (loop.paused = true), 60);

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
    hud: gameHud,
    /** What is going on, as plain data (plus what the renderer drew last frame). */
    state: () => ({ ...snapshot(sim), drawn: { calls: lastDraw.calls, triangles: lastDraw.triangles }, quality, gpu }),
    setState: (name: string) => setState(sim, name),
    THREE,
    ready: true,
  };
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('boot');
  if (el) el.textContent = 'Failed to start: ' + err;
});
