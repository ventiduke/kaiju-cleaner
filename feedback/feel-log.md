# Feel log

One line per change to how the game handles or scores, newest first: what moved, from what to what, and
why, in the playtester's words where there are any. Settings pasted from the in-game panel go here too.

| When | What | From → to | Why |
| --- | --- | --- | --- |
| 15 Nov 2026 | city streets: side / avenue / boulevard | 14 / 22 / 38 m → 24 / 30 / 44 m | "The city is also maybe a little too narrow streets." Course bot, careful: an 18 m street cost 10 buildings, a 26 m one cost 1. |
| 15 Nov 2026 | `tail.wrecks` | 1 → 0 | Course bot: the tail did about half the damage (33 buildings against 18, same careful run), from behind the player. It still knocks cars, people and loose lumps about, and passes through walls rather than snagging on them. |
| 15 Nov 2026 | lean from its own acceleration | all of it → `18 / acceleration` of it | Course bot: the quick styles stumbled on a straight road just from setting off (Wild: 56 stumbles in one careful run). |
| 15 Nov 2026 | default movement | Lumbering (speed 32, pickup 2.1, turning 2, grip 35.5, wobble 0.77, balance 0.75) → Steady (40, 0.8, 2.9, 62, 0.32, 0.8) | "movement is OK, but not fun. It feels very sluggish." Three styles to try, on keys 1, 2, 3; the old values are style 1. |
| 15 Nov 2026 | steering | tank only → by the screen (X switches) | "more normal movement rules" |
| 15 Nov 2026 | new moves | none → leap (Space) and belly-slide (C at a run) in the Wild style | "really fast and cool movement, like slides, jumps" |
| 15 Nov 2026 | approval: jobs / crooked / buildings / people | 14 each (uncapped) → 50 shared; 8 → 60% of a job; −1.2 → −0.45; −1 → −0.2 | Playtest bot: a careful, complete nine-job shift scored 0%. Set so that run lands near the middle (47%). |
| 15 Nov 2026 | placed pieces | knocked off at once → shrug off knocks for 4 s | Playtest bot: a tower top was knocked off one second after being set, turning to leave. |
| 15 Nov 2026 | bridge span | fitted along the bridge → fitted from the side | Playtest bot: it could only be fitted by standing where the bridge is. |
| 15 Nov 2026 | river current while carrying | full → 45% | Playtest bot: the bridge span took several times longer than any other job, and in one city could not be fitted at all. |
| 15 Nov 2026 | planted feet in the river | drift with the current → brace against it (15%) | Playtest bot: could not hold still to line the span up. |
| 15 Nov 2026 | `sneeze.dust` | 0.012 → 0.03 | "Sneeze meter needs to fill up faster." |
| 15 Nov 2026 | carrying | two-dot dial, hold to carry → click to hold, one up/down gauge at the side | "The skill check on carrying is still too distracting." |
| 14 Nov 2026 | `feel` (speed, pickup, grip, wobble, balance) | 24, 1.7, 34, 0.5, 0.5 → 32, 2.1, 35.5, 0.77, 0.75 | "these settings are feeling a little better" |
