# Camera rendering verification

Measured on 2026-10-31 in the `lucid/perf` worktree. Baseline: `e2833319e0e62750b653c24e9c93823b52941502`.

## Cause and change

The grounds SVG was restored as a full-size image above the overview cache's resolution threshold. Middle-button panning then repeatedly rasterized that enormous image. Chromium traces showed GPU raster stalls and synchronous `RasterImplementation::Finish` waits, while robot JavaScript occupied only a small fraction of the stalled runs. Hiding weather did not fix the stalls. Hiding only the static outdoor image did.

The renderer now keeps a 3200-pixel overview and one viewport crop with 256 CSS pixels of overscan. It changes the source SVG's viewport and intrinsic dimensions before decoding, then caches the result in a canvas. This avoids allocating the full grounds raster. A stable pan reuses the crop until it approaches its edge. Zoom retains the existing pixels during motion, then regenerates the crop at camera scale times device pixel ratio after 220 ms. One raster job runs at a time; replaced sources release their URLs, timers and canvases. Room, robot, screen, weather and UI artwork remain unchanged.

Duplicate actors had two causes in room handoffs: destinations could spawn while the source was still leaving, and a blind 15-second fallback created a hallway robot even when the source actor still existed. Exit ownership now lasts until the actual handoff, and fallback spawning requires the source actor to be absent. Hallway ownership also lasts through sitting and departure fades, with trip checks for reroutes. Seated and walking actors switch in one frame rather than overlapping in a crossfade.

## Measurements

Windows, Electron 45, NVIDIA RTX 3080, device pixel ratio 1.5. The existing `LUCID_SHOT` path places the normal Electron window offscreen with background throttling disabled. A fixed 31-thread fixture creates 18 occupied desks and 14 walker actors, including the boss. The overview shows many robots; close-up naturally shows fewer.

Each sample sends real Electron middle-button mouse events about every 8 ms for four seconds, with horizontal displacement of +/-180 CSS pixels and vertical displacement of +/-80. Values are renderer `requestAnimationFrame` intervals, with CPU profiling and Chromium tracing enabled in both builds. They are not a physical display FPS measurement. Ambient behavior and other GPU workloads can affect repeat runs.

| View | Scale | Before mean, ms | After mean, ms | Before p95, ms | After p95, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Overview | 0.23 | 18.2 | 9.5 | 34.6 | 20.5 |
| Office | 0.65 | 169.3 | 11.6 | 493.2 | 14.4 |
| Close | 2.0 | 117.5 | 7.0 | 499.8 | 7.2 |

In the baseline office trace, five synchronous GPU finish waits consumed 1077 ms in total, with a maximum of 367 ms. The ordinary after run had none. A wider +/-500 CSS pixel sweep, which forces cache renewal, averaged 12.7 / 16.4 / 9.0 ms in overview / office / close views. Its office p95 was 34.7 ms, so occasional cache-renewal hitches remain under this more aggressive movement; the change does not guarantee every frame fits 16.7 ms.

## Checks actually performed

- `npm install`, `npx vite build`, `npx tsc -p . --noEmit`, and `git diff --check` passed. Vite still reports the existing large-bundle warning.
- Captured and inspected offscreen screenshots at overview, office and close zoom, plus a settled park close-up.
- Held a departing question robot for 18 real seconds. The original renderer produced three actors for its ID. The fixed renderer retained exactly one actor, then completed the real source-to-hall-to-break-room walk. An animation-frame observer found no duplicate IDs throughout the fixed transition.
- Sent real wheel events to zoom the park to 3.932x, then checked the settled cache: 2517 bitmap pixels across 1677.974 CSS pixels, or 1.50002 pixels per CSS pixel, matching the display's 1.5 DPR.
- Reversed wheel direction repeatedly. Exactly one overview and one detail canvas remained. No renderer errors were recorded.
- Compared GPU traces and CPU profiles, including isolation experiments, before selecting the implementation.

Not verified: human-operated mouse feel in the visible production app, other GPUs or DPRs, a long-duration memory soak, every weather and animation state, or live T3 message workflows. The live tree, right chat layout and sidebar resizing were not changed.

## Reproduce

```powershell
npx vite build
node scripts/render-profile.cjs C:/temp/lucid-render-profile

$env:LUCID_PERF_CHECKS = '1'
$env:LUCID_PERF_CHECKS_ONLY = '1'
node scripts/render-profile.cjs C:/temp/lucid-render-checks

Remove-Item Env:LUCID_PERF_CHECKS, Env:LUCID_PERF_CHECKS_ONLY
$env:LUCID_PERF_PAN = '500'
node scripts/render-profile.cjs C:/temp/lucid-long-pan
```

Use a new output folder for each run. The harness uses an isolated screenshot profile and replaces world data and thread subscriptions with its fixture. It writes `results.json`, CPU profiles, Chromium traces and screenshots. Additional flags are documented at the top of the script.

Local raw evidence from this implementation session is in `C:/Users/tim/.t3/lucid-perf-evidence`: `baseline-final`, `final`, `long-pan`, and `checks-2`. The `after-final` repeat provides the quoted GPU wait comparison. The large raw artifacts are not committed.

## Startup and redundant presentation work, 2026-10-31

Optional games, video services, social apps and pastimes now load individually when
an activity is selected. Loading starts during the existing window entrance. The
same app code and styles still run. Concurrent desks share each module load, a
failed load can retry, and cancellation is checked before and after loading so an
interrupted robot cannot start a late app. Phone labels live in a small metadata
module instead of pulling the complete phone implementation into startup.

Desktop clocks, lock screens and the in-world T3 elapsed counters share one
cosmetic wall clock. Minute-only displays update on minute boundaries. Seconds
remain seconds. Hidden and offscreen clocks skip painting and update immediately
when shown again. Explicit owner teardown releases subscriptions. Cached date
formatters and unchanged-value guards avoid repeated formatting and DOM writes.
Unchanged T3 titles and model headers retain their existing nodes. Application
logic and agent supervision are unchanged. This scope edits no artwork or CSS.

The initial build payload below includes every JavaScript module preload and
stylesheet linked by `index.html`, not just the smaller entry file. Values are
uncompressed build bytes, not load-time measurements.

| Initial assets | Before | Performance candidate |
| --- | ---: | ---: |
| JavaScript | approximately 2,213,910 bytes | 1,555,162 bytes |
| CSS | approximately 401,120 bytes | 272,291 bytes |

The existing nine-scene `render-profile.cjs` suite ran before and after with
profiling enabled, its isolated 31-thread fixture, 23 desks and 14 walkers.
Hardware: Windows, Electron 45, Intel i9-13900K and NVIDIA RTX 3080. Each scene
samples four seconds. These are renderer animation-frame intervals, not physical
display FPS or CPU usage readings. Ambient behavior and the active app population
are not deterministic.

| Scene | Before mean, ms | After mean, ms | Before p95, ms | After p95, ms |
| --- | ---: | ---: | ---: | ---: |
| Idle | 6.97 | 7.08 | 7.30 | 7.40 |
| Crowded overview | 10.55 | 9.03 | 14.30 | 14.10 |
| Close | 6.94 | 7.06 | 7.30 | 7.30 |
| Panning | 9.17 | 9.02 | 14.00 | 14.10 |
| Many apps | 7.29 | 7.73 | 7.70 | 13.90 |
| Distant apps | 10.87 | 11.15 | 14.00 | 14.00 |
| Close apps | 6.98 | 6.98 | 7.10 | 7.10 |
| Chat | 6.97 | 6.96 | 7.20 | 7.20 |
| Rain | 7.02 | 7.14 | 7.30 | 7.30 |

Both runs recorded no renderer errors. These mixed results do not establish a
consistent steady-state frame-rate improvement. The demonstrated changes are
reduced initial asset work and elimination of redundant clock/header updates.
CPU utilization, RAM use, GPU memory, battery life and visible production startup
latency were not measured for this change.

Verification performed:

- Private `npm run verify:update` passed with the performance changes, including
  typechecking, desk presence, updater recovery, scheduling, detail transitions,
  viewport allocation and the production build.
- `node scripts/verify-lightweight.mjs` passed concurrent cold loads, cancellation,
  retry, 25 clock owners sharing one timer, minute/second cadence, hidden/offscreen
  suspension, immediate resume, reattachment and cleanup.
- All 32 optional activities opened in native Electron with their styles loaded
  and positive geometry. Every interrupted activity disposed its windows. No
  renderer errors were recorded. This is entry/style/cancellation coverage, not a
  full playthrough of every activity.

Raw evidence is under `C:/Users/tim/.t3/lucid-perf-evidence/` in
`lightweight-before-20261031`, `lightweight-after-20261031`, and
`lightweight-apps-20261031-r2`. The private build is
`E:/T3 Projects/Lucid/.lucid-update-u7Eoys/dist`, entry `index-CQWwcemO.js`.
It intentionally excludes newer concurrent feature work and must not be promoted
over it. Final delivery requires a fresh combined source snapshot and validation
after those owners finish. This task has not promoted or restarted production.

To repeat the optional activity checks with an isolated build:

```powershell
$env:LUCID_PERF_CHECKS_ONLY = '1'
$env:LUCID_IDLE_LOADING_CHECKS = '1'
node scripts/render-profile.cjs C:/temp/lucid-idle-loading-checks
Remove-Item Env:LUCID_PERF_CHECKS_ONLY, Env:LUCID_IDLE_LOADING_CHECKS
```

### Repeated startup and controlled rendering follow-up

The [performance review report](evidence/lightweight-2026-10-31/review.md)
adds six paired fresh-profile and six paired warm-profile launch-to-input
measurements on matched private builds and one saved world. Removing an artificial
1.5-second first-sidebar delay reduced median local launch-to-input from 2.90 to
2.58 seconds with fresh app caches and from 2.66 to 1.35 seconds with warm caches.
The OS disk cache was not flushed. A controlled six-pair, 18-app comparison did
not reproduce the earlier many-app p95 increase. It measures matched entry states,
with a separate close view where canvas clocks remain live, not every gameplay
state. The report retains raw results, exclusions, hardware, screenshots and
loaded-build proof for the coordinated delivery that includes the sidebar fix.

## Responsiveness and bounded work, 2026-10-31

Visible GSAP movement and camera/panel tweens now follow the display instead of
sharing a hard 60 Hz cap. Hidden windows retain the existing 60 Hz logic ceiling.
Robot body painting retains its 12/20/30/60 Hz tiers and eight-body, 2 ms budget
per 60 Hz interval, independently of display refresh. Waiting bodies receive fair
turns. Camera following uses elapsed time, preserving its original response and
bounding catch-up after a slow frame. Hidden following skips geometry reads.

The shared app clock sleeps between drawing deadlines and wakes for camera,
visibility, window and display-density changes. Its final owner and document
hiding cancel both queued animation frames and its timer. Real supervision and
app logic remain independent. The virtual 144 Hz single-screen check records
65 scheduler callbacks, 21 body-independent screen draws and 21 hierarchy checks.
Artwork, displayed density, sound and chat styling are unchanged.

Chat refreshes compare display fields against the current history objects rather
than retaining a serialized conversation and a serialized message in every DOM
attribute. Unchanged timelines skip layout reads and Markdown parsing. Remote
detail consumers share in-flight requests. Their full projection cache expires
after the existing 1.2-second reuse window and retains at most 16 entries. This is
an entry bound, not a total RAM ceiling. Remote watches deliver changed items and
metadata independently, including edits with unchanged timestamps. Stopped or
invalidated requests cannot restore obsolete cache entries.

World refreshes recheck building identity after asynchronous work. Task reads are
single-flight and discard old-building replies. Unacknowledged subscriptions can
retry. Actions requested during a refresh coalesce into an immediate follow-up,
and deferred initial camera framing belongs to its original building.

Checks performed:

- `npm run verify:update` passed on a frozen delivery snapshot, including runtime
  syntax, TypeScript, updater recovery/promotion, rendering checks and build.
- Focused coordinator, remote polling, chat comparison, history, canvas, Connect,
  actor and camera-queue checks passed. Actor checks exercise all body tiers on
  60/120/144/240 Hz clocks, fair scheduling, measured draw budgets, hidden resume
  and refresh-independent camera following.
- Native Electron fixtures passed full/reduced/offscreen/covered app transitions,
  restoration of the original canvas, buffered harness text, visible robot
  activity, overlay geometry and 205-message pagination. Unchanged history causes
  zero Markdown renders; editing one message causes one render. The reader anchor
  stays within one CSS pixel and no serialized message attributes remain.
- Real native middle-button input passed displacement, pointer cancellation,
  workstation capture, blur cleanup, cache reuse and display-density checks.
  The camera counter fixture now reads the active vector-canvas counter instead
  of an absent overview counter. System fixtures wait for real app entry, hold
  their layout during manual app checks and cover actual window geometry. The
  HUD shortcut check targets the renderer event layer; native F8 belongs to the
  Electron capture profiler.

Native profiling used Windows, Electron 45, Intel i9-13900K, NVIDIA RTX 3080 and
1.5 DPR with the existing isolated 31-thread fixture, 23 desks and 14 walkers.
The final nine-scene profile recorded no renderer errors. Separate diagnostic
fixtures overlapped part of this profile. The samples do not establish a steady
frame-rate improvement or physical 144 FPS. Crowded scenes still exceed the
6.94 ms target, with compositor/layer work prominent in the traces. The short
camera-tween callback check was below the rate needed to distinguish a 60 Hz cap
on hardware; the high-refresh timing contract is covered by virtual-clock tests.
Process CPU utilization, RAM, GPU memory and battery savings were not measured.
No human-operated visual or audio listening test, live remote integration or
long memory soak is claimed.

Raw traces, profiles, screenshots, loaded assets, check results and delivery proof
are in `E:/Lucid-validation/responsive-20261031/`. Relevant folders are
`final-native`, `camera-clock-final` and `after-system-history-final2`.
The full profile completed before an obsolete camera counter assertion failed;
the corrected camera fixture subsequently passed separately. Final helper changes
were included in a fresh `verify:update` run. The native-tested and delivered
application assets match; only the two test helpers differ between snapshots.

The safe local updater promoted the validated source snapshot to
`dist/assets/index-DM8O-VID.js`, with the preceding dist retained by its normal
recovery path. It did not restart the running application. Relaunching Lucid loads
this build. Existing user edits and unrelated concurrent source work were retained.

## Heavy zoom, camera input and scrolling follow-up

Saved camera restoration used to call the camera setup routine again. This added
wheel/pointer handlers and ResizeObservers on every restore. Restoration now
applies the saved state through the existing controls. Wheel bursts reuse scene
geometry, retain cursor anchors and accumulated reversals, and skip no-op input
at the maximum scale. A camera transition owns its tween; a newer focus request
replaces the older transition. Thirty restores keep handler/observer counts flat
in the focused check. Native input reproduced the former multiplied zoom response
and confirms that the corrected response applies one wheel delta.

Sharper room and outdoor crops now survive zoom-out when they still cover the
required geometry. Magnification and uncovered movement continue to restore the
original vectors immediately. Superseded outdoor raster jobs release discarded
canvas backings. Opacity scratch canvases grow to their required tile size rather
than repeatedly shrinking and growing at tile edges. Copies use the active tile
rectangle. Opacity groups cache conservative world bounds and skip work when
entirely outside a tile; unknown bounds remain drawable. These changes preserve
artwork and displayed pixel density.

Chat scrolling remains native. During incoming updates, reader-anchor lookup uses
chronological rows and expanded batches rather than measuring every preceding
bubble. Unchanged group summaries and visibility attributes remain untouched.
The focused fixture covers 10,000 rows and a 5,000-message expanded batch with at
most 16 anchor geometry reads. Native history checks preserve the selected older
message within one CSS pixel while earlier content grows, retain its expanded
group and perform zero unrelated group-metadata mutations.

Validation and evidence:

- `npm run verify:update` and focused camera, actor, scroll, message, history,
  static-art, outside-viewport and opacity-scratch checks passed on a frozen
  snapshot. Opacity tests independently check colors, partial tiles, clipping,
  transformed stroke bounds, unknown geometry, zero offscreen group copies,
  warm backing reuse and cleanup.
- Native artwork comparisons passed all 45 existing checks, including 16 actual
  artwork samples and three synthetic cases. Existing pixel thresholds were not
  changed. Static artwork retained its source pixels, viewport bounds, live props
  and immediate sharp fallback. A retained-scene screenshot was inspected.
- Native stress coverage sends 160 reversing zoom events, 100 mixed pan/zoom
  events, 100 chat-scroll events while the newest message changes, and 100 sidebar
  scroll events. It retains 400 messages, scrolls both panels, keeps those scrolls
  from moving the camera, settles raster jobs and releases middle-button capture.
  Final continuity checks passed with no renderer errors.
- The harness waits for native wheel input to drain before switching surfaces.
  Chromium can coalesce or queue rapid input; an injected event count is not an
  assumed delivered event count. Event-to-handler and handler-to-transform timing
  are recorded separately. They do not measure physical display presentation.

The native workload uses the isolated 31-thread fixture on Windows, Electron 45,
Intel i9-13900K, NVIDIA RTX 3080 and 1.5 DPR. Heavy zoom still produces substantial
frame hitches and queued wheel input. Passing these behavior/fidelity checks does
not establish smooth physical 144 FPS, a consistent frame-time improvement, lower
total CPU use or a RAM ceiling. Raw Electron process CPU/memory snapshots are
diagnostics, not evidence of sustained savings or GPU VRAM use. First CPU sampling
values can be zero without establishing that a process was idle. Battery life,
human-operated mouse/touch feel and long-duration memory use were not measured.
Electron also emitted GPU shutdown warnings after successful fixture exits;
these are not proof of an error-free GPU/driver session.

Evidence is in `E:/Lucid-validation/zoom-scroll-20261031/`. `before-final` retains
the reproduced restore bug; `after-all-scroll` covers the added sidebar case;
`final-native` includes the final conservative group-culling change, pixel checks,
history checks and all input/scroll cases. `verify-final.log`, `focused-final.log`
and `delivery-proof.json` identify validation and delivery.

The safe updater promoted the exact validated, native-tested application assets
as `dist/assets/index-CGoLmtP2.js`, retaining the preceding dist and leaving the
running app open. Concurrent mobile/touch source edits arrived during promotion.
They remain intact in the checkout and are outside this tested snapshot. The
post-promotion source-equality assertion noticed those later edits; separate
checks confirmed that the promoted build itself matches the validated snapshot
and native-tested assets exactly. No reset, stash or source hold was used.

## Repeated responsiveness review, 2026-11-01

[The review and evidence](evidence/responsiveness-review-20261101/review.md)
record two complete matched primary pairs and a separate confirmatory pair,
with repeated zoom, mixed-camera, native scroll and cleanup measurements.
The same unrelated notes, naming and static-art changes are present in each
control/candidate pair. No additional delivery or restart was made.

Outdoor movement now uses bounded original SVG followed by a settled, sharp
viewport bitmap. Unused tiles/overview, oversized history and closed-chat
transcripts are released. Context loss retries safely. Native checks also found
and corrected center-origin drift in static/live outdoor artwork.

Primary median per-cycle mixed-camera p95 improved from 31.0 to 15.5 ms,
and CDP-flood frame p95 from 38.9 to 16.05 ms. These are not pooled p95s.
The 6.94 ms target still fails. Chat scrolling remains about 16.2 ms p95.
One confirmatory injected flood reached 262 ms acknowledgement p95 and 21
outstanding commands despite a short handler-to-camera-commit path.

Sustained process sampling shows lower median/recovery memory, but overall CPU
did not decrease and peak private memory was not consistently lower. The final
30-second recovery still has persistent robots and desk transitions, so it is
not a full teardown. GPU-process RAM is not VRAM; no battery result or memory
ceiling is claimed. One strict input-accounting run remains incomplete and
excluded, with its replacement accounting revision reported separately.

Aligned final traces locate remaining spikes in layerization and GPU-process
raster flush/wait work. Hiding outdoor live artwork alone did not remove the
mixed-camera bottleneck. The report separates trace overhead, injected queues,
camera commits and physical display acceptance.

[Executing review-build proof](evidence/responsiveness-review-20261101/review-build-proof.json)
records validated source and the entry Chromium actually parsed, including the
accepted notes/BotsApp source hashes. Production inclusion is still pending.
At the next existing coordinated promotion, record the actual executing
production entry URL/hash, validated manifest and promotion result, then append
that genuine proof to the pending handoffs. Keep this job unsettled until review.

## Paced follow-up and longer recovery, 2026-11-01

[The follow-up evidence](evidence/responsiveness-followup-20261101/review.md)
completes a fresh missing workload pair with consistent signed-delta accounting
and adds a separate 12-cycle paced pair with 60-second recovery. Neither dataset
is pooled with the earlier instrumentation. The launchers now reject missing
entry modules and source changes before starting a private fixture. Per-cycle
checkpoints include heap, DOM, owned pixels and retained recorder counts.

Traced diagnostic runs isolate static grounds as a major remaining contributor:
mixed-route Layerize span falls from about 1,730 to 707 ms when only static
grounds are hidden. Disabling the root promotion hint has no useful effect.
Hiding artwork is diagnostic only, and flush/wait stalls remain.

The paced pair's median per-cycle mixed callback p95 is 22.6 to 7.6 ms; chat
remains about 15.1 ms. The 6.94 ms target still fails. Covered-time total CPU
rises slightly, and complete after CPU cost is unknown across 2.009 seconds of
missing-counter intervals. One-second sampled private peaks fall from 2,397 to
2,255 MiB, but the final recovery endpoint is higher after the fixes despite a
lower last-ten-second median. This supports neither a memory ceiling nor a
simple cleanup endpoint saving. The report records exact workload and hardware.

The delivery owner's newer tile candidate and its production attestation remain
separate pending work. No competing production promotion or restart was made.

## Landscape tiles (2026-11-02)

Terrain and woodland outside the offices are no longer SVG. `landscape.ts` plans the campus
woodland, lawns, meadows, creek, trails, paved walks and lamp posts once per geometry change
(independent of season), and paints any world rectangle in the current season, weather and
ground colours. `landscape-tiles.ts` owns the bitmaps:

- A whole-map overview canvas (at most 2048 pixels on its long side) always lies underneath, so
  an unpainted tile shows softer ground, never a hole. It is painted at once only on first
  load; later repaints (weather, season, layout) go into a second canvas in 224-pixel chunks
  and swap in when complete. The idle second canvas releases its pixels.
- Sharper 512-pixel tiles exist only near the view, at quarter-octave densities at or above
  camera scale times device pixel ratio (capped at 3). Out-of-view tiles are hidden; the least
  recently used are reassigned to new positions instead of allocating new canvases.
- During a zoom gesture the current tile density is kept (at most one octave off) and the
  matching density is painted 220 ms after the gesture rests.
- Tile and chunk painting run on animation frames with a 3 ms budget while the camera moves
  and 9 ms at rest, starting a piece only when its running average cost still fits.
- The remaining outdoor SVG holds only the building shell, the park objects robots use, and
  the light: dusk tint, night tint, lamp pools and window light spilling onto the grass.
  `.outside-layer` isolates its stacking so this overlay cannot cover the rooms.

`scripts/verify-landscape.mjs` checks the layout is deterministic and keeps trees, props and
lamps clear of buildings, walks and robot routes. `scripts/verify-campus-atmosphere-native.cjs`
captures six season/weather/time states with close views and measures frame intervals.

Measured on the isolated native fixture (Electron, NVIDIA RTX 3080, Windows, six projects,
18 threads, two connected buildings, about 1960 trees). Values are renderer animation callback
intervals over 2 s, not display FPS. Previous build (SVG tree ring) versus landscape tiles:

| Scenario | Previous mean / p95 / >33 ms | Landscape mean / p95 / >33 ms |
| --- | --- | --- |
| Overview | 8.0 / 13.9 / 0 | 7.0 / 7.1 / 0 |
| Park close | 6.9 / 7.2 / 0 | 6.9 / 7.0 / 0 |
| Pan | 9.7 / 14.0 / 0 | 8.3 / 13.9 / 0 |
| Zoom sweep | 17.5-18.2 / 34.8-41.5 / 8-9 | 15.3 / 27.9 / 5 |

Zoom stays heavy in both builds because rooms re-raster at new scales; separate repeated runs
varied by several milliseconds. The landscape's largest single frame slice was 9.5 ms. Peak
tile count during the zoom sweep was 35 (about 35 MB of tile pixels) plus the overview (about
12 MB). No CPU, RAM ceiling, GPU memory or battery measurement was made.

## Large offices (2026-11-07)

Measured with `scripts/make-load-office.py`: 68 running sessions on 72 desks, on a heavily
loaded machine (another process using about four cores), so absolute times are inflated.

The cost that grows with the office is Chromium regrouping the whole page into GPU layers
(Layerize) on every frame where anything repaints. It scales with the number of drawn elements,
not with any single animation. Changes:

- Behind a finished monitor snapshot, the real app is `content-visibility: hidden` (state kept,
  no style, layout or paint). This alone took the overview from about 15 to about 45 fps.
- Monitors a few pixels wide (`desk.lod-tiny`) skip their dock row.
- Zoomed far out (camera scale below 0.15), ambient work runs at 30 Hz, or 15 Hz when calm.
- While the camera moves, robot bodies and looping decorations hold until it settles.
- Thread rows scrolled out of view are skipped (`content-visibility: auto`), which also pauses
  their spinners.
- Calm mode no longer lets GSAP restart its own frame loop, and wakes just after its beat.

Result in that run: whole-office overview about 59 fps with no long tasks (was about 15 fps with
41 long tasks); panning and zooming about 50 fps on average (was about 29 fps). Zoom steps
still have a few long frames while rooms re-raster at the new scale. Robots remain the largest
remaining cost at the overview: each is about 240 SVG elements.

### Canvas robots (zoomed out)

Below camera scale 0.5 a seated robot is drawn on its own `<canvas>` (`src/world/robot-canvas.ts`)
instead of as ~240 live SVG elements; close up the real SVG is shown. The rig is unchanged: it
keeps writing to its SVG, which is `display: none`, and the canvas mirrors that state after each
body draw. Parts that never change shape become pictures made from the robot's own SVG (colors
resolved, shared vectors inlined, shared across robots that look alike); parts whose shape
changes every frame (arm strokes, contact shadows, chair spokes) are drawn as canvas shapes.
Parts seen moving on their own (an accessory's sway) are promoted to live parts after one
rebuild. A canvas update does not make Chromium regroup the page into layers, so this removes
robots from the per-frame Layerize cost. `localStorage['lucid.canvasRobots'] = '0'` turns it off.
Visibility for the body budget is tracked on whichever of the two is shown.

### Levels of detail

All levels use one set of distances in `src/perf/lod.ts`, measured in device pixels of a desk's
monitor (276 world units wide): full app text from 440 px, line shapes from 300 px, layout shapes
from 190 px, the app icon below that (where robots also switch to their canvas), and below 70 px
the dock row is skipped and background motion slows. Earlier these were page pixels or zoom
values chosen separately, so on a 150 % display they switched at uneven, too-early distances.
Robot canvases switch the moment the zoom crosses their level and resharpen when the camera
settles, instead of waiting for each robot's next draw.
