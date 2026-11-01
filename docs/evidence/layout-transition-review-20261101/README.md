# Crowded layout transition review

Review status: unsettled, awaiting review. These are isolated native Electron fixtures, not a claim that the live installation has loaded the fix.

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

The evidence report links the exact captures. The scoped change is handed to the existing coordinated delivery owner; this review starts no production restart or updater promotion. A later delivery receipt must distinguish installed manifest inclusion from executing production bytes.

Captures:

- [User-reported before](user-reported-before.png), build provenance unknown.
- [Reconstructed old rule, still held](before-held.png).
- [Corrected shrinking layout, released short of rendezvous](after-shrink-release.png).
- [Corrected robots at their destinations](after-destinations.png).
- [Corrected height-changing layout release](after-height-release.png).

Checks: `node scripts/verify-room-policy.mjs`, the reconstructed native comparison and both corrected native geometry cases, the per-frame analyzer, and `npm run verify:update`. The full update verification log is retained in the evidence directory. No live T3 integration, native audio listening, battery or VRAM measurement is claimed.
