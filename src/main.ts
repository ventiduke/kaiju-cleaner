import * as THREE from 'three';
import type { BallTool } from './core/ball';
import { buildTuningGui, Hud } from './core/debug';
import { FreeCamera } from './core/freeCamera';
import { InputManager } from './core/input';
import { Loop } from './core/loop';
import { initRapier } from './core/physics';
import { makeTuning, takeRestartStash } from './core/tuning';
import { createGame, SCENES, type SceneName } from './scenes';

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const requested = params.get('scene') as SceneName | null;
  const sceneName: SceneName = requested && SCENES.includes(requested) ? requested : 'yard';

  const R = await initRapier();
  const tuning = makeTuning(takeRestartStash());
  const sim = createGame(R, sceneName, tuning);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  const raycaster = new THREE.Raycaster();
  freeCam.onClick = (ndc) => {
    raycaster.setFromCamera(ndc, camera);
    ball.throw(raycaster.ray.origin, raycaster.ray.direction);
  };

  const input = new InputManager(sim.players);
  const hud = new Hud();
  buildTuningGui(tuning, { scene: sceneName, scenes: SCENES });
  document.getElementById('help')!.textContent = 'drag: orbit   wheel: zoom   right-drag: pan   click: throw ball';
  document.getElementById('boot')?.remove();

  const loop = new Loop({
    step: () => {
      input.update();
      sim.step();
    },
    render: (alpha, frameDt) => {
      sim.render(alpha, frameDt);
      freeCam.update();
      renderer.render(sim.scene, camera);
      hud.frame(sim.lastStepMs);
      hud.update(() => {
        const c = sim.counts();
        return [`bodies ${c.bodies}   awake ${c.awake}`];
      });
    },
  });
  loop.start();

  // Hook for headless checks and console poking.
  (window as unknown as { __game: unknown }).__game = { sim, tuning, loop, camera, freeCam, THREE, ready: true };
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('boot');
  if (el) el.textContent = 'Failed to start: ' + err;
});
