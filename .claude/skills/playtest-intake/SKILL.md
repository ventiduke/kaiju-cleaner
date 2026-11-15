---
name: playtest-intake
description: Turn a playtester's notes, pasted settings or session file for Kaiju Cleaners into a triaged list of changes, with every "it feels..." complaint restated as something measurable before any code is touched. Use this whenever the user reports on playing the game - "notes:", "feedback", "I played it", a pasted "copy settings + notes" block, a session .json, a screenshot of the settings panel, or remarks like "too floaty", "too distracting", "I like how X feels". Also use it before changing any tuning value. Not for running the game yourself (see playtest-bot) or for checking a change afterwards (see verify-change).
---

# Take in a playtest

The playtester is the only instrument that measures fun, and gets a handful of sessions. Two things waste
them: fixing the wrong reading of a note, and quietly losing something they liked while fixing something
else. This skill is about not doing either.

## 1. Read everything they sent

- A session file: `npm run feel -- feedback/<file>.json` prints their notes with what the kaiju was doing at
  that moment, their run's numbers, how their settings handle in the scripted maneuvers next to the
  defaults, and whether the run replays. Save the file in `feedback/` and commit it.
- Pasted settings: `npm run feel -- <file with the JSON>` gives the same handling comparison.
- A bug they hit ("it grew very long legs"): replay the session to that moment before theorising. The replay
  (`test/feel/replay.ts`) is exact; a regression test that replays the file is the fix's proof.
- Their words, exactly. Keep the quotes.

## 2. The table

Before changing anything, write one row per distinct point and show it:

| # | They said | Kind | Reading | Proposed change | How we will know |
| --- | --- | --- | --- | --- | --- |

**Kind** is one of:

- **BLOCK**: cannot play, or cannot finish (a crash, a job that cannot be done). Fix first.
- **FIX**: a clear defect or a request with one sensible reading.
- **FEEL**: a complaint about how it feels. Needs step 3 before any change.
- **KEEP**: something they like. Goes in `feedback/pins.json` (step 4), never left as a compliment.
- **IDEA**: new scope. Record it; do it only if they asked for it now.

If a note has two plausible readings, say both and pick one in the Reading column, marked as a guess. Ask
only when the readings lead to different work and no default is safe.

## 3. Feel complaints become targets

"More responsive", "less momentum", "too distracting" cannot be tested. Before touching code:

1. Restate it narrowly: which moment, which input, what they expected.
2. Name what is behind it. Handling lives in the six feel dials (`feel.*` in `src/core/tuning.ts`, shipped
   values in `src/tuning/defaults.json`); everything else has a named value in that file.
3. Read the current numbers: `npm run feel` (time to top speed, stopping distance, lean, which turns end
   in a stumble or a fall).
4. Write the target as an observation with a number: "full speed in under 1.8 s (now 2.1)"; "a tapped turn
   at full speed never falls (now: sometimes)"; "nothing to look at except the kaiju while carrying".
5. Change one value. Rerun `npm run feel`. If the number did not move the way the target says, undo it.

One value per change is not caution for its own sake: two changes at once and the next playtest cannot say
which one helped.

## 4. Pins: do not lose what they liked

`feedback/pins.json` holds what the playtester likes ("keep") and dislikes ("avoid") in their own words.
A keep-pin carries the tuning values behind it, or a named outcome. `test/pins.test.ts` fails when a
pinned value moves or a pinned outcome stops being true.

- Every KEEP row adds a pin, with the quote, the date, and the values or outcome.
- Before any change, read the pins. If the change would move one, say so and ask first.
- When they approve a change to a pinned value, update the pin with the new quote. The test going red is
  the reminder, not an obstacle to route around.
- Every "avoid" is a design rule. Check new features against the list (for example: nothing that needs
  watching away from the kaiju while carrying).

## 5. Make the changes

- BLOCK and FIX rows: one commit per row where practical, each verified (see verify-change).
- Tuning changes: add a line to `feedback/feel-log.md` (what, from → to, why in their words).
- If a change affects jobs, hazards or scoring, run the bot (see playtest-bot) before handing back.
- New defaults from their pasted settings go into `src/tuning/defaults.json`; the tests are pinned to a
  fixed reference feel, so they do not need to change.

## 6. Hand back with questions, not "how does it feel?"

Close with what changed against each row number, anything not done and why, and two or three specific
things to try: "Carry a tower top round one corner at full speed: does the bar come up too late to
catch?" Specific questions get specific notes, and the next table is shorter.

The table and its severities, and the keep-pin idea, follow playtest skills reviewed in
`research/gamedev-survey/` (see "playtest-notes intake" and "keep-pins" there).
