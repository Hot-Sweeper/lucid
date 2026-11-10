# Studio: watching a robot build a page

When a robot's real T3 work saves a web file (HTML, CSS, JS, JSX, TSX, Vue, Svelte, Astro, Sass,
SVG), the director opens the Studio app on its computer. The page is rebuilt from the files on
disk and the change since the previous render plays back like a person in a design tool: boxes
are drawn and filled, rounded and shadowed, text is clicked into place and typed, images are
dropped in and scaled, removed parts are selected and deleted. Nothing is recorded and no model is
asked anything, so it costs no tokens.

## Pieces

- `src/director.ts` (`showPage`): after the edit scene of a Codex `file_change` or a Claude
  `Write`/`Edit`/`MultiEdit` of a web file, it hands the save to Studio. A Claude `Write` that
  reports "File created" or a Codex `add` of an HTML file is a new page and is built from a blank
  canvas; an existing page first appears directly, and later saves play back. The dev server URL
  comes from the thread's own command output (`frontendUrlFromOutput`).
- `src/os/studio.ts` (`StudioApp`): the window, the sandboxed frame and its messages, the
  pointer handoff (one visible cursor; the robot's hand follows on its desk mouse) and the detail
  scene for distant monitors. `src/os/studio-schedule.ts` decides when a save renders and whether
  it plays back.
- `electron/studio.cjs`: sessions, the `lucid-studio://<session>` protocol and the navigation
  guard. `electron/studio-page/`: the host page and the playback engine (`stage-engine.mjs`),
  which diffs each new render against the visible one.

## What can be rendered

1. A static site renders directly from the project folder: the edited HTML file, else the page
   shown last, else the nearest `index.html` above the edited file.
2. A framework project (Vite, Next and similar in the nearest `package.json`, or an entry that
   loads `.ts`, `.tsx`, `.jsx`, `.vue` or `.svelte`, or an edit to such a source) renders only
   through the local dev server the robot started.
3. Otherwise Studio stays closed. A saved HTML file keeps the browser's live frontend preview;
   other files keep the editor or tool view. No page is ever made up.

## Presentation rules

- Renders reach the frame only while the robot is seated, the monitor is visible and close
  enough for full detail (`StudioSchedule.live`). Saves made meanwhile wait; only the newest one
  renders, and it plays from what is visible.
- A save during playback hands over: the current action finishes, then the build continues with
  the newer files. Losing the audience (camera, covered window, empty chair) finishes the
  playback at once. Reduced motion and catching up show changes directly.
- The director waits for the save's render at most 24 seconds and speeds playback up while more
  real work waits. T3 and the agent never wait for Studio.
- Distant tiers draw a scene measured from the real render (canvas, artboard, boxes, text lines).
- At most three Studio frames exist in the office. A frame is released when its window closes,
  when it has been unseen for 90 seconds or on reset, together with its timers, listener and
  session. Nothing polls while Studio is idle.

## Security

- The frame is `sandbox="allow-scripts allow-same-origin"` on its own `lucid-studio://<id>`
  origin (a random 96-bit id per session), so it cannot reach the app or its bridge; no forms,
  popups, modals or top navigation. Preloads do not run in subframes.
- Static sessions serve only files inside the project (realpath checked, hidden files refused,
  64 MB cap). Server sessions proxy GET and HEAD to that one local dev server; redirects off it are
  refused. Every response carries `cache-control: no-store` and a CSP that allows only the
  session's own origin (`connect-src 'self'`, `frame-src 'self'`, `form-action 'none'`).
- `will-frame-navigate` keeps every Studio document on its own session origin.
- Threads on a linked computer never render from this computer's disk; the director and the
  main process both refuse them.

## Checks

`node scripts/run-checks.mjs studio` runs `verify-studio.mjs` (render diff to playback steps,
scheduling, pointer handoff, bounded frames, teardown) and `verify-studio-server.cjs` (page
detection, project-only files, CSP, dev server proxy, sessions, navigation guard).
