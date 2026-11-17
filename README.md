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
- `?scene=course`: the movement test course: a timed kilometre of streets of different widths, with skybridges
  to get under and thin ground to step lightly over. The tuning dials are open beside it.
- `?scene=run`: the Runner's course: a sprint, three low walls to jump, towers to weave round and three low
  bridges to slide under. It opens in the Runner mode.
- `?scene=yard`: a flat practice ground with three test buildings, one of each repair job and one of each hazard.
- `?scene=plane`: nothing but ground, for judging movement on its own.

## Controls

| Action | Keyboard / mouse | Gamepad |
| --- | --- | --- |
| Run: the kaiju turns to go the way you point on the screen | W A S D | Left stick |
| Look: the mouse turns the view | Click the game (or Tab) to capture the mouse; Esc or Tab frees it | Right stick |
| Sprint | Hold Shift | Right trigger |
| Jump (hold for height) | Space | A |
| Crouch, for getting under skybridges and stepping lightly. On the move: a slide | C (toggles) | B |
| Take hold of a repair piece; let go of it | Click (or E); click again | X or right bumper |
| Catch a slipping load, or heave a toppled one, on the bar | Space, as the marker crosses the green | A |
| Line a held piece up: the kaiju faces where you look, and steps forward, back and sideways | Mouse; W A S D | Right stick; left stick |
| Plant your feet while holding: a wider green | C | B |
| Bow (say sorry to the people you just frightened) | V | Left bumper |
| The older, balancing styles (Lumbering, Steady, Wild), and back to the Runner | 1 / 2 / 3, and 4 | |
| In the balancing styles: tiptoe; crawl; steer by the screen or like a tank | Hold Shift; hold C; X | |
| Look around, raise or lower the view | Drag the mouse, or Q / Z | Right stick left / right |
| Zoom | Mouse wheel | |
| Reset the view | Double-click | |
| Time of day (late afternoon, dusk, night, morning, noon) | T | |
| Show all controls | H | |
| Tuning and feedback panel, debug readout | ` (backquote) | |
| Note for Claude | N | |
| Sound on / off | M | |
| Free camera on / off | \\ | |
| Throw a debug ball at the cursor | B (or click, in the free camera) | |

**A shift.** The game opens on a briefing: today's jobs, and the keys. The job list (top right) shows each
job and how far off it is; the map (bottom right) and the arrows at the edge of the screen point at them.
Whenever the city's opinion moves, the reason floats up from where it happened. When the last job is done
there is a report card, and "next shift" builds a new city.

A bar at the bottom of the screen shows what the kaiju is doing (crouched, sliding) and dust building toward
a sneeze. The bar at the top is what the city thinks of it.

**Staying upright** (the balancing styles only; the Runner does not fall). Fast and sharp tips it over: hold a hard turn at speed and it stumbles, then starts to
go. Let go at the stumble and it rights itself. Once it is going over there is a short window to save it by
steering into the fall (toppling right, steer right). If it does go down, mashing a direction scrambles it
up sooner.

**Repair jobs.** Tower tops are sitting in the road, a bridge is missing a span, and the clock tower in the
plaza has gone over. Each has a coloured marker, and a matching marker floats over where it belongs. Stand
facing a piece and click: the kaiju takes hold, and keeps hold until you click again.

**Keeping hold.** A load works loose in the hands: slowly when it is carried gently, quickly when it is
thrown about (hard starts and stops, sharp turns, clipping a building). A thin strip above the load shows
the grip draining. When it starts to slip, a bar comes up there with a marker running back and forth and a
green zone in the middle, and it ticks each time the marker crosses the green. Press **Space** in the green
and the kaiju takes a firm hold again; dead centre is a better hold still. A press outside the green is a
fumble and costs grip. Do nothing and the load is on the ground in about three seconds. The green is wider
standing still, and widest with feet planted (C).

While it is carrying, the kaiju faces where you are looking, so the mouse swings the load round and W A S D
step it forward, back and sideways without turning away. Carried pieces are let go over their marker. The piece squares itself up as it gets there, so only two
things decide the fit: how close to the mark it is, and whether the hold is firm. Within a metre is a
**perfect fit**, within about two and a half is straight, anything else in reach is crooked (and visibly
so), and a slipping load always goes in crooked. The label above the load says which it would be before
you click. The clock tower is stood up where it lies: the kaiju plants its feet and the same bar comes up;
every press in the green is a heave, five good ones stand it up, and a fumble lets it sag.

Each job also has a time, counted from taking hold (shown beside the job and above the load). Set right
inside it, the job is **quick work**.

A **bus on a roof** is lifted down and set on the crossroads marked for it, the same way. A **blocked road** is a taped-off stretch buried in lumps of rubble: get them off it however you
like, by shouldering through, kicking, a sweep of the tail, or a sneeze aimed down the street.

**Approval.** The city starts undecided (50%). Repairs raise it: straight ones, with no damage done, take it
to 86%. A crooked one earns 60% of a straight one, a perfect fit a quarter more, and quick work 15% more
again, so 100% takes every job perfect, quick and clean. Knocked-about buildings and squashed people lower it. Bowing (V) wins back people who are running from the
kaiju at that moment, up to a point. When the last repair goes in, the banner gives the verdict.

**Hazards.**

- Oil (dark, glossy patches): no grip. The Runner cannot turn or stop on it; the balancing styles go over.
- Weak ground (pale, cracked patches): a heavy step brings it down and shakes loose the buildings around.
  Crouched (or on tiptoe, in the balancing styles) it is light enough to cross.
- Water mains (blue covers in the road): a heavy step bursts one. The geyser throws about whatever is on
  it, staggers the kaiju, and leaves the road slippery until it dries. Standing in the spray does wash
  the dust out of its nose. Tiptoe is light enough to cross.
- Dust: every chunk that breaks nearby tickles its nose. When the bar fills it sneezes, which throws it
  backwards and blasts everything in front of it. There is no holding it in: the "ah... ah..." is about a
  second in which to point it somewhere harmless, or at a blocked road. Afterwards its nose is clear for a
  while, so one sneeze's wreckage does not bring on the next.
- The river: 13 m deep with a current. It pushes the kaiju downstream as it wades, and carries floating
  rubble out of the city. The road bridges stand on piers and will not take a kaiju.

**The city.** Buildings are built four ways: plain blocks, brickwork, small blocks, and interlocking slabs,
columns and L-shapes. Most loose pieces crumble to dust and a little rubble at their first hard knock; the
sturdy rest stay as lumps. A foot landing on rubble crushes the weak bits and stands on the sturdy ones.
The townsfolk run from a stomping kaiju (less from one on tiptoe), cheer a repair, and leave a colourful
splat if stepped on or sent flying into a wall.

## Finding the fun: styles and the test course

The game ships as the **Runner** (below). The three styles it started with are still there to switch to
while playing (keys 1, 2, 3; 4 goes back), each a setting of the six feel dials plus which extra moves it has:

- **Lumbering**: heavy, wobbly, slow to answer.
- **Steady**: moving within half a second, corners cleanly, still falls if you hold a hard turn.
- **Wild**: fast, with a leap (Space) that comes down hard enough to shake buildings loose, and a
  belly-slide (C at a run) that goes under a skybridge without stopping.

The **Runner** (key 4, and what the game opens as) is not a setting of those dials but a different body: a
third-person animal. Click the game (or press Tab) to capture the mouse; Esc or Tab frees it, and the game
lets go of it by itself when a run ends or the dials are opened. The mouse turns the view; W A S D mean "that way on
the screen", and the kaiju turns to go there (left alone, the view swings round behind it, so holding A or D
carries it round in an arc). Shift sprints, Space jumps (hold it for height), and C toggles a crouch.

It carries its weight. It takes a moment to get going and runs on a few strides when let go. It turns on an
arc that widens with speed, leaning into it; turned harder than its feet can hold, it drifts, and asked for
the opposite way at a sprint it digs in, skids, comes about and launches. C on the move is a slide: it throws
itself flat on its belly, tail up, and rides its speed down (Space leaps out of it). Its legs run a real
stride, with both feet off the ground between steps at speed; its head looks where it is going and stays level
while the body pitches under it; its tail streams out behind and swings wide in a turn. It never wobbles or
falls. Its numbers are in the panel's Runner folder (grip is the one that sets how much it drifts), and it has
a course of its own (`?scene=run`).

The kaiju's size is one dial (in the Feel folder; it needs "restart scene"). Legs, feet and stride follow
the body, and skybridges are hung to suit.

The test course (`?scene=course`, or the button on the briefing) is where to judge them. It times each leg
and counts what was broken on it; the score is the time plus two seconds a building and three a fall, so
a fast run only wins if the street is still standing. The finish card keeps a list of your runs and has a
button that copies the results and the settings that made them. `npm run course` drives the same course with
a bot on every style, which is how a change to the handling is checked before a person tries it.

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
