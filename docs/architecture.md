# Architecture

The app is an Electron program with a privileged main process (`electron/`) and a renderer built
by Vite (`src/`). T3 Code is the source of truth for all work: projects, threads, runs, questions,
pins, themes, dictation and usage.

## Main process (`electron/`)

- `main.cjs` creates the window, registers IPC handlers and the `lucid-file:` media protocol, and
  wires the services below. `preload.cjs` is the only bridge the renderer gets.
- `t3.cjs` reads T3 Code's state database read-only (`~/.t3/userdata/statev2.sqlite`, or
  `T3CODE_HOME`) and polls watched threads. `t3server.cjs` talks to the local T3 server for
  actions (starting, steering, answering, settling, pinning), pairing through T3's own `t3` CLI.
- `environments.cjs`, `connect-*.cjs` and `remote-*.cjs`: other computers linked in T3 Connect,
  shown as separate buildings. Remote data and actions always use the same authenticated link.
- `orchestrator.cjs`, `reports.cjs`, `headless-writer.cjs`: the optional orchestrator, settlement
  reports and flavor text written by a headless harness CLI (never a T3 thread).
- `localization.cjs`, `t3-theme.cjs`, `t3-voice.cjs`, `usage.cjs`, `provider-limits.cjs`:
  translation of fictional text, the Follow T3 theme, dictation and usage.
- Updates: `updater.cjs` (source checkouts, see `AGENTS.md`) and `packaged-updater.cjs`
  (installed builds, see `releasing.md`), picked by `app.isPackaged`.
- `brand.json` holds the public product name and app id; `brand.cjs` and `src/brand.ts` read it.

## Renderer (`src/`)

- `main.ts` coordinates settings, menus, refresh, hiring and thread actions.
- `office/`: rooms, camera, desks, the hire composer, chat panel, sound (`sound.ts` is the single
  audio engine) and soundtrack. `world/`: robots' persistent identity, movement and shared rooms.
- `director.ts` and `harness/` turn real T3 events into what each robot does on its computer;
  `os/` and `office-apps/` are the robot's desktop and apps.
- `fun/`, `social/`, `games/`, `leisure/`, `life/`, `content/`: fictional leisure content (parody
  apps and games). It is playful but never invents operational facts.
- `perf/` schedules rendering and levels of detail; nothing invisible renders.
- `themes/`, `ui/`, `styles.css`: design tokens and shared controls. `DESIGN.md` records the
  visual language.

## Data

Settings, roster, translations and caches live in the app's data folder (Electron `userData`,
named `lucid` whatever the product is called). There is no account, telemetry or analytics. The
network requests the app makes are listed in the README's privacy section; keep that list current
when adding one.

## Further reading

`renderer-structure.md`, `camera-and-office-layout.md`, `screen-fidelity.md`, `studio.md`,
`rendering-performance.md`, `outside-viewport.md`, `workers-and-desks.md`, `localization.md`,
`office-audio.md`, `themes.md`, `agent-browser.md`, `explorer-and-attachments.md`,
`chat-review-presentation.md` and `releasing.md`.
