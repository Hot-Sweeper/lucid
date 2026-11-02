# Tool operations without an app of their own (T3 attachment discard)

Before: `before-reported-t3-attachment-discard.png`, the supplied screenshot. A wrench icon, the title "T3 Code",
the raw tool name and `attachmentId`, and a looping bar that implied progress.

After: the same operation through the production `Director`, `WM`, `ToolApp` and styles, captured natively
by `node scripts/capture-tool-view-native.cjs <dir>` (2x zoom of the 820x461 robot screen, Electron, stable and Nightly builds).
`capture-results.json` holds the 29 in-renderer checks and the hashes below.

| Capture | State |
| --- | --- |
| discard-running.png | the exact reported call, still running: turning arc, no progress bar, no invented file |
| discard-done.png | the same item after it completed |
| discard-failed.png | failed result: the tool's own message, window grown to hold it |
| discard-with-file.png | a discard whose upload an earlier prepare call described: real name, type, size |
| prepare-running.png, prepare-done.png | prepare upload named from its own arguments |
| narrow-long-name.png | 232 px wide window, very long file name clamped to two lines |
| discard-running-nightly.png | Nightly title and icon |
| generic-running.png, generic-done.png | another MCP tool: Lucid fallback, secret-looking value hidden |

## Fixture boundaries (honest limits)

- Items are fixtures shaped like T3 Code events. Nothing was sent to T3 Code, no thread or attachment was touched.
- The identifier is a made-up `pending-` UUID matching the visible prefix of the reported one.
- The result shapes (`{content:[{text}]}`, `structuredContent.attachmentId`, `isError`) follow the MCP convention and the
  tool schemas in this session. A live `t3_attachment_prepare_upload` result was not inspected, so the matching of a
  discard to its earlier upload relies on the result carrying `attachmentId`. Without it the view honestly shows "Unsent upload".
- Windows renders in the Electron fixture, not the packaged app. No audio, battery or FPS measurement was made.
  Routine tool operations intentionally add no sound; the robot's existing cursor movement is the only physical event.
- The faint square in the middle of the desktop in the captures belongs to the fixture desktop, not this change.

## SHA-256
    5950169686164d808f086a388b0d8403dce7c4b023158f6a94a7175bd7242a53  before-reported-t3-attachment-discard.png
    50dd54ab55577b5df743d43943640e6ccbf524f2e11f140ed1bb79a02670b4e4  discard-done.png
    674a475ec0525972717b709df272c513d73235ecafa19020b3b344814d95bc78  discard-failed.png
    5ce6565a9d736c6736ea5b8c063286cbceddacbc862e78fe566625b95077dbcb  discard-running-nightly.png
    f073f08b2f859b6278d6011190cfded0b784f6c2b3a34073b4e8542cb833ac6c  discard-running.png
    aa9b6f4375acb62faa165482f456ea170cca6d2661216ab3b9da671341df395a  discard-with-file.png
    6c02bc7f1e9b60cd974cadaa4d3dd9fc0d514b7b806c74c81a7f639a04f89710  generic-done.png
    3ebaa86fce10d852f9dd543c5cdc42743555fef97d5af2bcfeec7f0a9c886c36  generic-running.png
    992edac61c1b8490f2c085b2eae765cdcb69fb16f7506e2f5ae99b3d460d16fb  narrow-long-name.png
    bb5102c9c3ed2af5b91664068128f600bed6967765385953209eb7cb14d44bb1  prepare-done.png
    dde50c632949bd33307cdd5b0224ba71680eb82abbdc7589279933d2e4954799  prepare-running.png
