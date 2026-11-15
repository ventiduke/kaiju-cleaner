# Claude Code skills and agent workflows for making games

Survey date: 2026-11-15. Scope: skill packs, subagent setups, CLAUDE.md conventions and workflows for
game development with Claude Code or similar coding agents, with a bias toward what fits Kaiju Cleaners
(Three.js, strict TypeScript, Rapier, Vite, Vitest, headless sim, Playwright screenshots, GitHub Pages).

## How this was done, and what the numbers mean

- Reddit was not read, directly or through any mirror or archive. Everything here comes from web search
  outside Reddit, GitHub repository pages, and the repositories themselves.
- Every repository in the table was confirmed by cloning it on 2026-11-15 (a shallow clone for the ones
  reviewed in depth, partial in two cases noted in section 4; a history-only clone for the rest). Nothing
  from any clone was run or installed.
- **Stars** are the figure shown on the repository's own GitHub page on 2026-11-15, read through a page
  fetch that summarises the page. A direct request for the page HTML was refused by this session's network
  proxy, and the GitHub API was not enabled for these repositories, so the exact counters could not be
  cross-checked. Treat them as "what the page showed, to the precision GitHub rounds to". Star figures on
  skill directories (skills.sh, claudemarketplaces and similar) disagreed with each other and were not used.
- **Last activity** is the date of the newest commit on the default branch in the clone.
- **Licence** is from the LICENSE file in the clone unless the cell says otherwise.
- The request was for roughly August to November 2026. Repositories with no commit in that window are
  still listed when they were given as starting points; the date column shows which ones those are.

## 1. Every repository found

| `owner/repo` | URL | What it is | Licence | Stars | Last activity | Relevance | How found |
|---|---|---|---|---|---|---|---|
| `majidmanzarpour/threejs-game-skills` | https://github.com/majidmanzarpour/threejs-game-skills | Nine skills for Three.js browser games: a director that routes to gameplay, graphics, UI, debug, QA and three asset generators; ships a Vite + TypeScript scaffold and a canvas inspector | MIT | 2.8k | 2026-09-27 | high | Task starting list; https://skills.sh/majidmanzarpour/threejs-game-skills/threejs-game-director |
| `PlayableIntelligence/game-creator` | https://github.com/PlayableIntelligence/game-creator | Claude plugin for Phaser and Three.js games: 34 skill folders, 4 agents, QA after every step. `opusgamelabs/game-creator` resolves to the same repository | MIT per README and skill frontmatter; no LICENSE file at the root of the clone | 367 | 2026-11-04 | high | https://claudemarketplaces.com/skills/opusgamelabs/game-creator/threejs-game |
| `levy-street/world-of-claudecraft` | https://github.com/levy-street/world-of-claudecraft | A shipped Three.js + TypeScript browser MMO built mostly by agents. Not a skill pack: its own CLAUDE.md files, 15 skills, 13 reviewer agents and hooks are in the repository | MIT (code) | 2.3k | 2026-11-05 | high | Search result linking https://raw.githubusercontent.com/levy-street/world-of-claudecraft/master/CLAUDE.md |
| `AlterLab-IEU/AlterLab_GameForge` | https://github.com/AlterLab-IEU/AlterLab_GameForge | 41 skills and 11 studio subagents; includes a Three.js specialist, a build loop skill and a Three.js starter CLAUDE.md pinned to the versions we use | MIT | 56 | 2026-11-06 | high | https://openskillindex.com/skills/alterlab-ieu-alterlab-gameforge-game-jam-mode |
| `gamedev-skills/awesome-gamedev-agent-skills` | https://github.com/gamedev-skills/awesome-gamedev-agent-skills | 79 skills and a router across 12 engines; three Three.js skills, engine-neutral discipline skills (game feel, physics tuning, camera), a written skill format and trigger evals | Apache-2.0 | 8.9k | 2026-11-12 | high | Task starting list; https://skills.sh/gamedev-skills/awesome-gamedev-agent-skills |
| `Donchitos/Claude-Code-Game-Studios` | https://github.com/Donchitos/Claude-Code-Game-Studios | Project template: 49 subagents, 78 skill folders, 18 hook scripts, 14 path-scoped rules. Engine agents are Godot, Unity and Unreal; the `/prototype` skill builds browser games | MIT | 39.4k | 2026-11-09 | high for `/prototype` and the authoring rules, low for the studio hierarchy | Search hit https://gameproductionalchemist.substack.com/p/claude-code-game-studios-49-agents (page not opened) |
| `CloudAI-X/threejs-skills` | https://github.com/CloudAI-X/threejs-skills | 13 reference skills for three.js r186 (fundamentals, materials, lighting, performance, loaders, asset pipeline and so on), each ending in a list of outdated patterns and their replacements | MIT | 4.2k | 2026-10-19 | high as API reference, none as workflow | Task starting list |
| `anthropics/skills` | https://github.com/anthropics/skills | Anthropic's example skills, the pointer to the Agent Skills spec, and `skill-creator` | Apache-2.0 for most skills per README; each skill has its own LICENSE.txt | 194.7k | 2026-11-14 | high for the format, not about games | Task starting list |
| `openai/plugins` | https://github.com/openai/plugins | Codex plugin examples. `plugins/game-studio` has nine skills, including `three-webgl-game`, `web-game-foundations` and `game-playtest` | `plugin.json` for game-studio says MIT; no licence file at the repository root | 7.9k | 2026-11-06 (whole repository) | medium | https://tessl.io/registry/skills/github/openai/plugins/game-playtest |
| `simonw/battledrones` | https://github.com/simonw/battledrones | A three.js + Vite + Vitest RTS built with Claude Code. No skills, but the repository holds the session prompts, in-progress screenshots, a tested `juice` module and balance tools | Apache-2.0 | 69 | 2026-10-23 | medium | Search summary of a simonwillison.net post that could not be opened |
| `davila7/claude-code-templates` | https://github.com/davila7/claude-code-templates | Large registry of Claude Code components. Holds a copy of OpenAI's `develop-web-game` skill, the origin of the `render_game_to_text` and `advanceTime` hooks | MIT | 33.7k | 2026-11-14 | medium (one skill) | https://playbooks.com/skills/davila7/claude-code-templates/develop-web-game |
| `openai/skills` | https://github.com/openai/skills | Codex skills catalogue, marked deprecated in favour of `openai/plugins` | Per skill | 28.8k | 2026-06-23 | low | https://skills.sh/openai/skills/develop-web-game |
| `mrdoob/three.js` | https://github.com/mrdoob/three.js | The engine. `docs/llms.txt` is its own guidance for language models (import maps, when to use WebGLRenderer or WebGPURenderer, TSL) | MIT | not checked | 2026-11-15 | medium (one file) | Cited inside GameForge's Three.js specialist and bundled in game-creator's `threejs-game/reference/` |
| `Nice-Wolf-Studio/claude-skills-threejs-ecs-ts` | https://github.com/Nice-Wolf-Studio/claude-skills-threejs-ecs-ts | 13 skills for Three.js, ECS and TypeScript game types, with a mobile slant | MIT | 35 | 2026-07-29 | medium | https://agent-skills.cc/skills/Nice-Wolf-Studio-claude-skills-threejs-ecs-ts |
| `tolitius/salvador` | https://github.com/tolitius/salvador | Visualisation agent that also carries a `game` skill (KAPLAY 2D, Three.js 3D) with a Puppeteer playtest script | EPL 1.0 or later, per README | 16 | 2026-02-11 | low | https://skills.sh/tolitius/salvador/game |
| `freshtechbro/claudedesignskills` | https://github.com/freshtechbro/claudedesignskills | 22 web 3D and animation skills; `threejs-webgl` is one | MIT | 1.4k | 2025-11-19 | low | Task starting list; https://skills.sh/freshtechbro/claudedesignskills/threejs-webgl |
| `sickn33/antigravity-awesome-skills` | https://github.com/sickn33/antigravity-awesome-skills | Collection of about 2,950 skills; `skills/game-development` is a router with sub-skills such as `web-games`. The GitHub page now titles it `sickn33/agentic-awesome-skills` | MIT, with CC BY 4.0 for written content | 49.7k | 2026-11-12 | low | Task starting list; https://claudemarketplaces.com/skills/sickn33/antigravity-awesome-skills/game-development |
| `vudovn/antigravity-kit` | https://github.com/vudovn/antigravity-kit | Agent kit with 47 skills and 20 agents; `.agents/skills/game-development` is a near copy of the router above. The page now titles it `vudovn/ag-kit` | MIT | 8.2k | 2026-08-31 | low | Task starting list; https://claudemarketplaces.com/skills/vudovn/antigravity-kit/game-development |
| `Jeffallan/claude-skills` | https://github.com/Jeffallan/claude-skills | 67 full-stack skills; `skills/game-developer` covers Unity and Unreal only | MIT | 12.4k | 2026-10-30 | low | Task starting list |
| `jwynia/agent-skills` | https://github.com/jwynia/agent-skills | Mixed skill collection; game entries are `godot-best-practices`, `godot-asset-generator` and `abstract-strategy` | No licence file at the repository root | 188 | 2026-02-24 | low | Task starting list; https://www.skills.sh/jwynia/agent-skills/godot-best-practices |
| `github/awesome-copilot` | https://github.com/github/awesome-copilot | Copilot instructions and skills; `skills/game-engine` is a general web game skill | MIT | 41.2k | 2026-11-13 | low | https://claudemarketplaces.com/skills/github/awesome-copilot/game-engine |
| `pamirtuna/gamestudio-subagents` | https://github.com/pamirtuna/gamestudio-subagents | 12 role subagents (orchestrator, producer, designers, "game feel developer", QA) for Godot, Unity and Unreal | MIT | 288 | 2025-08-24 | low | Named as the parent on the fork's GitHub page |
| `thomasphillips3/gamestudio-subagents` | https://github.com/thomasphillips3/gamestudio-subagents | Fork of the above, converted to native subagents | MIT | 0 | 2026-07-10 | low | https://www.claudepluginhub.com/plugins/thomasphillips3-gamestudio-subagents |
| `dylantarre/animation-principles` | https://github.com/dylantarre/animation-principles | 144 small skills applying the twelve animation principles by domain and role; two are game-facing | MIT | 158 | 2025-12-30 | low | https://skillselion.com/skills/dylantarre/animation-principles/game-designer |
| `omer-metin/skills-for-antigravity` | https://github.com/omer-metin/skills-for-antigravity | Skill library with a "Game Dev" category; one commit; individual game skills not inspected | Apache-2.0 | 212 | 2026-01-22 | low | https://claudeskills.info/skills/omer-metin/skills-for-antigravity/game-development/ |

25 repositories. Eight are reviewed in depth below; three medium ones get a short note after that.

## 2. Reviews of the high-relevance repositories

### majidmanzarpour/threejs-game-skills

Nine skill folders. Each `SKILL.md` is short (26 to 120 lines) and points at `references/` files with a
"read it when" table; the detail sits in the references and in two scripts. The director skill sets scope
from the user's own words ("a small arcade game is not a request for the full premium pipeline"), names one
lead who owns integration and a single consolidated verification pass, and keeps `artifacts/game-progress.md`
for resumption.

Worth borrowing:
- The evidence manifest. Before capturing, the agent writes `artifacts/evidence.json` listing viewport and
  state pairs with a fresh run ID. One inspector command captures all of them; a checker verifies only that
  set. A failing slot may not be removed, and old reports may not be relabelled as new.
- Named screenshot states through real hooks: `setState(name)` must return `{ state: name }` and unknown names
  must throw; `setPausedForScreenshot` stops the simulation while rendering continues.
- The inspector prints pixel metrics (colour entropy, edge density, luminance contrast, dominant colour share)
  and flags software rendering, in which case frame-rate numbers are declared invalid.
- A bot playtest that reports frames advanced, distance travelled, progress, and "softlock windows", plus a
  reckless run to prove the fail state and retry.
- `game-feel.md`: an order of operations, with copy-ready strict TypeScript for trauma shake, hitstop on the
  gameplay delta only, squash and FOV punch, and a table of event to feedback stack.
- `physics-engine-selection.md`: Rapier with a clamped fixed-step accumulator, one sync point, and the note
  that sensors do nothing without active events.

Does not fit: three of the nine skills drive external asset generation services; the visual scorecard's categories assume a
premium art target; mobile capture is on by default; the hooks live on `window`, so none of it covers a
simulation that runs in Node.

### PlayableIntelligence/game-creator

A Claude plugin with 34 skill folders, four agents (`game-creator`, `game-qa-runner`, `game-reviewer`,
`game-deploy`), two templates and helper scripts that drive the installed Chrome over the DevTools protocol.
Its latest commit (4 November) removed Playwright in favour of those scripts. The Three.js template is JavaScript,
built on an EventBus singleton, a GameState singleton and a `Constants.js`.

Worth borrowing:
- The live-iterate loop in `make-game/sub-pipelines/live-iterate.md`: after every change, check the console,
  read `render_game_to_text()` before looking at pixels, step time with `advanceTime(ms)`, screenshot only if
  the change is visual, run a one-action check on each neighbouring system, then give a verdict (verified,
  off-target or broken) and ask the player one narrow question.
- `playtest-repro.md`: turning "feels floaty" into a confirmed, measurable acceptance criterion before any
  code changes.
- Gameplay invariants as tests: the player can score, doing nothing must end in a loss ("never write a passing
  test for a no-input win"), and "design intent" thresholds taken from constants so a mechanic that exists
  but is too weak still fails.
- The QA runner agent: classify each failure as game bug, test bug, config issue or intentional change;
  never weaken an assertion; stop after three fix rounds and report what is left.
- `threejs-perf` measures instancing and notes that in headless Chromium only CPU-side numbers (draw calls,
  render CPU time) can be trusted.
- `make-game` rules: one feature per session, everything else goes to `docs/backlog.md`; milestones need an
  exit condition of the form "user does X, observes Y".

Does not fit: the singleton and event bus architecture and plain JavaScript; the monetisation and one-shot
"viral game" pipelines; its `advanceTime` waits for real time and is not a deterministic step.

### levy-street/world-of-claudecraft

Not a pack. It is the working setup of a large game on a stack close to ours: one deterministic TypeScript
simulation with no DOM or Three.js imports, a Three.js renderer that only reads it, Vitest on the simulation
in plain Node, and browser screenshot scripts kept separate. Only the documentation, `.claude/` and
`.agents/` were checked out for this review, plus two test files.

Worth borrowing:
- Invariants enforced by tests, not prose. `tests/architecture.test.ts` scans every simulation file for
  forbidden imports and for `Math.random`, `Date.now` and `performance.now`. `tests/monolith_budget.test.ts`
  pins a line ceiling per large file; growth fails the suite, the fix is extraction, and the ceiling is
  lowered afterwards.
- Layered enforcement, each layer sized to how often it fires: a PreToolUse guard on generated files, a Stop
  hook that scans only added lines for instant tripwires (`.only(`, `debugger`, randomness under `src/sim/`)
  and never runs the compiler or tests, a pre-push floor with `tsc` and the guard tests, and a `/qa` skill
  for judgement.
- The `/qa` skill dispatches fresh reviewer agents ("never have the implementer review its own work"), runs
  the deterministic checks itself, re-checks each finding before acting, and ends READY or NOT READY with a
  list of things a person still has to run.
- `pr-screenshots`: a table mapping changed paths to a bring-up recipe and clip region, so a new shot is one
  entry and not a new script; before and after captured with the same script; the lowest graphics preset
  for every capture unless the shot is about graphics.
- A short root CLAUDE.md with a per-directory CLAUDE.md that loads on demand.

Does not fit: the release branch, merge queue, localisation and server rules, and the sheer volume of
process. The pieces above stand alone.

### AlterLab-IEU/AlterLab_GameForge

Forty-one skills in three groups: eleven studio role agents, twenty-five workflows and five engine
specialists, with seven hooks and starter CLAUDE.md files per engine. Small audience, but the Three.js
material is the closest match to our dependency versions of anything found: `starters/threejs/CLAUDE.md`
pins three 0.187, `@dimforge/rapier3d-compat` 0.21, Vite 8 and TypeScript 7.

Worth borrowing:
- The starter CLAUDE.md is commands first ("a task is not done until these pass"), then pinned versions, then
  rules the agent cannot infer: fixed 1/60 s steps from an accumulator capped at 0.25 s, every gameplay number
  in one tuning file, seeded randomness with `Math.random()` allowed for cosmetics only, and a list of
  "patterns to reject in any diff".
- The "patterns AI agents still get wrong" table in the Three.js specialist: about 25 rows of outdated call,
  replacement and the release that changed it (`Clock` to `Timer`, `PCFSoftShadowMap`, `renderAsync`, and
  others), plus known-harmless console warnings that should not be "fixed".
- The test contract: in test mode the loop starts paused, so state depends only on the seed and the
  `advanceTime` calls. The skill reports that pausing after load gave flaky screenshots and starting paused
  gave identical ones.
- The `game-vibe-code` loop: write the check before the prompt; "a screenshot is evidence only after someone
  looked at it"; commit at every green check; after two failed corrections, revert and re-prompt smaller.
- A `balance(scope):` commit type for changes that touch only tuning values.

Does not fit: the studio role agents, market research, monetisation and publishing workflows. The human
playtest workflow (questions before testers, five testers per round, consent forms) is sound but far more
than a prototype with one playtester needs.

### gamedev-skills/awesome-gamedev-agent-skills

Seventy-nine skills plus a router, grouped by engine, discipline, genre and workflow. The router fingerprints
the project (a `three` dependency selects the Three.js skills), reads the pinned engine version before
choosing APIs, and loads two or three skills. Three skills are Three.js-specific; the discipline skills are
engine-neutral, with examples mostly in GDScript and C#.

Worth borrowing:
- `docs/SKILL-FORMAT.md` is the clearest written standard found. Frontmatter is exactly `name` and
  `description`; the description opens with the job, uses words people type, and ends with a "Not for ..."
  clause naming the neighbouring skill. Every workflow ends with a check the agent can run and what a pass
  looks like. Steps that need a person are written "ask the user to ... and report ...". One `## Gotchas`
  section in the form symptom, cause, remedy. Facts that go stale sit in a dated `## Version notes` section.
- Trigger evals: 366 prompts (should trigger, near miss, combination, none) scored by a separate agent
  that sees only names and descriptions. The results file also explains why descriptions were shortened:
  Claude Code lists them within a budget of 1% of the context window.
- `game-feel`: three tiers (small, medium, large) with trauma, hit-stop and particle ranges, one
  `feedback(tier, pos)` entry point, and a headless check (fire the event twice 30 ms apart; time scale back
  to 1; trauma reaches zero; scale ends at rest).
- `prototype-fast`: a one-question brief with written keep and kill signals.
- `threejs-scene-setup`: keep game state in plain objects and copy it to meshes each frame; a smoke script
  that forces a WebGL context loss and restore.

Does not fit: most of the catalogue is for other engines; there is no Rapier or TypeScript-specific
guidance; the accuracy figures are the project's own, judged by models.

### Donchitos/Claude-Code-Game-Studios

A project template you start Claude Code inside: 49 subagents in a studio hierarchy, 78 skill folders, hooks,
and rules scoped by file path. The README reports the project's own comparison: the same brief built at
`minimal` rigor (one document before code) and at `standard` (30 documents, 58 minutes). Two blind reviewers
and a human playtest ranked the `standard` build last, so the light path became the default.

Worth borrowing, mostly from `/prototype` and `.claude/rules/`:
- Every route ends in PROCEED, PIVOT, KILL, or NOT ASSESSED when nobody has played the build; three pivots on
  one concept force a kill.
- A fixed "small check" of about five minutes with one fix round. Results are rows in a TSV, and a row that
  could not run is `not_assessed` with a reason, never a pass.
- Every tuning value in `config.js` with `value`, `min`, `max` and `step`, read live. A tweak panel exports
  values to paste back, and a script writes them with a line in `feel-log.md`.
- Keep and Avoid lists in the player's own words, with the tuning values behind each Keep line pinned. A
  check compares pins to the config before any change is accepted.
- A cheap render mode for automated shots (no antialiasing, pixel ratio 0.5, no shadows or post): "never
  tune the game for a slow headless shot".
- `rules/skill-authoring.md`: "a check that cannot report that it did not run is not a check", and "a gate
  you have not watched fail is not a gate".
- `rules/test-standards.md`: run a regression test against the unfixed code and watch it fail first.

Does not fit: the director and lead agents, the "may I write this file?" protocol, design documents,
sprints and stories. The one-shot prototype is a single HTML folder in plain JavaScript.

### CloudAI-X/threejs-skills

Thirteen skills, one `SKILL.md` each of 240 to 500 lines, with no references, scripts or workflow. Each
follows the same layout: a runnable quick start, topic sections, a WebGPU and TSL section, "Common
Mistakes" and "See Also". The pack targets three.js r186, React Three Fiber 9.8 and gltf-transform 4.5;
the README says every import path and class was checked against the published packages.

Worth borrowing:
- The "Common Mistakes" form: outdated or wrong code, an arrow, the current code, and the reason in one
  sentence. Examples from `threejs-performance`: read `renderer.info.render.calls` after `render()`, not
  before, because the counters reset at the start of the call; `material.dispose()` does not free the
  material's textures; `Object3D.dispose()` on a glTF scene frees nothing below the root; do not disable
  frustum culling scene-wide; per-frame `new Vector3` shows up as periodic frame spikes; `Clock` to `Timer`.
- Stating the targeted release at the top of every skill, so a mismatch with the installed version is
  visible at once.
- `threejs-performance` starts with "Measure First" before any optimisation advice.

Does not fit as a workflow: the skills tell the agent what the API is, not what to do, in what order, or
how to check the result. There is nothing about games, physics or testing. It is one release behind us
(we have three 0.187 installed), so each claim would need checking against r187 before being copied.
Installing all thirteen would also add thirteen descriptions to the listing budget for knowledge we need
only occasionally; a single project skill with our own short table of mistakes would cost less.

### anthropics/skills

Anthropic's example skills, a template and a pointer to the specification at agentskills.io. Nothing in it
is about games. It matters here as the reference for the format and for `skill-creator`, the skill for
writing and measuring skills. `webapp-testing` is the nearest neighbour to our screenshot scripts.

Worth borrowing:
- Three loading levels: the name and description are always in context (about 100 words), the `SKILL.md`
  body loads when the skill triggers (under 500 lines), and bundled `references/`, `scripts/` and `assets/`
  load or run only when needed. A reference file over 300 lines gets a table of contents.
- The description is the trigger. `skill-creator` says Claude tends to under-trigger skills and recommends
  descriptions that state both what the skill does and the situations that should invoke it.
- Explain why a rule exists instead of writing it in capitals.
- Measure a skill: write a few test prompts, run them with the skill and without it in the same turn, grade
  both, read the outputs, rewrite, and repeat. A separate loop tunes the description against trigger
  queries.
- From `webapp-testing`: treat helper scripts as black boxes. Run them with `--help` first and do not read
  their source into context unless a custom solution is unavoidable. Our `scripts/shots.mjs` already has a
  usage header that serves this purpose.

Does not fit: the evaluation viewer and benchmark tooling assume more skills and more traffic than a
prototype will have. The two-run comparison (with and without the skill) is the part worth keeping.
`webapp-testing` is Python and waits for network idle, which says nothing about whether a WebGL frame has
been drawn.

### Medium relevance, briefly

- **`openai/plugins`, `plugins/game-studio`.** `three-webgl-game` names our stack exactly (three, TypeScript,
  Vite, Rapier, DOM overlays) and gives boundary rules: simulation state lives outside Three.js objects, the
  render graph is an adapter, UI stays in the DOM, and the first playable view is "low-chrome". `game-playtest`
  adds a checklist for 3D (HUD weight against playfield visibility, camera reset, context loss, collision
  proxy mismatch) and a report form: what the user sees, how to reproduce, why it matters, which subsystem
  owns it. Thin on procedure; the Rapier starter steps the world once per render frame, which we should not copy.
- **`develop-web-game`** (OpenAI's skill, read in the `davila7/claude-code-templates` copy). The source of the
  two hooks that game-creator and GameForge both adopted: `window.render_game_to_text()` returning compact
  JSON of visible state with a note on the coordinate system, and `window.advanceTime(ms)` stepping fixed
  updates. Also: open and inspect every screenshot, "fix the first new error before continuing", change one
  variable at a time, and keep a `progress.md` whose first line is the original prompt.
- **`simonw/battledrones`.** A working example on three, Vite and Vitest. Feedback effects are a `src/game/juice`
  module of small classes, functions and constants, covered by `tests/juice.test.ts`. Balance and pacing run as scripts
  (`tools/balance.ts`, `tools/pacing.ts`, `tools/scripted-player.ts`). In-progress screenshots are committed
  under `progress-shots/`, and every session's prompts are kept in `web-session-prompts.md`.

## 3. Practices worth turning into skills for Kaiju Cleaners

Each item says what to do, where it came from, and what Kaiju Cleaners already has. "We have" statements
come from reading `package.json`, `scripts/`, `test/` and `feedback/` in this repository on 2026-11-15.

1. **Verify in a fixed order, state before pixels.** After each change: `npm run typecheck`, the one relevant
   Vitest file, `npm run build`, `npm run smoke`; read a text dump of game state; take a screenshot only if
   the change is visual; open the PNG and write one sentence on what it shows; end with a verdict (verified,
   off-target, broken) and one narrow question for the player. To do: add a compact state export (kaiju
   pose, held piece, job list, approval, awake body count, draw calls) next to `window.__game` and have
   `scripts/shots.mjs` save it beside each PNG. Sources: game-creator `live-iterate.md`; `develop-web-game`;
   GameForge `game-vibe-code` rule 4.

2. **Declare the capture set before capturing.** For each visual change, write the list of shots (scene,
   state, camera) with a run ID first, capture exactly that list, and never drop a shot because it failed or
   reuse an older PNG. Keep a table from changed paths to shots (`src/gfx/` to look shots at two times of
   day, `src/ui/` to HUD states, `src/kaiju/` to yard poses) so a new shot is one entry. Capture before and
   after with the same list. We have the mechanism (`shots.mjs` takes a JSON list); the skill adds the
   discipline. Sources: threejs-game-skills `evidence-manifest.md`; world-of-claudecraft `pr-screenshots`;
   battledrones `progress-shots/`.

3. **Named, acknowledged states for shots and tests.** A `setState(name)` style helper that throws on an
   unknown name and returns the name it applied, for example `yard-carrying`, `city-dusk-job-nearby`,
   `report-card`, `toppled`. The capture script fails when the acknowledgement does not match. Start test
   mode paused so the state depends only on the seed and the steps taken. Sources: threejs-game-skills
   `visual-test-harness.md`; GameForge Three.js specialist, testing section.

4. **Headless rendering rules.** Record in every shot report whether the GPU was software. Our smoke script
   launches Chromium with SwiftShader, so never quote frames per second from it; quote draw calls,
   triangles and simulation step time instead. Use a cheap render setting for automated shots and a full one
   only when the look itself is being judged; never change the game to make a headless shot faster. Add
   simple pixel checks (not blank, colour entropy, luminance contrast) so "black screen" and "all fog" fail
   without anyone looking. Sources: threejs-game-skills `playtest-bot.md` and inspector; game-creator
   `threejs-perf` methodology note; Game Studios `one-shot-files.md`.

5. **Motion needs a sequence, not a still.** For any change to gait, tail, toppling or carrying, capture a
   short unpaused strip at the gameplay camera (for example eight frames over two seconds) and check foot
   sliding against ground displacement, snapping between states, and contact timing against the sound and
   dust events. Source: threejs-game-skills `visual-test-harness.md`, "Motion Evidence", which also says a
   rigid-body game should check its real physics motion and not invent a skeleton audit.

6. **Scripted-player runs with numbers, in the Node sim.** Three runs per build, in Vitest: a competent
   script that completes one repair job in the yard, a do-nothing run, and a reckless run that sprints through
   buildings. Report ticks advanced, distance travelled, job progress, windows where input was held but
   nothing moved, and approval change. Assert that doing nothing does not finish the shift and that the
   reckless run costs approval by a margin taken from the tuning file, not merely "greater than zero". We have
   scripted maneuvers and session replay in `test/feel/`; this extends them from handling to the job loop.
   Sources: threejs-game-skills `playtest-bot.md`; game-creator `gameplay-invariants.md`; battledrones
   `tools/scripted-player.ts`.

7. **Turn a feel complaint into a measurable target before touching code.** Steps: restate the complaint
   narrowly and ask which reading is meant; name the variables behind it; read their current values and the
   matching `npm run feel` numbers; propose a target as an observation with a number; get a yes; change one
   value; rerun the report. The session files in `feedback/` and the maneuver report are the inputs. Sources:
   game-creator `playtest-repro.md`; gamedev-skills `prototype-fast` (a retune is one constant, then play
   again).

8. **Keep-pins.** When the player says they love something, record it in their words with the tuning values
   behind it (for example "tiptoe feels careful (you said) · pins: ..."). A check compares the pins with
   `src/tuning/defaults.json` and reports `changed` or `gone`. A change that would move a pin needs a
   question first. Also record Avoid lines the same way. Source: Game Studios
   `prototype/references/one-shot-4-change.md`.

9. **Tuning changes are their own kind of change.** All gameplay numbers stay in the tuning file with a range
   and step; a tuning-only commit touches only that file and says so in its subject; values pasted from the
   in-game panel are applied by a script that logs one line per value with the player's reason. We have the
   panel, "copy settings + notes" and `diffTuning`; the missing parts are the log and the commit convention.
   Sources: Game Studios `one-shot-files.md` (`config.js`, `feel-log.md`); GameForge starter CLAUDE.md
   (`balance` commit type).

10. **Feedback effects in tiers, as tested pure functions.** Give each event (footfall, stumble, fall, sneeze,
    piece set in place, building damaged) a tier with fixed ranges for shake, hit-stop, particles and sound.
    Order of work: input response under about 100 ms, then response curves, then contact feedback, then
    camera, then sound on the same frame. Shake is trauma squared, capped, decaying in real time; hit-stop
    scales the gameplay step only. Test in Vitest: two events 30 ms apart leave time scale at 1 afterwards,
    trauma reaches zero within `1 / decay` seconds, any scale effect ends at exactly its rest value. Offer
    reduce-shake and reduce-flash settings. Sources: threejs-game-skills `game-feel.md`; gamedev-skills
    `game-feel`; battledrones `tests/juice.test.ts`.

11. **Determinism and layering guarded by a test and a hook.** A Vitest file that scans simulation sources
    for `Math.random`, `Date.now` and `performance.now` and for imports the simulation must not have, with an
    explicit allowlist. A Stop hook that scans only the lines added this turn for the same calls, a stray
    `.only(` and `debugger`, and does nothing heavier. Note for whoever writes it: `src/sim.ts` calls
    `performance.now()` at lines 204 and 206 to time a step (measurement, not logic), and `src/sim.ts` and
    several `src/city/` and `src/kaiju/` modules import `three`; I did not check what for. The allowlist has
    to start from what is really there. Sources: world-of-claudecraft `tests/architecture.test.ts` and
    `.claude/hooks/README.md`; GameForge starter CLAUDE.md.

12. **A file-size ratchet with extraction as the fix.** Pin a line ceiling for the largest logic files
    (today `src/city/destruction.ts` 929 lines, `src/kaiju/kaiju.ts` 706, `src/city/cityGen.ts` 673,
    `src/core/tuning.ts` 624). Growth past the ceiling fails; the fix is a sibling module with its own test;
    after extraction the ceiling is lowered. Data tables are exempt. Bug fixes start with a failing test that
    is run against the unfixed code and seen to fail. Sources: world-of-claudecraft `extract-and-test` skill
    and `tests/monolith_budget.test.ts`; Game Studios `rules/test-standards.md`; GameForge (split a file
    before it passes about 500 lines).

13. **A short table of three.js and Rapier mistakes for the versions we have installed.** Read `package.json`
    first (three 0.187, Rapier 0.21). Rows in the form wrong code, right code, one-sentence reason: `Timer`
    not `Clock`; `PCFShadowMap`; read `renderer.info` after `render()`; dispose textures separately from
    materials; fixed step with a clamped accumulator; transforms synced in one place; sensors need active
    events; continuous collision detection only where tunnelling is real. Add a list of console warnings
    known to be harmless, and treat any other new warning as a failure until classified. Check each row
    against r187 before adding it. Sources: GameForge Three.js specialist table; CloudAI-X "Common Mistakes";
    `mrdoob/three.js` `docs/llms.txt`; threejs-game-skills `physics-engine-selection.md`.

14. **Rules for writing our own skills.** Frontmatter is `name` and `description` only; the description says
    what the skill does, when to use it in the words we type, and ends "Not for ..." naming the neighbouring
    skill. The body stays under 500 lines with detail in `references/`, each listed with when to read it.
    Every workflow ends in a command the agent runs and a statement of what a pass looks like. Steps that
    need a person read "ask the player to ... and report ...". Any verdict vocabulary includes "not assessed"
    with a reason; a skipped step says so in the output. Before relying on a check, break the thing it guards
    and watch it fail. Try each skill on two or three real prompts with and without it. Sources:
    gamedev-skills `docs/SKILL-FORMAT.md` and `evals/RESULTS.md`; Game Studios `rules/skill-authoring.md`;
    anthropics `skill-creator`.

15. **Scope and session discipline.** The request sets the bar: a narrow fix stays narrow and gets targeted
    checks only. One feature per session; anything else that comes up is appended to a backlog file, not held
    in conversation. Keep one progress file with current intent, decisions, defects and next steps, and reread
    it after any interruption. Do not add planning documents by default: in the one measured comparison found,
    the build that wrote 30 documents first was ranked last. Sources: threejs-game-skills director skill;
    game-creator `make-game` rules; Game Studios README.

## 4. Could not verify, and gaps

- **Reddit.** None of the named subreddits or any post, comment or shared link was read. Anything that was
  shared only there is missing from this file.
- **Blocked hosts.** `simonwillison.net`, `dmnshd.gg` and `www.developersdigest.tech` did not resolve from
  this session and would have to be allowed in its network settings. As a result no post-mortem or write-up
  was read in its original form. What is said above about Simon Willison's games comes from the
  `simonw/battledrones` repository itself; the two dmnshd.gg posts ("from a tweet to a racing game", a Vibe
  Jam 2026 entry) and the Developers Digest analysis of Game Studios are known only by title.
- **Star counts** could not be read from raw page HTML (the proxy returned 403) or the API. They are as
  summarised from each GitHub page. Several are large for the commit count shown beside them (for example
  39.4k stars and 44 commits for Game Studios, 2.8k and 11 for threejs-game-skills); that is what the pages
  showed and I have no second source.
- **Nothing was executed.** No skill was installed, no script from any clone was run, and no claim here is
  about whether a pack produces good games. Accuracy and benchmark figures quoted from a repository
  (trigger accuracy, instancing timings, the rigor comparison) are that repository's own.
- **`develop-web-game`.** The original was not at the three paths tried in `openai/skills`, which is now
  marked deprecated, and it is not in `openai/plugins` (cloned without files over 2 MB, which does not
  affect the skill text read). The text reviewed is the copy in
  `davila7/claude-code-templates`, whose frontmatter names OpenAI as author. Its Playwright client script
  was not read.
- **`levy-street/world-of-claudecraft`** was checked out sparsely (root documents, `.claude/`, `.agents/`).
  Read: the root CLAUDE.md, the `src/sim/` and `tests/` CLAUDE.md files, three skills (`qa`,
  `pr-screenshots`, and part of `extract-and-test`), the hooks README and Stop hook, one reviewer
  agent, and the first part of two tests. Its screenshot scripts, gate scripts and the other
  reviewer agents were not read.
- **`PlayableIntelligence/game-creator`** has no LICENSE file at the root of the clone; MIT is stated in the
  README and in skill frontmatter. `jwynia/agent-skills` has no licence file at the root. `openai/plugins`
  has no repository-level licence file.
- **Vibe Jam 2026.** Search summaries say the winning entry was a Three.js game built with Claude Code using
  two or three parallel sessions split by subsystem. That is second-hand (news coverage quoted by GameForge
  and by search results); the developer's own write-up was not found.
- **Not found at all:** a published skill for tuning Rapier character or vehicle physics in three.js beyond
  the general references above; a skill that tests a simulation headless in Node (every web pack found
  tests through browser hooks; the only Node-side examples are the two real projects, world-of-claudecraft and
  battledrones); a skill for reading recorded play sessions the way `npm run feel` does.
- **Seen in search results but not confirmed as repositories:** `miles990/claude-software-skills`,
  `diegosouzapw/awesome-omni-skill`, a `threejs` skill attributed to `nexu-io`, `natea/fitfinder`,
  `rshankras/claude-code-apple-skills`, `oimiragieo/agent-studio`, a `sergevatel` game-studios plugin,
  `VoltAgent/awesome-agent-skills`, `ComposioHQ/awesome-claude-skills`, and a koota skill from `pmndrs`.
  These are leads only.
- **Time window.** Nine of the 25 repositories have no commit since the start of August 2026 (see the date
  column). They are listed because they were named as starting points or turned up in search, not because
  they are recent. Commit dates also say nothing about when something was shared or discussed.
