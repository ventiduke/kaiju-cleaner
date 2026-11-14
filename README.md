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
| Tiptoe: slow, narrow, quiet, until the calves give out | Hold Shift | A or right trigger |
| Crouch: slow, low, hard to tip, tail tucked | Hold Space | B or left trigger |
| Pick up and carry a repair piece | Hold E | Hold X or right bumper |
| Balance what you are carrying | Mouse position (or I J K L) | Right stick |
| Look around, raise or lower the view | Drag the mouse (or Q / Z to swing) | Right stick |
| Zoom | Mouse wheel | |
| Reset the view | Double-click | |
| Note for Claude | N | |
| Sound on / off | M | |
| Free camera on / off | C | |
| Throw a debug ball at the cursor | B (or click, in the free camera) | |

Fast and sharp tips it over: hold a hard turn at speed and it stumbles, then starts to go. Let go at the
stumble and it rights itself. Once it is going over there is a short window to **save it by steering into the
fall** (toppling right, steer right). If it does go down, mashing a direction scrambles it up sooner.

**Repair jobs.** Tower tops are sitting in the road and a bridge is missing a span; each has a coloured
marker, and a matching marker floats over where it belongs. Stand facing a piece and hold E to hoist it. It
balances on the kaiju's hands like a broom on a palm, and a dial appears: the ring is the hands, the dot is
where they need to be. Keep the ring on the dot and the load holds; let the dot pin against the rim and it
slips. Starting, stopping and turning all shove the load, so the kaiju moves more gently with its hands
full. Let go over the marker to set the piece in place: straight if it was lined up, crooked (and visibly so)
if it was not. A placed piece can be knocked off again.

The city is split by a river you can wade (slowly). The road bridges stand on piers and will not take a kaiju.
Dark patches on the roads are oil: no grip at all. The townsfolk run from a stomping kaiju, less so from one on
tiptoe, and a foot landing on one squashes it.

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

M0 (scaffold), M1 (destructible city), M2 (kaiju movement), M3 (kaiju in the city) and M4 (tiptoe, plus crouch)
are built, and have had two rounds of playtest changes. The first repair jobs (carry a piece back, balancing
it on the way) are in; standing a toppled building back up by pushing is not built yet. Each has measurable checks in `test/`; whether the movement is *fun* is a playtest call.

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
