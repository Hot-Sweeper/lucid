# Lucid performance validation, 2026-10-31

The final production candidate was measured with the real local T3 workload: 11 projects, 20 occupied desks and 14 walking actors, with original settings and roster copied into an isolated profile. World, conversation and subscription reads use the real source. The run cannot answer real approval requests. Electron renders with native background throttling disabled, and every recorded scene reports `document.hidden === false`. No alternate CSS is injected in the final candidate run.

Results are four-second requestAnimationFrame samples on this machine, including ongoing real work. They are not a guarantee for every machine, display or future workload. Panning uses held native middle-mouse input. The compact layout intentionally changes the overview from 0.042x to 0.081x, approximately doubling visible workstation size.

| Scene | Previous live mean / p95 (ms) | Final real-workload mean / p95 (ms) |
| --- | --- | --- |
| Whole building | 28.8 / 34.8 | 10.3 / 14.1 |
| Middle-mouse panning | 52.8 / 76.4 | 13.3 / 27.4 |
| Office view | Not recorded in baseline | 7.0 / 7.3 |
| Close desk | 7.1 / 7.3 | 6.9 / 7.2 |
| Open chat | Not recorded in baseline | 7.0 / 7.2 |
| Whole building in rain | Not recorded in baseline | 11.2 / 14.1 |

Panning still includes occasional frames above 33 ms (11 of 302 samples). This is a substantial measured improvement, not a claim of an unbroken 60 fps under every condition. The baseline is a foreground live-window run; the candidate is an isolated native-window run using the same real source, so these are representative workload comparisons rather than a deterministic same-state benchmark.

Evidence folders:

- `C:/Users/tim/.t3/lucid-actual-foreground-baseline`
- `C:/Users/tim/.t3/lucid-real-production-candidate`
- `C:/Users/tim/.t3/lucid-cache-layout-functional-2`
- `C:/Users/tim/.t3/lucid-compact-native-routing`

The changes address measured causes: large unbounded weather/scenery layers, overlapping app-window compositing layers, repeated database history scans and multi-megabyte icon transfers, SVG writes for unchanged geometry, unnecessary empty-desk actors, and antenna tweens that bypassed actor visibility. Static SVG artwork uses a bounded full-density lossless cache with original vectors restored during uncovered movement or zoom. Visible apps retain their real DOM and content at every zoom. Offscreen or fully covered presentation can pause; source state and movement clocks continue.

Official quota source was checked against the existing authenticated T3 connection. It returned separate Codex weekly and Claude session/weekly/model windows. Unsupported or stale sources are labelled honestly. No synthetic percentage replaces missing quota data.

Foreground delivery exposed a further periodic hitch. Invalidation tracing identified `[class^="so-"] *` as invalidating the entire world whenever camera/culling ancestor classes changed: individual style recalculations visited roughly 20,000 elements and took 32 to 43 ms. Social resets now use the existing named app roots, preserving the same declarations while allowing indexed class invalidation. The repeat real-source candidate (`lucid-indexed-css-candidate`) recorded panning mean 12.2 ms, p95 20.8 ms, and one frame above 33 ms among 332 samples. Overview had no frames above 33 ms. The live foreground confirmation is recorded separately after delivery.
