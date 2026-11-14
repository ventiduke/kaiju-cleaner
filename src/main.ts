import * as THREE from 'three';
import type { Damage } from './city/damage';
import type { ChunkField } from './city/destruction';
import type { BallTool } from './core/ball';
import { buildTuningGui, Hud } from './core/debug';
import { FreeCamera } from './core/freeCamera';
import { InputManager } from './core/input';
import { Loop } from './core/loop';
import { initRapier } from './core/physics';
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

  const renderer = new THREE.WebGLRenderer({ antialias: true });
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
  if (sceneName === 'city') {
    freeCam.distance = 300;
    freeCam.pitch = 0.7;
  }
  const raycaster = new THREE.Raycaster();
  freeCam.onClick = (ndc) => {
    raycaster.setFromCamera(ndc, camera);
    ball.throw(raycaster.ray.origin, raycaster.ray.direction);
  };

  const kaiju = sim.parts.kaiju as Kaiju | undefined;
  const followCam = kaiju ? new FollowCamera(sim, camera, kaiju) : null;
  let follow = !!followCam && params.get('cam') !== 'free';
  freeCam.enabled = !follow;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyC' || !followCam || e.target instanceof HTMLInputElement) return;
    follow = !follow;
    freeCam.enabled = !follow;
    if (!follow && kaiju) freeCam.target.copy(kaiju.visual.position).setY(8);
  });

  const input = new InputManager(sim.players);
  const hud = new Hud();
  buildTuningGui(tuning, { scene: sceneName, scenes: SCENES });
  document.getElementById('help')!.textContent = [
    'W/S walk   A/D turn   Q/E look around   (gamepad: left stick, right stick)',
    'C free camera (drag orbit, wheel zoom, right-drag pan)   click: throw ball',
  ].join('\n');
  document.getElementById('boot')?.remove();

  // Keep the shadow box centred on the action.
  const sun = sim.parts.sun as THREE.DirectionalLight;
  const sunOffset = sun.position.clone();

  const loop = new Loop({
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
      renderer.render(sim.scene, camera);
      hud.frame(sim.lastStepMs);
      hud.update(() => {
        const c = sim.counts();
        const k = kaiju
          ? [
              `kaiju: ${kaiju.state}   ${kaiju.speed.toFixed(1)} m/s   tilt ${((kaiju.tilt * 180) / Math.PI).toFixed(0)}°   ` +
                `stumbles ${kaiju.stumbles}   falls ${kaiju.falls}`,
            ]
          : [];
        return [
          ...k,
          `bodies ${c.bodies}   awake ${c.awake}   debris ${chunks.looseCount}`,
          `damage: ${damage.chunksBroken} chunks   ${damage.propsDisturbed} props   ${damage.buildingsDamaged} buildings`,
        ];
      });
    },
  });
  loop.start();

  // Hook for headless checks and console poking.
  (window as unknown as { __game: unknown }).__game = { sim, tuning, loop, camera, freeCam, followCam, kaiju, THREE, ready: true };
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('boot');
  if (el) el.textContent = 'Failed to start: ' + err;
});
