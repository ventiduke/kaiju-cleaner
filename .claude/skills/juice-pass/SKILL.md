---
name: juice-pass
description: Add or review the feedback a moment gives in Kaiju Cleaners - camera shake, hit-stop, particles, sound - by the size of the event, with the restraint rules that stop it turning to noise. Use this whenever a new event, job, hazard or interaction is added; when something "has no weight", "feels flat", "feels floaty" or "I didn't notice it happen"; when adding sounds or particles; and for a feel-polish pass. Not for handling and tuning complaints (see playtest-intake) or for checking the result (see verify-change).
---

# A feedback pass

Feedback tells the player that something happened and how much it mattered. It works when size matches
importance and fails when everything shouts. So every event gets exactly one size, and each size has one
bundle of effects. The table is `src/core/juice.ts`; this skill is how to use and extend it.

## The table

`TIERS` says what each size gets; `FEEDBACK` says which size each event is.

| Size | Camera trauma | Hit-stop | Particles | Sound | Examples |
| --- | --- | --- | --- | --- | --- |
| small | 0.06 | none | none of its own | short, pitch varied ±8% | footstep, a chunk breaking, taking hold |
| medium | 0.25 | 35 ms | a couple of dozen | distinct cue | stumble, a save, dropping a piece, road cleared |
| large | 0.65 | 80 ms | up to 70 | layered cue | a fall, a sneeze, ground giving way, a repair set in place |

`scale` trims the shake for one event. `stop: false` is for big things that are not sudden (a geyser, the
end of a shift): a freeze there reads as a hitch.

## Adding feedback for something new

1. **Emit an event** from the simulation with a position (`sim.emit(name, { x, y, z, ... })`, typed in
   `SimEvents` in `src/sim.ts`). Feedback hangs off events so that the simulation never knows about it.
2. **Give it a size** in `FEEDBACK`. Ask: how often does this happen, and does the player need to know?
   Many times a second is small. A thing the player caused and should notice is medium. A thing they will
   remember is large. When torn between two, take the smaller.
3. That alone gets it camera shake (`src/kaiju/camera.ts`) and, if medium or large and sudden, hit-stop
   (`src/main.ts`). Add the rest by channel:
   - **Sound** in `src/core/audio.ts`. Give anything that repeats `vary: 'small'` so it never sounds like
     one sample. Sound should land on the same frame as the event.
   - **Particles**: dust comes from `chunkBreak`/`chunkCrumble` already (`src/core/dust.ts`); a finished
     job throws confetti (`src/gfx/confetti.ts`). Reuse before inventing.
   - **A word**: if approval moves, the reason floats up from the spot (`approval` event,
     `src/ui/gameHud.ts`). That is the clearest feedback in the game; use it for anything scored.
4. **Run `npx vitest run test/juice.test.ts`**. It holds the rules below.

## Rules, and why

- **The camera shakes, never the kaiju's body.** Shake that moves physics changes the game and breaks replays.
- **Shake is trauma squared, capped at 1, decaying in real time.** Small things barely register and big
  things do; no single event may take the camera to its limit, so two things at once still read as two.
- **Hit-stop never stacks and never exceeds 0.12 s.** A second impact during a hold can lengthen it to its
  own length, not add to it. A collapse is fifty impacts; the game must not freeze.
- **Effects run on real time; the simulation does not.** Hit-stop skips simulation steps; particles, sound
  and the camera keep going. Nothing here may call into the simulation or use its random numbers
  (`test/pins.test.ts` checks the first; decoration keeps its own).
- **Nothing hides the kaiju or the job in hand.** No full-screen flashes; particles are small and short.
- **Common things are quiet.** Footsteps are the commonest event there is and stay small.
- **The player can turn it down.** Shake is `camera.shake`; hit-stop is `gfx.hitStop`. A new kind of effect
  needs its own switch.

## Order of work for "it feels flat"

Check these in order and stop at the first that is wrong, because polish on top of a slow response is wasted:

1. **Response time.** Does the kaiju visibly react within about 0.1 s of the input? Measure it:
   `sim.stepUntil(() => kaiju.speed > 0.5, 2)` after setting thrust.
2. **The motion itself**: acceleration, lean, the fall. That is tuning: see playtest-intake.
3. **Contact**: is there an event at the moment of impact, at the right size?
4. **Camera**, then **sound**, then **particles**.

## Checking it

Feedback is the part of the game least checkable from here. Say so plainly:

- **verified** by test: sizes, caps, timers, that a run with effects replays identically.
- **verified** by picture: that particles appear and do not cover the kaiju (see verify-change; capture the
  moment with a named state and `"wait"` short enough to catch it).
- **not assessed**: anything about how it sounds or feels in the hand. Hand the playtester one question per
  new effect ("does setting a tower top down feel like it landed?").

The tiers, the restraint rules and the order of work follow the game-feel references reviewed in
`research/gamedev-survey/` (which cite Eiserloh's camera-shake talk, "Juice it or lose it" and Swink's
*Game Feel*; those were not read first-hand).
