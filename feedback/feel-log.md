# Feel log

One line per change to how the game handles or scores, newest first: what moved, from what to what, and
why, in the playtester's words where there are any. Settings pasted from the in-game panel go here too.

| When | What | From → to | Why |
| --- | --- | --- | --- |
| 15 Nov 2026 | the Runner: how it is steered | faces the mouse at once, keys drive and strafe → keys mean "that way on the screen" and it turns to go there; the mouse turns only the view | "Strafing, turning didn't feel like I was actually turning, whereas the original movement did." |
| 15 Nov 2026 | the Runner: weight (`runner.accel`, `stop`, `sprintBuild`, `turn`, `turnFast`, `turnEase`, `grip`, `lean`) | 0.2 s to full speed, 0.16 s to stop, turns at 12 rad/s, no lean → 0.45 s to a run, 0.33 s (5 m) to stop, a sprint builds over another second; turns at 10 rad/s standing down to 3.6 at a sprint; grip 90 m/s² (a quarter turn runs 7 m wide at a run, 17 m at a sprint, with a drift); leans up to 0.5 rad | "Movement felt a little lifeless... kinda blocky... maybe we incorporate some of the 'drag' or 'momentum' into the WASD control style?" |
| 15 Nov 2026 | the Runner: slide (`slideFrom`, `slideBoost`, `slideFriction`) | from 90% of run speed, same pose as the crouch with the legs walking → from half run speed; flat on its belly, legs trailing, tail up, dust, its own sound and HUD label; 1.1 s and 30 m from a run, 2.1 s and 75 m from a sprint; Space leaps out of it | "Sliding didn't work." It was starting (checked with real key presses); it could not be told from a crouch. |
| 15 Nov 2026 | the Runner: tail (`runner.tail`) | the balancing body's loose chain → led, each part on its own spring | "Tail movement is off, it pretty much just spins around the character." After a quarter turn at a run the tip went right round the body and took 3.8 s to settle; now at most 1.0 rad off, settled in 0.6 s. |
| 15 Nov 2026 | the Runner: legs (`runner.cadence`) | the balancing body's catch-up shuffle (six steps a second at a sprint) → a stride, 2.5 steps a second at a run and 3 at a sprint, both feet off the ground between steps | "best in class third person animal movement" |
| 15 Nov 2026 | the Runner: jump | fixed height → hold for 9 m, tap for 3 m; a press just before landing counts | same |
| 15 Nov 2026 | the Runner: camera (`runner.camFollow`) | rigid behind → a moment behind the kaiju, wider and farther back at a sprint, tips into turns, swings round behind it at 0.8 rad/s when the mouse is still; framed so its feet and tail are in the picture | same |
| 15 Nov 2026 | new body: the Runner (key 4, `move.controller` 1) | none → mouse look, strafe, sprint, jump, crouch toggle, slide | "Mouse controls look, WASD movement (forward, back, strafe), crouch toggle, and actual slide... completely different genre/styles of movements" |
| 15 Nov 2026 | kaiju size (`kaiju.size`) | 1 (39 m tall) → 0.54 (21 m) | "the size of the kaiju I had above was feeling better" |
| 15 Nov 2026 | legs, feet, stance, stride | fixed sizes → in proportion to the body | "the legs looked off, not sure how to adjust" |
| 15 Nov 2026 | tail: `wrecks`, `wreckSpeed`, `bite` | smashes whatever it touches → only what it hits faster than 38 m/s, three chunks a swing | "The tail should cause some damage, but not as much as it is." Course, careful: 31 buildings always, 8 never, 16 now. |
| 15 Nov 2026 | shipped feel, streets, tail shape | Steady preset, 24/30/44 m → the playtester's settings (speed 60.5, pickup 0.65, turning 5...; 27/37/57 m; tail 20 m in 4 parts) | Where he left the dials in playtest 7. |
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
