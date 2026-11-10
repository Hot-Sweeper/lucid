# Combined delivery verification

2026-10-31, integrated `office` checkout. Four workers handled screen rendering/performance, chat/controls, coherent robot behavior, and usage/project costs. The coordinator reviewed their shared changes and ran the combined Electron build.

## Delivered behavior

- Visible robot screens retain actual desktop, app, thumbnail, game and streamed content at all zoom levels. The former far-camera placeholder and blanket animation freeze are removed. Tiny visible apps retain a 20 Hz presentation budget, with staggered updates; close apps use 60 Hz. Only offscreen or fully covered presentation pauses.
- Boss clicks open the real Orchestrator conversation. Both side panels resize and save their widths. Chat survives camera unfocus, groups consecutive same-sender updates within a minute, and renders real compactions, context handoffs, model changes and harness changes.
- Attachment sends retain the thread selected when sending started. Separate drafts and failed sends survive thread switches. Queue interactions clean up when interrupted. The daily reward's text stays beside its actual vector badge.
- Game launch searches use the selected game title, with matching window/result/dock names. Vapor Play directly opens the chosen game. Browser closes target the correct preview tab; failed or unknown closes preserve other tabs. Navigation uses the actual destination instead of an unrelated heading.
- Image activity reports actual completed, failed, pending or unavailable results. Late results update the existing image block without repeating prompts, reopening windows or stealing focus. Newer requests, thread changes and resets invalidate obsolete image loads.
- Photos and Player retain their correct window/dock icons. Photos fullscreen targets Photos. Permission overlays reflect a real pending request and its recorded outcome. Trading charts consume the market bridge's actual candles/price; offline simulations and fictional robot coins are explicitly labelled.
- Project usage uses exact native-session links, then real logged working-directory boundaries. Ambiguous usage stays Unassigned. Project tokens and micro-dollar costs reconcile with totals. Every reported limit pool/window has a stable row; unknown or expired readings are reported honestly.

## Combined runtime evidence

`C:/Users/tim/.t3/lucid-combined-acceptance` contains JSON results and screenshots from the actual Electron renderer:

- System checks passed: games update at 0.65x and 0.23x, offscreen/covered apps pause and resume, new harness text reaches the far screen, every visible robot receives animation updates, and renderer errors are empty.
- Behavior checks passed: exact preview-close dispatch, actual same-site address, image success/failure/interruption/pending/unreadable outcomes, played-item late completion, duplicate suppression, focus preservation and stale asynchronous load cancellation.
- Screen details checks passed: production Photos and animated Player paths, forced fullscreen, pending-only permission prompt and recorded decline/clear, live market timeframe/price provenance, offline label and fictional coin label. Market responses and approval reads were isolated fixtures; these checks never approved a request or traded.

The integrated UI fixture additionally exercises native mouse boss selection, both resize grips, saved widths, readable plans, real handoff rows, same-minute expansion, per-thread sends/drafts and minimum window geometry. Its final run at `C:/Users/tim/AppData/Local/Temp/lucid-integrated-sPrF5I` passed 19 checks, including actual project usage at narrow sidebar width and a narrow chat header without buttons overlapping the robot's name. Node fixtures cover usage reconciliation and all limit pools, chat event history, screen scheduling, image parsing and image refresh races. The final game-launch regression also passed all 18 checks.

## Performance with actual visible apps

Windows, Electron 45, RTX 3080, DPR 1.5, native offscreen renderer with background throttling disabled. The fixture has 31 threads, 23 desks and 14 walking actors. Heavy stages launch actual Voxel Valley, Night Shift, Bot-Com, Boot, Botflix and Benchtop activities. Each sample measures four seconds after settling. Values are renderer animation-frame intervals, not a physical display measurement or a slower-machine guarantee.

Raw evidence: `C:/Users/tim/.t3/lucid-visible-final-benchmark/results.json` and screenshots. Close-up stages now center an occupied app desk; they assert live game content and app callbacks instead of measuring an empty desk.

| Scenario | Mean ms | p95 ms | Intervals over 33.4 ms |
| --- | ---: | ---: | ---: |
| Idle office | 7.0 | 7.2 | 0 |
| Many robots | 7.5 | 11.3 | 2 |
| Close occupied desk | 7.0 | 7.2 | 0 |
| Wide middle-button pan | 7.8 | 13.9 | 3 |
| Active screen apps | 7.0 | 7.1 | 0 |
| All visible apps, far zoom | 16.0 | 21.1 | 1 |
| Actual active game close-up | 6.9 | 7.1 | 0 |
| Chat and active game | 7.0 | 7.2 | 0 |
| Rain and active apps | 6.9 | 7.1 | 0 |

The busiest all-app overview averages about 63 renderer frames per second, but its p95 misses the 16.7 ms target. Chromium tracing attributes much of the remaining cost to layerization and GPU raster work. This pass does not claim stable 60 fps on every machine or zero hitches. Screen content is preserved regardless of that target. Containment, layer-promotion and thumbnail backing experiments did not establish a useful improvement and were not adopted.

Historical performance documents measured a different distant-screen policy. Their before/after figures must not be used to claim performance for this all-visible workload. The benchmark's subsequent combined system check originally counted apps left running from the workload; the fixture now resets those apps before checking single-app offscreen counts. The separate combined acceptance run passed.

## Source limits

- Limit snapshots depend on metadata the installed harness actually writes. Unreported account limits remain unavailable.
- Market runtime fixtures verify data handling and labels, not an external provider's future availability. The production market bridge caches/rate-limits public Binance/CoinGecko reads.
- Reconstructed browser tool output without a recorded target cannot reproduce an exact click honestly. It shows the actual action and page rather than inventing a target.
- Physical mouse feel, other GPUs and a long-duration memory soak were not measured by these short fixtures.
