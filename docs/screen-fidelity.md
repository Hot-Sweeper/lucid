# Visible screens at every zoom

Visible workstations retain their real desktop, windows, thumbnails, canvas content and streamed text at every camera scale. Camera distance changes the update rate, never the screen contents:

| Screen width in CSS pixels | App updates |
| --- | ---: |
| Under 200 | 20 Hz |
| 200 to 449 | 30 Hz |
| 450 or more | 60 Hz |

The 20 Hz floor gives tiny visible screens a new presentation opportunity every 50 ms. This keeps games and streamed output visibly live while reducing work relative to close-ups. Workstation clocks have stable, staggered phases so their updates do not all land on one frame. Initial content and returning screens can draw immediately.

Offscreen screens, covered window bodies and a hidden document still pause presentation. Logical events and buffered stream state remain active. Panning back resumes the existing app. A window opening over another app does not occlude it until the opening animation finishes. Static thumbnails are built once when visible, including at small sizes, with one queued construction per frame.

The old far-camera CSS placeholder, global animation freeze, camera scale visibility cutoff and tiny-screen zero-Hz budgets have been removed. Screen CSS animations remain active; the existing distance budgets for outdoor ambient decorations are unchanged.

## Which app is on the screen

Robot screens only show real tools under their real names, drawn in Lucid's own simplified style, and fictional apps under robot parody names.

- Talking with you: the native chat app, showing the conversation you see.
- Working with other robots (messaging or reading another thread, delegating, starting a helper thread, checking on it): T3 Code. The build (stable or Nightly) is the one you run, read by `electron/t3-channel.cjs` from `desktop-last-started-version` in T3's home and passed through `window.lucid.t3Channel()`.
- A helper inside the robot's own harness (Claude's Agent tool): that harness's app or terminal (`src/harness/`).
- Code is read in the one shared code editor, thoughts go to the one Notes app, and app-minded robots commit, branch and merge in the Git app (`src/os/gitdesk.ts`).

## Checks

Run `node scripts/verify-screen-scheduler.mjs` for a CPU-only virtual-clock check of the actual scheduler. It verifies the rate boundaries, 20 Hz tiny-screen updates, 60 Hz close-ups, offscreen pause and resume, covered-window pause, reparenting from a covered window, deferred tiny-thumbnail construction and staggered updates. The implementation run passed with a peak of seven of twenty workstation callbacks on one frame after initial construction.

The native `scripts/render-system-checks.cjs` fixture now checks actual app calls and visible window content at close, medium (0.65x) and far (0.23x) camera scales. It also streams new harness text at far zoom and checks that the text reaches the real visible desktop. Screenshots are saved as `game-live-0.65.png`, `game-live-0.23.png` and `harness-far-live.png`. Existing offscreen and covered-window checks remain.

Run the native checks through `scripts/render-profile.cjs` with `LUCID_PERF_CHECKS_ONLY=1`, `LUCID_SYSTEM_CHECKS=1` and `LUCID_PERF_TRACE=0`, providing a fresh output directory. Run the combined performance suite separately after other workers finish. The historical benchmark in `app-performance.md` used the former hidden-distant-screen policy, so its numbers do not establish performance for this visible-screen policy. This change has not been GPU-benchmarked in isolation.
