# Update retry diagnosis, 2026-11-02

The user's screenshot shows a generic failed update. Its original in-memory
diagnostic was not recovered. A subsequent direct run on this PC reproduced a
concrete update blocker: divergent local and remote branches. See the outcome
below. None of the injected errors establishes the cause of the screenshot.
The job remains unsettled pending review.

## Direct updater outcome after identifying commit 0fff050

The working tree was clean. Local HEAD was `74c0f4d`, with local-only commits
`8100410`, `eba7c93`, and `74c0f4d`; remote main had the new `0fff050` commit.
The first direct updater run successfully built and installed pending local
source. A fresh updater instance then attempted the remote update and failed:

```text
Checking updates
Downloading updates
Error: git exited with code 128.
fatal: Not possible to fast-forward, aborting.
```

This is a reproduced Git integration failure on this PC, not a compiler error
in `0fff050`. A backup branch,
`backup/update-retry-before-0fff050-20261102`, preserves all original local commits.
Rebasing onto `origin/main` succeeded without conflicts and preserved those changes
as `4d072da`, `b786581`, and `c0a4bf2` above `0fff050`.

`npm run verify:update` passed on the combined source. The full verification log
is `E:/Lucid-validation/update-0fff050-verify.log`. The coordinated updater then
completed `Checking updates`, `Preparing update`, `Checking code`,
`Building update`, and `Restarting`, returning `{ updated: true }`.
The installed manifest matches the current source with zero differences, and
the installation completeness check passes. The CLI's `Restarting` progress text
does not restart the running production process; no separate production restart
was performed. The updated installation will load on the next normal app launch.

## Preserved transaction acceptance

`transaction-results.json` and `verify-update.txt` preserve the previously accepted
Electron transaction results. They cover current-source promotion, injected
compiler failure, interrupted validation, injected promotion failure, rollback,
retry, and a byte-identical production installation. These backend scenarios were
not rerun during the subsequent IPC investigation, apart from the mandatory
`npm run verify:update` suite.

The first interruption experiment conservatively quarantined its private fixture
after taskkill reported mixed success and an already-exited child. That is an
injected cancellation, not the user's observed failure. Its original local record
is `E:/Lucid-validation/update-transaction-20261102/results.json`. The accepted
transaction run instead interrupted a stable validation tree and confirmed cleanup.

## Actual IPC and lifecycle checks

Run `node scripts/verify-update-ipc-native.cjs --out <new-output-directory>`.
The helper registers verbatim state and update handlers extracted from
`electron/main.cjs`, uses the real preload in a hidden native BrowserWindow,
invokes `window.lucid.applyUpdate()`, and uses the real JSON stores and updater.
The installed-source restart path avoids repeating the accepted build scenarios.
Only store I/O is gated/fault-injected. Real Electron relaunch and exit are scoped
to the private fixture script and profile. A new Electron process verifies files
after relaunch. This is an isolated component app, not a full-office launch.

Before the fix, an injected rename failure rejected both save IPC requests, but
the store's caught serialization tail let flushing succeed. The update handler
then relaunched anyway. See `ipc-before-injected-failure.json`.

After the fix, the store remembers the latest write failure until a subsequent
write succeeds. Update flushing explicitly requires successful persistence. The
ordinary shutdown drain keeps its previous behavior. Failed flushing returns
the exact diagnostic `Injected settings persistence failure`, without relaunch.
After successful saves, a retry relaunches the private app and verifies the saved
draft and roster. See `ipc-after-injected-failure-and-retry.json` and
`ipc-success-and-reopen.json`. No production restart was requested or performed.

`ipc-verify-update.txt` records the successful required verification suite after
the code fix. There are no visual changes or before/after screenshots.

## Original-error diagnostic handoff

Agent-accessible collection attempted:

* The profile's recorded DevTools endpoint at loopback port 51265 is unreachable.
* The running production main process had no listening diagnostic TCP endpoint.
* Windows accessibility found the Lucid window but did not expose its
  `Copy error details` control.
* The current update handler returns details through IPC but does not persist the
  failed response in an updater log. The renderer keeps `lastUpdateFailure` in
  memory. Its concise visible menu text cannot establish the underlying error.

To preserve the original error, do not retry or restart first. In the existing
failure menu, click **Copy error details**, then paste that text into the review
thread. The exact text is needed, including command exit code and stdout/stderr
when present. If the old failure menu is gone, report that fact; a new failure
must be labeled as a new attempt rather than attributed to the screenshot.

The next diagnostic step is to map those original details to the failing stage
and reproduce that specific condition through the isolated IPC fixture. Passing
compilation, transaction fixtures, or injected persistence cases does not resolve
the original reported failure.
