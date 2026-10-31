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
