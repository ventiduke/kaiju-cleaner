---
name: playtest-bot
description: Play Kaiju Cleaners with a scripted player and read what happened - which jobs it finished, how long each took, where it got stuck, what it broke, and whether approval came out sensible. Use this whenever a job, hazard, the city generator, scoring, movement or carrying changes; before asking a person to playtest; when asked "can this be finished?", "how long is a shift?", "is the scoring fair?" or "does anything get stuck?"; and to check a new city seed. Not for how the game looks (see verify-change) or for what a person said about it (see playtest-intake).
---

# Playtest with the bot

A person's playtest is the only measure of fun, and it is slow and precious. The bot is for everything a
person should not have to find: jobs that cannot be finished, places a player gets stuck, scores that make
no sense. It is a plodding, literal player on purpose. If it cannot do a job, a first-time player will
struggle too. The first time it was run it found three real problems in ten minutes (see
`feedback/feel-log.md`, 15 Nov 2026).

## Running it

```sh
npm run playbot                      # yard and city, careful and reckless, shipped settings
npm run playbot -- city careful 3    # scene, style, how many city seeds
npm run playbot -- yard idle
```

The city takes about a minute per run to simulate. Styles (`src/bot/playbot.ts`):

- **careful**: keeps to wide streets, fords the river between bridges, eases off for corners, lines pieces
  up, catches a slipping load dead centre on the bar. This is the "competent first-timer".
- **reckless**: straight at everything, flat out; stabs at the bar, and one press in four is a fumble.
- **idle**: never touches the controls. Nothing should finish, break or move.

It drives whichever body the game ships with (the Runner now), and the report has a line for the grip bar
(catches, fumbles, drops) and counts sneezes and perfect fits. Rough targets, from the playtester's notes:
a careful shift finishes every job with one to three sneezes and no more than a drop or two; a reckless
one should score far below it. If "careful" ever stops finishing a city, treat that as a blocker: twice
now it has been a job that could not be done at all (a tower top above the kaiju's reach; a river bank
the Runner stuck to).

## The test course: for anything about how the kaiju moves

```sh
npm run course                  # every movement style, careful and flat out
npm run course -- 1 careful     # one style (0 Lumbering, 1 Steady, 2 Wild), one effort
npm run course -- settings.json # the settings in a file pasted from the game
npm run course -- run           # the runner's course (sprint, hurdles, slalom, low bars); style 3 is the Runner
```

The course (`src/scenes/course.ts`) is a fixed kilometre: a 40 m boulevard, a 26 m avenue with parked cars,
an 18 m squeeze, two sharp corners, skybridges to get under, and thin ground to cross lightly. The report
gives time and damage per leg, so a change in handling shows up as "faster through the chicane, but two
more buildings in the squeeze". The score is time plus a penalty for each building and fall
(`PENALTY` in `src/city/course.ts`).

Use it before and after any change to movement, the feel dials, the styles, the kaiju's size or the tail,
and quote both summaries. (The bot measures whether a body can get round and what it costs. It cannot say
whether a turn looks like a turn: for that, a filmstrip, in verify-change. And it cuts corners: it heads
for the next corner as soon as it is within a few strides of this one, so a body that turns in early can
clip the inside of a narrow street where a faster one runs wide and misses. Read a surprising
"careful is worse than flat out" leg with that in mind before blaming the handling.) What to look for:

- **Careful should beat flat-out on score** for a style that is fun to master: if flat-out always wins,
  care is not being rewarded; if careful is many times better, speed is being punished out of the game.
- **A leg that costs buildings however carefully it is driven** is too tight for the kaiju, or something
  unseen is doing the damage. (The tail was: `tail.wrecks`, see `feedback/feel-log.md`.)
- **Stumbles on the straight** mean the style trips itself up.

The playtester runs the same course by hand and can copy their results from the finish card: compare their
legs with the bot's, and ask about the legs where they differ most.

## Reading the report

```
city (seed 7), careful: finished in 5:02, approval 47%
  jobs 9/9   walked 1932 m   18 stumbles, 1 falls, 0 drops
  damage: 1066 chunks in 51 buildings, 107 people
    x top                    0:13
    ~ span                   1:40          (~ = crooked, ! = gave up)
  stalled at (-86, 0) after 2:41: span (deliver): no progress in 90 s
```

Work through it in this order, because the earlier lines explain the later ones:

1. **BROKEN lines.** Something that must never happen did (kaiju under the ground or in the air, a
   position that is not a number, approval outside 0 to 100, bodies multiplying). Stop and fix; this is a bug.
2. **"gave up" and "DID NOT FINISH" for the careful bot.** A job a careful player cannot finish is a design
   bug until shown otherwise. Go to the place it names, in a test (`moveTo` from `Stage` in
   `src/core/states.ts`) or a screenshot, and find out what a player would have to do there.
3. **Stalls.** The same spot or the same job twice is a real obstacle. One stall in a shift is the bot being
   clumsy.
4. **Times.** A job that takes several times longer than its neighbours is fiddly. A shift far from five
   minutes changes how much there is to do.
5. **Approval, across styles.** Idle must read exactly 50. Careful should land in the middle (roughly 40 to
   75: it is clumsy but it finishes). Reckless should be clearly below careful. If careful is pinned at 0 or
   100, the scale is not telling the player anything: retune `WORTH` in `src/city/approval.ts`, one value at
   a time, and note it in `feedback/feel-log.md`.

Do not tune the game until the bot wins. The bot's own clumsiness (cutting a corner through a building)
is not the game's fault; fix the bot's route instead and say so.

## When the game changes

- **A new kind of job** needs a handler in `PlayBot` (`carry`, `raise` and `clear` are the patterns) and a
  line in the yard, so the fast test covers it. The bot only knows what a player can see: where the job is,
  what is in hand, where the marker is on the bar.
- **A changed job or hazard**: run `npm run playbot -- yard careful` (two seconds) on every change, the city
  before shipping.
- **The tests** in `test/play.test.ts` hold the yard to: careful finishes everything without a fall or a
  drop; idle changes nothing; reckless does worse than careful. They run on the fixed reference feel, so
  they do not move when the shipped feel does. If a change breaks one, decide which is wrong before
  touching the number.

## What to tell the playtester afterwards

The bot's numbers make good questions. Instead of "how does it feel?", ask about what the bot flagged:
"The bridge span took the bot four times as long as a tower top. Did it feel fiddly, or satisfying?"

## Reporting

State the command run, the lines that mattered, what you changed because of them, and what the bot cannot
tell you (whether any of it is fun; anything about sound or looks). A job the bot could not attempt is
"not assessed", not "fine".

The approach (scripted players with numbers, per-step invariants, stall detection) follows several
projects reviewed in `research/gamedev-survey/engines-and-practice.md`.
