# Working on this repository

A cute, living desktop office on top of T3 Code: projects are offices, threads are robots at desks,
and each robot's computer shows the agent's real work. Start with `docs/architecture.md`.

## Rules

- T3 Code is authoritative for work, questions, progress, thread order, pins, settlement, themes,
  dictation and usage. Never invent operational facts. Fictional leisure content is fine and goes
  through the localization system (`docs/localization.md`).
- The public product name lives only in `electron/brand.json` (read by `src/brand.ts` and `electron/brand.cjs`). Never hardcode it
  in interface text, packaging or docs that the app shows.
- Preserve the visual language recorded in `DESIGN.md`: real robot artwork, Lexend and JetBrains
  Mono, warm rooms, navy and lavender panels, peach actions. No emojis, decorative status pills,
  eyebrow labels or generic dashboard cards. No tutorial overlays; the game is the tutorial.
- Design each feature's interaction, motion and sound together. Reuse the single sound engine
  (`src/office/sound.ts`) and honor reduced motion, mute, volume and visibility suspension.
- Performance is a feature: nothing renders that is not visible, hidden windows pause cosmetic
  work, and timers, observers, GSAP tweens and canvases are released by their owners. See
  `docs/rendering-performance.md` before performance work, and report measurements only with the
  hardware and workload they came from.
- Validate actions in the main process as well as the interface. Keep linked T3 computers
  isolated: data shown and actions taken use the same authenticated environment. Never log or
  expose secrets.
- Writing: no em or en dashes as punctuation in interface text, docs or commit messages.
- Delete dead code fully when removing a feature: imports, CSS, IPC handlers, preload entries,
  settings keys, checks and docs.

## Checks

- `npm test` runs every headless check in `scripts/checks` (listed in `scripts/run-checks.mjs`;
  add new checks to its `CHECKS` array).
- `npm run verify:update` runs typecheck, all checks and a production build. Run it before handing
  back code; it must pass. Never weaken a check to make it pass.
- `scripts/review` holds native and visual review harnesses that open hidden Electron windows.
  Run them only when you can do visual checks, and never claim a visual, audio, performance or
  live integration check that was not performed.

## Builds and updates

- `npm run build` and `verify:update` write `dist-build`, never `dist`. A running source checkout
  loads `dist`; only the coordinated updater (`electron/updater.cjs`) replaces it, after
  typechecking and building a frozen snapshot of the same source. Do not build into `dist`.
- The updater must keep the working build on failure, preserve user edits, accept only
  fast-forward remote changes and never reset or stash changes. Test interrupted validation and
  retry when changing it (`scripts/checks/verify-updater.cjs`).
- Installed builds update through `electron/packaged-updater.cjs` instead (`docs/releasing.md`).

## Where things are

- `electron/main.cjs` and `electron/preload.cjs`: window, IPC and the renderer bridge.
- `src/main.ts`: settings, menus, refresh, hiring and thread actions.
- `src/office/`: rooms, camera, desks (`room-policy.ts` owns desk eligibility), hire composer
  (`hire.ts`, reuse it for office actions), chat panel and sound.
- `src/world/`: persistent robot identity, outfits, movement and shared rooms. Accessories appear
  in every pose and place.
- `src/director.ts`, `src/harness/`: real conversation activity and the robots' computers.
- Robots are permanent workers and desks are jobs: `docs/workers-and-desks.md`.
- Jobs launched through the hire flow receive `electron/skills/lucid/SKILL.md`.
