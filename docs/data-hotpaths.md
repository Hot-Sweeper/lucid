# Live data and screen layout hotpaths

This pass addresses actual local T3 data volumes, not the small fixed benchmark alone. No live data was written during these checks.

## Findings and changes

- The local projection held about 28,000 turn items. Each watched desk independently scanned its full thread every 350 ms because the read-only database has a thread/ordinal index but no thread/updated-at index. Forty unchanged thread polls consumed about 50 ms of synchronous main-process time per sweep.
- All desks now share one indexed native event-sequence cursor. Turn-item IDs are coalesced, the latest projection row is fetched by its primary key, and only changed rows are dispatched. A content fingerprint catches native updates with identical timestamps. Initial reads precede cursor replay, preserving updates that arrive during subscription. Unsubscribing the final desk stops the shared timer.
- A periodic read-only projection safety pass reconciles direct edits and unsupported event sources. It processes at most two thread histories per tick instead of creating a full-office stall. Legacy databases without an event table retain projection polling. Connection replacement and event-sequence rewind clear stale watermarks and reconcile current rows. No index or persistent database mutation is introduced.
- `world()` repeatedly scanned every recent thread for max(updated_at) and rebuilt 2.15 MB of base64 project icons every three seconds. The event cursor now maintains exact latest-activity timestamps after the initial indexed thread reads. Project icons use the existing `lucid-file` protocol with modification-time/size URLs, so actual source images are loaded once by Chromium instead of repeatedly copied through IPC. Candidate-path discovery is bounded and cached; changed/deleted files are rechecked.
- Read-only measurements on this machine changed warm `world()` from roughly 53 to 100 ms and 2.17 MB per response to roughly 2 to 3 ms and 21 KB. A first cold read still loads activity headers and was about 84 ms. These timings measure the data bridge, not physical frame rate.
- Helper harness streams previously changed text, measured overflow, read/wrote scrolling, and reread scrollTop on each individual screen callback. A shared layout batch now measures all requested geometry before follow-up writes. It omits bottom-scroll writes when already at the target and keeps user scroll cancellation. T3 Code presentation uses the screen update budget, skips hidden intermediate Markdown construction, and retains the exact final reply.

## Subscription limits

The installed T3 Code server exposes the same provider subscription snapshots used by its UI through supported `server.getConfig` RPC, with existing `orchestration:read` scope. The response's `providers[].usageLimits` includes `checkedAt` and every labelled session/model/weekly/monthly window. This is separate from `server.getUsageSummary`, which aggregates token and cost records.

Lucid now reads those snapshots through its existing paired connection. Background usage reads never pair, re-pair, restart a provider or open an authentication prompt. Reads share an in-flight request, cache successful results for 20 seconds, back off failures for 30 seconds and return within 2.5 seconds. Existing provider-list config reads also populate the quota cache. Only provider identity and usage fields leave the main process, never account/authentication metadata.

All provider instances and all reported window IDs remain separate. Current official snapshots supersede corresponding local log readings; missing, old or reset snapshots preserve local fallback. The UI names the source and reports unknown/outdated readings honestly. Token and project-cost accounting remains unchanged.

## Verification

- `node --test scripts/verify-watch-items.cjs`: six deterministic SQLite tests covering subscription races, coalesced native updates, same-timestamp revisions, thread isolation, unchanged-tick scan avoidance, unwatched activity, legacy fallback, direct-projection reconciliation, connection replacement, sequence rewind, timer cleanup and spreading safety scans across ticks.
- `node --test scripts/verify-provider-limits.cjs`: three fixtures covering multiple provider instances, equal-duration model pools, Claude/Pi windows, unknown readings, stale/reset snapshots, current log fallback, offline source reporting and immutable cached totals.
- `node scripts/verify-layout-batching.mjs`: confirms coalescing and that all geometry reads precede writes, with disconnected-owner and error recovery coverage.
- Existing usage and stats DOM fixtures, whole-project TypeScript, and source syntax checks pass.

The coordinator owns Electron runs and actual live-workload profiling. The actual official quota source was verified separately in `C:/Users/tim/.t3/lucid-official-quota-check.json` (Codex Weekly and Claude Session/Weekly/Weekly Fable in 348 ms). Final native content/interaction tests and real-workload frame-time measurements are recorded in `docs/request-completion.md` and `docs/performance-validation.md`. They show substantial improvement while retaining occasional pan hitches; live-copy verification remains separate.


## Full conversation history without growing refresh payloads

`conversationPage` reads at most 80 persisted messages per normal chat request (hard maximum 200), using `(created_at,rowid)` keyset pagination. The whole pending queue is included independently on the newest page. Explicit older-page reads resolve historical run metadata beyond the normal recent 60 cache and include their persisted model/harness/context events. That extra JSON lookup is kept off normal live refreshes. The existing `conversation(id)` API still returns an array for reference summaries and callers that need only the newest window.

`src/office/history-window.ts` keeps loaded older pages locally, merges latest source changes by stable message identity and source order, and protects fresh stream content from a slow older-page response. The chat's Load earlier messages control prepends a bounded page while preserving the visible reader anchor. Thread changes invalidate outstanding results. No write action or remote provider session is involved.

Verification: `node --test scripts/verify-conversation-pages.cjs` (three SQLite tests), `node scripts/verify-history-window.mjs`, `node scripts/verify-chat-history.cjs`, and `npm run typecheck`. `scripts/render-history-pagination-checks.cjs` passed in `C:/Users/tim/.t3/lucid-all-details-final/history-pagination-checks.json`: 80/160/205 messages, 0.167 px reader-anchor error, retained oldest message identity and fresh latest stream.
