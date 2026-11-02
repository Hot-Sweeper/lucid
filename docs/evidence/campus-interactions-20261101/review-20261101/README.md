# Office interaction review evidence

Status: evidence supplied, review remains unsettled. No application source was changed, no unrelated acceptance suite was rerun, and this review performed no production restart or remote write.

The retained implementation gives empty offices a full-size workstation, preserves the computer-selection intent across environment activation, and uses explicit saved Expand/Collapse controls. The coordinated campus planner subsequently superseded the earlier below-building park arrangement. Its own source and native execution proof are retained separately below; this review does not conflate those builds.

## Captures

- [Before: actual user office report](before-user-office-report.png). Original supplied PNG, unchanged.
- [After: existing empty-office capture](after-existing-empty-office.png). Preserved from the accepted original campus fixture, unchanged.
- [After: coordinated corrected overview](coordinated-after-campus-overview.png). Genuine isolated native capture from the coordinated layout work, not a production screenshot or a reconstruction. Its [source proof](coordinated-source-proof.json) and [native result](coordinated-native-results.json) belong to that later layout build.
- [After: expanded occupied control](after-occupied-expanded-control.png). Captured before the measured occupied collapse/expand cycle.
- [After: collapsed occupied control](after-occupied-collapsed-control.png). Captured after evacuation and collapse completed.
- [Actual Ares conversation opened read-only](after-real-ares-session.png). Genuine authenticated remote session, isolated local shell. This capture also exposes the remaining computer-focus gap.

All image source paths, sizes and SHA256 hashes are in [artifact-sources.json](artifact-sources.json). The images are also submitted as native T3 attachments through prepare-upload, exact-byte POST, and send-attachments.

## Occupied collapse and expansion

The focused native test used the existing production renderer, IPC and World code from the retained frozen candidate `.lucid-update-fjpmiT`. T3 local and remote task data, weather and usage were fixtures, with writes forbidden. The accepted task flow was preserved and instrumented externally, rather than changing production source or rebuilding it.

It began with a physically seated robot, clicked Collapse, waited for the folded state and cleared transition ownership, clicked Expand, and waited for physical reseating. Forty-millisecond samples recorded seated and walking actors across the cycle. Every sample contained at most one actor for the session. The final state had exactly one seated actor, with no held floor, transit actor, trip or exit ownership. This establishes completion and sampled duplicate-free handoffs for this fixture; it is not a claim about every animation frame or every live office.

[Summary](occupied-summary.json), [full samples](occupied-transition.json), [unchanged interaction checks](focused-native-results.json), and [external instrumented fixture](occupied-fixture.cjs).

The [tested build record](tested-build.json) includes the complete source manifest and equal native V8/disk bundle hashes. The frozen candidate's full `npm run verify:update` had passed, as recorded by the coordinated rain refinement review. No extra full acceptance run was needed for this evidence-only turn.

## Actual Ares read-only check

The second isolated app retained the genuine existing T3 Connect Ares inventory and remote adapters. Its local office shell was simulated; its remote project, session, conversation and thread-info reads were not simulated. Remote dispatch and task-send paths were replaced with throwing guards. No remote thread, project, pin, settlement or message was changed.

A real mouse press/release on an occupied Ares monitor opened the expected environment and matching conversation. The independently read remote title matched the displayed session title. [Machine-readable check](actual-ares-read-only.json) records exact scoped identities and [the external fixture](actual-ares-fixture.cjs) records the guards.

[Loaded Ares conversation at the initial focus timeout](actual-ares-loaded-conversation-focus-timeout.png) preserves the later populated history, rather than claiming the initial empty loading frame establishes content rendering.

The computer's focus selection did not remain selected after opening. `computerFocusVerified` is therefore false. Session routing passed; sustained computer/screen focus did not pass. The earlier simulated routing result must not be treated as live proof for that behavior. This gap was sent to the coordinated delivery owner.

A separate MCP read was unavailable because linked-environment tools were disabled on this machine. The successful app check above used Lucid's already authenticated connection and had completed before that tool refusal; no further remote action was taken afterward.

## Commit and coordinated delivery

This is a scoped evidence-only commit. It records existing product source through complete tested manifests, without bundling other agents' uncommitted source changes. Product integration remains with the coordinated delivery owner:
<t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/3b0a491b-9351-4af6-a9af-7ec07e045efe>.

A read-only capture of the reopened production page at 19:32:29 UTC obtained its executing V8 entry hash. [Production executing entry](production-executing-entry.json) records index-CY9w-VI3.js and SHA256 b618b20f6545627aec4246dd017169f2e0aaa0236635b1075810194c8dd351f8. That asset no longer existed in the current dist, so it could not be matched to the [observed installed manifest](production-observed-manifest.json). This is an explicit provenance gap, not matching live delivery proof. The isolated tested build match above does not close it. No competing restart or promotion was attempted to manufacture a match.

The review must remain unsettled until sustained Ares computer focus and the coordinated matching executing-build receipt are supplied.

[Attachment ingestion](attachment-ingestion.json) confirms the received supported attachments match the exact source bytes.
