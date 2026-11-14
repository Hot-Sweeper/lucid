# Rendering performance

How the office keeps its frame budget, and how to profile it. Measurements depend on the
machine, display and workload: report numbers only with the hardware and workload they came from.

## Outdoor grounds and actors

The grounds SVG was restored as a full-size image above the overview cache's resolution threshold. Middle-button panning then repeatedly rasterized that enormous image. Chromium traces showed GPU raster stalls and synchronous `RasterImplementation::Finish` waits, while robot JavaScript occupied only a small fraction of the stalled runs. Hiding weather did not fix the stalls. Hiding only the static outdoor image did.

The renderer now keeps a 3200-pixel overview and one viewport crop with 256 CSS pixels of overscan. It changes the source SVG's viewport and intrinsic dimensions before decoding, then caches the result in a canvas. This avoids allocating the full grounds raster. A stable pan reuses the crop until it approaches its edge. Zoom retains the existing pixels during motion, then regenerates the crop at camera scale times device pixel ratio after 220 ms. One raster job runs at a time; replaced sources release their URLs, timers and canvases. Room, robot, screen, weather and UI artwork remain unchanged.

Duplicate actors had two causes in room handoffs: destinations could spawn while the source was still leaving, and a blind 15-second fallback created a hallway robot even when the source actor still existed. Exit ownership now lasts until the actual handoff, and fallback spawning requires the source actor to be absent. Hallway ownership also lasts through sitting and departure fades, with trip checks for reroutes. Seated and walking actors switch in one frame rather than overlapping in a crossfade.

## Large offices

Measured with `scripts/review/make-load-office.py`: 68 running sessions on 72 desks, on a heavily
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

Below camera scale 0.5 a seated robot is drawn on its own `<canvas>` (`src/robot/render/canvas.ts`)
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
with soft text bars from 190 px, the same layout under the app icon below that (where robots also
switch to their canvas), and below 70 px the dock row is skipped and background motion slows.
Reduced views draw backgrounds and CSS gradients, canvases, images and video frames, and inline SVG
shapes in their resolved colours; they are captured again when the app changes or the theme does.
Robot canvases key their pictures by the robot's resolved gradients too, and rebuild on every theme
or T3 palette change, so a far robot always wears its current colours. Earlier these were page pixels or zoom
values chosen separately, so on a 150 % display they switched at uneven, too-early distances.
Robot canvases switch the moment the zoom crosses their level and resharpen when the camera
settles, instead of waiting for each robot's next draw.

## A campus with linked computers

Measured in the real app with the Ares computer linked (its office with 23 rooms and 312
sessions next to the local one, about 25,700 DOM elements, 12 desks and 31 walking robots), on
an RTX 3080 through ANGLE OpenGL, 150 % scale, at 2560 x 1440 and 1280 x 800 CSS pixels. The
causes of the zoomed-out lag, and what replaced them:

- Camera-driven variables (`--sign-scale`, `--plate-zoom`) were set on the office root, and an
  inherited custom property makes every descendant recalculate its style. Each zoom step
  recalculated about 28,000 elements (70 to 100 ms frames). They are now written on the signs,
  plates and room labels that read them. Never put a value that changes with the camera on a
  root or container: write it on its consumers.
- The Follow T3 check compared T3's answer with the stored palette in a different key order, so
  every 8 s it replayed the theme transition, relighting the office and rebuilding robot canvases.
- Chromium regroups every paint chunk of the page into layers (Layerize, about 5 ms here) on any
  frame where an inline transform changes or a main-thread animation runs. A pan at an unchanged
  zoom therefore moves the keyframes of a held compositor animation of the world transform
  (`presentCamera` in `world/camera-view.ts`); zoom steps, glides and the settled camera keep the
  inline transform. Animations on SVG elements always run on the main thread, so the Working ring
  and T3's spinner turn an HTML wrapper instead. Far out, walking robots present their position
  on ambient beat frames, like their bodies.
- Every remote desk polled its whole thread every 2.5 s; one Ares thread is 30 MB of JSON.
  Watches, status, questions and actions read T3's bounded snapshot (the latest turns), skip
  diffing when the thread's event sequence is unchanged and read finished threads with nothing
  waiting every third beat; only the conversation reads the whole thread
  (`electron/remote-building.cjs`).
- Per-frame paths searched the whole campus (`querySelector` for the live grounds, the open
  chat's desk) and Ultra effects measured every robot with `getBoundingClientRect` on the ticker,
  forcing layout. They now keep references and use one shared IntersectionObserver.

Result in that workload (main-thread busy share, worst frame, long tasks over 50 ms): mouse-wheel
zoom from a desk to the whole campus and back went from 36 to 58 fps with 23 long tasks up to
179 ms to none at 2560 x 1440; the main process went from about 17 to 25 % of a core to about 1 to 11 %.
`scripts/checks/verify-far-view-performance.mjs` guards these behaviours.

### Second pass: a 144 Hz budget

The user's display is 3840 x 2160 at 144 Hz, so a frame has 6.9 ms. Measured the same way at
2560 x 1440 CSS pixels (main-thread BeginMainFrame times from Chromium traces):

- All camera motion moves one held compositor animation (`presentCamera`), zoom included.
  Chromium re-rasterizes an animated layer at the scale it reaches, so a touchpad zoom stays
  sharp without redraw passes; the settled camera returns to the inline transform and is redrawn
  once. A settled zoom matched a directly placed camera except for weather leaves (0.05 % of pixels).
- While you pan or zoom over robots small enough for their canvases, GSAP work (robots, walkers,
  room games) advances on ambient beats at 30 Hz (`perf/budget.ts`); flights and following a
  robot keep every frame. Frames between beats carry only the camera.
- Floating marks (sleepers' Zs, sighs) are compositor animations (`robot/render/float-mark.ts`)
  and are not drawn far out. Releasing a pan prevents Chromium's text-selection pass (235 ms).

Tried and not kept: walking robots on canvases (`RobotCanvas`) looked softer and lighter than
their SVG at the switch distance, and their canvas uploads cost as much as the SVG they replaced;
and the static-art rasters for far offices, which left the cost of a layer update unchanged
(5.6 ms at the whole-campus view), because Chromium already reuses the raster of unchanged rooms
and what remains is regrouping the live actors and rooms whenever something moves.

Remaining: beat frames during a far pan still take about 10 to 12 ms at the 95th percentile, and an
idle whole-campus view keeps about a fifth of a core busy while robots walk (their moves regroup
the campus 15 times a second). Both are dominated by Chromium's layer update over a large page.

## Profiling

Build, then run the isolated camera benchmark. It uses the app's offscreen `LUCID_SHOT` path,
an isolated profile and a fixed fixture world, and never reads or writes your T3 threads.

```sh
npm run build
node scripts/review/render-profile.cjs "$(mktemp -d)"                                  # timings
LUCID_PERF_CHECKS=1 LUCID_PERF_CHECKS_ONLY=1 node scripts/review/render-profile.cjs "$(mktemp -d)"   # native checks
LUCID_PERF_PAN=500 node scripts/review/render-profile.cjs "$(mktemp -d)"               # longer pans
```

Use a new output folder for each run. The harness writes `results.json`, CPU profiles, Chromium
traces and screenshots. More flags are documented at the top of the script.

For a running app, `LUCID_TRACE=<file>` records a five second Chromium trace after eight seconds
and `LUCID_PROFILE=<file>` a four second CPU profile after five seconds (see `electron/main.cjs`).
`scripts/review/make-load-office.py` builds a scratch T3 home with many running sessions for
large-office tests.
