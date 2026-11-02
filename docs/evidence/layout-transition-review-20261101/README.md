# Crowded layout transition review

Review status: unsettled, awaiting review. The captures are from the accepted isolated native Electron fixtures. Coordinated production inclusion is separately established by the delivery receipt and executing-entry proof below.

The layout readiness rule now requires each affected actor to clear both the old and proposed rooms. Assigned hallway spots guide evacuation but no longer gate promotion. The existing trip and geometry revision mechanism stops old waypoints and resumes the same journey against the promoted floor. Artwork, sounds, camera behavior and user state are unchanged.

The fixture uses 12 actual roster-backed production Walker actors, World.update, travel, hallway routing, source ownership and destination handoffs. It starts actors near the source office doorway as a controlled initial condition, then runs real-time movement. The input is synthetic T3 data; no real T3 action is submitted. One robot is held inside the old room for 5.5 seconds, then held again on safe floor short of its assigned spot. The first hold must prevent promotion; the second must not. The second gate is explicitly released to allow its pending test promise to finish and the real journey to resume. All 12 must reach the break room or park with exactly one physical actor each.

Shrinking coverage reduces building width and project-office height while retaining the entrance hall height. Height-changing coverage reduces the entrance hall from 2180 to 800 world pixels and requires evacuation beyond both building footprints. Frame samples cover actor positions, IDs, physical counts, layout revisions and room geometry. The analyzer rejects duplicate or missing actors, transit jumps beyond the 240 px/s bound plus 3 px sampling tolerance, entry into unrelated rooms, unsafe promotion, or unfinished hallway journeys. This is a targeted route and promotion check, not a battery or GPU performance measurement.

The before comparison is a reconstruction made from the same current source, restoring only the previous exact-arrival readiness expression through a Vite transform. It is genuine native footage captured during this review, not historical footage. The restored rule stays held at the safe checkpoint and later completes after the test releases that robot to its exact spot. It reproduces the cause of the unnecessary hallway barrier. The original user screenshot is also retained separately with unknown build provenance.

The initial apparent non-completion in the new fixture was a harness defect: rerouting replaced its single release callback, leaving an obsolete test promise pending. A shared gate fixes this. Completion is now judged by production transit and exit ownership plus actual destination actor counts, rather than by one original travel promise. No independent permanent deadlock was reproduced after that correction. The legacy render-hallway-checks fixture also calls walkLegs directly and expects a held rendezvous line; it is not evidence that full production travel and promotion complete. The new fixture exercises the complete trip.

`results.json` retains summaries, loaded and executing entry hashes, exact source hashes, build manifest hashes, capture hashes and raw-evidence locations. The loaded JavaScript was obtained with Electron Debugger.getScriptSource and compared with the tested bundle bytes. Raw per-frame results and profiles are retained outside the checkout at E:/Lucid-validation/layout-20261101/.

Reproduce:

```powershell
node scripts/build-layout-transition-control.cjs E:/Lucid-validation/layout-control
# Build the corrected renderer into a separate output directory with Vite.
node scripts/verify-layout-transition-native.cjs <output> <corrected-dist> shrink
node scripts/analyze-layout-transition.cjs <output>
node scripts/verify-layout-transition-native.cjs <output> <corrected-dist> height
node scripts/analyze-layout-transition.cjs <output>
$env:LUCID_LAYOUT_CONTROL='1'
node scripts/verify-layout-transition-native.cjs <output> E:/Lucid-validation/layout-control/dist shrink
node scripts/analyze-layout-transition.cjs <output> --control
```

The evidence report links the exact captures. The scoped change was included through coordinated delivery. This evidence follow-up performs no production restart or updater promotion.

The coordinated owner recorded [initial installed and executing proof](coordinated-delivery.json), with the exact tested `world.ts` and `room-policy.ts` source hashes, the installed build manifest and matching V8 entry bytes. A subsequent normal-profile freeze was traced to orchestrator reply parsing. The [corrective delivery receipt](coordinated-delivery-parser-fix.json) preserves that initial record and adds the repaired build's manifest, executing-byte proof and responsive normal-profile observations. Both exact layout source hashes remain included. The layout review remains unsettled, and these receipts do not claim that all rendering-performance work is complete.

Captures:

- [User-reported before](user-reported-before.png), build provenance unknown.
- [Before: newly captured reconstruction of the old rule, still held](before-held.png).
- [Corrected shrinking layout, released short of rendezvous](after-shrink-release.png).
- [Corrected robots at their destinations](after-destinations.png).
- [Corrected height-changing layout release](after-height-release.png).

Checks: `node scripts/verify-room-policy.mjs`, the reconstructed native comparison and both corrected native geometry cases, the per-frame analyzer, and `npm run verify:update`. The full update verification log is retained in the evidence directory. No live T3 integration, native audio listening, battery or VRAM measurement is claimed.

The current delivery statement is supported by [coordinated-delivery-culling.json](coordinated-delivery-culling.json), [executing-entry-culling.json](executing-entry-culling.json) and [delivered-build-culling.json](delivered-build-culling.json). The receipt records installed and executing entry `index-PMYb-Ujd.js`. Its V8 source and installed bundle both hash to `d20e58b975a2e3871c55e3a54d5c1ddc3fa175da373b4bf0e4370fb85fd18b27`; the retained manifest includes both exact accepted layout source hashes. This replaces the earlier pending-delivery statement without extending the accepted test claims.

All four existing captures were uploaded through `t3_attachment_prepare_upload`, exact-byte HTTP upload and `t3_thread_send_attachments`. The message labels `before-held.png` as a newly captured reconstruction. [attachment-ingestion.json](attachment-ingestion.json) confirms all four in actual T3 report facts, unchanged image hashes and the production submission collector's image list (one Before and three After). The collector check used a separate evidence directory. The current run is still active, so persistence into the next submission archive occurs through normal submission after completion; no archived submission was edited. Accepted tests and screenshots are preserved. No repeat native run, build or restart was performed.
