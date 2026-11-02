# Performance and freeze reconciliation, 2026-11-01

Review status: **unsettled**. The accepted four images are retained unchanged.
This reconciliation reuses existing checks and the stabilization owner's delivered
build evidence. It performs no profiling, build, source freeze, promotion or restart.

The current stabilization owner is
<t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/3b0a491b-9351-4af6-a9af-7ec07e045efe>.
Its active work supersedes the older mobile delivery plan in the responsiveness
follow-up. This document records the evidence available at reconciliation time;
it does not take over that work or ask for a second acceptance run.

## Resolved within the stated checks

| Requirement | Change and actual evidence | Status and limit |
| --- | --- | --- |
| Botify logo | One shared clean vector replaces the antenna mark in the app header, sidebar and dock. Both accepted archived production app captures passed eight native checks, including executing bundle byte equality. | Visual change accepted for the archived comparison. Both exact product file hashes are included in the parser-fixed delivered manifest. No new screenshot run is needed. |
| Blurry screen snapshots and inconsistent density | Screen snapshot density follows logical monitor size and display DPR. Existing zoom and DPR sweeps and original native captures remain retained. Later rendering work preserves source artwork and density. | Earlier sharpness fix verified within those sweeps. This does not accept every subsequent rendering path or close the remaining seam cases. |
| Blank office while reports or watches stall | World and controls initialize without awaiting report processing or watch acknowledgement. The blocked native test draws six rooms, controls and the thread list, continues world refreshes, and recovers without renderer errors. | Reproduced startup dependency fixed. Evidence: `E:/Lucid-validation/stability-20261101/startup-final/startup.json`. This is not an end-to-end startup-time benchmark. |
| Deterministic hard renderer freeze | `Delegate.parseReply` no longer revisits the opening brace at offset zero forever for unrelated or malformed JSON. Original parser workers hang in four cases until the 500 ms deadline; all corresponding fixed cases terminate. Actual saved-state inspection found the triggering retry and unrelated replies. | Specific infinite loop fixed and delivered. See [freeze diagnosis](../renderer-freeze-20261101.md). This does not prove every possible freeze is eliminated. |
| Update and launch reliability | Normal launch opens the installed build without rebuilding unfinished source. Explicit updates validate and build a private snapshot, yield during copying, serialize updates, preserve the previous build on failure, and flush accepted settings/roster saves before exit. | Existing focused regressions and the corrective snapshot's full `npm run verify:update` passed, including interruption/retry. No duplicate verification or new build was run for this document. |
| Artwork loading after camera changes or visibility changes | Obsolete consumers and stale jobs release ownership; showing the window resumes unfinished work. New scratch raster work waits for camera quiet; ready artwork and native fallback remain available. | Lifecycle and fidelity checks reused from stabilization. Faster variants that failed fidelity or timing were rejected. This is not zero-hitch performance acceptance. |
| Simulated computer activity while a robot is away | Physical chair/visibility gating pauses typing, cursor and window movement, while real work and approval IPC continue. | Existing 24-assertion native presence run passed, including real 65-second absence and 2300 ms mid-drag departure. Exact tested WM hash is included in the corrective delivery proof. |

## Current delivered-build proof

The older `index-COgrAjl-.js` receipt proves an earlier installation, but that
build subsequently froze. It is historical evidence, not the current recovery
result. The corrective delivery chain preserves both records:

- [Corrective delivery chain](../layout-transition-review-20261101/coordinated-delivery-parser-fix.json).
- [Executing entry proof](../layout-transition-review-20261101/executing-entry-parser-fix.json).
- [Validated installed manifest](../layout-transition-review-20261101/delivered-build-parser-fix.json).
- Normal-profile health observations: `E:/Lucid-validation/stability-20261101/freeze-fixed-delivery/responsiveness.json`.

The corrective candidate is `.lucid-update-RdewP1`. Its full update verification
passed before promotion. V8's executing source for `index-BtWwktEL.js` hashes to
`726d56016a305bde1df44feab4aa3289a641fb8c8922b9d7d481044f51a70c05`,
equal to the installed entry. The manifest SHA256 is
`5ed7ac344973ee41d8cbbc1e78dfd060314e2272d51b18b52f47c7a529630f50`.
The proof includes the corrected parser, both Botify files and the exact tested
presence WM. [Reconciliation metadata](reconciliation.json) records the checked
hashes and original evidence paths.

The owner observed the normal profile for 61.883 seconds with 60 responsive
queries, continuing animation, `document.hidden=false`, and zero captured
renderer errors. The retained callback intervals have p95 27.8 ms and maximum
104.2 ms. These are health observations in that scene, not a pan/zoom benchmark,
human input latency or physical-display FPS. They establish observed recovery
from the specific hard freeze, not completion of the smoothness goal.

## Still open before whole-thread settlement

1. **Consistently smooth movement and zoom.** The latest stabilization owner is
   still assessing movement/rendering. Existing rapid-wheel tests show substantial
   callback and input-backlog spikes. Earlier controlled before/after improvements
   remain valid only for their recorded snapshots and workloads. They cannot be
   transferred to the corrective delivered build as fresh performance acceptance.
   The user subsequently reported continued lag/glitching and asked whether rain
   and particles contribute. The existing owner is measuring that view with weather
   visible, temporarily hidden and restored. There is no result or causal conclusion
   from that comparison in this reconciliation, and no duplicate run is requested.
2. **Remaining visual glitches.** Phase-sensitive outdoor PNG seams remain recorded.
   Current retained fidelity results include small differences also present in
   same-source continuous controls. Broad mean-error passes do not establish zero
   visible seams or accept arbitrary pixel-density reductions.
3. **Longer normal-use reliability and the original dictation freeze.** The parser
   fix closes one reproduced cause. The isolated synthetic-microphone/real CPU
   model fixture passed after batching capture and deferring model load, but did
   not reproduce the original complete-app freeze. No combined normal-profile
   recording acceptance is substituted here.
4. **Resource targets.** The earlier responsiveness comparison did not establish
   sustained total CPU savings, a memory ceiling, VRAM savings or battery savings.
   Its finite repeated workload exceeded 2.2 GiB private committed memory. These
   are historical measurements with documented hardware and instrumentation,
   not measurements of the corrective delivery. See the existing
   [responsiveness follow-up](../responsiveness-followup-20261101/review.md).
5. **Whole-project audit gaps.** The prompt audit remains a retained-history ledger,
   not proof that every feature is finished. Remote manager write acceptance and
   other feature-specific reviews remain with their existing owners. They must
   not be silently marked complete by this rendering evidence package. The
   October 31 audit's then-pending presence and delivery findings are superseded
   only to the extent supported above.
6. **Review and user acceptance.** The latest user report still describes lag and
   glitches. No whole-thread settlement is requested by this reconciliation. Keep
   it unsettled until the existing owner reports remaining acceptance and this
   review is completed.

## Retained before and after images

- Botify: [before](before-Botify-archived-monitor.png), [after](after-Botify-archived-monitor.png).
  These are real captures of archived production builds opened during the prior
  review, not original live-before images or a new screenshot of the current app.
- Screen sharpness: [before](before-zoom-snapshot-20261031.png), [after](after-zoom-snapshot-20261031.png).
  These are the original unmodified native captures from October 31, with differing
  activity and content. They are contextual visual evidence, not a matched pixel test.

All four retain their accepted hashes and attachment resolution checks. This
documentation-only reconciliation changes no visual or application behavior.
