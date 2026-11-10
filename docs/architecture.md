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

- `main.ts` is a short bootstrap: it imports the modules in cascade order (modules bring their own
  CSS), creates one app context (`app/context.ts`) and starts the modules in order.
- `app/`: the shell around the office, one module per concern: `shell` (markup, settings panel),
  `office` (creating the world), `chat`, `work` (collecting finished work), `workers`, `rooms`
  (sidebar room list), `navigation` (opening threads), `refresh` (live data and buildings), `menus`
  (office and desk menus, hiring), `update-button`, `settings`, `layout` (columns and the rail),
  `input`, `orchestrator`, `coins`, `sound-controls`, `usage`, `weather-badge`, `thread-sidebar`
  and `thread-actions`. Shared state and the functions modules call on each other live on the app
  context; state one module uses alone is a module variable. Each module registers its functions
  first (`define...`), then starts at its place in `main.ts`.
- `office/`: rooms, camera, desks, the hire composer, chat panel, sound (`sound.ts` is the single
  audio engine) and soundtrack. `office/world.ts` is the World class: its shared state, constructor,
  room settling, empty desks and saved layouts. Its behaviour lives in `office/world/` (routing,
  journeys, outdoors, rooms, the layout pass, desks, desk dragging, camera view, input and focus,
  campus, plus types, floor geometry and room art); each file holds methods typed `this: World`
  that `util/mixin.ts` copies onto the class.
- `robot/`: the robot system, imported through `robot/index.ts`:
  - identity: `brand.ts` (harness to species, palette, logo), `look.ts` (outfit options, defaults,
    random and migrated looks, colours), `roster.ts` (persistent workers), `persona.ts`, `voice.ts`;
  - art: `art/head.ts` (both robots' heads, eyes, painting a species or look), `art/outfit.ts`
    (hats, accessories, eye styles, stickers, fabric sway), `art/portrait.ts`, `art/model-sticker.ts`;
  - motion: `rig.ts` (the desk contract and the SeatedRobot interface), `ik.ts` (limb solvers),
    `antenna.ts` (the antenna spring);
  - the desk robot in `seated/` (`geometry`, `art`, `body`: state and the per-frame pass, `props`:
    mug, phone, headphones, `robot`: poses, typing, reactions) and the walking robot in `walker/`
    (`skeleton`, `art`, `body`, `speech`, `activities`, `walker`: walking and gestures, `handoff`);
  - rendering: `render/canvas.ts` (far robots on a canvas), `render/deferred.ts` (desk robots made
    on assignment), `render/power.ts` (Ultra and Fast effects).
  Accessories are part of the look and are drawn by both robots in every pose and place.
- `world/`: shared rooms (break room, question line, charging room, boss desk) and their games.
- `util/`: small shared helpers (`html.ts` escape, `math.ts`, `random.ts`, `dom.ts`, `mixin.ts`).
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
