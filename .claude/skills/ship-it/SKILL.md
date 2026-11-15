---
name: ship-it
description: Release Kaiju Cleaners - run every check, commit, push the working branch, fast-forward main, wait for the GitHub Pages deploy and then load the live site to prove the new build is what players get. Use this whenever work is finished and should reach the playtester, when asked to deploy, publish, push to main, "put it live" or "is it up?", and whenever the user says the site is broken, stuck on Loading or showing an old version. Not for checking a change while still working on it (see verify-change).
---

# Ship it

"Pushed" is not "live". Twice in this project a deploy was reported as done when players were getting a
broken page: once because a second publisher overwrote the build with the raw source, once because a
timing check failed on a busy CI machine. Both were found only when the live page was loaded. So a release
is finished when `npm run verify:live` says OK, and not before.

## 1. Checks, in this order

```sh
npm run typecheck
npm test                 # includes the pins, the bot's yard runs, and the repeatability guards
npm run build
npm run smoke            # boots yard and city in a real (headless) browser
```

If scoring, jobs, hazards or the city changed, also `npm run playbot -- city careful` and read it (see
playtest-bot). If anything a player sees changed, the capture set (see verify-change).

A failing check is fixed, never skipped or loosened to get through. The one exception already made is
written down in the code: wall-clock time budgets are looser on CI (`STEP_BUDGET_MS` in `test/m3.test.ts`),
because shared runners vary by a factor of three. Do not add timing assertions that can fail a deploy.

## 2. Commit

- One subject line saying what changed for the player; a body listing the parts.
- End every commit message with the attribution lines the session gives (Co-Authored-By and the session
  link). No model names anywhere else in the repository.
- Tuning-only changes are their own commit, with a line in `feedback/feel-log.md`.
- Session files the playtester sent belong in `feedback/`; screenshots in `scripts/out/` are not committed.

## 3. Push, then main

```sh
git push -u origin <working branch>
git checkout main && git merge --ff-only <working branch> && git push origin main && git checkout <working branch>
```

Work happens on the session's branch; `main` only ever fast-forwards to it. Do not open a pull request
unless asked. If the fast-forward is refused, someone else has pushed to `main`: stop and look, do not force.

## 4. Wait for the deploy, then prove it

The "Deploy to GitHub Pages" workflow runs on every push to `main` and takes one to two minutes (it runs
the tests again). Check the run with the GitHub tools, not by guessing; if it failed, read the failing
step's log before doing anything else. Then:

```sh
npm run verify:live
```

It loads the live page in a headless browser with a throwaway URL parameter (the site caches pages for ten
minutes), fails on any request that does not load, waits for the game to boot, and compares the build it
reports with the commit checked out here.

- `OK`: say so, with the build hash.
- `STALE`: the deploy has not finished or did not run. Check the workflow run; wait and try once more.
- `FAILED REQUEST` or `NOT READY`: players are getting a broken page now. Fix it before anything else. If
  the page says it is the unbuilt source, Pages is publishing the repository itself: the repository's
  Settings → Pages → Source must be "GitHub Actions" (only the owner can change that; tell them).

This container can only reach `ventiduke.github.io` because the owner allowed that host. If the check
cannot connect at all, say that the live site could not be checked: do not report the release as done.

## 5. Tell the playtester

- The link, and "hard refresh" if they had the page open (the ten-minute cache).
- What changed, in terms of what they will see and do.
- What was checked and what could not be: frame rate on a real graphics card, sound by ear and gamepad are
  never checked from here.
- Two or three specific things to try (see playtest-intake, step 6).
- Update the plan document's newest section if this was a pass they asked for.
