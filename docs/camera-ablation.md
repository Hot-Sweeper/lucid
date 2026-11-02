# Camera rendering investigation

The main reproduced zoom bottleneck was the temporary static outdoor SVG. Hiding that layer removed most of the delay. Hiding screens, robots, rooms, animated trees or weather individually did not. Removing grass/paving patterns did not solve it. Whole-world compositor promotion made the problem worse.

The exact renderer loaded at the start was captured as `index-Bp8mDvs_.js`, including its stylesheet and world metadata. The controlled native workload has six desks, eleven projects, a 2574 by 1456 CSS-pixel viewport and DPR 1.5. It uses real middle-button and wheel input. These are isolated native comparisons with occlusion disabled, not accepted measurements of foreground mouse feel. The live attempt lost visibility and was rejected.

Evidence is under `C:/Users/tim/.t3/lucid-camera-ablation`:

| Experiment | Zoom p95 | Interpretation |
| --- | ---: | --- |
| Original renderer, first matrix | 104.3 ms | Includes a 2055.7 ms frame |
| Hide all outdoor art | 13.9 ms | Large improvement |
| Hide static outdoor presentation | 13.9 ms | Isolates static scenery |
| Hide animated outdoor details | 76.6 ms | Does not solve it |
| Hide only native static SVG | 13.9 ms | Confirms the fallback path |
| Hide only bitmaps | 69.9 ms | Does not solve it |
| Final repeated retained rendering | 14.0 / 13.9 ms | `final-repeat/results.json` |

These runs have different short sample windows, so individual maxima and counts should not be treated as a precise speedup ratio. The original matrix and subsequent traces consistently isolate the static fallback. The final repeated pan p95 was 7.2 / 7.3 ms, with no frames above 33 ms. The repeated zoom samples still contain occasional frames around 100 ms. This is a substantial improvement, not proof of zero lag or a universal display frame rate.

## Rendering change

Static SVG geometry, transforms, colors, strokes, patterns and opacity composition are parsed once into retained Path2D commands. Bounds are measured once for culling. Subsequent camera movement uses small canvas tiles instead of repeatedly rasterizing the full SVG scene or uploading a viewport-sized buffer.

Each tile has a 510-pixel core and one physical pixel of overlap on internal edges, so its allocation stays at most 512 by 512. The overlap prevents compositor seams during fractional zoom. Source density rounds upward and always meets the current camera scale times display density. Covered pans and zoom-outs reuse existing pixels; a small bounded history supports reversals. Wide views anticipate the next density bucket. Near views preserve tighter pixel alignment.

The current and historical tile budget is 40 million physical pixels, except when the current requested viewport alone requires more. History retains at most two views. Per-tile scratch buffers preserve group opacity. Unsupported SVG features retain the original native fallback. The original artwork is preserved.

## Verification and reproduction

`final-art-checks` and `final-mounted-art` contain independent original-SVG comparisons at four scales across park, woodland, building and fractional crops, compound opacity/pattern goldens, density and memory checks, unsupported-feature fallback, and zero geometry reads while drawing. Mounted native checks verify actual tile mapping and resolution, with screenshots at .23, .65, 2 and 5x. `final-stitched-proof` adds overlapping-edge checks and final native screenshots.

The stitched renderer passed 45 native checks. Its final controlled pan p95 was 7.2 ms with no frames above 33 ms; zoom p95 was 14.0 ms, with nine frames above 33 ms and a maximum of 111.5 ms. Native screenshots were inspected after fixing the visible tile seams. The exact same frontend bundle, `index-CJuffJwP.js`, was rebuilt by the complete `npm run verify:update` suite in the private source snapshot `.lucid-update-e78M72`. Runtime syntax, TypeScript, update failure/retry/promotion, scheduler, LOD and viewport regressions all passed. `verified-input.json` records that snapshot and source hashes. Shared dist was not changed by this verification.

`node scripts/capture-live-renderer.cjs <archive>` captures the actual loaded renderer through explicitly enabled localhost CDP 9334. `node scripts/profile-camera-ablation.cjs <output>` performs reversible layer visibility experiments against a running app and rejects hidden or no-input samples. `scripts/camera-ablation-fixture.cjs` reproduces an archived renderer and metadata in an isolated profile; `LUCID_AB_BUILD` selects a staged candidate. `LUCID_AB_CANVAS_CHECKS=1` enables the independent image checks. Timing output explicitly labels controlled native samples.

Runtime GPU status captured after initialization confirms hardware acceleration on the NVIDIA RTX 3080. Early app-ready status alone is not reliable. The actual running asset must be checked separately after delivery; a successful staged build does not establish which renderer the user currently has open.
