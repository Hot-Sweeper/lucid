// What the camera shows: applying the camera transform, culling and presentation of offscreen work,
// sharp redraws after zooming, warming the outside art, fitting and flying to a rectangle.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { canvasRobotsWanted, syncRobotCanvases } from "../../robot";
import { LOD_PX, monitorPx } from "../../perf/lod";
import gsap from "gsap";
import { setZoom, setCameraMoving } from "../../perf/budget";
import { UNIT_W, UNIT_H } from "../desk";
import { footprintCovers } from "../building-footprint";
import { updateOutside } from "../outside-zoom";
import { setRenderView } from "../../perf/render";
import { beginSystem, endSystem } from "../../perf/metrics";
import { updateStaticArt } from "../../perf/static-art";
import type { World } from "../world";

export class WorldCameraView {
  refreshPresentation(this: World) {
    if (!this.scene.inert && !document.hidden && this.presentationDirty) {
      this.presentationDirty = false;
      if (this.resizePresentation) this.resizePresentation(); else this.apply();
      return;
    }
    this.recull();
    this.syncBuildings();
  }

  recull(this: World) {
    if (this.scene.inert || document.hidden) {
      this.presentationDirty = true;
      for (const d of this.allDesks) { setRenderView(d.screen, false, 276 * (this.cam.s || 1)); d.director.setPresentationVisible(false); }
      return;
    }
    const box = this.sceneBox ?? (this.sceneBox = this.scene.getBoundingClientRect());
    const s = this.cam.s || 1, m = 160 / s;
    const x0 = -this.cam.x / s - m, y0 = -this.cam.y / s - m, x1 = x0 + box.width / s + 2 * m, y1 = y0 + box.height / s + 2 * m;
    for (const el of this.cullSet) {
      if (!el.isConnected) { this.cullSet.delete(el); continue; }
      const st = el.style, desk = el.classList.contains("desk-unit");
      const l = parseFloat(st.left) || 0, t = parseFloat(st.top) || 0;
      const w = desk ? UNIT_W : parseFloat(st.width) || 0, h = desk ? UNIT_H : parseFloat(st.height) || 0;
      const out = l + w < x0 || l > x1 || t + h < y0 || t > y1;
      if (out !== el.classList.contains("culled")) el.classList.toggle("culled", out);
    }
    for (const d of this.allDesks) {
      const left = this.cam.x + (parseFloat(d.el.style.left) + 54) * s;
      const top = this.cam.y + (parseFloat(d.el.style.top) + 4) * s;
      const inView = !this.scene.inert && !!d.threadId && left < box.width && left + 292 * s > 0 && top < box.height && top + 172 * s > 0;
      const shown = inView && !d.el.classList.contains("arriving");
      setRenderView(d.screen, shown, 276 * s, 820, inView);
      // far away the desk's monitor shows a simple sign instead of its unreadable panel
      const px = monitorPx(s);   // the monitor's width on screen, in device pixels (perf/lod.ts)
      const far = px < LOD_PX.full;   // where screens stop drawing apps in full
      if (d.el.classList.contains("lod-far") !== far) d.el.classList.toggle("lod-far", far);
      // farther still the monitor is a few pixels wide: its dock row is skipped (office.css)
      const tiny = px < LOD_PX.tiny;
      if (d.el.classList.contains("lod-tiny") !== tiny) d.el.classList.toggle("lod-tiny", tiny);
      d.director.setPresentationVisible(shown);
    }
    const vx = -this.cam.x / s, vy = -this.cam.y / s;
    this.viewIndoors = footprintCovers(this.footprint, { x: vx, y: vy, w: box.width / s, h: box.height / s });
    this.root.querySelector(".outside-live")?.classList.toggle("culled", this.viewIndoors);
    this.fitBubbles();
  }

  // A thought bubble opens to the right of the robot's head; when that side is off screen or under
  // the side chat, it opens to the left instead.
  fitBubbles(this: World) {
    const box = this.sceneBox;
    if (!box) return;
    const s = this.cam.s, right = box.width - this.panelWidth - 8;
    for (const d of this.allDesks) {
      const b = d.bubble;
      if (!b.classList.contains("show")) continue;
      const left = parseFloat(d.el.style.left) || 0, BW = 234;  // bubble width with its padding
      const l0 = this.cam.x + (left + 248) * s, r0 = l0 + BW * s;          // opening to the right
      const r1 = this.cam.x + (left + 400 - 248) * s, l1 = r1 - BW * s;    // opening to the left
      let flip = false, shift = 0;
      if (r0 > right) {
        if (l1 >= 8) flip = true;
        // zoomed in close neither side fits: slide it along until it is all in view
        else shift = Math.max(0, Math.min((r0 - right) / s, (l0 - 8) / s));
      }
      if (flip !== b.classList.contains("flip")) b.classList.toggle("flip", flip);
      const want = shift ? `${(248 - shift).toFixed(0)}px` : "";
      if (b.style.left !== want) b.style.left = want;
    }
  }

  applySoon(this: World) {
    if (this.applyQueued) return;
    this.applyQueued = requestAnimationFrame(this.flushCamera);
  }

  cancelOutsideWarm(this: World) {
    if (this.outsideWarmIdle) window.cancelIdleCallback?.(this.outsideWarmIdle);
    if (this.outsideWarmTimer) clearTimeout(this.outsideWarmTimer);
    this.outsideWarmIdle = this.outsideWarmTimer = 0;
  }

  scheduleOutsideWarm(this: World) {
    if (this.outsideWarmIdle || this.outsideWarmTimer || this.dragged || this.zooming || this.scene.inert || document.hidden) return;
    const expected = { ...this.cam }, box = this.sceneBox ??= this.scene.getBoundingClientRect();
    const warm = () => {
      this.outsideWarmIdle = this.outsideWarmTimer = 0;
      if (this.dragged || this.zooming || this.scene.inert || document.hidden || !this.root.isConnected || expected.x !== this.cam.x || expected.y !== this.cam.y || expected.s !== this.cam.s || box !== this.sceneBox) return;
      updateOutside(this.root.querySelector('.outside-layer'), this.cam, box.width, box.height, 96, {x: box.left, y: box.top});
    };
    // Restore a useful pan reserve after settling, including under opaque floors.
    // Retained crops near an edge must not put their first renewal on a gesture.
    if (window.requestIdleCallback) this.outsideWarmIdle = window.requestIdleCallback(warm, { timeout: 500 });
    else this.outsideWarmTimer = window.setTimeout(warm, 80);
  }

  cameraExtent(this: World) {
    const g = this.grounds?.bounds ?? { x: 0, y: 0, ...this.size };
    const f=this.forestBounds, x=Math.min(g.x,f?.x??g.x), y=Math.min(g.y,f?.y??g.y);
    return { x, y, w: Math.max(g.x+g.w,this.campusRight,f?f.x+f.w:0)-x, h:Math.max(g.y+g.h,this.campusHeight,f?f.y+f.h:0)-y };
  }

  cameraZoomBounds(this: World) {
    const g = this.cameraExtent(), box = this.sceneBox ??= this.scene.getBoundingClientRect();
    return { min: Math.max(Number.EPSILON, Math.min(box.width / g.w, box.height / g.h) * .75), max: 5 };
  }

  clampCam(this: World) {
    if (!this.grounds) return;
    const box = this.sceneBox ??= this.scene.getBoundingClientRect(), W = box.width, H = box.height;
    if (!W || !H) return;
    const c = this.cam, min = this.cameraZoomBounds().min;
    if (c.s < min) { const k = min / c.s; c.x = W / 2 - (W / 2 - c.x) * k; c.y = H / 2 - (H / 2 - c.y) * k; c.s = min; }
    const g = this.cameraExtent(), pad = Math.max(240, 100 / c.s);
    const fit = (t: number, size: number, lo: number, len: number) => len * c.s <= size ? (size - len * c.s) / 2 - lo * c.s : Math.min(-lo * c.s, Math.max(size - (lo + len) * c.s, t));
    c.x = fit(c.x, W, g.x - pad, g.w + 2 * pad);
    c.y = fit(c.y, H, g.y - pad, g.h + 2 * pad);
  }

  apply(this: World) {
    if (this.hostWorld) { this.recull(); return; }
    if (this.scene.inert || document.hidden) { this.presentationDirty = true; return; }
    const started = beginSystem();
    this.clampCam();
    this.root.style.transform = `translate(${this.cam.x}px, ${this.cam.y}px) scale(${this.cam.s})`;
    const labelDetail = this.cam.s < 1.15 ? "compact" : "full";
    if (this.root.dataset.labelDetail !== labelDetail) this.root.dataset.labelDetail = labelDetail;
    // While the camera moves, the GPU slides and scales one frozen picture of the world
    // (see .world.zooming). Zooming in magnifies it, so it is redrawn every 1.12x, too
    // small a step to see as a resolution change; shrinking stays crisp longer (1.6x).
    // It is redrawn once more when the camera settles.
    if (this.cam.s !== this.lastScale || this.cam.x !== this.lastX || this.cam.y !== this.lastY) {
      this.lastScale = this.cam.s; this.lastX = this.cam.x; this.lastY = this.cam.y;
      if (!this.zooming) { this.zooming = true; setCameraMoving(true); this.rasterScale = this.cam.s; this.root.classList.add("zooming"); }
      // A compositor glide is rasterized by Chromium at its sharpest scale up front.
      else if (this.glideAnim) this.rasterScale = this.cam.s;
      else if (!this.resharpen && (this.cam.s / this.rasterScale > 1.12 || this.rasterScale / this.cam.s > 1.6)) this.redrawSharp();
      window.clearTimeout(this.zoomEnd);
      this.cancelOutsideWarm();
      // Settle only once a compositor glide is over: redrawing the world mid-glide makes
      // Chromium re-raster everything while it animates, and unready tiles flash blank.
      const settle = () => {
        // a glide whose finish event was missed must not keep the camera "moving" forever
        if (this.glideAnim?.playState === "finished") this.endGlide(this.glideAnim);
        if (this.glideAnim) { this.zoomEnd = window.setTimeout(settle, 40); return; }
        this.zooming = false; setCameraMoving(false); this.redrawSharp(); this.scheduleOutsideWarm();
        syncRobotCanvases(this.cam.s);   // resharpen robot canvases for the zoom it settled at
      };
      this.zoomEnd = window.setTimeout(settle, 180);
    }
    // During a compositor glide everything between its start and end view is shown, so
    // culling, terrain, scenery and weather prepare that whole span at its sharpest scale.
    const realCam = this.cam, realBox = this.sceneBox;
    if (this.glideSpan) { this.cam = this.glideSpan.cam; this.sceneBox = this.glideSpan.box; }
    try { this.applyView(); } finally { this.cam = realCam; this.sceneBox = realBox; }
    const robotsOnCanvas = canvasRobotsWanted(this.cam.s);
    if (robotsOnCanvas !== this.canvasRobots) { this.canvasRobots = robotsOnCanvas; syncRobotCanvases(this.cam.s); }
    // small looping details (steam, swaying plants, birds) only move when you are close enough to see them
    const near = this.cam.s >= 1;
    if (near !== this.near) { this.near = near; this.scene.classList.toggle("near", near); }
    // Far overview traces showed compositor layer-building dominating paint.
    // These SVG actors keep their full artwork and motion; only the unnecessary
    // permanent promotion hint changes within the existing distant-view band.
    const overview = this.cam.s < .3;
    if (overview !== this.overviewLayers) { this.overviewLayers = overview; this.root.classList.toggle('overview', overview); }
    endSystem("camera", started);
  }

  /** Everything that follows the visible area (this.cam and this.sceneBox). */
  applyView(this: World) {
    this.recull();
    this.syncBuildings();
    setZoom(this.cam.s, this.cam.x, this.cam.y);
    const box = this.sceneBox ??= this.scene.getBoundingClientRect();
    // The footprint already proves every displayed pixel is behind opaque
    // office geometry. Keep the sharp ground cache parked until it is exposed;
    // drawing it underneath the floors can otherwise monopolize a pinch frame.
    if (!this.viewIndoors) updateOutside(this.root.querySelector(".outside-layer"), this.cam, box.width, box.height, 0, {x: box.left, y: box.top});
    else this.scheduleOutsideWarm();
    this.viewLandscape();
    updateStaticArt(this.cam,box.width,box.height,box.left,box.top);
    // the weather follows the camera without measuring the page (which is slow every frame)
    if (this.fx) { this.sceneBox ??= this.scene.getBoundingClientRect(); this.fx.setCamera(this.cam, this.sceneBox, this.size.w, this.viewIndoors ? this.size.h : undefined); }
  }

  /** Redraws the world at the current zoom. Chromium never re-rasterizes a promoted layer
   * (will-change: transform) when its scale changes, so robots promoted while zoomed out stay
   * pixelated when zoomed in. Dropping every promotion for one committed frame (.resharp)
   * makes Chromium paint them again at the current scale. */
  redrawSharp(this: World) {
    cancelAnimationFrame(this.resharpen);
    this.rasterScale = this.cam.s;
    this.root.classList.remove("zooming");
    this.root.classList.add("resharp");
    // Two frames: the class change must be committed once before promotion returns.
    this.resharpen = requestAnimationFrame(() => {
      this.resharpen = requestAnimationFrame(() => {
        this.resharpen = 0;
        this.root.classList.remove("resharp");
        if (this.zooming) this.root.classList.add("zooming");
      });
    });
  }

  fitTarget(this: World, rect: { x: number; y: number; w: number; h: number }, pad: number, W: number, H: number) {
    const s = Math.min((W - pad * 2) / rect.w, (H - pad * 2) / rect.h, 6);
    return { s, x: W / 2 - (rect.x + rect.w / 2) * s, y: H / 2 - (rect.y + rect.h / 2) * s };
  }

  fit(this: World, rect: { x: number; y: number; w: number; h: number }, pad: number, W: number, H: number) {
    Object.assign(this.cam, this.fitTarget(rect, pad, W, H));
  }

  flyTo(this: World, rect: { x: number; y: number; w: number; h: number }, pad = 40, d = 1, insetRight = 0) {
    const W = this.scene.clientWidth - insetRight, H = this.scene.clientHeight;
    if (!W || !H) return;
    this.stopFollow(); this.cancelCameraTween();
    this.frame = { rect, pad };
    this.cameraTween = gsap.to(this.cam, { ...this.fitTarget(rect, pad, W, H), duration: d, ease: "power3.inOut", onUpdate: () => this.apply() });
  }

  cameraState(this: World) { return { ...this.cam }; }

  restoreCamera(this: World, state: { x: number; y: number; s: number }) {
    this.stopCameraMotion(); Object.assign(this.cam, state); this.sceneBox = null;
    this.apply(); this.keepFocus();
  }
}
