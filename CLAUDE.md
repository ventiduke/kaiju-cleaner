# Kaiju Cleaners: notes for an agent working here

A 3D browser game prototype (Three.js, TypeScript, Rapier, Vite). One human playtester; everything else
is checked by tests, a scripted player, and headless screenshots. `README.md` says what the game is.

## Commands

```sh
npm run typecheck        npm test                 npm run build && npm run smoke
npm run feel [-- file]   # handling numbers; with a session file, the playtester's notes and a replay
npm run playbot [-- <scene> <careful|reckless|idle> <seeds> <difficulty 0-2>]   # a scripted player plays a shift
npm run course [-- [run] <style 0-3> <careful|flatout>]         # a bot drives the test course (or the runner's) on each movement style
node scripts/shots.mjs '<json>'   # named-state screenshots, each with a state dump (needs a build)
node scripts/strip.mjs <name> <scene> '<setup>' [frames] [ticks] [view]   # a filmstrip: a movement, frame by frame
npm run verify:live      # is the deployed site serving this commit, and does it boot?
```

## Rules of the code

- `src/sim.ts` and everything it runs are the simulation: fixed 60 Hz step, seeded randomness
  (`src/core/rng.ts`), no clock, no page. Tests step it under Node; recorded sessions replay exactly.
  `test/pins.test.ts` fails if `Math.random`, `Date.now`, `performance.now`, `document` or `window` turn up
  outside a short allowed list. Effects (sound, particles, camera, HUD) hang off `sim.emit` events.
- Every number a player might want changed lives in `src/core/tuning.ts` with a range; the shipped feel is
  `src/tuning/defaults.json`. Tests run on a fixed reference feel, so shipped values can move freely.
- The kaiju has two bodies (`move.controller`): the balancing one (`Kaiju.preStep`, tuned by the feel dials)
  and the runner (`Kaiju.runnerStep`, tuned by `runner.*`). A change to one should not touch the other.
  They share the model and nothing else: the runner has its own gait (`Legs.stride`), tail (`Tail.follow`),
  camera (`FollowCamera.updateRunner`) and body language (`Kaiju.bodyLanguage`, drawn only, never simulated).
- `src/main.ts` is the only browser shell. `window.__game` exposes `state()`, `setState(name)`, the sim
  and the tuning for scripts.
- Comments say why. No planning documents in the repo; the plan lives in the shared doc the owner keeps.

## Skills (in `.claude/skills/`)

| When | Skill |
| --- | --- |
| The playtester sent notes, settings or a session file; or a tuning value is about to change | `playtest-intake` |
| A job, hazard, the city, scoring or movement changed; "can it be finished?" | `playtest-bot` |
| Anything changed and is about to be called done; screenshots; "why can't I see it" | `verify-change` |
| A new event or interaction; "it feels flat" | `juice-pass` |
| Releasing; "is it live?"; the site looks broken | `ship-it` |

`feedback/pins.json` holds what the playtester likes and dislikes, in their words. Read it before changing
how anything feels. `feedback/feel-log.md` is the history of such changes.

`research/gamedev-survey/` is where these practices came from.
