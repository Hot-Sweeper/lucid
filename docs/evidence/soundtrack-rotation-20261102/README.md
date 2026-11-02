# Soundtrack rotation

The office previously looped Little Lights. It now rotates nine original local
recordings, with persisted shuffle history, no adjacent repeat across playlist
cycles, local morning/day/evening/night preferences, and quiet song transitions.
The original theme and separate ambience are retained. This revision has no
visual interface changes, so before/after screenshots do not apply.

Accepted checks retained in this directory:

- `native-audio.json`: all nine recordings decoded in real Chromium, produced
  nonzero signal and advanced through actual ended events; only ambience looped.
  The same two media streams were reused. Mute/resume, independent levels and
  teardown passed. Output was muted; this was not a listening test.
- `verification.json`: original soundtrack source and asset hashes, with passing
  `verify:update` and packaged-audio parity from the candidate build.
- The review follow-up reran `npm run verify:update` successfully after adding
  the standalone `verify:soundtrack` package script. It did not repeat playback.

The scoped commit includes the full previously untracked shared sound engine,
its required local recordings, catalogue, shuffle queue, authoring scripts,
audio fixtures and checks. Other owners' staged files are preserved. Only the
standalone `verify:soundtrack` package entry is included in that commit; the
uncommitted shared `verify:update` pipeline remains in the working tree.

Running-build and installed-audio delivery receipts are recorded separately
from the earlier native playback result. Source hash parity establishes the
soundtrack scope, not a claim that unrelated current edits are installed.

Scoped source commit: `58a001582937ea699d065f360f9dfbb09506ed5a`.

Review delivery receipts:

- `review-validation.json`: the required full validation rerun, accepted native
  result identity, and exact candidate soundtrack parity.
- `packaged-audio-proof.json`: SHA-256 equality for all nine committed songs and
  room air, their accepted assets and installed files, plus production-entry
  references to every recording. Runtime working bytes match the accepted and
  build-manifest bytes. Git normalizes `sound.ts` from CRLF to LF; canonical
  committed-source equality is recorded separately.
- `installed-build-manifest.json`: the manifest observed with the packaged audio.
- `running-capture-attempt.json`: the unsuccessful read-only attempt against the
  earlier normal app, which had no CDP connection. It is retained as a failed
  attempt and does not prove execution. No app was launched or restarted.

The existing coordinated delivery owner accepted the source handoff. The normal
app was found running PID 180456, started at 23:17:56 UTC, with the soundtrack
already installed. A read-only check exported its loaded original entry through
DevTools Sources.

- `running-build.json`: the loaded-source export and then-installed entry have
  identical SHA-256
  `105c6cfbc0d3305a7adc453de83fac9432982c8402111de498a41239208e67c5`.
  This is a DevTools UI source export, not a successful CDP helper capture.
- `packaged-audio-proof.json` binds that same entry and installed manifest to all
  nine committed recordings, room air and accepted soundtrack source hashes.
- The raw loaded entry is retained at
  `E:/Lucid-validation/soundtrack-delivery-20261102/loaded-index-BTZvy9tc.js`.
  It stays outside the scoped commit because the bundle also contains other
  owners' changes.
- A subsequent normal update completed at 23:29 UTC while this receipt was being
  recorded. The captured build is now in `dist-previous`; its exact bytes and
  manifest were rechecked there. `latest-installed-audio.json` separately proves
  the same soundtrack source and all ten audio assets remain in the new installed
  entry. No execution-byte claim is made for that subsequent entry.

Developer Tools were closed after inspection. This thread did not launch, reload,
restart, promote, or repeat playback. Unrelated staged and working changes remain
untouched. Review and final settlement remain pending.
