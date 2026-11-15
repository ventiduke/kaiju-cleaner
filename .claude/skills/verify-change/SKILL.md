---
name: verify-change
description: Check that a change to Kaiju Cleaners actually works, by reading the game's state before looking at any picture, then taking a declared set of named screenshots. Use this after ANY change to gameplay, HUD, graphics, camera or the kaiju, before saying it is done, and whenever something "should be visible" but is not. Also use it when asked to take screenshots, compare before and after, or check how the game looks. Not for judging whether it is fun (that needs a person: see playtest-intake) or for releasing (see ship-it).
---

# Verify a change

The game can be checked two ways: by asking it what is going on (cheap, exact, never ambiguous) and by
looking at it (slow here, and easy to misread). Most mistakes in this project so far were caught by the
first and would have been missed by the second: a draw-call count that read "1", a repair knocked off a
second after it was set. So read state first, and keep pictures for claims about how something looks.

## The order

Stop at the first step that fails, fix, and start again from the top.

1. `npm run typecheck`
2. The test file nearest the change: `npx vitest run test/<name>.test.ts`. If there is none and the change
   is to behaviour, write one first and watch it fail against the old code.
3. `npm run build && npm run smoke` (boots both scenes in a real browser).
4. **State.** Put the game in the state that shows the change and read it:
   - in a test or script: `setState(sim, name)` then `snapshot(sim)` (`src/core/states.ts`, `src/core/snapshot.ts`)
   - in the browser: `window.__game.setState(name)`, `window.__game.state()`
   - to wait for something, `sim.stepUntil(() => condition, maxSeconds)`, never a guessed number of steps
5. **Pictures**, only if the change is something a player sees. Write the list first (below), then run it.
6. Say what you found, using the words in "Reporting".

## Named states

`src/core/states.ts` holds the places worth looking at (`spawn`, `walking`, `toppled`, `bowing`, `carrying`,
`carrying-prompt`, `raising`, `job-nearby`, `bus-nearby`, `sweep-nearby`, `geyser`, `wrecking`). An unknown
name is an error. If the change needs a state that is not there, add it to that file (and it is tested
automatically by `test/play.test.ts`) rather than scripting it inline: then the next person's screenshot and
your test mean the same thing.

## Declaring the capture set

Decide which shots prove the change before taking any, so that a shot that comes out badly cannot be
quietly dropped. Put them in a JSON list and run them in one go:

```sh
npm run build && node scripts/shots.mjs '[
  {"out":"hud-prompt","scene":"yard","state":"carrying-prompt","code":"h.view(0.9,0,1)"},
  {"out":"look-night","scene":"city","state":"walking","code":"h.hour(22)"}
]'
```

`scripts/captures.json` is the standing set; add to it when a new kind of thing appears. Which shots a
change needs:

| Changed | Shots |
| --- | --- |
| `src/gfx/`, materials, lights | city `walking` at two times of day (17.4 and 22), yard `spawn` |
| `src/ui/`, `index.html` | the HUD state concerned: `carrying-prompt`, `raising`, `job-nearby`; the briefing with `"query":"&intro=1"` |
| `src/kaiju/` | yard `spawn`, `toppled`, `bowing`, from the front: `h.view(2.6,-0.2,0.7)` |
| `src/city/` jobs or hazards | the matching state (`bus-nearby`, `sweep-nearby`, `geyser`) |
| movement, gait, falling | a still is not evidence: step the state forward and take 4 to 6 shots half a second apart |

Each shot writes `scripts/out/<out>.png` and `<out>.json`. **Read the JSON first.** It holds the game state,
`drawn` (draw calls and triangles for the frame), the GPU name, and `picture` (brightness, contrast, detail,
and any `problems`). A blank, black or washed-out frame fails the run without anyone opening it.

Then open each PNG with the Read tool and write one sentence on what it shows. If you cannot say what the
shot proves, it is the wrong shot.

## Rules for headless pictures

- This container draws in software (the JSON says `"software": true`). Never quote a frame rate from here.
  Quote draw calls, triangles and `physics.stepMs`. The city was 378 draw calls when this was written; a
  change that adds a hundred needs a reason.
- Shots take 30 to 60 seconds each. Use `"dpr": 2` only for a picture a person will be sent.
- Do not change the game to make a shot easier or faster. If a state is hard to reach, that is a missing
  named state.
- When something should be on screen and is not, work through `references/cant-see-it.md` before changing code.

## Reporting

End with one of these for each thing you claimed, and the evidence:

- **verified**: with what (test name, state value, shot name)
- **off-target**: it works but is not what was asked; say how
- **broken**: what fails
- **not assessed**: and why (for example "sound: cannot be heard from here", "frame rate: software rendering")

Never leave a check out silently. A person reading "done" assumes everything was checked.

Ideas here come from the survey in `research/gamedev-survey/` (state-before-pixels loops, evidence
manifests and named test states in several three.js and Godot agent toolkits).
