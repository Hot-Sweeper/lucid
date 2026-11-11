// Camera focus: following a robot, showing the park, a room or a desk, and zooming onto a desk or
// its screen.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { GEOM } from "../../robot";
import gsap from "gsap";
import { Desk, UNIT_W, UNIT_H } from "../desk";
import type { World } from "../world";

export class WorldCameraFocus {
  follow(this: World, el: HTMLElement) {
    this.frame = null;
    if (this.focusDesk) this.unfocus(false);
    this.select(null);
    this.cancelCameraTween();
    this.followEl = el;
    gsap.ticker.remove(this.followTick);
    gsap.ticker.add(this.followTick);
  }

  stopFollow(this: World) {
    gsap.ticker.remove(this.followTick);
    this.followEl = null;
  }

  overview(this: World) {
    this.unfocus(false);
    const g = this.cameraExtent();
    this.flyTo(g, 40);
  }

  showPark(this: World) { const p = this.outdoor?.park; if (p) { this.unfocus(false); this.flyTo({ x: p.x - 40, y: p.y - 40, w: p.w + 80, h: p.h + 80 }, 20); } }

  showRoom(this: World, id: string, insetRight = 0) {
    if (this.hostWorld) {
      if (this.rooms.find(r => r.id === id)?.collapsed) this.setRoomExpanded(id, true);
      const entry = [...this.hostWorld.neighbors.values()].find(e => e.office === this), room = this.rooms.find(r => r.id === id);
      if (entry && room) this.hostWorld.flyTo({ x: entry.x + room.x, y: entry.y + room.y, w: room.w, h: room.h }, 30, .45, insetRight);
      return;
    }
    if (this.rooms.find((r) => r.id === id)?.collapsed) this.setRoomExpanded(id, true);
    this.stopFollow();
    const r = this.rooms.find((q) => q.id === id);
    if (r) { this.unfocus(false); this.flyTo({ x: r.x, y: r.y, w: r.w, h: r.h }, 30, 1, insetRight); }
  }

  /** A desk in a folded office opens its office first; false while a held floor plan keeps it folded. */
  unfoldDesk(this: World, d: Desk) {
    if (!d.folded) return true;
    this.setRoomExpanded(d.room, true);
    if (!d.folded) return true;
    this.showRoom(d.room);
    return false;
  }

  showDesk(this: World, d: Desk) {
    if (!this.unfoldDesk(d)) return;
    this.stopFollow();
    this.unfocus(false);
    this.flyTo({ x: parseFloat(d.el.style.left) - 20, y: parseFloat(d.el.style.top) - 40, w: UNIT_W + 40, h: UNIT_H + 60 }, 30);
  }

  // Bring a whole desk close (robot, desk and screen), with the chat beside it.
  // The chat stays open while you zoom and pan around a robot. It only closes once you zoom
  // well out (to about a third of the close-up) or move the robot's desk out of view.
  keepFocus(this: World) {
    // Mid-glide the desk is still on its way into view.
    if (this.scene.inert || document.hidden || this.glidePath) return;
    const d = this.focusDesk;
    if (!d) return;
    // worked out from the camera, without measuring the page (that forced a full layout per mouse move)
    const s = this.sceneBox ?? (this.sceneBox = this.scene.getBoundingClientRect());
    const c = this.cam, dl = parseFloat(d.el.style.left) || 0, dt = parseFloat(d.el.style.top) || 0;
    const left = s.left + c.x + dl * c.s, top = s.top + c.y + dt * c.s, w = UNIT_W * c.s, h = UNIT_H * c.s;
    const r = { left, top, right: left + w, bottom: top + h, width: w, height: h };
    const visW = Math.max(0, Math.min(r.right, s.right - this.panelWidth) - Math.max(r.left, s.left));
    const visH = Math.max(0, Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top));
    const shown = (visW * visH) / Math.max(1, r.width * r.height);
    const deskShare = r.width / Math.max(1, s.width - this.panelWidth);   // how much of the view the desk fills
    if (shown < 0.25 || deskShare < 0.12) this.unfocus(false);
  }

  /** Where the desk's project tag sits, in the desk's own coordinates (it is centred above the monitor and grows upward). */
  tagFrame(this: World, d: Desk) {
    const el = d.el.querySelector(".desk-proj") as HTMLElement | null;
    const w = el && !el.hidden ? el.offsetWidth : 0, h = el && !el.hidden ? el.offsetHeight : 0;
    return { l: 200 - w / 2, r: 200 + w / 2, top: h ? Math.min(-32, 6 - h - 14) : -32 };
  }

  focusOn(this: World, d: Desk) {
    if (this.hostWorld) { this.onOpenDesk(d, false); return; }
    if (!this.unfoldDesk(d)) return;
    this.stopFollow();
    this.focusDesk = d;
    this.focusMode = "desk";
    // the frame includes the project tag that sits above the monitor, however long its name is
    const tag = this.tagFrame(d), x0 = Math.min(-10, tag.l - 6), x1 = Math.max(UNIT_W + 10, tag.r + 6);
    this.flyTo({ x: parseFloat(d.el.style.left) + x0, y: parseFloat(d.el.style.top) + tag.top, w: x1 - x0, h: UNIT_H - tag.top + 6 }, 18, 0.85, this.panelWidth);
    this.scene.classList.add("screen-mode");
    this.onFocus(d);
  }

  // Fill the view with the robot's screen.
  focusScreen(this: World, d: Desk) {
    if (this.hostWorld) { this.onOpenDesk(d, true); return; }
    if (!this.unfoldDesk(d)) return;
    this.focusDesk = d;
    this.focusMode = "screen";
    const m = GEOM.screen;
    // keep the project tag above the monitor in view, all of it
    const tag = this.tagFrame(d), x0 = Math.min(m.x, tag.l - 6), x1 = Math.max(m.x + m.w, tag.r + 6), y0 = Math.min(m.y, tag.top);
    this.flyTo({ x: parseFloat(d.el.style.left) + x0, y: parseFloat(d.el.style.top) + y0, w: x1 - x0, h: m.y + m.h - y0 }, 22, 0.9, this.panelWidth);
    this.scene.classList.add("screen-mode");
    this.onFocus(d);
  }

  unfocus(this: World, fly = true) {
    const d = this.focusDesk;
    if (!d) return;
    this.focusDesk = null;
    this.scene.classList.remove("screen-mode");
    this.onFocus(null);
    if (fly) this.showDesk(d);
  }
}
