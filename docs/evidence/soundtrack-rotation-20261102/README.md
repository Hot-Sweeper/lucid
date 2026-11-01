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
