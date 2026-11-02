# Phone access

Keep Lucid running on the PC. Connect the phone to Tailscale with the same user
account as the PC. In Lucid, open **Office & tools**, then **Phone access** and
choose **Enable with Tailscale**. Open the displayed HTTPS link on the phone.
Safari's **Add to Home Screen** can keep the office within easy reach.

The phone uses the same T3 work and saved robots. Office, Threads and Chat share
one full-width working surface. Phones initially fit an active room; the whole
building remains available through **Whole building**. Drag the office with one finger, pinch with two,
and tap a robot to open its conversation. Send messages with the Send button;
Enter inserts a line break on a phone. The composer follows the visible viewport
when the keyboard opens. Unsent text stays in the existing chat draft store.

The PC remains the sole owner of agent supervision, learning, reports, coin
collection and office settings. Task launches and manual conversation actions
work from the phone. Shared decorating, shop purchases and orchestrator settings
remain on the PC. New task assignments use the desktop's authoritative roster,
recheck robot availability, and preserve occupied desks. A conflicting appearance
edit fails with a refresh-and-retry message instead of replacing a newer edit.

The PC must remain awake, Lucid must stay open and Tailscale must stay connected.
Closing a phone tab does not stop desktop work. Hidden phone tabs release thread
watches and event streams; reopening reconnects without clearing the composer.
If the host is unavailable, reconnect it and retry. Failed sends retain drafts.

## Network boundary

Lucid listens on `127.0.0.1:5180`. Tailscale Serve publishes only Lucid's dedicated
HTTPS root on port `9443`. Setup preserves existing services and refuses to
overwrite an occupied port or use a public Funnel route. Authentication uses
Serve's authenticated `Tailscale-User-Login` header and accepts only the hosting
computer's Tailscale user. LAN listeners, public tunnels and arbitrary reverse
proxies are not configured.

The listener checks the public Host and Origin, refuses cross-site requests,
and exposes an explicit subset of the desktop bridge. Each browser page has its
own environment selection, thread watches and bounded event connection. A phone
cannot select a different building for the desktop or remove its watches. File
previews use authenticated media routes, with byte ranges for video and audio.
Hashed assets are cached and scripts, styles and larger API responses use gzip.

Phone refreshes combine office metadata, robot state and tasks in one versioned
read. Unchanged parts are omitted and retain their existing interface nodes.
Computer event subscriptions follow visible monitors and the selected chat.
Covered or offscreen computers retain their presentation state and resume when
shown. The desktop keeps its full subscriptions and supervision. Physical robot
arrivals refresh monitor visibility immediately, independently of source changes.

Configuration is stored separately from office settings in
`%APPDATA%/lucid/mobile-access.json`. Enabled access resumes when Lucid starts.
**Disable** closes the listener and removes only Lucid's owned Serve root.
If Tailscale is offline during cleanup, the listener is still closed and the UI
provides a cleanup retry. No password or pairing token is stored in the renderer.

Tailscale documents [Serve identity headers and the localhost trust boundary](https://tailscale.com/docs/features/tailscale-serve).
The underlying CLI is [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve).

## Verification

```text
node scripts/verify-mobile-server.cjs
node scripts/verify-mobile-access.cjs
node scripts/verify-companion-state.mjs
node scripts/verify-touch-camera.mjs
node scripts/verify-camera-queue.mjs
node scripts/verify-mobile-layout.cjs
npm run verify:update
node scripts/verify-mobile-browser.cjs
```

The browser acceptance script uses the production app and HTTP bridge in isolated
Electron browser windows with fixture T3 data. It cannot send tasks or alter
the user's Tailscale configuration. Mobile viewport and keyboard simulations
do not establish real iPhone frame rates, battery savings or Safari behavior.
Use the profiling procedure in [rendering-performance.md](rendering-performance.md)
for measured performance claims.
