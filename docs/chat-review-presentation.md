# Review messages in chat

The Orchestrator's saved settlement verdicts render as a native chat report: outcome, summary, next steps, human questions, checks and genuine captures. Empty sections are omitted. The original response remains exact and copyable under Original response.

Recognition requires an assistant message in the configured local Orchestrator conversation, a matching saved report ID, a complete standalone JSON object and the settlement schema. Fenced examples, prose surrounding JSON, unrelated objects, user messages, malformed final payloads and oversized candidates keep ordinary rendering. Known streaming reports show a quiet placeholder until completion. Saved report lookups precede rendering and discard results after a conversation switch.

Report actions open the existing saved paper and source conversation. Answer questions focuses the existing questionnaire and uses its existing persistence action. No answers, settlement state, ingestion rules or persisted messages are changed. Local reports are never applied to a linked environment's conversation. Archived image copies are preferred when a verdict references their original sources. Captures open the existing in-product media viewer.

The source session also shows its latest saved completion report after the conversation. Before a verdict exists, it shows the real submitted response excerpt and review state. Reviewed papers reuse the native report treatment and current saved status. The footer stays outside stored messages and minute groups, updates through existing report synchronization, and preserves ordinary conversation text, reader position and expanded details. There is no additional polling timer.

Verification:

- `node scripts/verify-chat-review.mjs` checks the supplied real verdict, strict schema, malformed/bounded input, ordinary snippets, streaming and decision wording. Included in `npm run verify:update`.
- `node scripts/verify-chat-review-native.cjs <output-directory>` builds the actual old and changed production components into isolated fixture bundles and uses a hidden native Electron window, its own profile, production CSP and media protocol. It never connects to T3 or writes production data.
- `LUCID_REVIEW_ARCHIVE` can select a read-only report archive. The fixture requires the supplied report and a genuine visual verdict with accessible captures. `LUCID_REVIEW_BASELINE` can select the baseline revision; by default it uses the pre-change revision recorded in the script.
- The native fixture captures the supplied example and long/narrow cases before and after, archived visual evidence, in-product preview and the actual answer form. It checks sanitization, unavailable captures, failed history lookup and retry, streaming, repeated refresh, reader position, older-history insertion and stale lookup rejection. Long text and the questionnaire request are explicitly synthetic fixture cases.

The fixture proves component presentation and integration with the existing report/answer components. It does not establish production installation, a live human answer, native audio listening, performance or battery results. Delivery and running-build proof belong to the coordinated release.
