# Thread startup activity review

Status: implementation and checks complete, unsettled pending review.

The Director now retains the initial item snapshot until authoritative metadata arrives. It replays only the run identified by metadata with status running. Completed turns remain available to conversation history. Reset discards any pending startup snapshot.

## Native evidence

Both runs used isolated Electron profiles, production Desk, Director, WM and seated robot components, and synthetic T3 adapters. Each process had a 60 second deadline and exited after checking. No real tasks, approvals, or production state were changed. Metadata was withheld for 1800 ms after each initial snapshot. Completed, cancelled, failed and no-run metadata were then delivered, with another 1200 ms observation. This tests the startup presentation boundary directly; the fixture world sidebar stays configured as running and is not a claim about inactive thread list labels. The running turn is a real running-status event stream in this fixture, not a live provider task.

Baseline: newly captured reconstruction of pre-fix behavior, not historical screenshots. The baseline build plugin removes the metadata gate and restores latest-historical-run selection. Separate profiles can generate different robot cosmetics and note apps. Failed exploratory captures were superseded by the passing result.json files.

- [Before: historical notes replay during metadata delay](baseline/before-new-baseline-delayed.png)
- [Before: subsequent lock screen](baseline/before-new-baseline-inactive.png)
- [After: delayed metadata, no historical work](after/after-delayed.png)
- [After: inactive thread](after/after-inactive.png)
- [After: current turn typing](after/after-current.png)

The passing baseline registered old-work key activity in all four cases. The fixed run registered zero keys, no old note text, and no old item left in its queue in every inactive case. Current typing advanced from 24 to 55 key events over one second, with increasing note text. The old turn was excluded. Screenshots were visually inspected.

## Checks and delivery

- `node scripts/verify-startup-activity.mjs` passed: delayed metadata, completed/cancelled/failed/queued/no-run snapshots, active run selection and fresh events.
- `npm run verify:update` passed, including typechecking, updater recovery checks and production build. See verify-update.log. It was rerun after a concurrent unrelated outside.ts edit, followed by the final native run.
- Baseline native run: 9 assertions passed. Final native run: 10 assertions passed. See the respective result.json files.
- tested-source-delivery.json records the exact full shared working-tree source hashes and installed build hashes. Native V8 executing source matched the installed entry bytes. These are the tested source snapshot, including pre-existing shared edits, not a claim that the scoped commit alone represents the whole build.
- The successful production launch was preserved, with no restart or reload. A read-only attempt to inspect its executing source failed because port 9334 was unavailable. production-delivery.json records that failure. Installed/tested/native-fixture bytes match; executing bytes in the already-running production process remain unattested.

The commit stages only the startup fix in director.ts plus its new focused checks, baseline builder, native fixture and evidence. Other existing changes in director.ts and the shared checkout are preserved outside this commit.

## Attachment correction

The three existing PNGs were uploaded through the supported prepare-upload, exact-byte HTTP POST (all HTTP 204), and send-attachments flow. The Before filename and message retain the newly captured reconstructed-baseline label. [attachment-ingestion.json](attachment-ingestion.json) confirms the actual T3 reportFacts attachment input, SHA-256 equality with the originals, and the unchanged production submission collector's image list: one Before and two After entries. The collector ran in a separate evidence directory. The current run is active, so this verifies ingestion and collection, not persistence of a future archive. No production report archive was edited.

Accepted checks and captures remain unchanged. No test, native capture, build or production restart was repeated. Status remains pending dependency and unsettled until coordinated delivery supplies matching production execution proof.
