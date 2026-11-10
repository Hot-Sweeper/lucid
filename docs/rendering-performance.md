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
from 190 px, the app icon below that (where robots also switch to their canvas), and below 70 px
the dock row is skipped and background motion slows. Earlier these were page pixels or zoom
values chosen separately, so on a 150 % display they switched at uneven, too-early distances.
Robot canvases switch the moment the zoom crosses their level and resharpen when the camera
settles, instead of waiting for each robot's next draw.

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
