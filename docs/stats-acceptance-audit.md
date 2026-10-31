# Stats acceptance audit

Verified on 2026-10-31 in the isolated `Lucid-dev` checkout. No Electron app or server was started for these checks. Browser layout and the delivered desktop build still need the coordinator's runtime review.

## Sources and attribution

- Usage remains the harness-native Claude Code, Codex and Pi JSONL records. The existing local `usage-model-rates.json` prices the recorded model, token/cache counts and service tier. API-priced work is an estimate of equivalent API work, not a subscription invoice.
- `statev2.sqlite` is opened with `DatabaseSync(..., { readOnly: true })`. Queries select project names/roots, thread project IDs/worktree paths and native session references, never message bodies, credentials or auth files.
- Exact matches use `orchestration_v2_projection_provider_threads.payload_json.nativeThreadRef.nativeId` only when its strength is `strong`, joined through the real app thread to `projection_projects`. Legacy `projection_thread_sessions` native IDs are also supported. The provider driver is normalized for Claude. Shared orchestration provider session IDs are not treated as native IDs, since one shared provider session can serve several projects.
- If no exact native-session mapping exists, a logged `cwd` can match the longest project-root or real thread-worktree prefix, with path-component boundaries and Windows case/slash normalization. No title matching, encoded-directory guessing or arbitrary first-project fallback is used. A conflicting exact session or equal-length path match stays `Unassigned`.
- Codex `session_meta` and Pi `session` headers supply session IDs/cwd even when large-file timestamp seeking skips their old body. Claude assistant records carry `sessionId`/cwd. Each usage row retains the context present when that row was read.
- `byProject` exists in all three existing time windows, with tokens, API-priced USD, pricing completeness and token counts attributed by session, cwd or Unassigned. Today's projects appear in a compact disclosure next to the existing model disclosure. Each project name exposes its attribution source; partial pricing is marked. Unrounded USD is available on hover.
- Streaming/copy de-duplication retains the existing largest-message accounting. Exact project mappings beat cwd-only duplicate copies. Copies with conflicting equally strong project mappings count once under Unassigned. Codex de-duplication is scoped to its native session so independent sessions with identical timestamps/counters cannot collide.
- Project cost uses micro-dollar rounding with fractional remainders, so project tokens and cost reconcile exactly with the corresponding total. The existing token/cache pricing and wallet conversion remain unchanged. This patch does not change the 1 coin per $1 wallet.

## Reported limits

- Every observed Codex `limit_id` is retained, including model-side pools. Each primary/secondary slot has a stable pool-and-slot ID, so equal-duration windows remain separate rows. Existing `primary`, `secondary`, `plan` and `observedAt` compatibility fields remain available.
- Every Claude `rateLimitType` observed in the existing error/quota metadata is retained separately, including model-specific weekly windows. The compatibility secondary field still represents the latest reported weekly window.
- Unknown percentages stay null and render as unavailable. Rejected Claude requests without a reset time do not invent a current percentage. Values whose reported reset time has passed render as having no reading since reset. Every retained window includes its observation time.
- A harness with no reported limit metadata shows a quiet unavailable message. No subscription total, percentage, reset or model pool is invented from token totals.

## Checks run

- `node --test scripts/verify-usage.cjs scripts/verify-stats-ui.cjs`: 7 passing tests. Deterministic fixtures cover exact mappings, legacy mappings, conflicting sessions, copied streaming records, longest cwd/worktree matching, path boundaries, missing DB behavior, unknown model pricing, reconciliation in all windows, same-duration limit pools, model-specific Claude windows, stale and unknown readings, independent stable DOM rows, project disclosure, concurrent getUsage requests, partial appends, warm body-read avoidance and large-file seek restoration.
- `npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --lib es2023,dom --types vite/client src/stats/stats.ts`: passed. Uses the project's current TypeScript 7 compiler.
- `node --check electron/usage.cjs`: passed.
- `node scripts/usage-check.cjs --summary`: real read-only scan passed reconciliation for the five-hour, today and seven-day windows. The sampled cold call took 1.95 seconds and the warm call took 36 milliseconds, with 156 MB RSS. Live logs can change between calls. The observed machine supplied one Codex window and no current Claude reading, which is reported as unavailable.
- `git diff --check`: passed for this work. Whole-project typecheck initially encountered independent in-flight director/CodexApp API changes; it is the coordinator's responsibility to run the integrated check after those changes settle.

## Precise limits

- Coverage remains the existing seven-day usage view, with files inactive for over eight days excluded and large files entered near that time range. Historical pools outside this retained source range are not reconstructed.
- This database has no subscription-usage table. Limits therefore remain snapshots from metadata the installed harness actually reports in session logs, not a complete account dashboard. Claude commonly writes limit metadata only on rejection. Unreported Claude/Pi limits cannot be recovered here without a supported additional source; no auth endpoint or credential file is accessed.
- Directory attribution is a fallback to real logged cwd, not proof that every operation stayed inside that directory. Symlinks, unmatched external worktrees, ambiguous roots and missing/deleted native mappings can remain Unassigned. Deleted project rows retained in T3 can still name historical usage.
- The DOM fixture verifies identity, text and disclosure behavior, not browser pixels, narrow-screen geometry or keyboard focus rendering. The additions reuse the existing stats typography, spacing, bars and native button behavior; they add no cards or decorative badges. Long project names wrap.
- Currency is shown compactly at cents in the UI; hover exposes micro-dollar values. Independently rounded visible cents may differ by a cent from their sum, while underlying project totals reconcile at the same precision as the headline data.
