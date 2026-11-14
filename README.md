# Kaiju Cleaners

A 3D web game prototype: giant, earnest, clumsy kaiju trying to help clean up a wrecked city without breaking even more of it.

Built with Vite, TypeScript, Three.js and Rapier. Deployed to GitHub Pages on every push to `main`.

## Run it

```sh
npm install
npm run dev        # local dev server
npm test           # headless sim checks (Vitest, no browser needed)
npm run typecheck
npm run build      # production build into dist/
npm run smoke      # boots the build in headless Chromium, screenshots to scripts/out/
```

Scenes are picked with a URL parameter: `?scene=yard` (flat tuning ground) or `?scene=city`.

## How the code is laid out

- `src/sim.ts` is the whole simulation (physics world, scene graph, systems). It has no DOM or WebGL
  dependency, so tests step it directly under Node.
- `src/main.ts` wraps a sim with the renderer, camera, input, HUD and tuning panel.
- `src/core/tuning.ts` holds every tunable. The in-game panel edits them live; values marked ⟳ apply on
  "restart scene". "Copy JSON" output pasted into `src/tuning/defaults.json` becomes the new default feel.
- `window.__game` exposes the running sim for console poking and the smoke script.

## One-time GitHub setup

Repo Settings → Pages → Build and deployment → Source: **GitHub Actions**. After that, pushes to `main` deploy
automatically.
