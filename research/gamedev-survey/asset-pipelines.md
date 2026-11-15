# AI asset pipelines for a browser game (survey, 15 November 2026)

Scope: what people building games with gen-AI tools were sharing between roughly August and November 2026 about
generated 3D models, textures, sprites, skies and sound, and which of it Kaiju Cleaners (three.js, TypeScript,
Rapier, Vite, static site, no GPU in the build container) could use.

How this was done. Reddit could not be read and no mirror or archive of it was used. Everything here comes from
web search outside Reddit and from GitHub itself: repository pages, raw files, and shallow clones that were read
but never run. Star counts are the rounded figures GitHub showed on 15 November 2026. Prices come from the
repositories' own documents unless marked otherwise, and none was checked against a vendor's price page.
No paid API was called, including Gemini.

Three things were actually executed in this session, all local and free:

- Blender as a Python module (`bpy` 5.3.0 from PyPI) installed into a scratch virtualenv and ran headless: it
  made a mesh, decimated it from 5,120 to 512 faces, UV-unwrapped it and exported a GLB in 0.26 s.
- ImageMagick commands for checking and repairing texture seams (section 4, item 1).
- Network checks showing which hosts this session can reach (section 4, "What the session can reach").

## 1. What "Topology AI" is

It could not be identified. Nine web searches for "TopologyAI", "Topology AI" and "r/TopologyAI" (with and
without 3D, retopology, game, Claude, GitHub and Discord as extra terms) found no product, company, repository,
Discord or public page with that name, and no description of a subreddit called that. The closest unrelated hit
was a GitHub organisation `topology-cloud` ("Operating System for the Built Environment") with no public
repositories. So nothing can be said about what that community shares.

The most likely reading, and it is only a guess from the name and the company it keeps in the owner's list, is
a small subreddit about AI-generated 3D meshes and their topology. That subject is real and was active in the
period:

- Tripo's `tripo-cli` README (npm, 4 Nov 2026) says its default model is now `P2-20260801`. Trade press reported
  that P2.0 produces quad meshes natively:
  [runtimewire](https://runtimewire.com/article/tripo-ai-p2-native-quad-meshes-3d-generation),
  [VoxelMatters](https://www.voxelmatters.com/tripo-ai-launches-p2-0-model-to-generate-native-quad-meshes-for-production-pipelines/).
  Only the headlines were seen; neither article was opened.
- Meshy sells "Smart Topology" models (`meshy-t2`, `meshy-t2.5`), listed in the
  [meshy-mcp-server README](https://github.com/meshy-dev/meshy-mcp-server).
- AutoRemesher 1.0 was relicensed to MIT in July 2026
  ([Digital Production](https://digitalproduction.com/2026/07/28/autoremesher-final-goes-mit/); the
  [repository](https://github.com/huxingyi/autoremesher) shows MIT).
- Two paid Blender retopology add-ons got coverage in October 2026: Quadify
  ([BlenderNation, 5 Oct](https://www.blendernation.com/2026/10/05/quadify-clean-quad-retopology-for-ai-scan-and-cad-meshes-in-blender/))
  and Nitro Retopo ([Digital Production, 13 Oct](https://digitalproduction.com/2026/10/13/nitro-retopo-dense-blender-meshes/)).
  These were seen as search results, not opened.

If the owner can paste the subreddit's description or a few post titles, this section can be replaced.
"r/aigamerdevs" is assumed to be r/aigamedev; nothing from it was read.

## 2. Repositories

All of these were confirmed to exist on GitHub on 15 November 2026. "Cloned" means a shallow clone was read.
Relevance is to this project as it stands: a browser game whose build container has no GPU and whose only
credential is Gemini.

### Agent skills and MCP servers that wrap asset generation

| Repo | What it is | Licence | Stars | GPU / cost | Relevance | Found via |
|---|---|---|---|---|---|---|
| [htdt/godogen](https://github.com/htdt/godogen) | Claude Code / Codex skills that build whole games (Godot, Bevy, Babylon.js, three.js); one `asset-gen` skill covers images, 3D, voice, music. Cloned, last commit 2026-10-16 | MIT | 7.3k | Local path needs an NVIDIA GPU; paid path uses Gemini, xAI and Tripo keys | high | [gigazine](https://gigazine.net/gsc_news/en/20260317-godogen/) |
| [htdt/godogen_assets](https://github.com/htdt/godogen_assets) | The local generators godogen calls: Qwen-Image, TRELLIS.2, Make-It-Animatable, Kimodo, Stable Audio 3, Qwen3-TTS. Cloned, 2026-10-01 | none stated | 2 | RTX 3060 12 GB, 24 GB RAM, about 130 GB disk during setup | low (no GPU) | godogen README |
| [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) | Nine skills for three.js games; three are asset generators (Gemini images, Tripo 3D, ElevenLabs audio). Cloned, 2026-09-27 | MIT | 2.8k | No GPU; three optional paid keys | high | [claudemarketplaces](https://claudemarketplaces.com/skills/majidmanzarpour/threejs-game-skills/threejs-audio-generator) |
| [kingbootoshi/nano-banana-2-skill](https://github.com/kingbootoshi/nano-banana-2-skill) | Bun CLI and Claude Code skill for Gemini images, with reference images and green-screen transparency. Cloned, 2026-02-26 | MIT | 420 | No GPU; Gemini per image | high | [claudeskills.info](https://claudeskills.info/skills/kingbootoshi/nano-banana-2-skill/nano-banana/) |
| [ybuild-ai/ai-game-art-pipeline-skill](https://github.com/ybuild-ai/ai-game-art-pipeline-skill) | Provider-neutral skill for 2D game art: prompt patterns, magenta keying, contact sheets, video-to-frames. Cloned, 2026-06-18 | MIT | 306 | No GPU; bring your own image API | medium | [sourcepulse](https://www.sourcepulse.org/projects/30309402) |
| [gemini-cli-extensions/nanobanana](https://github.com/gemini-cli-extensions/nanobanana) | Gemini CLI extension and MCP server: generate, edit, icon, pattern, story. Cloned, 2026-03-06 | Apache-2.0 | 1.1k | No GPU; Gemini per image | medium | prior knowledge |
| [Meowa-AI/meowa-skills](https://github.com/Meowa-AI/meowa-skills) | One `game-assets` skill for pixel art, tilesets, seamless textures and audio, all through Meowa's own paid API. Cloned, 2026-11-08 | MIT | 55 | No GPU; needs `MEOWART_API_KEY` | low | [claudeskills.info](https://claudeskills.info/skills/meowa-ai/meowa-skills/game-assets/) |
| [PlayableIntelligence/game-creator](https://github.com/PlayableIntelligence/game-creator) | Claude Code skills for browser games; pixel art drawn in code, music with Strudel, Web Audio effects (was `opusgamelabs/game-creator`) | MIT (Strudel music makes the game AGPL) | 367 | No GPU, no keys for the procedural parts | medium | [claudemarketplaces](https://claudemarketplaces.com/skills/opusgamelabs/game-creator/game-3d-assets) |
| [ahujasid/blender-mcp](https://github.com/ahujasid/blender-mcp) | "MCP for Blender" (renamed September 2026; GitHub now shows it as `ahujasid/mcp-for-blender` and the old URL redirects): drives a running Blender; can call Tripo, Hunyuan3D, Rodin, Meshy and import Poly Haven, Sketchfab, Poly Pizza assets. Cloned, 2026-11-13 | MIT | 34.5k | Needs Blender open with its add-on; generators need keys or the paid "Premium" tier | medium | named in the brief |
| [VAST-AI-Research/tripo-mcp](https://github.com/VAST-AI-Research/tripo-mcp) | Tripo's MCP server; alpha, only works through the Tripo Blender add-on | MIT | 230 | Needs Blender plus Tripo credits | low | prior knowledge |
| [meshy-dev/meshy-mcp-server](https://github.com/meshy-dev/meshy-mcp-server) | Official Meshy MCP server, 28 tools (text/image to 3D, remesh, rig, animate, convert) | MIT | 93 | No GPU; paid Meshy Pro plan; 20–35 credits a model, remesh 5, rig 5 | low until there is a key | [Meshy docs](https://docs.meshy.ai/en/api/ai) |
| [meshy-dev/meshy-3d-agent](https://github.com/meshy-dev/meshy-3d-agent) | Meshy's skill pack for Claude Code and Cursor; uses the `meshy` CLI, no MCP | MIT | 109 | Same paid plan | low until there is a key | [Meshy docs](https://docs.meshy.ai/en/api/ai) |
| [sato942/game-asset-mcp](https://github.com/sato942/game-asset-mcp) | MCP server that makes 2D and 3D assets through Hugging Face Spaces (Flux LoRA, InstantMesh, Hunyuan3D-2). Was `MubarakHAlketbi/game-asset-mcp`; banner says an update was due June 2026 | MIT | 167 | Hugging Face token and your own copy of a Space | low | [mcpservers.org](https://mcpservers.org/servers/MubarakHAlketbi/game-asset-mcp) |
| [elevenlabs/elevenlabs-mcp](https://github.com/elevenlabs/elevenlabs-mcp) | ElevenLabs MCP server (speech, sound effects, voice tools). Archived 20 August 2026 in favour of a hosted server | MIT | 1.6k | Paid; README mentions a free 10k credits a month | low | named in the brief |
| [acatovic/ai-game-studio](https://github.com/acatovic/ai-game-studio) | Web tool for 2D characters, sprite animations and audio through OpenRouter and ElevenLabs | MIT | 193 | No GPU; two paid keys | low | [hnshowcase](https://www.hnshowcase.com/post/48260339/simple-sprite-sheet-generation) |
| [tdimino/claude-code-minoan](https://github.com/tdimino/claude-code-minoan) | Personal skill collection; includes `sprite-forge`, `nano-banana-pro`, `meshy`, `blender-forge` (headless Blender) | MIT | 41 | Varies by skill | low | [skills.sh](https://skills.sh/tdimino/claude-code-minoan/sprite-forge) |
| [aallbrig/AssetGen](https://github.com/aallbrig/AssetGen) | Client and server pipeline wrapping TripoSR, SDXL, UniRig, AudioLDM2, MusicGen, Bark | none stated | 0 | GPU recommended (12 GB) | low | [project site](https://aallbrig.github.io/assgen) |

### 3D generation, rigging, retopology, optimisation

| Repo | What it is | Licence | Stars | GPU / cost | Relevance | Found via |
|---|---|---|---|---|---|---|
| [donmccurdy/glTF-Transform](https://github.com/donmccurdy/glTF-Transform) | Library and CLI to inspect, resize, compress and simplify glTF/GLB. CLI 4.5.1 on npm, 2026-09-28 | MIT | 2.1k | CPU only, free | high | named in the brief |
| [zeux/meshoptimizer](https://github.com/zeux/meshoptimizer) | Mesh simplifier and codecs, plus the `gltfpack` CLI. 1.3.0 on npm, 2026-09-25 | MIT | 8.9k | CPU only, free | high | named in the brief |
| [microsoft/TRELLIS.2](https://github.com/microsoft/TRELLIS.2) | Image to textured GLB with PBR maps, 4B parameters | MIT | 12.9k | NVIDIA GPU with 24 GB (godogen_assets squeezes it onto 12 GB) | low (no GPU) | godogen `asset-gen` skill |
| [Tencent-Hunyuan/Hunyuan3D-2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1) | Image to 3D with PBR texturing | Tencent community licence; does not apply in the EU, UK or South Korea | 4.4k | 10 GB for shape, 21 GB for texture, 29 GB for both | low | named in the brief |
| [TencentARC/Pixal3D](https://github.com/TencentARC/Pixal3D) | Image to 3D on a TRELLIS.2 backbone; multi-view code added September 2026 | MIT | 2.6k | CUDA GPU; has a low-VRAM mode, no figure given | low | [Godot forum](https://forum.godotengine.org/t/pixal3d-open-source-image-to-3d-generation-with-glb-export-for-godot/143058) |
| [VAST-AI-Research/TripoSR](https://github.com/VAST-AI-Research/TripoSR) | 2024 single-image reconstruction; fast, low detail | MIT | 7.4k | About 6 GB VRAM; CPU use is not documented | low | named in the brief |
| [VAST-AI-Research/UniRig](https://github.com/VAST-AI-Research/UniRig) | Automatic skeleton and skinning for arbitrary meshes; README points to SkinTokens as successor | MIT | 2.1k | CUDA GPU with 8 GB | low | prior knowledge |
| [jasongzy/Make-It-Animatable](https://github.com/jasongzy/Make-It-Animatable) | Rigs humanoid characters to a Mixamo-style skeleton | MIT | 476 | godogen_assets runs it on CPU | low (the kaiju is not a humanoid) | godogen changelog |
| [huxingyi/autoremesher](https://github.com/huxingyi/autoremesher) | Automatic quad remesher with a headless CLI (`--input --output --target-quads`) | MIT | 3.7k | CPU; needs a built binary | low | [Digital Production](https://digitalproduction.com/2026/07/28/autoremesher-final-goes-mit/) |
| [sciences44/meshii](https://github.com/sciences44/meshii) | Web app that runs TRELLIS and TRELLIS.2 on rented Modal GPUs, with decimation, UVs and LODs after | MIT | 10 | No local GPU; README estimates $0.03–0.10 a model on Modal | low | web search |

### Textures, sprites, images

| Repo | What it is | Licence | Stars | GPU / cost | Relevance | Found via |
|---|---|---|---|---|---|---|
| [google-gemini/cookbook](https://github.com/google-gemini/cookbook) | Google's own notebooks for the Gemini API: image models, Lyria music, speech. Read from raw files | Apache-2.0 | 17.9k | No GPU; API per call | high | prior knowledge |
| [danielgatis/rembg](https://github.com/danielgatis/rembg) | Background removal, CLI and library; several models | MIT (each model has its own licence) | 25.5k | Runs on CPU, free | high | godogen `rembg.md` |
| [HugoTini/DeepBump](https://github.com/HugoTini/DeepBump) | Normal map from a colour image, height from normals; ONNX models ship in the repo | GPL-3.0 | 1.4k | CPU through onnxruntime | medium | prior knowledge |
| [ubisoft/ubisoft-laforge-chord](https://github.com/ubisoft/ubisoft-laforge-chord) | Predicts base colour, normal, roughness and metalness from one texture image | research only | 235 | CUDA GPU | low (licence and GPU) | web search on PBR textures |
| [boytchev/tsl-textures](https://github.com/boytchev/tsl-textures) | Procedural textures in the three.js shading language | MIT | 275 | None, but needs `WebGPURenderer`; the game uses `WebGLRenderer` | low for now | prior knowledge |

### Audio

| Repo | What it is | Licence | Stars | GPU / cost | Relevance | Found via |
|---|---|---|---|---|---|---|
| [KilledByAPixel/ZzFX](https://github.com/KilledByAPixel/ZzFX) | Sound-effect synth under 1 KB; a sound is one array of about 20 numbers. Cloned, 2026-11-02 | MIT | 815 | None | high | named in the brief |
| [chr15m/jsfxr](https://github.com/chr15m/jsfxr) | JavaScript port of sfxr with presets and a Node script that writes WAV files. Cloned, 2026-05-05 | Unlicense | 467 | None | high | named in the brief |
| [Tonejs/Tone.js](https://github.com/Tonejs/Tone.js) | Web Audio framework for synths, sequencing and effects | MIT | 14.9k | None | medium | named in the brief |
| [Stability-AI/stable-audio-3](https://github.com/Stability-AI/stable-audio-3) | Open-weight audio models; the Small music and Small SFX models run on CPU, up to 120 s | code MIT; weights under Stability's community licence and gated on Hugging Face | 878 | CPU works (godogen_assets says about 20 times slower than GPU) | medium, blocked today | [paper](https://arxiv.org/html/2605.17991), godogen_assets |

Also confirmed to exist, not reviewed, no star count taken: `Tencent-Hunyuan/Hunyuan3D-2`,
`TencentARC/InstantMesh`, `Stability-AI/stable-fast-3d`, `VAST-AI-Research/SkinTokens`,
`VAST-AI-Research/tripo-python-sdk`, `nv-tlabs/kimodo`, `htdt/kimodo-practical`, `facebookresearch/audiocraft`
(MusicGen), `Stability-AI/stable-audio-tools`, `keithclark/ZzFXM` (music for ZzFX), `googleapis/js-genai`
(`@google/genai` 3.3.0 on npm, Apache-2.0), `Poly-Haven/Public-API`, `google/xrblocks`.

## 3. Reviews of the high-relevance repositories

### htdt/godogen

The closest thing to what we want to write. Since July 2026 it publishes one skill, `asset-gen`, plus a
one-page guide per engine, including three.js with Rapier and Vite. `asset-gen/api.md` documents a single
script, `tools/asset_gen.py`, with subcommands:

- `image --prompt ... -o x.png [--image ref.png] [--size 512|1K|2K|4K] [--aspect-ratio 16:9]`
- `speech --voice Algenib --style "..." --text "..." -o x.ogg`
- `music --prompt ... [--length clip|song] -o x.mp3`

Every call prints one line of JSON: `{"ok": true, "path": "...", "cost_cents": 7}`. Model IDs in the code are
`gemini-3.1-flash-image`, `gemini-3.8-flash-tts`, `lyria-3-clip-preview` and `lyria-3.5`. It needs the
`google-genai` Python package and an API key.

Working rules worth copying:

- Never prompt for a transparent background, because the model paints a checkerboard. Prompt a solid colour
  close to the in-game surroundings and matte it out (`rembg_matting.py`).
- Make one hero image and derive the rest from it by image-to-image.
- Generate one facing and flip at runtime.
- Keep a manifest table with an in-game size for every asset.
- Look at every PNG, render every GLB, and read audio as a spectrogram, since the agent cannot hear.
- Confirm with the user before the first paid call.

`loop_audio.py` cuts whole bars out of a Lyria clip and crossfades the tail into the start to make a loop.

Limits: the default path assumes an NVIDIA GPU, 3D goes through Tripo's paid CLI, and the Python script
imports the xAI SDK even if you only use Gemini.

### majidmanzarpour/threejs-game-skills

Nine skills aimed at exactly our stack. The three asset skills are thin Python scripts with a `probe`
subcommand that prints `KEY=SET|MISSING` without revealing the key.

- `threejs-image-generator` calls `gemini-3-pro-image-preview` (the dearer Pro model) at 1K, 2K or 4K. Its
  value is the prompt patterns for image-to-3D references, riggable creatures, seamless textures, UI art and
  sky plates.
- `threejs-3d-generator` wraps the Tripo API with checkpoints, so an interrupted job is resumed and not paid
  for twice. `references/threejs-integration.md` records loader problems found the hard way: batched
  animation clips arrive named `NlaTrack`, `NlaTrack.001` and so on; how to make a clip play in place without
  collapsing the skeleton; rigged models must be cloned with `SkeletonUtils.clone`.
- `threejs-audio-generator` wraps ElevenLabs sound effects, music, speech and voice cleanup.

Two documents carry over directly. `threejs-game-director/references/asset-recovery.md` is a table of what
to do for each failure (missing key, credits gone, bad input, timeout, uncertain submission) and insists that
procedural art is a valid choice, not a failure. `technical-art.md` gives render budgets (it suggests at most
750k triangles on desktop and 300k on mobile) and an intake checklist for any imported GLB.

Install: `npx skills add majidmanzarpour/threejs-game-skills --skill '*' -a claude-code -g -y`.

Limits: only the Gemini skill is usable with what we have; Tripo and ElevenLabs need keys and network access
this session lacks.

### google-gemini/cookbook

Not a skill, but the only primary source for the Gemini API we could reach, since `ai.google.dev` is blocked
here. The notebook `quickstarts/Get_Started_Nano_Banana.ipynb` (copyright 2026) lists four image models:

| Model ID | Name | Notes from the notebook |
|---|---|---|
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite | fastest and cheapest, "includes a free tier", 512px and 1K, up to 3 reference images |
| `gemini-3.1-flash-image` | Nano Banana 2 | 512px to 4K, aspect ratios from 1:8 to 8:1, up to 14 reference images |
| `gemini-nano-banana-2.1` | Nano Banana 2.1 | "next-generation", higher fidelity |
| `gemini-3-pro-image-preview` | Nano Banana Pro | 4K, best text rendering |

Aspect ratios are 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9 and 21:9 on all models, plus 1:4, 4:1, 1:8
and 8:1 on Nano Banana 2 and Pro. There is no 2:1.

The notebooks use the newer Interactions API. The image comes back base64-encoded in
`interaction.output_image.data`:

```python
client.interactions.create(
    model="gemini-3.1-flash-image", input=prompt, response_modalities=["image"],
    generation_config={"image_generation_config": {"aspect_ratio": "1:1", "image_size": "1K"}})
```

Passing `previous_interaction_id` edits the previous image and keeps the subject consistent. The older
`generate_content` call still appears in the same notebook and in godogen.

Other notebooks: `Get_started_Lyria.ipynb` covers `lyria-3.5`, `lyria-3-pro-preview` and
`lyria-3-clip-preview` (30-second clips), with prompts that set BPM, timestamps and `[Intro]`/`[Verse]`
sections. `Get_started_TTS.ipynb` covers `gemini-3.8-flash-tts`, which returns 24 kHz mono WAV.
`Get_started_LyriaRealTime.ipynb` covers a streaming instrumental model the notebook calls free in preview.

Limits: notebooks, not tools, and they say nothing about tileable textures or transparency.

### kingbootoshi/nano-banana-2-skill

One TypeScript file (`src/cli.ts`) run with Bun, and a `SKILL.md` that teaches Claude Code to call it.

```bash
nano-banana "prompt" -o name -d out/dir -s 512|1K|2K|4K -a 16:9 -r ref.png -t
```

`-r` can be repeated to pass several reference images for style transfer. `-t` appends "place the subject on
a solid bright green background" to the prompt, reads the real key colour from the corner pixels (the model
returns something like `#05F904`, not pure green), then runs FFmpeg
`colorkey=0x<key>:0.25:0.08,despill=green` and trims with ImageMagick. `--costs` prints running spend, logged
per call.

Defaults are `gemini-3.1-flash-image-preview` and `gemini-3-pro-image-preview`. Those are the February 2026
preview names; the cookbook now shows `gemini-3.1-flash-image` without the suffix. The README prices one
Flash image at about $0.045 (512), $0.067 (1K), $0.101 (2K), $0.151 (4K) and Pro at about double.

The key is taken from `--api-key`, then the `GEMINI_API_KEY` environment variable, then `.env` files
(including `~/.nano-banana/.env`). FFmpeg and ImageMagick are needed for `-t`, and both are already in our
container.

Limits: last commit February 2026, so model names are stale; green keying eats green subjects (ybuild's
skill argues for magenta, godogen for a colour near the game's background); it turns on Google Search
grounding for every request, which we would not want for textures.

### donmccurdy/glTF-Transform

The standard clean-up step for any GLB before it goes into a web game. No GPU. Runs with
`npx @gltf-transform/cli` (4.5.1). Commands shown in its README:

```bash
gltf-transform optimize in.glb out.glb --texture-compress webp
gltf-transform resize in.glb out.glb --width 1024 --height 1024
gltf-transform meshopt in.glb out.glb --level medium
gltf-transform draco in.glb out.glb --method edgebreaker
gltf-transform webp in.glb out.glb --slots "baseColor"
```

`optimize` is the all-in-one command. From memory of its documentation, not re-read here, it removes
duplicates and unused data, welds, simplifies and compresses geometry and textures; `gltf-transform optimize
--help` gives the exact list for 4.5.1. There is also a scripting API (`@gltf-transform/core` and
`/functions`) for a Node build script, which is how a Vite project would run it.

A file compressed with meshopt needs one line in the game:
`loader.setMeshoptDecoder(MeshoptDecoder)`, imported from `three/addons/libs/meshopt_decoder.module.js`.
Draco needs a decoder file shipped alongside, so meshopt is the simpler choice for GitHub Pages.

Limits: not run in this session (see section 5). KTX2 texture output needs extra native tools; WebP does not.
It does nothing until we have GLB files, and today the game has none.

### zeux/meshoptimizer

Two useful parts. `gltfpack` is a one-command optimiser:

```bash
gltfpack -i scene.glb -o scene.glb -cc -si 0.5 -tw
```

`-cc` applies meshopt compression, `-si 0.5` simplifies to half the triangles, `-tw` converts textures to
WebP, `-kn` keeps named nodes so game code can still find them. The README recommends the native binary from
the Releases page over the npm build, which is slower and cannot compress textures to KTX2.

The second part is `meshoptimizer` on npm, with a WebAssembly simplifier callable from Node or the browser:

```js
MeshoptSimplifier.simplify(indices, positions, 3, targetIndexCount, 0.01, ['LockBorder'])
```

It returns a shorter index buffer over the same vertices, so one vertex buffer serves several levels of
detail. That fits a game that builds its geometry in code, like ours: levels of detail for buildings or the
kaiju could be computed at load time with no asset files.

Limits: the simplifier needs welded vertices, and flat-shaded boxes with split normals do not simplify well.
Simplifying AI-generated meshes hard degrades their texture mapping.

### KilledByAPixel/ZzFX and chr15m/jsfxr

Both make retro-style sound effects from a handful of numbers, cost nothing, and need no asset files.

ZzFX (`npm i zzfx`, 1.4.0) is the smaller. `zzfx(...[,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17])` plays a
sound; `ZZFX.buildSamples(...)` returns the raw samples as an array, so sounds can be precomputed once and
replayed. Sounds are designed in its web tool, which copies the array to the clipboard. An agent can also
write the array directly, since the parameters are named in the source: volume, randomness, frequency,
attack, sustain, release, shape, slide, pitch jump, noise, bit crush, delay, tremolo, filter.

jsfxr (`npm i jsfxr`, 1.4.1) has named presets: `sfxr.generate("explosion")`, also `pickupCoin`,
`laserShoot`, `powerUp`, `hitHurt`, `jump`, `blipSelect`, `click`. `sfxr.toBuffer(sound)` returns samples,
`sfxr.toWave(sound).dataURI` a WAV. The bundled Node script writes files:
`./sfxr-to-wav <definition> out.wav`, or pipe a JSON definition in.

Limits: both sound like 8-bit games; a kaiju's roar or a collapsing building needs layered noise and
filtering, which `src/core/audio.ts` already does by hand. Their value is fast variety for small sounds
(pickups, UI, impacts). Neither does music; `keithclark/ZzFXM` adds a tracker for ZzFX.

### danielgatis/rembg

Removes image backgrounds on CPU. `pip install "rembg[cpu,cli]"`, then `rembg i in.png out.png`, with `-m`
to choose a model (`u2net`, `isnet-general-use`, `birefnet-general` and others). Models download on first
use. As far as is known the U2-Net and BiRefNet files come from the project's GitHub releases, a host this
session can reach, but that download was not tried.

It is what makes Gemini images usable as sprites, decals and UI icons, because the image models cannot
output real transparency. godogen wraps it in `rembg_matting.py` with a `--preview` flag that composites the
result on a contrasting colour, so the agent can judge the cut-out by looking.

Limits: the default model, `bria-rmbg`, needs a paid agreement for commercial use, so pick a BiRefNet or
U2-Net model explicitly. On four CPU cores expect seconds per image. Soft subjects such as smoke and glow
matte badly; generate those on black and use the brightness as alpha.

### ahujasid/blender-mcp (medium, reviewed because the brief names it)

The most-starred tool in this area, and not a fit for this container. It is two parts: an add-on that opens
a socket inside a running Blender, and an MCP server (`claude mcp add blender uvx mcp-for-blender`) that
sends commands to it. Tools include `execute_blender_code`, `look` (viewport or render), `generate_3d`
(Tripo, Hunyuan3D, Rodin or Meshy, with your key or the project's paid tier) and `search_assets` /
`import_asset` (Poly Haven, Sketchfab, Poly Pizza). The README documents Blender running on a desktop. It
mentions "headless setups or CI" only as a reason to pass API keys by environment variable, and does not say
how to start the add-on's server in a Blender with no window. Its warning is plain: the code tool runs
arbitrary Python in Blender, and remote access has no authentication.

What does work here is Blender without the MCP. `pip install bpy` (5.3.0, needs Python 3.13, which the
container has; a 428 MB download, 1 GB installed) gives the whole of Blender as a Python module. That was
tested in this session (see the top of this document). The wheel lacks Blender's built-in Draco and meshopt
compressors, so compress afterwards with glTF-Transform. godogen takes the same route (`blender -b -P
script.py`) for anything that must be exact or articulated.

## 4. What we could actually do from this session

### What the session can reach

Checked on 15 November 2026 with header-only requests.

- Reachable: GitHub (clone and raw files, release downloads), the npm registry, PyPI.
- Refused by the network policy: `huggingface.co`, `api.tripo3d.ai`, `api.meshy.ai`, `fal.run`,
  `api.elevenlabs.io`, `api.polyhaven.com`, `ambientcg.com`, `ai.google.dev`, `download.blender.org`.
- Not tested: `generativelanguage.googleapis.com`. The brief says it works through a proxy that adds the
  credential.

So today the only generators available are Gemini's, plus anything that installs from npm or PyPI and runs
on CPU. Hosted 3D generation and open-weight models from Hugging Face are both out of reach until hosts are
allowed.

### Gemini prices used below

From godogen's `api.md` (October 2026), which agrees with the nano-banana-2-skill README:

- `gemini-3.1-flash-image`: about 5¢ at 512px, 7¢ at 1K, 10¢ at 2K, 15¢ at 4K.
- Lyria: 4¢ per 30-second clip, 8¢ per song, and no free tier.
- Speech: about 0.25¢ per ten-second line, doubling in 2027.
- `gemini-3.1-flash-lite-image`: third-party sites put it near 3.4¢ per 1K image. They disagree with the
  cookbook on whether the API has a free tier.

### Ranked list

Ranked by how much the game gains for how little can go wrong. Items 1 to 4, 7 and 8 need the Gemini
credential; none needs a GPU.

**0. First, list the models (needs Gemini; free).** One `GET /v1beta/models` shows which of the IDs above
this credential can use. Nothing below should be built before that. Effort: minutes. Risk: none.

**1. Tileable surface textures (needs Gemini).** Asphalt, concrete, brick, glass-panel facade, kaiju hide,
slime. Effort: half a day for a script and a skill. Risk: medium. Cost: 5–7¢ a texture.

- Generate with `gemini-3.1-flash-image`, 1:1, 1K: "Seamless tileable texture of wet asphalt, orthographic
  top-down, flat even lighting, no shadows, no perspective, uniform detail scale, fills the frame edge to
  edge, no text".
- Save as PNG, downscale to 512, then load with `TextureLoader`, `RepeatWrapping` and
  `colorSpace = SRGBColorSpace`.
- Check the seam every time; do not trust the prompt. The nanobanana extension only appends "tileable,
  repeating pattern" to the prompt and checks nothing. A search summary of a January 2026 Nano Banana Pro
  tutorial ([notes at lilys.ai](https://lilys.ai/notes/ru/nano-banana-pro-20260114/seamless-pbr-materials-nano-banana-pro),
  not opened) says prompts of that kind still left visible seams that had to be fixed by hand.
- Check by numbers: compare the left and right edge columns with two neighbouring columns. On a
  deliberately non-tiling test image the wrap difference was 50 against 0.6 between neighbours; on a tiling
  one it was 0 against 1.3. Then tile it 2×2 for a look:
  `convert t.png -write mpr:t +delete -size 2048x2048 tile:mpr:t tiled.png`.
- Repair by moving the seam to the middle (`convert t.png -roll +512+512 rolled.png`), sending that back as
  an edit ("repaint only the cross-shaped seam through the centre; leave the outer border unchanged"), then
  rolling back and checking again.
- Fallback that always tiles, at the price of visible symmetry:
  `convert t.png \( +clone -flop \) +append \( +clone -flip \) -append -resize 1024x1024 mirrored.png`.

The ImageMagick commands and the seam measure were run here. The Gemini half was not, so whether one edit
pass is enough is unknown.

**2. A skyline strip and sky for the backdrop (needs Gemini).** Effort: half a day. Risk: medium. Cost: 7–10¢.
`gemini-3.1-flash-image` offers 4:1 and 8:1 images. An 8:1 city skyline wrapped on a cylinder behind the
play area suits `src/gfx/backdrop.ts` better than a full 360° sky, which the model cannot produce at the 2:1
shape a sky sphere wants. Only the left-right join needs the seam repair from item 1. Keep the procedural
sky above it. Google's own `xrblocks` sample just prompts "Generate a 360 equirectangular skybox image for
..." and applies the result with `EquirectangularReflectionMapping`, with no seam handling.

**3. Signs, decals, icons and sprites with transparency (needs Gemini).** Shop signs and billboards for
facades, cracks and scorch decals, rubble sprites, HUD icons. Effort: one day including the matting script.
Risk: low to medium; text on signs is the weak spot on the cheaper models. Cost: 5–7¢ a sheet.

- Prompt a solid background colour, never "transparent".
- Put several objects in one image as a grid and slice it, to share one style and one payment. godogen has
  `grid_slice.py` for this.
- Matte with rembg on CPU (a BiRefNet model) or FFmpeg `colorkey` plus `despill`.
- View the cut-out on a contrasting colour before accepting it.

**4. One style sheet, reused everywhere (needs Gemini).** Generate a single "look" image for the game and
pass it as a reference image on every later call; Nano Banana 2 accepts up to 14. Record prompt, model, cost,
in-game size and path for every asset in a manifest, as godogen does. Effort: an hour. Risk: low. Without
this, items 1 to 3 drift apart in style.

**5. A small procedural sound-effect library (needs nothing).** Effort: half a day. Risk: low.

- Add ZzFX (MIT, under 1 KB) for small sounds, defined as arrays in code. Or use jsfxr presets rendered to
  WAV at build time with its Node script.
- Keep the hand-built Web Audio code for the big sounds.
- The agent cannot hear, so check each sound as a picture, as godogen_assets does:
  `ffmpeg -i x.wav -lavfi showspectrumpic=s=800x300 x.png`. Also check length and peak level as numbers.
  FFmpeg is already installed.

**6. A glTF intake step, ready before the first model arrives (needs nothing).** A script that runs
`gltf-transform optimize` with WebP textures and meshopt, prints triangle, material and texture counts, and
fails over a budget; plus `GLTFLoader` with the meshopt decoder in the game. Effort: half a day. Risk: low,
but it has no use until item 9 or 10 happens.

**7. Kaiju roars and announcer lines from Gemini speech (needs Gemini).** `gemini-3.8-flash-tts` accepts
lines made only of tags such as `<grunt>` and `<scream>`, with a style direction, and returns WAV. Slow it
down and pitch it down with FFmpeg (`asetrate`, `atempo`) and layer it with the existing noise synth for a
monster. Plain announcer lines ("Cleanup crew, move out") work as they come. Effort: half a day. Risk:
medium, since quality can only be judged by spectrogram until a person listens. Cost: well under 1¢ a line.

**8. A music loop from Lyria (needs Gemini with billing).** `lyria-3-clip-preview` returns a 30-second MP3.
Put the BPM in the prompt and "Instrumental only, no vocals", then cut whole bars and crossfade the tail into
the head, as godogen's `loop_audio.py` does. Effort: half a day. Risk: medium: nobody in the loop can hear
it, a looped MP3 adds 300–500 KB to the page, and Google's terms for shipping generated music were not read.
Cost: 4¢ a clip. The free alternative is a sequencer written in Web Audio or Tone.js; avoid Strudel unless
AGPL is acceptable for the whole game.

**9. Models built by script in headless Blender (needs nothing).** `bpy` runs here. It gives bevels,
booleans, subdivision, decimation, UV unwrapping, skinning and baked ambient occlusion, exported as GLB.
Good candidates: a building kit with proper window insets, vehicles with turning wheels, a kaiju body from
metaballs or a skin modifier with a short bone chain. Effort: one to two days for the first asset and the
pipeline. Risk: medium. It is a second way of making geometry beside the in-code one, and it only pays off
if the result looks clearly better than boxes and capsules. Install it in the development environment only,
not in the repository.

**10. Normal maps for the textures in item 1 (needs nothing).** Simplest: treat brightness as height and
derive a normal map with a Sobel filter in a build script or in the shader. DeepBump does it better on CPU,
but it is GPL (acceptable as an offline tool whose output we ship) and pins an old onnxruntime that may not
install on Python 3.13. Effort: two hours for the simple route. Risk: low.

**11. AI-generated 3D models: not possible today.** Every route is blocked.

- Hosted APIs need a key and an allowed host. godogen's figures for Tripo are about 30 credits (roughly
  30¢) per model on v3.1, 25 to rig and 10 per animation clip. The `tripo-cli` README says the default P2
  model costs 100–130 credits. Meshy needs a paid Pro plan, at 20–35 credits a model.
- Open models need a GPU: 24 GB for TRELLIS.2, or the 12 GB card godogen_assets targets.
- Free Hugging Face Spaces need `huggingface.co`, which is refused.

If the owner adds a Tripo key and allows `api.tripo3d.ai`, the path is: Gemini makes a three-quarter-view
reference on a plain background, then
`tripo make ref.png --model tripo-v3.1 -p face_limit=30000 --json --yes -o assets/`, then item 6.

### What the skills could look like

Borrowing from godogen and threejs-game-skills, four small skills cover the list above:

- an image skill: Gemini call, prompt patterns, seam check, matting;
- an audio skill: synth arrays, spectrogram check, Lyria loop cutting;
- a model skill: `bpy` scripts, glTF intake, budgets;
- an asset manifest rule: every asset has prompt, model, cost, in-game size and path recorded.

Each generator should be a script that prints one line of JSON with the path and the cost. Each skill should
say to ask before the first paid call and to look at every output before building on it.

## 5. Could not verify, and gaps

- **Reddit.** None of the named subreddits was read. Web searches for the subreddit names returned only
  links to Reddit mirror sites; none was opened. One search summary described r/aigamedev from those mirrors,
  and that description has been left out.
- **Topology AI.** Not identified (section 1).
- **Gemini.** The API was not called. Model IDs come from Google's cookbook repository as of 15 November
  2026 and from godogen. `ai.google.dev` is blocked, so prices and limits are second-hand, and sources
  disagree on whether Nano Banana 2 Lite has a free API tier. The Interactions API call was read from the
  notebook, not run. How the proxy supplies the key to an SDK (which normally insists on one) is unknown.
  Whether Gemini can repair a texture seam in one edit, or produce a usable 8:1 skyline, is untested.
- **Tools not run.** `gltf-transform`, `gltfpack`, `zzfx` and `jsfxr` were not executed: installing npm
  packages into the scratch folder was refused by the session's permission layer. Their commands are quoted
  from each README.
- **Repositories that could not be confirmed.** `vast-enterprise/Tripo-API-CLI` (the source of `tripo-cli`
  on npm) and `drawcall-ai/generate-panorama` (a 360° environment-map generator on npm that uses GPT Image 2
  through fal.ai) both return 404 on GitHub, so they are private or moved; only the npm packages were seen.
  `zeveck/audiogen-claude-skills` returns 404. A `game-asset-generator` skill attributed to
  `notque/claude-code-toolkit` by a skill index is not mentioned on that repository's front page. The
  official Blender Lab MCP server is hosted outside GitHub and was not checked.
- **Prices for Tripo, Meshy, fal.ai and ElevenLabs** come from repository READMEs and search summaries, not
  vendor price pages, and third-party figures for Tripo conflict.
- **Licences of model weights** on Hugging Face (Stable Audio 3, Qwen-Image, rembg's models) could not be
  read there. What is stated above comes from the GitHub READMEs. `htdt/godogen_assets` and
  `aallbrig/AssetGen` state no licence at all.
- **A blocked source.** `app.cinevva.com` hosts a dated timeline of 2026 3D-model releases that search
  results cite; it could not be opened. The dates for Meshy 7 (12 August 2026) and other hosted releases in
  that timeline are therefore not in this document.
- **Left behind.** The Blender test environment (1 GB) is at
  `/tmp/claude-0/-home-user-kaiju-cleaner/78dab013-f150-593d-8e8c-cea4084a0104/scratchpad/toolcheck/bpyenv`
  and the clones are under
  `/tmp/claude-0/-home-user-kaiju-cleaner/78dab013-f150-593d-8e8c-cea4084a0104/scratchpad/repos/assets/`.
  Both are scratch and can be deleted.
