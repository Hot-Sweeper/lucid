# App performance pass

Historical measurements below used the former hidden-distant-screen policy. For the current all-visible screen behavior and combined measurements, see [delivery-audit.md](delivery-audit.md).

Baseline for this pass: `1ef6115ada23caf8ead6ae0254386761cd028734`, which already contains the outdoor raster and duplicate-actor fixes. All changes stay in `lucid/perf`. The production checkout is not edited.

## Findings and implementation

- Heavy screen apps had independent, uncapped rAF loops that continued rendering offscreen. Games, video sites, Botflix, social activities and the harness now share one visibility-aware scheduler. Offscreen, fully covered and unreadably small screens stop drawing. Screens under 200 CSS pixels update at 15 fps, medium screens at 30 fps, and close screens at 60 fps. Logical events and real thread data remain independent of rendering.
- Per-frame walker CSS variables were inherited by the whole SVG, forcing unnecessary descendant style work. Card and battery offsets now update only the overlay that consumes them. Hidden batteries receive no bob updates.
- Distant robot redraws were synchronized, producing bursts. They now use staggered slots and a fair overdue queue. A late GSAP clock temporarily limits bodies to three draws per tick, rather than letting all overdue bodies create the next long frame. Movement continues at a steady 60 Hz clock; offscreen body draws stop completely.
- Camera input was processed at display rate, including unnecessary global tween searches per mouse event. Camera painting is now paced at 60 updates per second, using one reusable callback. Dragging cancels the camera tween once, and bubble geometry uses cached elements.
- Outdoor CSS animations pause outside the scene. Small ambient details rest below 1x zoom. Weather stops entirely when the viewport lies inside the opaque building; slow cloud shadows draw at 12 fps and precipitation has a distance budget. Camera geometry is updated without per-frame object cloning.
- Static posters and video thumbnails are built only when visible, at most one queued image per frame. Existing art caches are reused. Layout containment isolates desks, rooms and robot hosts; it does not clip their overlays.
- The scenery renderer retains two recently used sharp viewport crops, in addition to the current crop and small overview. Backtracking can reuse pixels instead of decoding and rasterizing the same SVG again. Cache storage is bounded, stale jobs do not replace a usable crop, and source replacement releases the history. This trades up to two extra viewport buffers for fewer pan hitches.
- Window placement now uses coordinates owned by the window manager, avoiding repeated offset geometry reads after writes. Fully covered windows stop drawing and resume on focus or movement. Cursor setters are reused, invisible typing avoids intermediate DOM updates, and workstation clock timers are destroyed with their desks.
- Chat compares source content before Markdown parsing. Unchanged polls parse zero messages, same-length edits and attachment changes still update, and polling preserves scroll position. Unchanged project labels and Add a desk placeholders retain their DOM nodes. The chat layout and sidebar resizing are unchanged.

## Native benchmark

2026-10-31, Windows, i9-13900K, RTX 3080, DPR 1.5, offscreen Electron 45. The screenshot path disables background throttling. The fixture has 31 threads, 18 occupied desks, and 14 walker actors including the boss. The heavy-app stages open actual Blockcraft, Night Shift, Bot-Com, Boot, Botflix and TensorHub activities across all 18 desks, reaching roughly 180 to 210 canvases. Chat contains 200 Markdown messages and polls every 750 ms. Rain runs after the heavy-app stages.

Each stage measures four seconds after settling. These are renderer rAF intervals, not physical display FPS. Native comparison runs disable CPU tracing/profiling; the after run enables lightweight system counters. Ambient choices and other desktop/GPU work can vary between runs. Traces and isolation runs were used separately to identify causes.

The eight-stage table was captured just before the final viewport-history addition. That addition was then verified separately with the wider sweep and the complete regression run. The combined production app has not been measured here.

| Scenario | Before mean, ms | After mean, ms | Before p95, ms | After p95, ms |
| --- | ---: | ---: | ---: | ---: |
| Idle office | 9.0 | 8.0 | 15.6 | 8.1 |
| Many robots / overview | 8.9 | 9.6 | 15.6 | 16.1 |
| Zoomed in | 7.8 | 7.8 | 8.1 | 8.2 |
| Middle-button pan | 15.5 | 9.9 | 23.8 | 16.0 |
| Many active screen apps | 21.1 | 8.1 | 31.7 | 8.5 |
| Active screen close-up | 15.1 | 8.0 | 23.1 | 8.4 |
| Chat plus active apps | 17.2 | 8.1 | 23.5 | 8.4 |
| Rain plus active apps | 21.8 | 8.5 | 31.8 | 15.5 |

All eight p95 values fit 16.7 ms on this machine. This does not mean every frame does: the final run recorded one interval above 33.4 ms in idle and one during panning. The overview mean is slightly higher than baseline; the pass prioritizes spreading its work consistently rather than concentrating it into sparse large bursts.

A separate +/-500 CSS pixel sweep tested scenery cache renewal and backtracking. Adding the two-entry crop history reduced raster jobs from 12 to 6, mean interval from 11.7 to 8.7 ms, and p95 from 30.5 to 14.2 ms. There were still nine intervals above 33.4 ms in that four-second run, so this is a p95 improvement rather than a claim of zero hitches. The wide-sweep raw folders are `wide-pan-final` and `wide-pan-cached-final`.

## System budgets

The 16.7 ms target is divided below. Measured costs are mean synchronous JS work normalized to a 60 Hz frame, taking the highest stage average in the final native run. The HUD itself displays cost per sampled rAF. Renderer style/layout/paint and GPU time are separate from JS counters and need Chromium traces. Budgets are targets, not hard preemption of arbitrary canvas or DOM work.

| System | Target ms per 60 Hz frame | Highest measured mean JS ms per 60 Hz frame |
| --- | ---: | ---: |
| Robot bodies | 2.0 | 0.37 |
| Desk screens / apps / harness | 3.0 | 2.46 |
| Weather | 0.75 | 0.03 |
| Static scenery cache | 0.75 | 0.00 during warmed stages |
| Camera / culling | 0.5 | 0.13 |
| Sidebar / ordinary UI | 0.5 | 0.002 |
| Chat | 0.5 | 0.014 |
| Style, layout, paint, compositor / GPU | 6.0 | Not represented by JS counters |
| Input, GC and scheduling reserve | 2.7 | Not represented by JS counters |

Scenery initialization and cache-renewal peaks are not included in its zero warmed-stage mean. Heavy app callbacks still have individual peaks above their mean budget, so short-run averages alone are insufficient to promise performance on slower hardware.

## Diagnostics and checks

Press **Ctrl+Shift+F8** to toggle the hidden frame-time overlay. It shows mean, p95 and system JS work, and updates twice per second. By default it creates no overlay or sampling rAF. The console API is `window.__lucidPerf.enable(true)`, `.reset()`, `.snapshot()` and `.render()`. `enable(true, true)` also shows the overlay; `enable(false)` removes it and stops sampling.

Verified with the real offscreen app:

- A visible game made 42 to 43 callbacks in a 700 ms close-up sample. Offscreen, distant and fully covered samples made zero calls. Returning to it or uncovering it resumed rendering.
- A real harness view stopped rendering offscreen, accepted updated fixture text, and resumed correctly. All 29 visible robot SVGs in the fairness sample continued changing.
- Unchanged chat polls performed zero Markdown renders and retained scroll position. Same-length edits and attachment metadata updates rendered correctly.
- Native keyboard input toggled the HUD on and off. It was absent and disabled by default.
- Localized question-card and battery offsets matched their skeleton coordinates within 0.05 CSS pixels. The actor root no longer received the inherited bob variable.
- The original slow-exit test still held exactly one actor, completed its real room-to-hall-to-room walk without duplicate IDs, and retained one preview plus one sharp canvas after repeated wheel reversals. Settled zoom density still matched 1.5 DPR.
- Vite build, TypeScript and diff whitespace checks passed. Vite retains the existing large-bundle warning. Screenshots were inspected for game resume, the harness, HUD and close-up artwork.

Not verified: physical mouse feel in the visible production app, real streaming T3 workloads, other GPUs/DPRs, a long memory soak, or every game and weather state. A synthetic 4x CPU slowdown still misses 60 fps. That stress result means these measurements do not establish stable 60 fps on an ordinary slower laptop; substantial SVG/browser rendering cost remains under severe CPU limits.

## Reproduce

```powershell
npx vite build
$env:LUCID_PERF_SUITE = '1'
$env:LUCID_PERF_TRACE = '0'
$env:LUCID_PERF_METRICS = '1'
node scripts/render-profile.cjs C:/temp/lucid-app-perf

Remove-Item Env:LUCID_PERF_SUITE, Env:LUCID_PERF_TRACE, Env:LUCID_PERF_METRICS
$env:LUCID_PERF_CHECKS_ONLY = '1'
$env:LUCID_PERF_CHECKS = '1'
$env:LUCID_SYSTEM_CHECKS = '1'
node scripts/render-profile.cjs C:/temp/lucid-app-regressions
```

Use fresh output folders. Optional flags: `LUCID_PERF_CPU=4`, `LUCID_PERF_PAN=500`, and `LUCID_PERF_SCENES=idle,many,panning,apps-many,apps-close`. Leave `LUCID_PERF_TRACE` unset to collect CPU profiles and Chromium traces. The harness uses fake thread data and subscriptions in isolated screenshot profiles.

Raw local evidence: `C:/Users/tim/.t3/lucid-perf-evidence/full-native-before`, `full-native-local-final`, and `regressions-local-final`. Earlier trace and isolation folders remain available for comparison. Large raw artifacts are not committed.

Final viewport-history regression evidence is in `regressions-cached-final`. It passed both the original robot/zoom checks and the new system checks, with no renderer errors.

## Integration overlaps

- `main.ts`: only the diagnostics import and begin/end timing calls in `renderThreads`. Favor the incoming thread-grouping behavior if these conflict, then reapply the timing calls.
- `world.ts`: `recull` supplies screen visibility/size to the scheduler and hides outdoor animation indoors; `applySoon` uses the paced camera callback; drag start cancels camera tweens once; `apply` supplies building height to weather, uses the 1x ambient threshold and records timing. `addTiles` caches unchanged controls, `fitBubbles` uses a cached element, and `redrawOutside` registers ambient visibility. Preserve the incoming panel-resize and scene-bounds calculations.
- `chat-panel.ts`: this pass changes caching and pending-message refresh logic, not layout or event wiring. If same-minute grouping changes message markup based on neighboring messages, include that grouping context in the cache signature or update grouping classes outside the cached Markdown path. Do not replace incoming ordering/event fixes with this file wholesale.

## Files changed

Core: `src/perf/metrics.ts`, `src/perf/render.ts`, `src/world/budget.ts`, `src/world/seated.ts`, `src/world/walker.ts`, `src/office/world.ts`, `src/office/desk.ts`, `src/office/ambient.ts`, `src/office/outside-zoom.ts`, `src/office/office.css`, `src/weather/effects.ts`, `src/main.ts`.

Screen and chat engines: `src/os/wm.ts`, `src/os/typing.ts`, `src/os/tasks.ts`, `src/office-apps/common.ts`, `src/harness/harness.ts`, `src/life/util.ts`, `src/office/chat-panel.ts`, `src/fun/util.ts`, `src/fun/site.ts`, `src/fun/botflix.ts`.

Owner bindings: `src/fun/games/dash.ts`, `src/fun/games/flappy.ts`, `src/fun/games/snake.ts`, `src/fun/phone.ts`, `src/fun/tensorhub.ts`, `src/fun/tube.ts`, `src/games/kit.ts`, `src/games/blockcraft.ts`, `src/games/boot.ts`, `src/games/botcom.ts`, `src/games/bugger.ts`, `src/games/connect4.ts`, `src/games/island.ts`, `src/games/merge.ts`, `src/games/nightshift.ts`, `src/games/tictactoe.ts`.

Verification: `scripts/render-profile.cjs`, `scripts/render-system-checks.cjs`, `docs/app-performance.md`.
