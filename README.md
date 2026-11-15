# Kaiju Cleaners

A 3D web game prototype: giant, earnest, clumsy kaiju trying to help clean up a wrecked city without breaking even more of it.

**Play it: https://ventiduke.github.io/kaiju-cleaner/**

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

- `?scene=city` (default): the city, 8×8 blocks either side of a river.
- `?scene=yard`: a flat practice ground with three test buildings, one of each repair job and one of each hazard.
- `?scene=plane`: nothing but ground, for judging movement on its own.

## Controls

| Action | Keyboard / mouse | Gamepad |
| --- | --- | --- |
| Run forward / back | W / S | Left stick up / down |
| Turn | A / D | Left stick left / right |
| Tiptoe: slow, narrow, quiet, until the calves give out | Hold Shift | A or right trigger |
| Crawl on all fours: slow, can't be tipped, fits under skybridges | Hold Space | B or left trigger |
| Take hold of a repair piece; let go of it | Click (or E); click again | X or right bumper |
| Steady what you are holding, when the gauge says so | Move the mouse up or down (or I / K) | Right stick up / down |
| Plant your feet while holding (steadier, but no walking) | Hold Space | B or left trigger |
| Bow (say sorry to the people you just frightened) | V | Left bumper |
| Hold your breath (keeps dust out of the nose) | Hold F | Y |
| Look around, raise or lower the view | Drag the mouse, or Q / Z | Right stick left / right |
| Zoom | Mouse wheel | |
| Reset the view | Double-click | |
| Time of day (late afternoon, dusk, night, morning, noon) | T | |
| Show all controls | H | |
| Tuning and feedback panel, debug readout | ` (backquote) | |
| Note for Claude | N | |
| Sound on / off | M | |
| Free camera on / off | C | |
| Throw a debug ball at the cursor | B (or click, in the free camera) | |

**A shift.** The game opens on a briefing: today's jobs, and the keys. The job list (top right) shows each
job and how far off it is; the map (bottom right) and the arrows at the edge of the screen point at them.
Whenever the city's opinion moves, the reason floats up from where it happened. When the last job is done
there is a report card, and "next shift" builds a new city.

A bar at the bottom of the screen shows what the kaiju is doing and how long it can keep it up: tiptoe
stamina, held breath, or dust building toward a sneeze. The bar at the top is what the city thinks of it.

**Staying upright.** Fast and sharp tips it over: hold a hard turn at speed and it stumbles, then starts to
go. Let go at the stumble and it rights itself. Once it is going over there is a short window to save it by
steering into the fall (toppling right, steer right). If it does go down, mashing a direction scrambles it
up sooner.

**Repair jobs.** Tower tops are sitting in the road, a bridge is missing a span, and the clock tower in the
plaza has gone over. Each has a coloured marker, and a matching marker floats over where it belongs. Stand
facing a piece and click: the kaiju takes hold, and keeps hold until you click again. Tops and the span are
carried to their marker and let go there. The clock tower is stood up where it lies: the kaiju plants its
feet and heaves for a few seconds.

While it has hold of something, a gauge appears at the left of the screen. Most of the time there is nothing
to do. A sudden start, stop or hard turn throws the marker out of the green band, and now and then the load
shifts by itself; the gauge turns amber and says **MOUSE UP** or **MOUSE DOWN** (with a rising or falling
blip). Shove the mouse that way and it comes back; you cannot overdo it. Left alone, the grip (the strip
beside the gauge) burns down and the piece slips. Drive gently and it rarely asks. A piece let go over its
marker goes in straight if it was steady and lined up, crooked (and visibly so) if not.

Two jobs need no carrying skill at all. A **bus on a roof** is lifted down and set on the crossroads marked
for it. A **blocked road** is a taped-off stretch buried in lumps of rubble: get them off it however you
like, by shouldering through, kicking, a sweep of the tail, or a sneeze aimed down the street.

**Approval.** The city starts undecided (50%). Repairs raise it, a straight one more than a crooked one.
Knocked-about buildings and squashed people lower it. Bowing (V) wins back people who are running from the
kaiju at that moment, up to a point. When the last repair goes in, the banner gives the verdict.

**Hazards.**

- Oil (dark, glossy patches): at a run its feet shoot out from under it. Tiptoe or crawl across.
- Weak ground (pale, cracked patches): a heavy step brings it down, trips the kaiju and shakes loose the
  buildings around. Tiptoe is light enough to cross.
- Water mains (blue covers in the road): a heavy step bursts one. The geyser throws about whatever is on
  it, staggers the kaiju, and leaves the road slippery until it dries. Standing in the spray does wash
  the dust out of its nose. Tiptoe is light enough to cross.
- Dust: every chunk that breaks nearby tickles its nose. When the bar fills it sneezes, which throws it
  backwards and blasts everything in front of it. Hold F to hold its breath through the worst of it.
- The river: 13 m deep with a current. It pushes the kaiju downstream as it wades, and carries floating
  rubble out of the city. The road bridges stand on piers and will not take a kaiju.

**The city.** Buildings are built four ways: plain blocks, brickwork, small blocks, and interlocking slabs,
columns and L-shapes. Most loose pieces crumble to dust and a little rubble at their first hard knock; the
sturdy rest stay as lumps. A foot landing on rubble crushes the weak bits and stands on the sturdy ones.
The townsfolk run from a stomping kaiju (less from one on tiptoe), cheer a repair, and leave a colourful
splat if stepped on or sent flying into a wall.

## How it looks

Sky, sun, clouds and stars are drawn by a shader and change with the time of day (`gfx.hour`, or the T key);
the same settings drive the light, the fog and how many windows are lit. Buildings are still plain boxes:
their windows, shopfronts and roofs are painted by the block material (`src/gfx/facade.ts`) on whichever
faces are outside walls, so a broken-open building shows bare concrete inside. The picture is finished with
bloom and a light grade; if the frame rate stays low for five seconds the game lowers the resolution, then
turns those passes off, and says so.

## Tuning the feel

Press **`** for the panel. It opens on six **Feel** dials: speed, pickup, turning, grip, wobble and balance. They drive the
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

## Working on it with an agent

`CLAUDE.md` has the rules of the code and the commands. Five skills in `.claude/skills/` hold the working
practice:

- **playtest-intake**: turns a playtester's notes into a triaged table, restates "it feels..." as a number
  to hit, and pins what they liked (`feedback/pins.json`, guarded by `test/pins.test.ts`).
- **playtest-bot**: `npm run playbot` plays whole shifts with a scripted player (careful, reckless, idle) and
  reports times, stalls, damage and score.
- **verify-change**: read the game's state before looking at a picture; screenshots come from named states
  (`src/core/states.ts`) and each saves a state dump and fails if blank.
- **juice-pass**: feedback by event size (`src/core/juice.ts`), with the rules that keep it from becoming noise.
- **ship-it**: the release checklist, ending with `npm run verify:live`.

They were written from a survey of what people building games with coding agents report works
(`research/gamedev-survey/`).

## Status

M0 (scaffold), M1 (destructible city), M2 (kaiju movement), M3 (kaiju in the city) and M4 (movement modes)
are built, with five rounds of playtest changes, five kinds of job, four hazards, a bow, a score, a
game loop round them (briefing, job list, map, report card, next shift) and a full visual pass. Each has
measurable checks in `test/`; whether it is *fun* is a playtest call.

## How the code is laid out

- `src/sim.ts` is the whole simulation (physics world, scene graph, systems). It has no DOM or WebGL
  dependency, so tests step it directly under Node.
- `src/main.ts` wraps a sim with the renderer, camera, input, HUD and tuning panel.
- `src/core/tuning.ts` holds every tunable. The in-game panel edits them live; values marked ⟳ apply on
  "restart scene". "Copy JSON" output pasted into `src/tuning/defaults.json` becomes the new default feel.
- `src/gfx/` is the look: time of day, sky, building fronts, water, smoke, the town beyond the site, and the
  finishing passes. `src/ui/gameHud.ts` is the game's screen furniture.
- `src/city/` generates the city as plain data, builds chunked buildings with a support graph, and owns the
  break rules (`destruction.ts`). `src/kaiju/` is the body and balance controller, tail, legs and follow camera.
- `window.__game` exposes the running sim for console poking and the smoke script.
- `node scripts/shot.mjs <scene> <out.png> '<js using g>'` boots a scene headless, runs a snippet against
  `window.__game`, and saves a screenshot. Handy for checking a change without a display.

## One-time GitHub setup

Repo Settings → Pages → Build and deployment → Source: **GitHub Actions**. After that, pushes to `main` deploy
automatically.

If Source is left on "Deploy from a branch", GitHub also publishes the raw repository on every push. The
deploy workflow waits for that and publishes the built game after it, but if a build ever fails the raw
source is what stays up, and the page says so instead of loading.
