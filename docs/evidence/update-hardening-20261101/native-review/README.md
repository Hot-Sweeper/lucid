# Native updater feedback review

The isolated Electron fixture passed 12 assertions. It uses the actual updater, command runner, TypeScript compiler, update-handler source, menus and styles. It has its own installation directory and profile. The content panel is explicitly a review fixture, not the production office.

Native mouse input triggered real failed validation. The corrected popup shows its entire recovery message and focuses Copy error details. Its copy action transferred the complete diagnostic to the real clipboard, with Windows line-ending normalization only. The clipboard contents were restored. The hidden offscreen renderer used focus emulation for the Clipboard API; no production window was focused or inspected.

After failure, every installed file remained byte identical and native clicks and text input still worked. Correcting the fixture's TypeScript error allowed one successful promotion. The old installation was retained byte for byte in the rollback directory. Reopening the page with a fresh updater instance preserved the note and displayed Check updates. The executing component bundle matched its tested SHA256.

- [Before, reconstructed from retained pre-change handlers](before-validation-failure.png)
- [After, readable validation failure](after-validation-failure.png)
- [Installed fixture usable after failure](after-failure-installed-app-usable.png)
- [Successful retry and reopened fixture](after-successful-retry.png)
- [Assertions and capture hashes](results.json), [tested source hashes](tested-source.json)

The first retry attachment retained the old updater object's baseline while reloading only the renderer, so it showed an obsolete Update (1) label. That fixture lifecycle was corrected to reconstruct the updater, as a normal Electron restart does. The corrected retry attachment supersedes that image. The other three attached images are byte identical. No production repair or restart was performed for this review.

`npm run typecheck` and the focused feedback regression passed. The accepted backend checks and earlier full `verify:update` log and executing-delivery proof are retained unchanged in the parent folder. No broad suite was rerun. The only additional production change in this review is opt-in wrapping for the update-error menu title. Its source and native evidence supersede the previous unwrapped popup, but it has not been promoted in this review.

The scoped commit includes updater dependencies and selected updater hunks in mixed files. It excludes unrelated source edits and the pre-existing staged world/floor-plan changes. Historical full-file delivery hashes describe the shared tested snapshot, not a claim that every unrelated change in those files belongs to this commit.

Reproduce with `node scripts/verify-update-feedback-native.cjs <isolated-output-directory> <retained-pre-change-source-directory>`. The accepted run is retained at `E:/Lucid-validation/update-feedback-native-20261101/accepted-lifecycle`.

Broader stabilization and this review remain unsettled pending review. This evidence does not establish full-office performance, dictation stability, or a resource ceiling.
