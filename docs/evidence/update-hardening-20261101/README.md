# Update hardening, 2026-11-01

The updater changes passed the full `npm run verify:update` suite. At 22:38:38 UTC, the running renderer and seven loaded Electron main modules matched the validated bytes. The installed source manifest matched the entire final validation snapshot, and all 97 compiled output files matched, excluding the timestamp-bearing manifest. See [executing delivery](executing-delivery.json), [source hashes](source-proof.json), [validated source](validated-source.json) and [verification log](verify-update.log).

The installed manifest SHA256 is `4259801f566292bfd4a066428a488816f8b788de842eeb649f8725d89f435c17`. Main PID was `162136`. The executing entry was `index-KSlqkuT0.js`, SHA256 `81679d2ea8c5ce5b82241758fa6f35fc7e993e50a0ca867bf2a663f7dc72157e`. Main-process V8 capture includes the accepted profiler SHA256 `64ea9bb04f34807fecd09dab10c66adc7a39264d68ddb134095577b4768b7f0f` and reports SHA256 `b58ef507e71b44c3de31906f3873953aedb384658b2fb897c50189afa46b27ee`.

## Failures addressed

- The supplied screenshot was a TypeScript failure in unfinished park source. Validation must reject that source while preserving the installed build. The update UI now explains that the changes need a code fix and offers exact diagnostic details separately.
- A separate live inspection found that the running entry `index-Dx1aQ3fL.js` had disappeared from `dist`. Ordinary Vite builds were replacing the installation while its window remained open. Default builds and full verification now write `dist-build`. Only the updater's explicit private `dist-update` path is promoted. The missing immutable entry was restored from a retained verified build, with no overwrite or restart. [Recovery receipt](restored-assets.json).
- Updates reject source changes during validation, retain working backups through promotion failures, and preserve recovery files when rollback fails. Cleanup or progress callback errors cannot turn a committed update into a reported failure.
- Timed-out Windows commands stop their owned process trees before returning. An unconfirmed stop creates a persistent recovery gate, including when dependency installation fails before freezing source. Another updater instance cannot overlap it. A demonstrably lower OS uptime allows recovery after reboot; ambiguous or malformed recovery state fails closed.

## Validation and boundaries

The full suite includes real Vite success and syntax-failure builds that preserve installed sentinel files, native Electron ASAR copying and interrupted-copy retry, real Windows npm timeout and child-process termination with unrelated sibling survival, interrupted validation, all promotion rename failures, rollback failure, concurrent requests, source drift, cleanup failures, persistent recovery gating, concise feedback and repeated-click recovery.

The final candidate was `.lucid-update-IvemMp`. Its full verification completed at 22:36:46 UTC with no shared-source drift. Normal application updates occurred during this work. This audit did not trigger a competing production restart or promotion. It inspected the existing process and then closed its temporary inspector connections. The final receipt proves the observed delivery; earlier candidate receipts are retained as intermediate evidence, not current delivery claims.

The window was hidden during the final source capture. This is executing-byte proof and a native capture, not an interactive FPS or battery test. Newer forest artwork remains under its owner's ongoing review. This receipt does not settle the broader stability task or claim that every future OS, disk, dependency or source-code failure is impossible. It establishes the tested recovery behavior and exact observed installation.
