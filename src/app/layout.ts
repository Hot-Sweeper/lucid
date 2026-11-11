// The columns: sidebar, office and chat widths, resize grips, folding sections and the sidebar rail.
import { gameSound } from "../office/sound";
import gsap from "gsap";
import { foldSection, setRail } from "../office/sidebar";
import { EdgePeek, paintPin } from "../office/edge-peek";
import { $ } from "./dom";
import type { App } from "./context";
const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const chatDefault = () => Math.round(Math.min(560, Math.max(400, innerWidth * 0.32)));
const SIDE = { min: 240, max: 560, def: 340, rail: 64 };
const SCENE_MIN = 380;
const CHAT = { min: 340, max: 760, tab: 64 };

export function mountLayout(app: App) {
  // --- folding the sidebar, its sections and the chat (remembered in settings.ui) ------------
  app.settings.ui ??= {};
  app.ui = app.settings.ui;
  app.folded = new Set((app.ui.folded ?? ["usage", "orch"]).filter(key => !["todo", "company", "managers"].includes(key)));
  app.appEl = $("app") as HTMLElement;
  // Panel widths: you drag the inner edge of the sidebar or the chat. Small windows shrink the chat first, then
  // the sidebar, so the office always keeps room.
  app.widths = () => {
    let side = app.ui.rail ? SIDE.rail : clampTo(app.ui.sideW ?? SIDE.def, SIDE.min, SIDE.max);
    let chatW = app.chat.collapsed ? CHAT.tab : clampTo(app.ui.chatW ?? chatDefault(), CHAT.min, CHAT.max);
    let over = side + chatW + SCENE_MIN - innerWidth;
    if (over > 0 && !app.chat.collapsed) { const cut = Math.min(over, chatW - CHAT.min); chatW -= cut; over -= cut; }
    if (over > 0 && !app.ui.rail) side -= Math.min(over, side - SIDE.min);
    return { side, chat: chatW };
  };
  app.chat.wide = () => app.widths().chat;
  app.applyLayout = () => {
    const w = app.widths();
    app.chat.finishShelf();
    if (!app.appEl.classList.contains("rail-moving")) app.appEl.style.setProperty("--side", `${w.side}px`);
    app.appEl.style.setProperty("--chat", `${w.chat}px`);
    app.appEl.classList.toggle("chat-folded", app.chat.collapsed);
    for (const [g, v, lo, hi] of [[app.sideGrip, w.side, SIDE.min, SIDE.max], [app.chatGrip, w.chat, CHAT.min, CHAT.max]] as const) {
      g.setAttribute("aria-valuenow", String(Math.round(v))); g.setAttribute("aria-valuemin", String(lo)); g.setAttribute("aria-valuemax", String(hi));
    }
  };
  // Commit the column once. The real shelf and camera glide together on the compositor.
  app.slideChat = (animate: boolean) => {
    const to = app.widths().chat;
    app.world.resizeForShelf(() => {
      app.appEl.classList.toggle("chat-folded", app.chat.collapsed);
      app.appEl.style.setProperty("--chat", `${to}px`);
      app.chatGrip.setAttribute("aria-valuenow", String(Math.round(to)));
    }, animate);
    if (animate) gameSound.play("switch");
  };
  // the draggable edges (highlighted only while grabbed; arrow keys and a double-click work too)
  app.makeGrip = (cls: "left" | "right", label: string, key: "sideW" | "chatW", range: { min: number; max: number }, def: () => number) => {
    const g = document.createElement("div");
    g.className = `grip ${cls}`;
    g.tabIndex = 0;
    g.setAttribute("role", "separator");
    g.setAttribute("aria-orientation", "vertical");
    g.setAttribute("aria-label", label);
    g.title = "Drag to resize. Double-click to reset.";
    app.appEl.appendChild(g);
    const dir = cls === "left" ? 1 : -1;
    const other = () => (cls === "left" ? app.widths().chat : app.widths().side);
    const set = (w: number) => {
      // never wider than leaves the office room
      const hi = Math.max(range.min, Math.min(range.max, innerWidth - SCENE_MIN - other()));
      app.ui[key] = Math.round(clampTo(w, range.min, hi));
      app.applyLayout();
    };
    const now = () => (cls === "left" ? app.widths().side : app.widths().chat);
    g.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      app.chat.finishShelf(); app.world.stopCameraMotion();
      e.preventDefault();
      try { g.setPointerCapture(e.pointerId); } catch { /* window listeners keep the resize usable */ }
      const x0 = e.clientX, w0 = now();
      g.classList.add("grabbing");
      document.body.classList.add("col-resizing");
      const move = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) set(w0 + dir * (ev.clientX - x0)); };
      let ended = false;
      const up = () => {
        if (ended) return;
        ended = true;
        g.classList.remove("grabbing");
        document.body.classList.remove("col-resizing");
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); window.removeEventListener("blur", up);
        window.removeEventListener("keydown", escape, true); g.removeEventListener("lostpointercapture", up);
        if (g.hasPointerCapture(e.pointerId)) g.releasePointerCapture(e.pointerId);
        app.saveSettings();
      };
      const escape = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); set(w0); up(); } };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up); window.addEventListener("blur", up);
      window.addEventListener("keydown", escape, true); g.addEventListener("lostpointercapture", up);
    });
    g.addEventListener("dblclick", () => { app.ui[key] = undefined; app.applyLayout(); app.saveSettings(); });
    g.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 96 : 24;
      const d = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      if (!d) return;
      e.preventDefault();
      set(now() + dir * d);
      app.saveSettings();
    });
    return g;
  };
  app.sideGrip = app.makeGrip("left", "Resize the sidebar", "sideW", SIDE, () => SIDE.def);
  app.chatGrip = app.makeGrip("right", "Resize the chat", "chatW", CHAT, chatDefault);
  window.addEventListener("resize", app.applyLayout);
  app.applyLayout();
  $("side-panel").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("[data-fold]") as HTMLElement | null;
    if (!b) return;
    const key = b.dataset.fold!, open = b.getAttribute("aria-expanded") !== "true";
    if (open) app.folded.delete(key); else app.folded.add(key);
    foldSection(key, open);
    app.ui.folded = [...app.folded];
    app.saveSettings();
  });
  for (const key of app.folded) foldSection(key, false, false);
  // Auto-hide: the sidebar stays folded into its rail and slides over the office while you hover
  // the left edge. The pin in its header switches between that and keeping it open.
  app.sidePanel = $("side-panel");
  app.sideOpenWidth = () => Math.min(clampTo(app.ui.sideW ?? SIDE.def, SIDE.min, SIDE.max), Math.max(SIDE.min, innerWidth - app.widths().chat - 120));
  app.sidePeek = new EdgePeek({
    side: "left",
    panel: app.sidePanel,
    edge: () => $("side-rail"),
    width: app.sideOpenWidth,
    reveal: () => { app.sidePanel.hidden = false; app.sidePanel.scrollTop = Number(app.sidePanel.dataset.scroll || 0); },
    conceal: () => { app.sidePanel.dataset.scroll = String(app.sidePanel.scrollTop); app.sidePanel.hidden = true; },
    busy: () => !!document.querySelector(".pop-menu, .dialog-wrap:not(.closing)") || document.body.classList.contains("th-dragging") || document.body.classList.contains("col-resizing"),
    onChange: (shown) => { $("rail-show").setAttribute("aria-expanded", String(shown)); $("side-hide").setAttribute("aria-expanded", String(shown)); },
  });
  app.paintSidePin = () => paintPin($("side-pin"), !app.ui.sideAuto, "sidebar", "left");
  app.setSideAuto = (on: boolean) => {
    if (on === !!app.ui.sideAuto) return;
    app.ui.sideAuto = on;
    app.appEl.classList.toggle("side-auto", on);
    app.paintSidePin();
    if (on) { if (!app.ui.rail) app.foldRail(true); app.sidePeek.setEnabled(true); return; }
    if (!app.sidePeek.shown) { app.sidePeek.setEnabled(false); app.foldRail(false); return; }
    // Pinned while it peeks: it holds still and the office makes room beside it.
    const to = app.sideOpenWidth();
    app.sidePeek.release(); app.sidePeek.setEnabled(false);
    app.ui.rail = false;
    $("side-rail").hidden = true; app.sidePanel.hidden = false; app.appEl.classList.remove("railed");
    $("side-hide").setAttribute("aria-expanded", "true"); $("rail-show").setAttribute("aria-expanded", "true");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { app.applyLayout(); return; }
    app.appEl.classList.add("rail-moving");
    gsap.fromTo(app.appEl, { "--side": `${SIDE.rail}px` }, { "--side": `${to}px`, duration: 0.3, ease: "power3.out", onComplete: () => { app.appEl.classList.remove("rail-moving"); app.applyLayout(); } });
  };
  app.toggleRail = (on: boolean, animate = true) => {
    if (app.ui.sideAuto) { if (on) app.sidePeek.hide(animate); else app.sidePeek.show(animate); return; }
    app.foldRail(on, animate);
  };
  app.foldRail = (on: boolean, animate = true) => {
    app.ui.rail = on;
    $("side-hide").setAttribute("aria-expanded", String(!on));
    $("rail-show").setAttribute("aria-expanded", String(!on));
    if (on) app.renderRail();
    const hadFocus = document.activeElement === $("side-hide") || document.activeElement === $("rail-show");
    app.appEl.classList.add("rail-moving");
    setRail(on, { app: app.appEl, panel: $("side-panel"), rail: $("side-rail"), animate, wide: () => app.widths().side, done: () => { app.appEl.classList.remove("rail-moving"); app.applyLayout(); if (hadFocus) $(on ? "rail-show" : "side-hide").focus(); } });
  };
  $("side-hide").addEventListener("click", () => { app.toggleRail(true); app.saveSettings(); });
  $("rail-show").addEventListener("click", () => { if (app.ui.sideAuto) app.sidePeek.toggle(); else app.toggleRail(false); app.saveSettings(); });
  $("side-pin").addEventListener("click", () => { app.setSideAuto(!app.ui.sideAuto); gameSound.play("clip"); app.saveSettings(); });
  app.paintSidePin();
}

export function restoreLayout(app: App) {
  app.chat.setCollapsed(true, false);
  app.applyLayout();
  app.chat.onCollapse = (on, animate) => { app.ui.chatTab = on; app.saveSettings(); app.slideChat(animate); };
  // While auto-hiding, the chat slides out at the width you gave it, leaving some office visible.
  app.chat.peekWidth = () => Math.min(clampTo(app.ui.chatW ?? chatDefault(), CHAT.min, CHAT.max), Math.max(CHAT.min, innerWidth - app.widths().side - 120));
  if (app.ui.chatAuto) app.chat.setAutoHide(true, false);
  app.chat.onAutoHide = (on) => { app.ui.chatAuto = on; app.appEl.classList.toggle("chat-auto", on); app.saveSettings(); };
  app.appEl.classList.toggle("chat-auto", !!app.ui.chatAuto);
}
