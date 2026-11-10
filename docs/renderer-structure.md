# Renderer structure

How the office keeps its SVG element count and animation ownership bounded while preserving visible screen contents, robot artwork, animation cadence and vector sharpness.

## Empty desk characters

An empty reserve desk previously constructed a complete animated seated robot, including its SVG, overlaid thumb, GSAP ticker, breathing/glow loops and recurring idle timers. CSS then hid that character. Every free slot in every project kept this animation machinery.

`DeferredRobot` is now the computer's stable robot reference. A free desk contains its existing empty-chair artwork but no seated character rig. Assignment constructs the real rig synchronously before applying its brand, model and customization. Unassignment destroys it; reassignment creates exactly one new rig while WM and Director keep their original reference. Mouse, typing, phone-thumb, headphones and music operations all forward to the current rig.

Destroying a reusable rig also cancels its complete phone/coffee timeline. Interrupted animation promises settle, and disposed rigs check their lifecycle before continuing after an asynchronous wait. This prevents an old character's prop callbacks from changing a desk after reassignment.

## Floor geometry

Default wood floors previously retained one rectangle per plank joint, and cafe floors retained one rectangle per tile. Floors now reference shared native SVG definitions containing their original rect geometry. Matching room sizes and colors reuse one retained source. Room signs, windows, clocks, plants and their existing updates remain separate and unchanged. Break and question-room plank floors use the same reference mechanism. Each room releases its owned source references when removed or rebuilt.

An initial two-path batching candidate was rejected by native pixel comparisons: mathematically identical rect corners received different native path antialiasing. SVG image resources also introduced edge differences at fractional density, even without internal tiling, and were rejected. Native SVG instances matched the original artwork exactly in the coordinator's twenty reference comparisons. No image cache or alternate rounded-corner path is used for these floors.

## Shared desk and rig geometry

Identical keyboard bases, table surfaces, empty chairs and static parts of the seated hands, elbows and backrests now use native SVG instances. Their original shapes are retained once in a reference-counted zero-size definition library. Instance styles inherit each robot's actual palette. The last owning desk or character releases its definitions. There is no intermediate image resampling or alternate rounded-corner tessellation in those instances.

Keyboard geometry and key centers remain the original coordinates. Only actually pressed keys materialize an animated rect overlay; repeated presses reuse it, and assignment/reset/destroy cancels overlays. Mouse, mug, steam, phone and all other live controls remain separate. Front and back head surfaces switch display at the existing actual facing flip, so the wholly occluded surface is not needlessly painted.

## Rig writes

The seated animation loop now checks each rounded SVG attribute before writing it. Constant ears, logos, invisible thumbs, hand shadows and unchanged geometry no longer generate redundant attribute mutations. It reads actual SVG attributes rather than keeping a potentially stale memo, so GSAP and customization writes are respected.

Seated and walking antenna pulses animate their original sine curve on scalar state. Their actual SVG opacity is presented with the same actor frame as their body. Previously these infinite direct SVG tweens kept invalidating both visible and offscreen robot artwork every GSAP tick, bypassing the existing actor presentation budget. Near actors retain the existing 60 Hz presentation and distant actors retain their existing body cadence; movement and pulse clocks keep running.

## Viewport and DPR static presentation

`static-art.ts` separates contiguous immutable SVG paint runs from live bindings without changing their order. It expands shared vector references and referenced gradient/pattern definitions into a self-contained original SVG source, then caches only the current viewport crop plus 256 CSS pixels of overscan. Source pixel density is camera scale times device pixel ratio. PNG storage is lossless; matching desk artwork and crops share decoded assets.

Original vector nodes remain owned in a detached fragment. A zoom or an uncovered viewport restores those exact native nodes before the next paint, instead of stretching an old bitmap into a blurry fallback. A new sharp crop replaces them atomically after SVG decode, rasterization, PNG encoding and PNG decode complete. Existing covered crops can move with the camera without repeated SVG writes. Prefetch begins before a pan reaches a crop's edge.

Clocks, window skies/stars/frost/clouds, animated plants, project names/icons, keyboard controls, mouse, mug, steam, phone, actors and screens remain native. Every SVG node with a data binding is treated as live, including the break-room games' private binding namespaces. Theme/layout rebuilds dispose the old runs; inherited variables used by static sources are checked during daylight invalidation.

Jobs are serialized and shared by source/crop/density, stale asynchronous results cannot install, failed decoding uses a five-second backoff while original vectors stay visible, and offscreen surfaces release their active bitmap reference. Unused decoded assets use a 64 MB LRU target; assets currently displayed are retained until replaced or offscreen. Destroying the owning desk/room restores native nodes and releases its images.

## Checks

- `node scripts/checks/verify-deferred-robot.mjs`: covers empty construction/reset, idempotent mounting, look/model/phone forwarding, one release and clean reassignment.
- `node scripts/checks/verify-shared-vectors.mjs`: covers exact geometry reuse, two-rig ownership, idempotent release, re-creation and cleanup of the definition library.
- `scripts/review/render-floor-checks.cjs` exports `async ({ js, out })` for the root's isolated Electron run. It checks actual desk assignment/release during a phone animation and pressed-key identity/reset, then compares original rect artwork with the shared vector references at four densities. It also compares actual shared robot geometry and inherited colors with an equivalent inline clone. It saves `lazy-robot-checks.json`, `shared-vector-palette-checks.json` and `floor-pixel-checks.json`.
- `scripts/review/render-static-art-checks.cjs` checks actual cached pixels against their original self-contained SVG source at 2x and 3.932x camera zoom, viewport/DPR bounds, retained live controls, native fallback during density changes, and decode-failure backoff. It saves screenshots and `static-art-checks.json`.

