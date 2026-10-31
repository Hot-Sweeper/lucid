# Chat and controls acceptance audit

Audited on 2026-10-31 against the user's durable Lucid preferences. This audit separates code review and lightweight checks from the final Electron run, which belongs to the integrating agent.

| Obligation | Result and evidence |
| --- | --- |
| Both side panels resize and remember widths | Existing width settings, bounds and keyboard arrows retained. Resize listeners run on the window. Added capture fallback, lost-capture cleanup and Escape restoration. Final real mouse and narrow-window checks are in `scripts/verify-integrated-ui.cjs`. |
| Camera changes preserve chat | Fixed `main.ts` so camera unfocus leaves the selected conversation open. The explicit close action closes chat and unfocuses the scene. |
| Boss and robots away from their desks open their real chat | Existing boss routing retained. Fixed reserved desks marked `arriving` so the questions-room path does not focus an empty desk. Detached chats update status from real thread information without stealing keyboard focus. |
| Every pending question can be answered | Reviewed `AnswerCard` mounting, polling, question choices, free text and provider-response path. Question routing now reaches the intended chat. Real approvals were not sent during this audit. Final UI inspection with a real pending request is still required. |
| Real compactions, handoffs and switches | History rows come from persisted runs and top-level turn items. Executed selections drive switches; queued selections do not. `node scripts/verify-chat-history.cjs` passed for compaction, handoff deduplication, model/harness changes and date filtering. Interrupted compactions now have truthful copy. |
| Same-minute message folding | Consecutive messages of the same role in the same absolute minute share an expandable group. Event rows break groups. Stable group identity retains expansion through refresh and same-thread reopening. Final fixture checks include repeat opening. |
| Safe messages, attachments and unfinished drafts | Fixed async sends to capture their original thread before saving attachments. Each conversation restores its text, files and references. Pending bubbles and errors belong to their originating thread. Failed background sends keep the retry draft. Reference-summary loading and animated chip removal retain object identity across thread switches. |
| Queue ordering, edit, cancel and steering | Existing real T3 actions retained. Added captured thread IDs, thread-aware hold bookkeeping, full queue signatures and clearing stale queue rows immediately on thread switches. Drag cancellation now handles Escape, window blur, lost capture and switching chats. Edit/confirmation listeners clean up on navigation. |
| Long content, references and collapsible panels | Reviewed existing Markdown, code copy, image zoom, file chips, long user-message expansion, thread references, panel folding and bounded composer growth. No new replacement UI added. |
| Daily reward toast | Fixed a descendant selector that overwrote the icon badge with reward copy. Copy targets a named span inside its text column. The badge uses the existing vector coin. A visual-only fixture does not change the wallet balance. |

Completed checks: `npx tsc -p . --noEmit`, `node scripts/verify-chat-history.cjs`, and `node --check scripts/verify-integrated-ui.cjs` all passed.

Required integration checks: build the combined app and run `node scripts/verify-integrated-ui.cjs`. New fixture coverage exercises delayed attachment saves, different-thread drafts, failed background sends, interrupted queue dragging, preserved grouping, camera unfocus and reward layout. Message writes and attachment saves are stubbed inside the fixture and restored afterward. The worker did not run Electron while other agents edited the shared checkout.

Remaining scope outside this worker: whole-app frame rate, visible screens at every zoom, app launch coherence, app icons and in-world permission visuals belong to the other implementation workers. Per-project cost display is under the integrating agent's audit. This file makes no performance or complete UI acceptance claim before those checks finish.
