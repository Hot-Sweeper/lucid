# Collapse and Expand native review

Status: unsettled, awaiting review and coordinated production delivery proof.

Explicit collapse bypasses the automatic 20-second placement stability delay. Working robots start leaving immediately. Existing safe floor promotion still waits until actors clear the changing room, and expansion brings the same robot physically back to its reserved desk. The scoped commit records the collapse state field and urgency change, a focused regression check, the native harness and evidence. Other pre-existing shared-checkout office features remain outside this commit. This is a scoped layered change, not a claim that this commit alone contains the complete tested shared checkout.

The isolated native Electron run used actual mouseDown/mouseUp input on the production Collapse and Expand buttons, production World and Walker components, a separate profile and retained renderer bytes. It covered one occupied local project office and one embedded connected-device office using synthetic T3 adapters. External mutations were blocked. It does not establish live authenticated remote integration, audio quality or performance savings. The run completed within its 180-second deadline and closed its own app. No production restart or promotion occurred.

All 12 native checks passed: prompt departure, collapsed control state, safe room promotion after the actor clears the old office, physical return with one seated actor, identity and seat preservation, and no duplicate walkers in both scopes. A post-run check also counted simultaneous seated/walking ownership across all 1,450 samples: no duplicates. Both scopes finished with zero transit actors, zero pending exits and no held layout.

Early runs exposed fixture errors: an unrelated actor was included in a broad count; the periodic inventory removed a manually inserted remote building; a replacement adapter omitted watch helpers. Those runs remain under E:/Lucid-validation/fold-20261101 for audit and are not accepted evidence. The final run uses persistent synthetic connection inventory and isolated watch adapters. No product workaround was added for these harness errors.

Checks run: node scripts/verify-room-fold.mjs, node scripts/verify-room-policy.mjs and node scripts/verify-room-fold-native.cjs E:/Lucid-validation/fold-20261101/native-complete E:/Lucid-validation/fold-20261101/dist. The previous passing npm run verify:update is reused as requested. Later concurrent campus atmosphere edits are outside this acceptance; the tested placement method is unchanged. No broad rerun was performed.

[tested-build.json](tested-build.json) retains the complete tested renderer source manifest. [source-proof.json](source-proof.json) records exact source and manifest hashes. [native-result.json](native-result.json) retains checks, promotion coordinates, trace summary, capture hashes and executing bundle proof. Raw samples remain at E:/Lucid-validation/fold-20261101/native-complete/result.json with their hash in the summary. The executing V8 entry matched retained bundle index-DRmlFmxo.js, SHA256 6675ecf332c9646382d8db5b05b9a9be6a63054cc5bef7df23402c2eda55ce5a.

Coordinated normal-profile running-build proof remains pending. The one-shot read-only capture failed because the expected existing CDP endpoint at port 9334 was unavailable. [production-attestation-attempt.json](production-attestation-attempt.json) records that failure. The isolated executing-byte proof is not substituted for production delivery. A future coordinated receipt must establish the accepted collapse method is included in the installed manifest and executing normal-profile entry without assuming the current dist is loaded.

The original before image is the unchanged actual user attachment, not a reconstruction. Historical build provenance is unknown. Original and four corrected control-state captures were uploaded using t3_attachment_prepare_upload, exact-byte HTTP POST and t3_thread_send_attachments. [attachment-receipt.json](attachment-receipt.json) retains the successful message receipt.

Captures:

- [Original user before](user-original-before.png).
- [Local occupied](local-01-occupied.png), [departure](local-02-departing.png), [collapsed with Expand](local-03-collapsed.png), [returned with Collapse](local-04-returned.png).
- [Connected occupied](connected-01-occupied.png), [departure](connected-02-departing.png), [collapsed with Expand](connected-03-collapsed.png), [returned with Collapse](connected-04-returned.png).
