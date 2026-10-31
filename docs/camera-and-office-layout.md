# Middle-mouse camera and activity-sized offices

The camera captures middle-button input at the scene before workstation controls can start a drag or steal focus. Pointer release, cancellation, capture loss, blur and document hiding end the interaction. Input is coalesced into one pending display-frame callback; there is no separate 60 Hz deadline delaying camera updates on faster displays.

Covered movement retains the sharp outdoor canvas, preview crop and live SVG viewport, translating bounded presentation surfaces instead of rebuilding them each camera update. Scenery has 256 CSS pixels of overscan per side; weather has 128. Zoom/coverage changes renew the source, with unchanged source density. Weather animation continues on its existing clock. No visible app content or animation is replaced to achieve this.

Quiet main/project/freelance offices fold to a 420 by 180 entrance facade and instantiate no workstation. Running, queued and pending work opens exactly its physical desks. Saved reservations remain separate from that physical projection, so completion does not delete history, change main-office membership or erase desk order. Opening history reveals one chosen thread. A currently viewed desk remains available when its work finishes. Keep office open offers deliberate capacity; Auto-size removes that manual pin.

Project and freelancer offices can be reordered by grabbing their in-world title or sidebar grip. A preview shows the destination; Escape, capture loss, blur and an outside drop cancel. Existing menus also provide Move office earlier/later. Order and manual expansion are persisted alongside the existing layout. Utility rooms keep their connected entrance arrangement.

Room movement and shrinking never replace a held desk/thread/room drag. Participating walkers retain their identity and old floor until reaching a point safe in both layouts. Shared halls use their real intersection; layouts without shared hall floor use the old exit and a point outside both buildings before continuing through the new entrance. Fresh journeys cannot indefinitely starve a pending layout change.

The backend no longer promotes an explicitly completed run to running for 90 seconds because of its last output. Recent activity is only a fallback when no projected run state exists.

## Validation

- `verify-camera-queue.mjs`: 200-event bursts coalesce, the latest state wins, 144 Hz callback timestamps are honored, and idle camera frames stop.
- `verify-outside-viewport.mjs` and `verify-weather-retention.mjs`: repeated covered pans reuse buffers, preserve source density/mapping, renew at coverage edges, keep the real weather clock and clean up.
- `verify-room-policy.mjs`: active/terminal statuses, zero/one/many desks, durable and reordered reservations, history reveal and connected folded-room routes.
- `verify-room-drag.mjs`: saved/hidden room order, previews, valid drops, cancellation, capture loss and cleanup.
- `lucid-camera-office-final-native`: native camera displacement/capture/cancel/blur and workstation isolation pass; covered pan adds zero scenery or sky blits and zero live SVG viewport changes. Five viewport/zoom cases preserve camera mapping and DPR. Room title drag, immediate saved order, physical order, menu movement, cancellation and manual open/auto-size pass. Activity transitions retain one actor and saved assignments while opening one desk, retiring it, folding, and revealing one history desk.

`lucid-middle-pan-real-final` records four held-drag views against the actual source: 11 projects, one working desk and 15 walking actors. Frame samples averaged about 7 ms with no samples above 33 ms in those four-second stages. Pointer-event-to-DOM-update p95 was 1.2 to 1.8 ms in the non-clamped views. This does not measure OS mouse latency or guarantee every future frame. The fully fitted overview hits camera bounds, so intervals between unchanged camera positions are not latency samples. A separate 23-app stress fixture remains more demanding at far zoom; its result is not substituted for the real workload.
