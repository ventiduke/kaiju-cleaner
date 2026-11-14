# Kaiju Cleaners

A 3D web game prototype: giant, earnest, clumsy kaiju trying to help clean up a wrecked city without breaking even more of it.

Built with Vite, TypeScript, Three.js and Rapier. Deployed to GitHub Pages on every push to `main`.

## Run it

```sh
npm install
npm run dev        # local dev server
npm test           # headless sim checks (Vitest, no browser needed)
npm run typecheck
npm run build      # production build into dist/
npm run smoke      # boots the build in headless Chromium, screenshots to scripts/out/
```

Scenes are picked with a URL parameter:

- `?scene=city` (default): the 3×3 block city.
- `?scene=yard`: a flat tuning ground with three test buildings and a row of props.
- `?scene=plane`: nothing but ground, for judging movement on its own.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Walk forward / back | W / S | Left stick up / down |
| Turn | A / D | Left stick left / right |
| Look around | Q / E | Right stick |
| Free camera on / off | C | |
| Throw a debug ball | Click | |

In the free camera: drag to orbit, wheel to zoom, right-drag to pan.

## Status

M0 (scaffold), M1 (destructible city), M2 (kaiju movement) and M3 (kaiju in the city) are built. Each has
measurable checks in `test/`; whether the movement is *fun* is a playtest call, made by tuning the sliders.

## How the code is laid out

- `src/sim.ts` is the whole simulation (physics world, scene graph, systems). It has no DOM or WebGL
  dependency, so tests step it directly under Node.
- `src/main.ts` wraps a sim with the renderer, camera, input, HUD and tuning panel.
- `src/core/tuning.ts` holds every tunable. The in-game panel edits them live; values marked ⟳ apply on
  "restart scene". "Copy JSON" output pasted into `src/tuning/defaults.json` becomes the new default feel.
- `src/city/` generates the city as plain data, builds chunked buildings with a support graph, and owns the
  break rules (`destruction.ts`). `src/kaiju/` is the body and balance controller, tail, legs and follow camera.
- `window.__game` exposes the running sim for console poking and the smoke script.
- `node scripts/shot.mjs <scene> <out.png> '<js using g>'` boots a scene headless, runs a snippet against
  `window.__game`, and saves a screenshot. Handy for checking a change without a display.

## One-time GitHub setup

Repo Settings → Pages → Build and deployment → Source: **GitHub Actions**. After that, pushes to `main` deploy
automatically.
