// Camera input: wheel and touchpad zoom, panning, clicks on the scene, keyboard, touch gestures and
// resizing.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { mountTouchCamera } from "../touch-camera";
import { exposedScene } from "../exposed-scene";
import type { World } from "../world";

export class WorldCameraInput {
  mountTouchInput(this: World) {
    this.disposeTouchInput?.();
    this.disposeTouchInput = mountTouchCamera(this.scene, {
      camera: () => this.cam,
      viewport: () => this.sceneBox ??= this.scene.getBoundingClientRect(),
      zoomBounds: () => this.cameraZoomBounds(),
      constrain: () => this.clampCam(),
      start: (kind) => { this.stopCameraMotion(); this.cancelOutsideWarm(); this.dragged = true; this.holdTouchLayout(true); },
      change: () => this.applySoon(),
      end: () => { this.dragged = false; this.holdTouchLayout(false); },
    });
  }

  /** Release owned touch input when an embedding removes its office scene. */
  /** Direct manipulation takes ownership from an earlier fly-to or followed actor. */
  stopCameraMotion(this: World) {
    this.stopFollow();
    this.frame = null;
    this.cancelCameraTween();
  }

  camera(this: World) {
    const s = this.scene;
    s.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!e.deltaY) return;
      if (this.followEl) this.stopFollow();
      const smooth = !(e.deltaMode === 0 && Math.abs(e.deltaY) < 40);
      const pending = this.cam.s;
      this.cancelCameraTween(); // this.cam is now the visible position, not the old goal
      // Accumulate mouse notches only while continuing toward the pending goal.
      // Reversals and direct touchpad input take over from the visible position;
      // otherwise a smaller opposite delta can still move in the old direction.
      const continuing = Math.sign(pending - this.cam.s) === -Math.sign(e.deltaY);
      const base = smooth && continuing ? pending : this.cam.s;
      this.frame = null;
      const bounds = this.cameraZoomBounds();
      const ns = Math.min(bounds.max, Math.max(bounds.min, base * Math.exp(-e.deltaY * 0.0015)));
      // Camera transforms do not move the scene's viewport. Reuse its geometry
      // across high-rate wheel bursts; resizing and panel moves invalidate it.
      const r = this.sceneBox ??= s.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      // Touchpads send many small deltas and are already smooth; follow them directly.
      if (!smooth) {
        if (ns === this.cam.s) return;
        const wx = (px - this.cam.x) / this.cam.s, wy = (py - this.cam.y) / this.cam.s;
        this.cam.s = ns; this.cam.x = px - wx * ns; this.cam.y = py - wy * ns;
        this.clampCam();
        this.applySoon();
        return;
      }
      // A mouse notch is a 20% jump; shown in one frame it reads as stutter. Glide there.
      this.glideTo(ns, px, py);
    }, { passive: false });
    let start: { id: number; button: number; x: number; y: number; cx: number; cy: number } | null = null;
    const endPan = (e?: PointerEvent) => {
      if (!start || e && e.pointerId !== start.id) return;
      const id = start.id;
      start = null;
      s.classList.remove("panning");
      try { if (s.hasPointerCapture(id)) s.releasePointerCapture(id); } catch { /* window already lost capture */ }
      setTimeout(() => (this.dragged = false), 0);
    };
    const beginPan = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (start || e.button !== 0 && e.button !== 1) return;
      if (e.button === 1) {
        e.preventDefault(); e.stopPropagation();
        // Capture at the scene before desks/apps see middle-down. Crossing their
        // controls during a camera drag must not start hover, focus or app drags.
        try { s.setPointerCapture(e.pointerId); } catch { /* synthetic/offscreen pointer */ }
      }
      this.stopGlide(); // a drag takes over from where a wheel glide is now
      start = { id: e.pointerId, button: e.button, x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y };
      this.dragged = false;
    };
    // the middle button pans too: claim it, or Chromium starts its own autoscroll and fights the pan
    s.addEventListener("mousedown", (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); } }, true);
    s.addEventListener("pointerdown", (e) => { if (e.button === 1) beginPan(e); }, true);
    s.addEventListener("pointerdown", (e) => {
      if (e.button === 0) beginPan(e);
    });
    window.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (!(e.buttons & (start.button === 1 ? 4 : 1))) { endPan(e); return; }
      if (start.button === 1) { e.preventDefault(); e.stopPropagation(); }
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!this.dragged && Math.hypot(dx, dy) < 5) return;
      if (!this.dragged) { this.dragged = true; s.classList.add("panning"); this.stopFollow(); this.frame = null; this.cancelCameraTween(); }
      this.cam.x = start.cx + dx; this.cam.y = start.cy + dy;
      this.applySoon();
    }, true);
    window.addEventListener("pointerup", endPan, true);
    window.addEventListener("pointercancel", endPan, true);
    s.addEventListener("lostpointercapture", endPan);
    window.addEventListener("blur", () => endPan());
    document.addEventListener("visibilitychange", () => { if (document.hidden) endPan(); });
    s.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); } }, true);
    s.addEventListener("click", (e) => {
      if (this.dragged || (e.target as HTMLElement).closest(".desk-unit")) return;
      // little things to click on in the world (fountain, pond)
      const r = this.root.getBoundingClientRect(), z = r.width / (this.root.offsetWidth || 1);
      const wx = (e.clientX - r.left) / z, wy = (e.clientY - r.top) / z;
      if (this.park.hit(wx, wy) || this.landClick(wx, wy)) return;
      this.select(null);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.followEl) { e.preventDefault(); this.stopFollow(); return; }
      if (e.key === "Escape" && this.focusDesk) { e.preventDefault(); this.unfocus(); }
    });
    // clicking any walking robot (also one that was just thrown) makes the camera follow it
    this.root.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest(".world-walker") as HTMLElement | null;
      if (!el || this.dragged) return;
      this.follow(el);
      const id = el.dataset.id;
      if (id) this.onWatchChat(id);
    }, true);
    // The sidebar and the chat sit beside the scene, so the scene is exactly the visible area. When a panel
    // changes width the view adapts to it: a framed view (a desk, a room, the whole building) is fitted to
    // the new area again, and a freely panned view keeps what is at its centre in the centre.
    let last = { w: s.clientWidth, h: s.clientHeight };
    this.resizePresentation = () => {
      if (this.scene.inert || document.hidden) { this.presentationDirty = true; return; }
      this.sceneBox = null;
      // Read geometry only on layout changes, never in a robot's frame loop.
      this.journeyInsets = exposedScene(s.getBoundingClientRect(),
        [...s.parentElement!.querySelectorAll<HTMLElement>(':scope > .panel, :scope > .side-rail, :scope > .chat-panel, :scope > .cp-tab')]
          .map(panel => panel.getBoundingClientRect()));
      const w = s.clientWidth, h = s.clientHeight;
      if (last.w && last.h && w && h && (w !== last.w || h !== last.h)) {
        if (this.frame) {
          this.cancelCameraTween();
          this.fit(this.frame.rect, this.frame.pad, w, h);
        } else if (!this.followEl) {
          this.cam.x += (w - last.w) / 2; this.cam.y += (h - last.h) / 2;
        }
      }
      last = { w, h };
      // A layout change (the chat opening, the sidebar folding, the window resizing) is not you
      // looking away, so it never drops the focused desk and folds its chat.
      if (!this.shelfLayoutCommit) this.apply();
    };
    this.layoutObserver?.disconnect();
    const layoutObserver = this.layoutObserver = new ResizeObserver(this.resizePresentation);
    layoutObserver.observe(s);
    for (const panel of s.parentElement!.querySelectorAll(':scope > .panel, :scope > .side-rail, :scope > .chat-panel, :scope > .cp-tab')) layoutObserver.observe(panel);
  }
}
