# Robot activity acceptance audit

2026-10-31, behavior worker. These are code traces and targeted checks, not a claim that the combined app has passed visual or performance review.

## Fixed

- A real `preview_close` now closes its matching preview tab and preserves other tabs. Unknown tab IDs do nothing. Failed closes preserve the visible tab.
- Same-site navigation types the actual destination URL. It no longer clicks an arbitrary visible heading and pretends that heading led there.
- Tool actions with no recorded target show their real activity caption. They no longer click a random position on a reconstructed page. Leisure page reading scrolls the page instead of pretending to follow an unspecified link.
- Image generation returns distinct completed, failed, pending and preview-unavailable outcomes. The activity line only claims a generated image after a returned image loads. Interrupted calls, nested tool errors and nonzero command exits produce failure states. Returned HTTP image URLs can be displayed.
- Saved app interests now gate Mail, Vapor and the Botcoin Exchange as well as the other pastime apps. A nonempty saved phone app list no longer silently gains Spool.
- Old game speech timers cannot erase a new activity's speech after its idle session ends.
- Music skips preserve actual elapsed playback time instead of jumping the clock forward before clicking Next.
- Compaction activity names context compaction rather than an unrelated break.
- A played image item continues receiving real result updates after its presentation budget expires. A revision gate refreshes the same result block once per changed terminal result. It does not type the prompt again, reopen a window or steal focus. Reset, thread identity, WM epoch and newer image checks invalidate stale asynchronous loads.

## Existing paths inspected and preserved

- `GAME_TITLES` supplies actual game titles for game windows. Vapor's returned launch key is passed to `doActivity(..., true)`, preserving the direct launch path from Play without another OS search.
- Image viewer opens the Photos app and uses its existing Photos icon. Editor and video app icons already have dedicated entries. WM title, dock and taskbar handling is owned by the renderer worker.
- BotsApp, Telegrid, Instabot, Sparkplug and Snapbot call shared typing indicators and phone keyboard helpers.
- the Botcoin Exchange reads real market candles and price through the market bridge. Its fictional coin section and offline market history have explicit labels. Vapor and robot coins remain local fictional leisure activities, not real purchases or trades.

## Checks run

- `node scripts/verify-image-results.mjs`: passed. Exercises production parsing of generated remote/local output, exclusion of input reference images, interrupted status, nested and serialized tool errors, failed commands, and unrelated command rejection.
- `npm run typecheck`: passed after these changes.
- `node scripts/verify-image-refresh.mjs`: passed. Covers completion after the presentation budget, duplicate pushes, completion during the last presentation sleep, newer images, thread/reset cancellation, reused item IDs, failed results, delayed sources, and ordinary completion without replay.
- `scripts/render-behavior-checks.cjs` exports the opt-in Electron assertions for cases 1, 2, 3 and 6 below. Syntax and embedded renderer snippets were checked; execution belongs to the parent worker's coordinated Electron run.

## Combined runtime checks still required

1. Open two preview tabs with distinct `pv:<tabId>` keys, close one through `preview_close`, and confirm the other tab and page remain visible. A failed close must leave both tabs intact.
2. Run image fixtures for success, tool failure, interrupted call, tool still running past the presentation wait, and completed result with no readable image. Only the success fixture should say Generated image.
3. Navigate between two URLs on one site. Confirm the address matches the destination and no unrelated heading is clicked. Search-result navigation should still click its matching actual result.
4. Check a robot whose saved interests omit Vapor, Mail and the Botcoin Exchange. None should enter its weighted pastime selection. Its phone home screen should contain only its saved social apps, plus utility icons.
5. Observe actual runtime tool outputs and photo/video viewer titles alongside the other workers' WM icon changes.
6. Set an image presentation's `maxMs` to a short budget, let it return pending, then push the same real item's completed output. Confirm its original result block fills, the prompt remains single, and another app retains focus. Repeat with a failed output and unreadable image. Start a second image while the first result is loading and confirm the stale first refresh is ignored.

## Limits

- Preview tool output sometimes lacks DOM target coordinates or a matching source element. The reconstructed browser can show the source page and actual action caption, but cannot honestly reproduce the precise click in that case.
- The in-place late refresh applies to the newest image presentation in the current thread and WM epoch. A closed Codex window stays closed; obsolete or detached blocks are not recreated. The full visual result lifecycle still needs the combined runtime fixture above.
- Crypto API availability, actual GPU frame time, zoomed-out screen preservation, full idle distribution and combined Electron visuals were left to the parent worker's coordinated runtime checks. No Electron instance or GPU capture was launched by this worker.
