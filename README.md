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

| Action | Keyboard / mouse | Gamepad |
| --- | --- | --- |
| Run forward / back | W / S | Left stick up / down |
| Turn | A / D | Left stick left / right |
| Look around, raise or lower the view | Drag the mouse (or Q / E to swing) | Right stick |
| Zoom | Mouse wheel | |
| Reset the view | Double-click | |
| Note for Claude | N | |
| Free camera on / off | C | |
| Throw a debug ball at the cursor | B (or click, in the free camera) | |

Fast and sharp tips it over: hold a hard turn at speed and it stumbles, then falls. Let go when it stumbles
and it saves itself. Slow down, or feather the turn, to corner cleanly.

## Tuning the feel

The panel opens on six **Feel** dials: speed, pickup, turning, grip, wobble and balance. They drive the
detailed numbers under **Advanced**, which you can still fine-tune by hand afterwards.

## Giving feedback an agent can use

1. Play. Press **N** whenever something is worth saying; the note is saved with the settings and what the
   kaiju was doing at that moment.
2. Press **copy settings + notes** and paste into the chat. It is a few lines: only the settings you changed,
   your notes, and stats for the run (stumbles, falls, lean, damage).
3. For more detail, **save full session file** and attach it, or commit it to `feedback/`. It also holds your
   inputs, so the run can be replayed.

To read a session file, or to see how any settings handle:

```sh
npm run feel                          # handling numbers for the shipped defaults
npm run feel -- feedback/session.json # your notes, your run, your settings vs the defaults, and a replay
```

The handling numbers come from fixed scripted maneuvers (`test/feel/maneuvers.ts`): time to top speed, lean,
and whether a set of turns at different speeds ends steady, in a stumble, or in a fall.

## Status

M0 (scaffold), M1 (destructible city), M2 (kaiju movement) and M3 (kaiju in the city) are built, and have had one
round of playtest changes. Each has measurable checks in `test/`; whether the movement is *fun* is a playtest call.

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
