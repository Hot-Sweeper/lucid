# Sharp rendering and responsive work

The rendering changes preserve the existing artwork, live app content and logical game coordinates.

## Zoom snapshot correction, 2026-10-31

The reduced screen tiers previously used fixed .4x and .25x raster sizes. Those
buffers stretched beyond their source resolution near the tier cutoffs. Their
cache also survived display-density changes, and a newly maximized window could
stretch its original smaller snapshot until its content refresh was due.

Reduced views now allocate enough pixels for the largest reduced monitor width
at the current device pixel ratio. Same-tier zoom reuses that sufficient buffer;
a display-density increase or a window resize rebuilds it. The logical monitor
width determines the allocation, independently of opening animations. Ordinary
content refreshes stay throttled and all apps keep their original DOM and state.

Outdoor tile CSS coordinates now use source pixels independently of display DPI.
Changing display density refreshes the camera layer even when the camera itself
has not moved. Static room and tile surfaces no longer request permanent
compositor promotion; scaling permits the original SVG edges to rerasterize.

Controlled native evidence is in `E:/Lucid-validation/sharp-quality-final` and
`E:/Lucid-validation/sharp-scenery-performance-final`. Eight zoom levels from
.65x through 5x, DPI changes 2/1.25/2, and all 45
outdoor mapping/pixel/retention checks passed. Screenshots use the real WM with
deterministic test content. The pan/zoom check uses actual CDP middle-button and
wheel input in an isolated instance with native occlusion disabled. It still
recorded occasional long frames, so this is not evidence of zero lag or a
guaranteed physical display frame rate. Production delivery must separately
verify its loaded asset. Original artwork with intentional soft lines or
pixel-art resolution is unchanged.

Live game, Botflix and GIF canvases follow the actual camera scale and display pixel ratio. Density buckets round upward, and a density increase bypasses ordinary screen cadence so the next display frame redraws at the new resolution. Small reversals retain sufficient pixels. Only explicitly registered, complete-redraw buffers resize; static posters and thumbnails keep their original pixels. Drawing transforms, styles, dashes and shadow distances survive resizing.

Nested canvases created before their message enters the document rebind to their actual screen on attachment. This fixes a native Botcord failure where a visible GIF retained a 400-pixel buffer at high zoom. Resizing also bypasses internal game and media frame gates so it cannot leave an empty buffer.

Outdoor camera motion reuses bounded crops. Static geometry is retained as Path2D commands and painted into small, overlapping canvas tiles with sufficient source density for the actual zoom. Covered motion and reversals reuse sharp tiles. Unsupported SVG features retain the isolated native SVG and settled-image fallback. The whole-world bitmap promotion is limited to translation; zoom permits Chromium to rasterize live text and vectors at the new scale. Static indoor caches restore native vectors during uncovered movement and correctly release stale assets when inherited colors change. The later measured scenery investigation is recorded in [camera-ablation.md](camera-ablation.md).

Robot work uses a measured synchronous budget and the existing eight-body paint ceiling. A late unrelated frame no longer forces a second of three-body animation. Route distances are cached, arm geometry remains equivalent, and blocked rendezvous retries yield to the event loop without replacing the actor or trip. Offscreen note, prompt and sprite presentation stops measuring or painting while logical state continues. Context-item reads reuse discovered IDs with bounded invalidation and fresh primary-key payload reads; the source database and schema remain unchanged.

## Verification

Evidence is local under `C:/Users/tim/.t3/lucid-performance-recovery`:

- `combined-sharp-checks`: real game canvases at .23, .65, 2 and 5x; rapid reversals; an emulated display-density change; static art comparisons; immediate native-vector fallback; camera capture/cancellation; room arrangement; actor fairness; screen occlusion; chat freshness and activity sizing. These checks passed without renderer errors.
- `media-attachment-fixed`: production Botflix hero, modal and video plus Botcord GIFs at four camera scales, repeated reversals, changing media pixels, actual channel text and cleanup. All checks passed.
- `media-final/results.json`: the crowded synthetic fixture has 23 desks and 14 walkers with real screen apps. The heaviest distant-app sample still contains frames above the 16.7 ms target. These samples do not establish zero lag or an unbroken display frame rate.
- `final-interface-only`: combined conversation rail, retained draft, sidebar search and empty-task validation checks. The fixture does not send messages or create tasks.

The original performance baseline is preserved separately in `baseline-dist`. Foreground delivery measurements must verify the actually loaded asset and must reject hidden or occluded runs. RequestAnimationFrame timing is not a direct physical-display FPS measurement.

The production app was restarted with asset `index-DzPEyL7k.js` (source `966a776`). Repeated foreground measurement attempts were rejected because Chromium reported the native window hidden or occluded, including an attempt with native window restoration and foreground activation. No foreground timing is accepted from those runs. The rejected diagnostic is `C:/Users/tim/.t3/lucid-actual-ux-final/overview-rejected.json`; its timing percentiles must not be presented as foreground performance evidence. This leaves physical foreground mouse feel and frame pacing unverified in this environment.

The subsequent gait and waiting-space snapshot `3c74c9b` passed its native desk fixture: 92 checks, 23 collision-safe segments and six approaches, including continuous waiting separation and assigned-work-only running. Evidence is `C:/Users/tim/AppData/Local/Temp/lucid-desk-verification-tq69iz`. This snapshot is committed but has not replaced the running production asset. Separate manager and distance-detail requests are actively editing the checkout and build output; their unfinished changes were preserved and were not installed as part of this delivery.

Focused CPU regressions cover detached canvas attachment, pixel density, frame cadence, context-state preservation, cache invalidation, Unicode note/prompt output, offscreen work, indexed history freshness, blocked route yielding and eight pixel-identical BOOT scenes. BOOT retains its intentional software-rendered pixel-art resolution.
