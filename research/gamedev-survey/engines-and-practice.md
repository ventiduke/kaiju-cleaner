# Engine tooling for agents, and what practice people report works

Survey date: 2026-11-15. Scope: Godot and three.js tooling that lets a coding agent see, drive and test a
running game; write-ups from people who built games with Claude Code or similar agents; game-feel references.

## How to read this

- **Reddit was not read**, directly or through any mirror or archive.
- **Only GitHub could be opened directly.** This session's network rules refused every other site
  (simonwillison.net, dev.to, Medium, Hacker News, Substack, the Godot forum, YouTube and the rest). Repositories
  were read on GitHub or cloned. Blog posts and forum threads are quoted **only from web-search summaries**, and
  each such claim is marked "(search summary)". Treat those as leads to confirm, not as checked quotations.
- Star counts are what the GitHub page showed on 2026-11-15. "not checked" means the repository was confirmed
  to exist with `git ls-remote` but its page was not opened.
- "Cloned" means the files were read on disk. Nothing from any repository was run.
- The requested window was August to November 2026. Older items are included where current tools still build
  on them, and are dated.

## 1. Repositories

Relevance is to Kaiju Cleaners (three.js, TypeScript, Rapier, Vite, Vitest, headless deterministic sim,
Playwright screenshots, human playtester sending notes and session files).

### Web and three.js: letting the agent see, drive, test and profile

| Repo | URL | What it is | Licence | Stars | Relevance | Found via |
|---|---|---|---|---|---|---|
| `Keeno-Corp/paprika3d` | https://github.com/Keeno-Corp/paprika3d | MCP server and Claude Code plugin: headless Chrome on a paused, seeded clock; frame-exact input; state as JSON; feel, perf and visual-compare tools for three.js pages. Cloned; last commit 2026-11-14 | Apache-2.0 | 7 | high | Web search; https://socket.dev/npm/package/paprika3d |
| `openai/skills` (`develop-web-game`, removed) | https://github.com/openai/skills | Skill for a web-game build-and-test loop: `window.render_game_to_text`, `window.advanceTime(ms)`, a Playwright client that sends input bursts and saves screenshots. Added 2026-01-31, deleted 2026-04-23 (commit `11c6438`); read from git history. Repo README now says it is deprecated | Apache-2.0 (skill) | 28.8k | high | Web search; https://skills.sh/openai/skills/develop-web-game |
| `openai/plugins` (`plugins/game-studio`) | https://github.com/openai/plugins | OpenAI's Codex "Game Studio" plugin: skills for three.js, React Three Fiber, Phaser, a `game-playtest` skill, playtest checklist, WebGL debugging and Rapier starter references. Sparse-cloned; plugin v0.1.2 | MIT (plugin manifest) | not checked | high | Web search; https://mcpservers.org/agent-skills/openai/game-playtest |
| `DmitriyGolub/threejs-devtools-mcp` | https://github.com/DmitriyGolub/threejs-devtools-mcp | MCP server with 69 tools that inspect a live three.js scene through an injected bridge: compact scene tree, `renderer_info`, draw-call breakdown, FPS percentiles, leak check, screenshots, frame capture; Playwright helpers. Cloned; last commit 2026-10-14 | MIT | 130 | high | Web search; https://glama.ai/mcp/servers/DmitriyGolub/threejs-devtools-mcp |
| `jrejaud/claude-game-playtest-skills` | https://github.com/jrejaud/claude-game-playtest-skills | Claude Code plugin: turn a narrated playtest recording into a timestamped bug table, telemetry aligned to the recording, an approval-gated fix-and-verify loop, and a real-input browser playtest CLI with `.play` scripts. Cloned; single commit 2026-10-17 | MIT | 0 | high | Web search (GitHub page) |
| `BigBadLoser/cc-ftl` (PR #418) | https://github.com/BigBadLoser/cc-ftl/pull/418 | Browser game (TypeScript, Svelte, Vite, Vitest) that adds a `?agent` flag exposing `window.__play`: `state()`, `describe()`, `elements()`, `step(seconds)`, `log()`. Merged 2026-11-10. PR page read, repo not cloned | not shown | 0 | high | Web search (GitHub PR page) |
| `chongdashu/phaserjs-oakwoods` | https://github.com/chongdashu/phaserjs-oakwoods | Phaser game with a `playwright-testing` skill for canvas games: `window.__TEST__` seam, `?test=1&seed=42`, ready flag, flake-reduction notes. Cloned; one commit 2026-01-23 (before the window) | MIT | 86 | high | Web search; https://skillselion.com/skills/chongdashu/phaserjs-oakwoods/playwright-testing |
| `takahirox/three-webmcp` | https://github.com/takahirox/three-webmcp | Small library that exposes a three.js scene to agents through the draft WebMCP browser API: `three.scene.inspect`, `three.object.update`, `three.renderer.inspect` (reads `renderer.info` without resetting it). three r186 and WebGLRenderer only | not shown | 0 | medium | Web search (GitHub page) |
| `microsoft/playwright-mcp` | https://github.com/microsoft/playwright-mcp | Playwright MCP server. Works from the accessibility tree by default, which is empty for a canvas; needs `--caps vision`, screenshots and `browser_evaluate` for games. README now suggests CLI plus skills for coding agents | Apache-2.0 | 39.7k | medium | Web search (GitHub page) |
| `ChromeDevTools/chrome-devtools-mcp` | https://github.com/ChromeDevTools/chrome-devtools-mcp | Chrome DevTools MCP server: performance traces, CPU and network throttling (`emulate`), console with source maps, heap snapshots and comparison, `evaluate_script`, and tools to call a page's WebMCP tools | Apache-2.0 | 56.5k | medium | Known tool; page and `docs/tool-reference.md` read |
| `Math-Quest-Web/Math-Quest` (PR #19) | https://github.com/Math-Quest-Web/Math-Quest/pull/19 | Headless playtest bot (`tests/playtest/bot.js`): plays the real game with real key events, checks invariants every frame, flags stalls over 4 s, writes a JSON report and screenshot, exits non-zero. Merged 2026-10-04. PR page read | not shown | 0 | medium | Web search (GitHub PR page) |
| `simonw/raccoon-heist` | https://github.com/simonw/raccoon-heist | One-prompt three.js game built by Claude Code (2026-08-05). `notes.md` is the agent's own log: which bugs its Playwright checks caught and the `window.__rh` debug hook it added | not shown | 18 | medium | Web search; https://simonwillison.net/2026/Aug/5/raccoon-heist/ |
| `mrdoob/three.js` (`test/e2e`) | https://github.com/mrdoob/three.js | three.js's own screenshot tests: `deterministic-injection.js` replaces `Math.random`, `performance.now`, `Date.now` and `requestAnimationFrame` before capture. Its skip list includes `physics_rapier_instancing` under "timing issues" | MIT | not checked | medium | Known project; raw files read |
| `RenaudRohlinger/stats-gl` | https://github.com/RenaudRohlinger/stats-gl | FPS, CPU and GPU timing for WebGL and WebGPU; `StatsProfiler.getData()` returns `{fps, cpu, gpu, gpuCompute}` for reading in code | MIT | 286 | medium | Known project; page read |
| `BabylonJS/Spector.js` | https://github.com/BabylonJS/Spector.js | WebGL frame capture and draw-call inspector; the tool OpenAI's game-studio plugin names for rendering bugs | not checked | not checked | low | Named in `openai/plugins` game-studio references |
| `mapbox/pixelmatch` | https://github.com/mapbox/pixelmatch | Pixel diff library that Playwright's screenshot comparison uses (search summary) | not checked | not checked | low | Web search; https://bug0.com/knowledge-base/playwright-visual-regression-testing |
| `lappemic/awesome-ai-built-games` | https://github.com/lappemic/awesome-ai-built-games | List of 95 playable games built with coding agents; 13 are tagged three.js plus Claude Code, none links source or a write-up | CC0-1.0 | 125 | low | Web search (GitHub page) |

### Godot: MCP servers, editor bridges and skills

| Repo | URL | What it is | Licence | Stars | Relevance | Found via |
|---|---|---|---|---|---|---|
| `satelliteoflove/godot-mcp` | https://github.com/satelliteoflove/godot-mcp | Editor bridge with 21 tools: JSON state digests of the running game, input injection, a frozen clock with `step` and `step_until`, profiler, screenshots. Includes an eval harness that scores agent tool use. Cloned; last commit 2026-11-11 | MIT | 186 | high | Web search (GitHub page) |
| `htdt/godogen` | https://github.com/htdt/godogen | Publishes a thin runtime (manifest, one-page engine guide, asset skill) into a new game repo for Godot, Bevy, Babylon.js or **three.js + Vite + TypeScript + Rapier**. Cloned; last commit 2026-10-16 | MIT | 7.3k | high | Web search; https://news.ycombinator.com/item?id=47400868 (listing only) |
| `Erodenn/godot-mcp-runtime` | https://github.com/Erodenn/godot-mcp-runtime | "Playwright MCP for Godot": injects a bridge at launch and removes it on exit. Screenshots come with pixel statistics and a `likelyBlank` verdict; each input reports what it hit and what changed. Cloned; last commit 2026-11-13 | MIT | 98 | high | Web search (GitHub page) |
| `Coding-Solo/godot-mcp` | https://github.com/Coding-Solo/godot-mcp | The most-starred Godot MCP: launch editor, run project, read debug output, create scenes. No screenshots or runtime inspection | MIT | 6.7k | low | Web search; https://claudemarketplaces.com/mcp/coding-solo/godot-mcp |
| `tugcantopaloglu/godot-mcp` | https://github.com/tugcantopaloglu/godot-mcp | 157 tools including runtime screenshots, input, live scene tree and `game_eval` | MIT | 512 | low | Named in the comparison table of `Erodenn/godot-mcp-runtime` |
| `HaD0Yun/Doyunha-Gopeak` (GoPeak; older names `HaD0Yun/godot-mcp`, `HaD0Yun/Gopeak-godot-mcp` resolve to it) | https://github.com/HaD0Yun/Doyunha-Gopeak | Editor plugin plus runtime plugin for an edit, run, inspect, fix loop | MIT | 273 | low | Web search; https://mcpservers.org/servers/had0yun/godot-mcp |
| `alexmeckes/godot-mcp` | https://github.com/alexmeckes/godot-mcp | 99 tools; runtime harness inside the game for input and viewport capture; atomic writes that reject stale edits | MIT | 43 | low | Web search (GitHub page) |
| `alexmeckes/godot-claude-skills` | https://github.com/alexmeckes/godot-claude-skills | Five Godot skills. `godot-interactive` requires a "QA inventory" (each claim mapped to the evidence that proves it) before sign-off. One skill file read | MIT | 54 | medium | Linked from `alexmeckes/godot-mcp` README |
| `letsagents/godot-mcp` | https://github.com/letsagents/godot-mcp | Research project on runtime feedback for self-correction: errors, scene tree, node inspection, screenshots, breakpoints | MIT | 2 | medium | Web search (GitHub page) |
| `masteryee-labs/Open-Godot-MCP` | https://github.com/masteryee-labs/Open-Godot-MCP | Frozen-clock playtesting, state digest before screenshots, assert actions. Tool names match `satelliteoflove/godot-mcp` | MIT | 15 | low | Web search; https://forum.godotengine.org/t/open-godot-mcp-ai-plays-tests-your-game-not-just-edits-files/141986 |
| `beckettlab/beckett-godot-mcp` | https://github.com/beckettlab/beckett-godot-mcp | MCP server written as a GDScript editor plugin; parses scripts and refuses to write ones that do not compile. Free edition sees the game; playtesting is in a paid edition | MIT (Lite) | 51 | low | Web search; https://forum.godotengine.org/t/beckett-zero-sidecar-mcp-server-for-godot-4-2-the-ai-sees-and-optionally-playtests-your-game/141177 |
| `mkdevkit/godot-mcp` | https://github.com/mkdevkit/godot-mcp | 173 tools; includes `run_test_scenario`, `assert_node_state`, `assert_screen_text`, `compare_screenshots` | MIT | 17 | low | Web search (GitHub page) |
| `Randroids-Dojo/PlayGodot` | https://github.com/Randroids-Dojo/PlayGodot | Python client in the style of Playwright (`wait_for_node`, `click`, `press_key`, `screenshot`); needs a custom Godot fork | MIT | 40 | low | Recalled; page read |
| `bitwes/Gut` | https://github.com/bitwes/Gut | GDScript unit-test framework with a command-line runner | MIT | 2.8k | low | Web search; https://tessl.io/registry/testland/godot-gut-tests |
| `rondorkerin/gamestack` | https://github.com/rondorkerin/gamestack | Game-design process skills "tuned for headless, procedural, AI-authored development": per-system benches, fixed-fps golden images, a playtest API, review gates | MIT | 34 | medium | Web search (GitHub page) |
| `LuoxuanLove/godot-dotnet-mcp`, `IvanMurzak/Godot-MCP`, `youichi-uda/godot-mcp-pro`, `ee0pdt/Godot-MCP`, `hi-godot/godot-ai`, `godot-gdunit-labs/gdUnit4`, `Randroids-Dojo/Godot-Claude-Skills`, `thedivergentai/gd-agentic-skills` | https://github.com/ + name | More Godot MCP servers, test frameworks and skill packs. Existence confirmed only; not reviewed | not checked | not checked | low | Web search results (various listings) |

### Game feel

| Repo | URL | What it is | Licence | Stars | Relevance | Found via |
|---|---|---|---|---|---|---|
| `gamedev-skills/awesome-gamedev-agent-skills` | https://github.com/gamedev-skills/awesome-gamedev-agent-skills | 79 skills for 12 engines. The engine-neutral `game-feel`, `physics-tuning`, `camera-systems` and `performance-optimization` skills give numbers, headless checks and questions to put to a human. Cloned; last commit 2026-11-12 | Apache-2.0 | 8.9k | high | Web search (GitHub page) |
| `m4bwav/game-juice` | https://github.com/m4bwav/game-juice | Three skills: scan a codebase for feel moments missing feedback, apply fixes behind toggles, and a principles file (28 principles, parameter table) cited to books and talks. Cloned; last commit 2026-11-13 | MIT | 1 | high | Web search (GitHub page) |
| `grapefrukt/juicy-breakout` | https://github.com/grapefrukt/juicy-breakout | The example game from Jonasson and Purho's 2012 talk "Juice it or lose it" | Zlib | 693 | medium | Cited in `m4bwav/game-juice` RESEARCH.md |
| `CodingQuests/godot-game-feel-lab` | https://github.com/CodingQuests/godot-game-feel-lab | One sword swing with each feedback channel on its own switch and live sliders; defaults listed (hit-stop 80 ms, white flash 5 frames) | MIT | 0 | medium | Web search (GitHub page) |
| `hasparus/haunted` (issue #1) | https://github.com/hasparus/haunted/issues/1 | A jam team's "juice, sound, music and playtest checklist" (2026-10-16): juice per mechanic with priorities, and a playtest script with metrics and questions | not checked | not checked | medium | Web search (GitHub issue page) |

Overlap with the sibling skills survey: `Donchitos/Claude-Code-Game-Studios`, `OpusGameLabs/game-creator` and
`majidmanzarpour/threejs-game-skills` exist (confirmed with `git ls-remote`) and are left to that file.

## 2. Reviews of the high-relevance repositories

### Keeno-Corp/paprika3d

A three.js-specific harness, published as an MCP server and Claude Code plugin, and the closest match to our
stack. It runs the page in headless Chrome on a fake clock (it replaces `requestAnimationFrame`,
`performance.now`, `Date`, timers and CSS animations and seeds `Math.random`), so the same inputs give the same
frames. `interact` takes steps such as "hold `KeyW` for 30 frames", "set this state first", or "step until
`player.grounded` is true, at most 120 frames", and returns what changed. It can trace one value (peak, first
change, landing frame) and it flags when a held direction moves the subject more than 30° off its screen axis.
`feel` plays the inputs that cause an event and lists what reacted: pops, flashes, shakes, particles, sounds,
teleports. `perf` measures frame time against a budget and can measure variants ("hide the trees",
a different pixel ratio) on fresh pages against a baseline. Visual compare replays a saved camera at a saved
frame and ignores 16×16 cells with fewer than four differing pixels. A hook reruns saved checks after each
edit and speaks only when one starts or stops failing.

**Borrow:** the `window.__game` contract (`describe`, `observe`, `act`, `setState`); `until` and `trace`;
feel as a list of what reacted; perf variants; an after-edit hook that is silent unless a check changes state.
**Caution:** new project, seven stars, vendor-run benchmarks with small samples, and it makes network calls
(asset search, optional pings). Take the design; installing it is a separate decision.

### openai/skills, `develop-web-game` (deleted April 2026) and openai/plugins, `game-studio`

The deleted skill is the clearest short statement of the loop many later tools copy: implement a small change,
act, pause, observe, adjust. It asks the game for two hooks. `window.render_game_to_text()` returns concise
JSON "with enough information to play the game without visuals", including a note on the coordinate system.
`window.advanceTime(ms)` steps the update loop at a fixed 1/60 s. A bundled Playwright client sends input
bursts from a JSON file, steps time, saves screenshots and buffers console errors. The instructions are blunt:
open and look at the screenshots, check that the text state matches the picture, fix the first new console
error before continuing, change one variable at a time, and keep a `progress.md` with the original prompt at
the top so another agent can continue.

Its successor, the `game-studio` plugin, is checklists rather than tooling. `web-game-foundations` fixes the
architecture first (simulation state owned outside the renderer, one input action map, DOM for HUD).
`game-playtest` and `playtest-checklist.md` list 3D checks we could use directly: camera stability, depth
readability, overlay weight against the playfield, collision proxy alignment, resize, context loss. Findings
are reported in severity order with reproduction steps and a likely owner (simulation, renderer, frontend,
asset pipeline). The debugging reference's rule is "capture first, then guess".

**Borrow:** the text-state rule, the fix-first-error rule, the 3D checklist and the reporting format.

### htdt/godogen

Started in March 2026 as a multi-stage Claude Code pipeline for Godot. Its changelog is the useful part: in
April it dropped an external vision model for QA because newer models "self-verify from captured frames;
external pass added no signal"; in July it deleted the planner, scaffold, lookup skills and hooks and kept a
short manifest plus a one-page guide per engine. In October it added a three.js guide for exactly our stack.
The manifest fixes two things only: durable status lives in `README.md`, and "judge progress from the running
game, never from a clean build", ending with a 15 to 20 second clip the agent watches before calling the work
done. The three.js guide spends its words on what fails silently: textures left in the wrong colour space,
physical light falloff leaving a scene near-black, a directional light's shadow camera covering only ±5 units,
skinned clones bound to the original's bones. Its capture recipe: read the WebGL `RENDERER` string and warn on
SwiftShader or llvmpipe, wait for a ready flag, and give the game a capture mode that stops the animation loop
and exposes a hook that advances one fixed step and renders, because screenshotting a live loop gives a
sped-up, stuttering clip.

**Borrow:** a quirks list limited to silent failures; the stepped capture mode; the proof clip; and the
lesson that guidance should be pruned as models improve.

### satelliteoflove/godot-mcp

The best worked example of how an agent should see a running game. A design note in the repo measures the
cost: a 1920×1080 screenshot is 200 to 700 KB of context plus vision tokens, while a JSON digest of about 20
watched entities is 2 to 6 KB with exact numbers. So the default view is a state digest (position, velocity,
animation, on-screen or not) and screenshots are for layout and art questions. Games opt in with a group tag
and a `_mcp_state()` method capped at about 1 KB per node; the guide says to return both live values and the
"definition context" needed to judge them (the goal count, the grid size), or the agent can see changes but
not whether they are right. The clock answers to the agent: freeze, then `step` a duration or frame count with
an input timeline inside the window, or `step_until` a predicate holds, with a cap that returns
`predicate_met: false` rather than hanging, and `report` expressions read back in the same call. Read tools
and write tools are split so reads can be auto-allowed. The repo also has an eval harness that runs real
agent tasks and scores which tools were called, and the stated method is to fix tool descriptions and schemas,
not prompts.

**Borrow:** state before pixels; live values plus definition context; `step_until` with `report`; the
read/write split; evals for our own skills.

### DmitriyGolub/threejs-devtools-mcp

An inspector for any three.js page, vanilla or React Three Fiber, WebGL or WebGPU. A proxy injects a bridge
script; Playwright tests can attach the same in-page API with `attachDevtools(page)` and no MCP server. The
tools are labelled by mode so the agent knows what is read-only, what changes only the browser, and what is
meant to be written into source; live changes are journalled and `pending_changes` turns them into code. For
us the read side matters: `scene_tree` returns compact text (about 2 KB against 60 KB of JSON),
`renderer_info` and `draw_call_breakdown` list the most expensive objects first, `perf_monitor` records
average, minimum and p50/p95/p99 frame rates, `dispose_check` looks for leaks, and `capture_frames` records on
virtual time. The audit flags over 100 draw calls as worth a look and over 300 as too many for mid-range
phones. One built-in prompt is a checklist for "why can't I see X": exists, visible, parent visible, scale,
layers against the camera, near and far planes, material opacity and side, draw range, clipping planes, lights.

**Borrow:** name every mesh so reports read well; compact tree first, detail on request; the invisible-object
checklist; draw-call thresholds as a starting budget; the Playwright advice (wait for the scene, fixed
viewport and scale factor, compare with a tolerance).

### jrejaud/claude-game-playtest-skills

One commit and no stars, but it describes our situation: a human plays, an agent turns the feedback into
fixes. The developer records a session while talking; a script extracts audio, transcribes it with timestamps
and pulls a frame every five seconds; the agent reads the frames around each spoken complaint and traces it to
code. An optional telemetry logger writes inputs and a few watched values only when they change, with a
wall-clock start line, so "it broke at 3:41" maps to exact inputs and state. The loop is approval-gated: the
agent presents a table `# | Time | Severity | Issue | Proposed fix` with severity BLOCK, FIX, INFO (the player
asked a question; the answer is not a code change) or KEEP (praise; protects it from accidental change), then
stops until rows are approved. Each approved item gets its own commit and is verified by driving the game to
that scene. Other rules: print state as text every step ("steering by numbers beats steering by pixels"),
bake checkpoints so nobody replays the intro, pace inputs, and never trust a build wrapper's exit code.

**Borrow:** the four severities, especially KEEP and INFO; the approval stop; one commit per item; verifying
each fix at the scene it concerns.

### BigBadLoser/cc-ftl, PR #418

A small, recent, concrete example in a TypeScript, Vite and Vitest game. Opening the page with `?agent`
installs `window.__play`; without the flag nothing is installed, and the cheat-capable developer hook stays
separate. `state()` returns 2 to 3 KB of JSON built from the same stores the UI reads, so it reports only what
a player can see. `describe()` says the same in a few lines of English. `elements()` lists visible controls
with a label, whether enabled, a box and a click point. `step(seconds)` works only while paused, advances
whole ticks, stops early if a decision opens or the game is lost, and returns the new state. `log(sinceId)`
returns recent events. Eleven tests cover it, including that it is absent without the flag, that state stays
under 4 KB, and that stepping is deterministic. A bot review found `elements()` listed canvas targets hidden
behind a dialog, a useful reminder to test the hook itself.

**Borrow:** player-visible state only; a size budget enforced by a test; an event log with a cursor; a
separate flag for cheats.

### Erodenn/godot-mcp-runtime

Its README makes the limits explicit: "This is not a playtesting replacement... it won't tell you if your game
is fun. What it does is let an agent confirm that a scene loads, a button responds, a value updated." Three
design choices transfer. Every screenshot comes with pixel statistics and a `likelyBlank` verdict, so a caller
that cannot look at the image can still tell a rendered frame from an empty one. Every input action reports
what it did: what it hit, which signals fired, what changed on screen. And a value the server could not
measure "comes back as `null` with a warning rather than a made-up number"; debug output it cannot see is
`null`, never an empty list that would read as "nothing happened". A cheap `render_movie` check answers
"blank or not, moving or not" before a full run.

**Borrow:** blank-frame statistics on every capture; inputs that report their effect; `null` plus a warning
for "could not measure".

### gamedev-skills/awesome-gamedev-agent-skills

A large maintained skill set; the engine-neutral discipline skills are what matter here. `game-feel` works in
tiers so feedback stays proportional: small events (trauma 0.10 to 0.20, no hit-stop, 0 to 4 particles),
medium (trauma 0.30 to 0.50, hit-stop 40 to 60 ms, 6 to 12 particles, flash), large (trauma 0.70 to 1.00,
hit-stop 100 to 150 ms, 20 to 40 particles, flash, zoom). Shake scales with trauma squared and decays in real
time; hit-stop restores with real-time timers so overlapping hits do not cut each other short. It lists
failure modes (hit-stop that never ends, UI tweens crawling during a freeze, juice that never returns to
rest) and accessibility toggles. `physics-tuning` says to read current settings first, change one knob at a
time, prove tunnelling fixes with a headless test that exits 1 on failure, keep mass ratios within about 1:10,
and then "ask the user to judge feel with specific questions".

**Borrow:** event tiers; real-time timers for anything that must outlast a freeze; a headless check paired
with specific questions for the human.

### m4bwav/game-juice

Tiny audience, careful content. `juice-scan` classifies functions as feel moments (input, hit, death, UI,
camera) and checks each against seven channels: visual, motion, camera, audio, UI, haptic, timing. The
principles file is the best checklist found, each item cited by chapter to Swink's *Game Feel*, Schell,
Hodent and Rogers, plus the talks. Examples: response within about 100 ms reads as caused by the player;
protect the roughly 240 ms correction loop; polish cannot fix broken control; attention is a budget; perceived
weight beats simulated weight; movement should be fun in an empty room; tune the core motion first and build
the world to its metrics; test with people and measure with tools. It also states its own limit: the apply
skill "cannot playtest; feel judgements are left to the developer".

**Borrow:** the seven-channel audit per event, and the principles as review questions.

### chongdashu/phaserjs-oakwoods, `playwright-testing` skill

Older (January 2026) but a clean statement of test seams for canvas games. Add a read-only
`window.__TEST__` with `ready`, `seed`, a `state()` that returns plain data with ids rather than engine
objects, and a few commands (`reset`, `seed`, `skipIntro`). Load with `?test=1&seed=42`, wait on the ready
flag rather than a sleep, fail on console errors, assert state, and only then take a screenshot as evidence.
Its anti-patterns are worth copying: sleep-driven tests, pixel snapshots before determinism, and retries as a
strategy.

## 3. What people report works, and what fails

Sources marked "(search summary)" were not opened; see the note at the top.

### Reported by several independent sources

1. **The agent must run the game and look; a clean build proves nothing.**
   - "Judge progress from the running game, never from a clean build." https://github.com/htdt/godogen (`prompts/runtime.md`)
   - "Treat the screenshots as the source of truth; if something is missing, it is missing in the build." https://github.com/openai/skills (deleted `develop-web-game` skill)
   - Most Godot AI tools "only do static analysis" and cannot see whether the code works when run; the project's hypothesis is that "giving AI runtime feedback enables AI self-correction". https://github.com/letsagents/godot-mcp
   - "'I built it' ≠ 'I tested it'." https://github.com/jrejaud/claude-game-playtest-skills
   - Agentic tools help game work only when a feedback loop is present. https://chierhu.medium.com/ai-coding-tools-for-video-game-development-a-first-principles-analysis-of-what-actually-works-90dfa10edd13 (search summary)
   - The raccoon-heist agent's own notes list three real bugs found only by its Playwright runs (a canvas at twice its size on phones, a hidden element swallowing clicks, first screenshots too dark). https://github.com/simonw/raccoon-heist (`notes.md`)

2. **Give the agent game state as text; keep screenshots for visual questions.**
   - 2 to 6 KB of JSON against 200 to 700 KB for a screenshot. https://github.com/satelliteoflove/godot-mcp (`docs/design/perception-spike.md`)
   - Playtest "without needing screenshots"; state under 4 KB. https://github.com/BigBadLoser/cc-ftl/pull/418
   - "Steering by numbers beats steering by pixels." https://github.com/jrejaud/claude-game-playtest-skills
   - A text renderer over game state let an agent reproduce, fix and retest bugs with no browser tool. https://blog.jeffschomay.com/letting-ai-play-my-game (search summary)
   - A commenter on that thread, working on a physics game, needed both a code-level physics stepping API and a browser tool; neither alone was enough. https://news.ycombinator.com/item?id=47947525 (search summary)

3. **Deterministic time control is what makes agent playtesting reliable.** Freeze, step a fixed amount, step
   until a condition, seed the randomness.
   - https://github.com/satelliteoflove/godot-mcp (`docs/tools/game-time.md`)
   - https://github.com/Keeno-Corp/paprika3d (`skills/threejs-game/SKILL.md`)
   - https://github.com/openai/skills (`advanceTime`), https://github.com/BigBadLoser/cc-ftl/pull/418 (`step`)
   - https://github.com/mrdoob/three.js (`test/e2e/deterministic-injection.js`)
   - https://github.com/chongdashu/phaserjs-oakwoods ("prefer determinism over retries")

4. **Headless WebGL capture has specific traps.** Software rendering is slow or blank; early screenshots are
   blank; reading the canvas outside the render call returns nothing.
   - https://github.com/htdt/godogen (`engines/threejs.md`)
   - https://github.com/DmitriyGolub/threejs-devtools-mcp (`docs/playwright.md`: wait for the scene, fixed viewport, `deviceScaleFactor: 1`, tolerance, SwiftShader flags in CI)
   - https://github.com/Erodenn/godot-mcp-runtime (`likelyBlank`)
   - Playwright's defaults let Chrome pick the software renderer. https://gist.github.com/davidar/be59931b655cb4a4c3fb5f064b6f2498 (search summary)

5. **Agents and bots can check that the game works, not that it is fun or feels right.**
   - https://github.com/Erodenn/godot-mcp-runtime (README note quoted above)
   - https://github.com/m4bwav/game-juice ("cannot playtest")
   - Skipping human playtests is a named mistake; models optimise for plausible code. https://gamineai.com/blog/i-built-a-game-with-chatgpt-and-claude-heres-what-happened-2026 (search summary)
   - The Vibe Jam 2026 winner says he spent most of his time planning and playing, and tuned feel and placed cameras himself. https://leocoout.medium.com/how-i-made-25k-in-15-days-with-a-game-built-entirely-by-claude-code-94b3b817f0ce (search summary)
   - The bottleneck moved "from typing code toward direction, evaluation, iteration, and taste". https://www.ai.joaoqueiros.com/blog/librarian-2-ai-game-development-claude-code-codex (search summary)
   - "An agent can check that your game works, not that it is fun." https://dev.to/orellanaed/ai-playtesting-for-godot-an-agent-can-check-that-your-game-works-not-that-it-is-fun-58gd (title seen in search results only)

6. **Build in small planned steps; one-shot building breaks down on complex games.**
   - A Godot developer gave up after about 40 hours on a metroidvania; replies said it has to be built piece by piece. https://forum.godotengine.org/t/post-mortem-of-my-failed-attempt-to-vibe-code-a-metroidvania-game/137567 (search summary)
   - A three.js and Rapier game built over 53 days and 731 commits used 87 written plans, split into phases that keep the game runnable, 36 AI code reviews and 11 retrospectives. https://news.ycombinator.com/item?id=47600002 and https://supertommy.com/games/super-mario-galaxy-movie-game/ (search summary)
   - Plan mode before each feature; two or three sessions on separate parts of the code. Leo's post above (search summary)
   - "Scope lock beats model choice"; features creep unless a new chat is started. The gamineai post above (search summary)
   - "Implement small... change one variable at a time." https://github.com/openai/skills

7. **Keep durable memory in files the agent rereads.**
   - A 164-line `CLAUDE.md` of hard constraints learned from debugging, pruned several times. https://news.ycombinator.com/item?id=47600002 (search summary)
   - `progress.md` with the original prompt at the top. https://github.com/openai/skills
   - Status and asset table in `README.md` "so a run survives compaction". https://github.com/htdt/godogen (`docs/PROJECT.md`)
   - A project rules file updated as systems are added. https://liminalwarmth.substack.com/p/claude-code-context-lessons (search summary)

8. **The model's engine knowledge is stale, and the dangerous errors are silent.**
   - three.js "ships a release a month... read `node_modules/three/src`, not memory". https://github.com/htdt/godogen (`engines/threejs.md`)
   - Godot 3 calls appear in Godot 4 code and fail only when the line runs. https://dev.to/ziva/why-does-chatgpt-keep-giving-me-godot-3-code-we-tested-150-answers-58b7 (search summary)
   - A GDScript runtime error leaves the exit code at 0; gate on `SCRIPT ERROR` in the log. https://github.com/htdt/godogen (`docs/PROJECT.md`)
   - A build wrapper's exit code can lie; grep the log and do a boot check. https://github.com/jrejaud/claude-game-playtest-skills

9. **Keep simulation separate from rendering so it can be tested without a screen.**
   - https://github.com/openai/plugins (`plugins/game-studio/skills/web-game-foundations/SKILL.md`)
   - "Every system needs to be checkable without a human walking to it in a running game." https://github.com/rondorkerin/gamestack
   - Unit tests for deterministic simulation, browser tests only for integration. https://github.com/chongdashu/phaserjs-oakwoods

10. **Human feedback works best when it is specific and tied to a moment.**
    - Long numbered playtest lists with bug reproductions worked well as input. https://adventuremedia.ai/blog/i-built-a-game-in-24-hours-with-claude-code (search summary)
    - Play, screenshot what looks off, describe it. https://buildingbetter.tech/p/i-built-a-browser-racing-game-in (search summary)
    - Recording, timestamps and telemetry. https://github.com/jrejaud/claude-game-playtest-skills

11. **In 3D, the hard parts are camera, placing objects in space, physics and lighting.**
    - Physics, camera and shadows were the most complex parts; the author tried a command-line tool to help the agent place objects. https://discourse.threejs.org/t/super-mario-galaxy-movie-game/90783 (search summary)
    - Most of OpenAI's 3D playtest checks concern camera, depth readability and collision proxies. https://github.com/openai/plugins
    - Interface and visual work is where the agent struggles. https://liminalwarmth.substack.com/p/week-4-roguelike-vibecoding-uiux (search summary)

### Single-source opinions

- **Models now respond to "make it a LOT more fun".** Simon Willison reports that this prompt, then a port to
  three.js, transformed a weak prototype with Claude Opus 5.5, and that telling models to use three.js works
  well. This is the one source that cuts against item 5. https://simonwillison.net/2026/Oct/28/vibe-game-development/ (search summary)
- **Delete scaffolding as models improve.** Godogen removed its planner, lookup skills, hooks and external
  visual QA and reports no loss. https://github.com/htdt/godogen (`CHANGELOG.md`)
- **A typed, compiled language gives the agent a better gate.** Godogen moved from GDScript to C# because
  the compiler catches what GDScript lets through. https://github.com/htdt/godogen (`docs/gdscript-vs-csharp.md`)
- **Improve agent tools by fixing descriptions and schemas, and measure with real tasks.**
  https://github.com/satelliteoflove/godot-mcp (`server/evals/README.md`)
- **For coding agents, a CLI plus skills may suit better than an MCP server.** https://github.com/microsoft/playwright-mcp
- **"When a physics test fails, question the code before the tolerance."** Also: every number in one tuning
  asset, and physics checks run three times each. https://apeiron01.itch.io/anchor/devlog/1778150/how-anchor-was-made-one-human-three-ai-agents-four-days (search summary)
- **A Rapier scene is excluded from three.js's own screenshot tests for timing.** Expect physics scenes to
  need a fixed step count before capture. https://github.com/mrdoob/three.js (`test/e2e/puppeteer.js`)
- **Code spread over many files drifts.** An audit found 15 behaviour flags defined in data and never read by
  code. https://gonzoml.substack.com/p/how-we-built-a-full-browser-game (search summary)
- **Speech transcription invents lines during silence.** Check there is speech at a timestamp before trusting
  it. https://github.com/jrejaud/claude-game-playtest-skills
- **Unattended runs need a cost alarm.** One ticket reached $402 over nine headless runs before the author
  noticed. https://dev.to/tiagovilasboas/i-built-a-full-pwa-game-in-one-day-with-claude-opus-55-and-claude-code-here-is-the-real-token-41p7 (search summary)
- **Tool-assisted agents score higher on a three.js benchmark** (66% to 86% of objects passing with one model).
  The vendor ran the benchmark itself. https://github.com/Keeno-Corp/paprika3d

## 4. Practices worth turning into skills for Kaiju Cleaners

The project already has a headless deterministic sim, input replay, `npm run feel` and session files. These
build on that.

1. **An agent hook on the page, behind a URL flag.** `?agent` installs `window.__game` with `describe()`,
   `observe()` (plain JSON, under about 4 KB, enforced by a test), `act(input)`, `setState(partial)`,
   `step(frames)`, `log(sinceId)` and a `ready` flag. Cheats stay behind a different flag. Sources: paprika3d
   `docs/convention.md`; cc-ftl PR #418; deleted `develop-web-game` skill; phaserjs-oakwoods skill.

2. **A "state first, pixels second" rule.** Read `observe()` before taking a screenshot; take one only for a
   claim about how something looks. `observe()` carries live values and the context to judge them (job
   targets, hazard radii, world bounds). Sources: satelliteoflove `docs/runtime-state-guide.md` and
   `perception-spike.md`; jrejaud `game-playtest` skill.

3. **`stepUntil(predicate, maxSteps, report)` in the headless sim and on the page.** Returns whether the
   predicate was met and the reported values, never hangs. Use it in tests instead of fixed step counts.
   Sources: satelliteoflove `docs/tools/game-time.md`; paprika3d `threejs-play` skill.

4. **A playtest bot that drives toward each repair job and reports where it got stuck.** Per-step invariants
   (no NaN or out-of-bounds body, kaiju above ground, job progress in range, body count under a cap), stall
   detection, a JSON report with the step number and a screenshot at the failure, non-zero exit. Run it per
   scene and per seed. Sources: Math-Quest PR #19; cc-ftl PR #418; Jeff Schomay's harness (search summary).

5. **A capture skill for headless three.js.** Check the WebGL `RENDERER` string and say when it is software;
   wait for the ready flag; use a capture mode that stops the loop and steps a fixed 1/30 s per frame; read
   pixels right after render; compute blank-frame statistics for every shot; finish a feature with a 15 to 20
   second stepped clip and watch it. Sources: godogen `engines/threejs.md` and `prompts/runtime.md`; Erodenn
   README; threejs-devtools-mcp `docs/playwright.md`.

6. **Visual regression on a frozen clock.** One baseline per named view and viewport, same renderer, saved
   camera and frame, fixed `deviceScaleFactor`, a tolerance that ignores a few pixels per cell, and a fixed
   number of physics steps before capture. Sources: paprika3d `threejs-visual-regression` skill; three.js
   `test/e2e`; phaserjs-oakwoods anti-patterns.

7. **A perf probe the agent can read.** One command prints `renderer.info` (calls, triangles, geometries,
   textures), frame time p50/p95/p99 over N stepped frames, cost by named group, and variants against a
   baseline (debris hidden, shadows off, pixel ratio 1). Start with budgets of 100 and 300 draw calls. Add a
   leak check after a destruction-heavy run: geometry and texture counts should return to baseline. Sources:
   threejs-devtools-mcp `docs/tools.md` and `renderer.ts`; paprika3d `threejs-perf` skill; three-webmcp;
   chrome-devtools-mcp heap snapshot tools; game-studio "capture first, then guess".

8. **A "why can't I see it" checklist, plus a short list of three.js silent failures.** Exists, visible,
   parent visible, scale, layers, near and far planes, material opacity and side, draw range, clipping, lights;
   then colour space, light decay, shadow camera bounds, skinned clones. Keep the list to things that fail
   with no error. Sources: threejs-devtools-mcp `prompts.ts`; godogen `engines/threejs.md`.

9. **A playtest-notes intake skill.** Turn the tester's notes and session file into a table
   `# | Time | Severity | Issue | Proposed fix` with severities BLOCK, FIX, INFO and KEEP; stop for approval;
   one commit per approved row; verify each by replaying the session to that moment; quote the tester and ask
   when a note is ambiguous. Sources: jrejaud `game-playtest` skill and `recording-review.md`.

10. **Telemetry that records only changes.** The session file gets a wall-clock start line, then inputs and a
    few watched values only when they change, so a note such as "around two minutes in" maps to exact inputs
    and state. Sources: jrejaud `examples/godot_telemetry.gd`.

11. **Feel as numbers in the feel report.** Frames from input to first visible response (target under about
    100 ms), frames to full speed, to reverse and to turn 90°, whether a held direction moves the kaiju along
    its screen axis, and for each key event (stomp, building hit, repair complete) the list of channels that
    reacted. Sources: paprika3d `feel` and `interact` Response lines; game-juice principles P-01, P-02, P-06.

12. **A juice pass by event tier, with restraint rules.** Classify events small, medium, large; give each
    tier one bundle (shake trauma, hit-stop, particles, flash, sound with ±5 to 10% pitch variation); shake
    the camera not the physics body; real-time timers through hit-stop; toggles for shake, flashes and camera
    motion; no more than three flashes a second; nothing hides the kaiju or the job target. Sources:
    gamedev-skills `game-feel` skill; game-juice `principles.md` (parameter table, P-15 to P-18); Eiserloh,
    "Juicing Your Cameras With Math", GDC 2016, https://archive.org/details/GDC2016Eiserloh; Jonasson and
    Purho, "Juice it or lose it", https://www.gdcvault.com/play/1016487/Juice-It-or-Lose-It and
    https://github.com/grapefrukt/juicy-breakout; Nijman, "The Art of Screenshake" (2013); Swink, *Game Feel*
    (2009). The talk links are as cited in game-juice's `RESEARCH.md`; they were not opened here.

13. **A physics tuning protocol.** Read current values first; one knob per change; all tunables in one file;
    a headless test for each failure class (tunnelling, exploding stacks, bodies that never sleep) that exits
    non-zero; run physics checks more than once; when a check fails, question the code before loosening the
    tolerance; then put specific questions to the playtester rather than "how does it feel?". Sources:
    gamedev-skills `physics-tuning` skill; ANCHOR devlog (search summary); deleted `develop-web-game` skill.

14. **A QA inventory before saying "done".** List each claim the final message will make and the evidence
    for it (test, state read, screenshot), add two off-the-happy-path checks, and report anything that could
    not be measured as unmeasured. Sources: `openai/skills` `playwright-interactive` skill;
    alexmeckes `godot-interactive` skill; Erodenn (`null` with a warning).

15. **A human playtest script.** A one-line premise and no other explanation; log every question the tester
    asks; record time to first repair, time per job, and the count of "what do I do?" moments; ask afterwards
    for the most confusing moment, best and worst moments, and what to cut. Sources: hasparus/haunted issue
    #1; game-studio `playtest-checklist.md`.

## 5. Could not verify, and gaps

- **Reddit.** No post, comment or link from r/godot, r/ClaudeGameDev, r/ClaudeCode or r/aigamerdevs was read.
  Whether any repository above was shared there is unknown.
- **Every write-up outside GitHub** is known only from search summaries. The ones most worth reading in full,
  if their hosts are allowed in the session's network settings: simonwillison.net (28 October and 5 August
  2026), news.ycombinator.com (items 47600002, 47947525, 47400868), leocoout.medium.com, chierhu.medium.com,
  forum.godotengine.org (thread 137567), blog.jeffschomay.com, dmnshd.gg, supertommy.com, dev.to,
  apeiron01.itch.io, pepwuper.com, adventuremedia.ai, gonzoml.substack.com, liminalwarmth.substack.com.
  Searches did not return the "what fell short" section of the dmnshd.gg racing post, the lessons section of
  the pepwuper headless-Godot post, or the body of the dev.to "works, not fun" post.
- **YouTube** descriptions and videos were not opened.
- **Nothing was run.** Whether paprika3d or threejs-devtools-mcp work with three r187, Rapier 0.21 and our
  build is untested. paprika3d's benchmark figures are its own.
- **Star counts and licences** are missing for the repositories marked "not checked". `takahirox/three-webmcp`,
  `BigBadLoser/cc-ftl`, `Math-Quest-Web/Math-Quest` and `simonw/raccoon-heist` showed no licence on their pages.
- **Not in the window.** The `develop-web-game` skill (January to April 2026), phaserjs-oakwoods (January),
  Godogen's first release (March), the Mario Galaxy and Jeff Schomay threads (about April) and Vibe Jam 2026
  (April to May) predate August. They are included because tools from the window build on them.
- **Not found.** No write-up in the window reports using recorded player telemetry to tune a three.js physics
  game, and none describes an agent-run tuning panel. No source measures how well an agent's judgement of a
  screenshot matches a human's. Simon Willison's "more fun" claim has no second source.
- **Godot tooling** is crowded and much of it is copied or vendor-led; several roundups are written by vendors.
  Only three servers were read in depth.
