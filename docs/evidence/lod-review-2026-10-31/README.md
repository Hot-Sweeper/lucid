# LOD native review evidence (2026-10-31)

Status: unsettled, awaiting review and coordinated final delivery.

The universal window renderer now adds the real app icon to the text-free shapes view. Icons are larger at both text-free levels. The farthest view contains the app surface color and icon, with no title bar. Existing apps and future WM apps inherit the same code path.

The isolated production build loaded `index-CpXzjJTd.js`, built at `2026-10-31T15:27:13.335Z`. The genuine baseline was the archived previously loaded `index-Bp8mDvs_.js`. See `tested-build.json` and `verification.json` for source hashes. Live Lucid was not restarted or reloaded.

The native Electron test loaded the production UI, recorded office metadata and actual Files, Tasks and Botify app implementations. Review content was supplied through their existing app APIs. Settings were isolated. Camera scale changed through the real world camera. Native screenshots were cropped to the actual monitor rectangle through CDP. No screenshot UI was reconstructed. App window position/size has ordinary random variation between versions, so these are representative comparisons, not pixel-exact pairs.

For all three apps, the native run verified full, shapes, icon, then restored full detail. Original app body and first-child DOM identity survived, and checked Files/Tasks content survived. Music DOM survived; playback text was intentionally not asserted constant because playback advances. All recorded samples were visible and reported no renderer errors. This run did not exercise physical wheel input. A separate follow-up is prepared for wheel reversal and an actual animated Snake app.

These three scenes had zero scheduled app loops. Their results establish visual behavior and state continuity, not a measured canvas-loop or FPS improvement. No FPS or p95 result is claimed.

## Paired captures

| Real app | Shapes before | Shapes after | Color and icon before | Color and icon after |
| --- | --- | --- | --- | --- |
| Files | [Before](before-files-shapes.png) | [After](after-files-shapes.png) | [Before](before-files-icon.png) | [After](after-files-icon.png) |
| Tasks | [Before](before-tasks-shapes.png) | [After](after-tasks-shapes.png) | [Before](before-tasks-icon.png) | [After](after-tasks-icon.png) |
| Botify | [Before](before-music-shapes.png) | [After](after-music-shapes.png) | [Before](before-music-icon.png) | [After](after-music-icon.png) |

All 12 paired screenshots were uploaded and attached to the source thread, so they are available to its report evidence collector. The 24 original full/shapes/icon/restored captures, native runner and test scripts are also retained at `C:/Users/tim/.t3/lucid-lod-review-20261031/`.

CPU checks: TypeScript, symmetric tier cutoffs and wheel-multiplier round trips, controller cache/invalidation tests and screen scheduler tests pass. Native GPU slot was explicitly released after the isolated process exited.
## Full detail restored

[Files](after-files-restored.png), [Tasks](after-tasks-restored.png), and [Botify](after-music-restored.png) after returning from the farthest tier. These three additional genuine captures are attached to the source thread too. `attachment-verification.json` confirms that all 15 LOD review images resolve through the report evidence collector.

## Completed runtime work and input follow-up

The explicitly granted follow-up loaded the same isolated `index-CpXzjJTd.js` production renderer and launched its real Snake implementation through IdleLife. A temporary counter wrapped `CanvasRenderingContext2D.clearRect`, scoped to the original game canvas inside the app body; it excluded LOD snapshot canvases. Four 2-second windows recorded 60 draw clears in full detail, zero in shapes, zero in icon view, and 61 after restoring full detail. The scheduler retained one loop throughout, active only at full detail. The original game canvas remained mounted throughout. All samples were visible, with no visibility-loss event or renderer error. The counter was removed, and the isolated process exited before explicitly releasing the GPU slot.

Trusted CDP `mouseWheel` events exercised the actual window's wheel handler: scale 1.12/full -> 0.9355026367806247/lines -> 1.12/full, and 0.61/shapes -> 0.5095148289608759/icon -> 0.6099999999999999/shapes. Both inverse steps restored the original tier and camera scale within floating point precision. This uses real renderer input events, not a human-operated physical wheel.

See [runtime-work.json](runtime-work.json). These results demonstrate suppressed per-app drawing work, not total-frame speed or p95 improvement. Snapshot construction, layout, scenery and other app activity are outside this narrowly scoped counter. The first static-app capture set did not itself measure continuous app work; this follow-up supplies that missing evidence. The earlier pending statements in this document describe the first capture run; the follow-up checks are now passed. Live Lucid remains untouched by this verification. Status remains unsettled pending review and combined delivery.
