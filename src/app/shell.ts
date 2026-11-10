// The page shell: the app's markup, the Office and settings panel (gear menu) and error capture for test runs.
import { icon as uiIcon } from "../ui/icons";
import { mountInterfaceThemeSetting } from "../interface-theme";
import { mountPerformancePanel } from "../office/performance";
import { mountLanguageSetting } from "../office/language";
import { Orchestrator } from "../office/orchestrator";
import { coinIcon } from "../office/wallet";
import { foldButton } from "../office/sidebar";
import { PIN_ICON } from "../office/edge-peek";
import { BRAND } from "../brand";
import { brandMark } from "../ui/brand-mark";
import { esc, $ } from "./dom";
import type { App } from "./context";

export function renderShell(app: App) {
  document.getElementById("app")!.innerHTML = `
    <aside class="panel" id="side-panel">
      <header class="brand"><span class="mark" aria-hidden="true">${brandMark()}</span><h1>${esc(BRAND.name)}</h1><button type="button" class="wx" id="wx" hidden aria-haspopup="menu"></button>
        <button class="update" id="update" type="button" title="Check for game updates">Check updates</button>
        <div class="brand-actions">
        <button type="button" class="ghost side-help side-settings" id="side-settings" aria-label="Office and settings" aria-expanded="false" title="Office and settings: rooms, language, staff wall, linked computers">${uiIcon("settings")}</button><button type="button" class="ghost side-help" id="side-help" aria-label="How ${esc(BRAND.name)} works" title="How ${esc(BRAND.name)} works and keyboard shortcuts (?)">${uiIcon("help")}</button><button type="button" class="side-pin pin-btn" id="side-pin" aria-pressed="true">${PIN_ICON}</button><button type="button" class="side-hide" id="side-hide" aria-expanded="true" aria-controls="side-panel" aria-label="Hide sidebar" title="Hide sidebar: it folds into a rail on the left (Ctrl+B)">${uiIcon("sidebarHide")}<span>Hide<span class="sh-more"> sidebar</span></span></button>
        </div>
      </header>

      <section class="wallet" id="wallet"><button type="button" class="wl-coins" id="wl-coins" aria-haspopup="dialog" aria-expanded="false" title="1 coin for every dollar of AI work at API prices. Open the coin ledger">${coinIcon(18)}<b id="wl-bal">0</b><span>coins</span></button></section>

      <section class="threads">
        <div class="th-head"><h3>Threads</h3><label class="th-search">${uiIcon("search", 14)}<input id="th-q" type="search" placeholder="Search" aria-label="Search threads"></label><button type="button" class="primary th-new-task" id="th-new-task" title="Start a new task (Ctrl+N)">${uiIcon("plus", 14)}Task</button><button type="button" class="ghost th-new-project" id="th-new-project" aria-label="New project" title="New project: create a folder or add one you have">${uiIcon("plus", 14)}Project</button>${foldButton("threads", "threads")}</div>
        <div class="fold-body" id="fold-threads"><ol class="th-list" id="th-list" aria-label="Threads. Drag one into the chat, or press R, to reference it"></ol></div>
      </section>

      <div id="environment-body"></div>
      <section class="rooms">
        <div class="sec-head"><h3>Rooms</h3>${foldButton("rooms", "rooms")}</div>
        <div class="fold-body" id="fold-rooms">
        <ul id="room-list" class="room-list"></ul>
        <div class="room-links"><button type="button" class="link-btn" id="overview">Whole building</button><button type="button" class="link-btn" id="park">The park</button></div>
        <div class="hidden-offices" id="hidden-offices" hidden></div>
        </div>
      </section>

      <section class="usage" id="usage">
        <div class="sec-head"><h3>Subscriptions</h3>${foldButton("subscriptions", "subscription usage")}</div>
        <div class="fold-body" id="fold-subscriptions"><div id="usage-body"></div></div>
      </section>

      <section class="orch" id="orch">
        <div class="sec-head"><h3>Orchestrator</h3>${foldButton("orch", "orchestrator")}</div>
        <div class="fold-body" id="fold-orch"><div id="orch-body"></div></div>
      </section>

    </aside>
    <nav class="side-rail" id="side-rail" aria-label="Folded sidebar" hidden>
      <button type="button" class="rail-show" id="rail-show" aria-expanded="false" aria-controls="side-panel" title="Show sidebar (Ctrl+B)">${uiIcon("sidebarShow")}<span>Show<br>sidebar</span></button>
      <button type="button" class="rail-coins" id="rail-coins" aria-haspopup="dialog" aria-expanded="false">${coinIcon(16)}<b id="rail-bal">0</b><span class="coin-label"> coins</span></button>
      <ol class="rail-list" id="rail-list" aria-label="Threads"></ol>
    </nav>
    <main class="scene" id="scene"></main>
    <section class="orch-power" aria-label="Global orchestrator controls">
      <label class="switch orch-power-switch"><span>Orchestrator</span><input type="checkbox" id="orch-power-toggle" role="switch" aria-label="Orchestrator enabled" disabled><span class="track" aria-hidden="true"><i></i></span><b id="orch-power-status">Off</b></label>
      <button type="button" class="link-btn" id="orch-power-attention" hidden></button>
      <button type="button" class="link-btn" id="orch-controls-open" aria-label="Orchestrator settings">Settings</button>
    </section>
    <div class="zoom-ui"><button type="button" id="back-btn" hidden>Back to the office</button><button type="button" id="coin-bank" class="coin-bank" aria-haspopup="dialog" aria-expanded="false">${coinIcon(18)}<b id="coin-bank-bal">0</b><span class="coin-label"> coins</span></button><button type="button" id="terrible-song" disabled>Mark song terrible</button><button type="button" id="game-sound" aria-pressed="true">Sound on</button></div>`;
}

export function mountOfficeSettings(app: App) {
  // Keep threads in front and put occasional office controls behind one disclosure.
  // Occasional office controls live in a settings panel behind the gear in the sidebar header.
  app.extras = document.createElement("div");
  app.extras.className = "office-settings";
  app.extras.hidden = true;
  app.extras.setAttribute("role", "dialog");
  app.extras.setAttribute("aria-label", "Office and settings");
  app.extras.innerHTML = '<header class="os-head"><h2>Office &amp; settings</h2><button type="button" class="ghost os-close" aria-label="Close">Close</button></header><div class="sidebar-extras-body"></div>';
  app.extrasBody = app.extras.querySelector<HTMLElement>(".sidebar-extras-body")!;
  mountLanguageSetting(app.extrasBody, () => app.dailyWriter);
  mountInterfaceThemeSetting(app.extrasBody);
  {
    const wall = document.createElement("button"); wall.type = "button"; wall.className = "link-btn extras-staff-wall"; wall.textContent = "Staff wall";
    wall.addEventListener("click", () => app.openWall()); app.extrasBody.appendChild(wall);
  }
  mountPerformancePanel(app.extrasBody);
  for (const selector of ["#environment-body", ".rooms", "#orch", "#wallet"]) {
    const section = document.querySelector(selector);
    if (section) app.extrasBody.appendChild(section);
  }
  document.body.appendChild(app.extras);
  $("side-panel").appendChild($("usage"));
  {
    const gear = $("side-settings");
    let previous: HTMLElement | null = null;
    const close = () => {
      if (app.extras.hidden) return;
      app.extras.hidden = true; gear.setAttribute("aria-expanded", "false");
      window.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onDown, true);
      previous?.focus({ preventScroll: true });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    const onDown = (e: PointerEvent) => { const t = e.target as Node; if (!app.extras.contains(t) && !gear.contains(t) && !(t as Element).closest?.(".pop-menu, .dialog-wrap")) close(); };
    gear.addEventListener("click", () => {
      if (!app.extras.hidden) { close(); return; }
      previous = document.activeElement as HTMLElement | null;
      const r = gear.getBoundingClientRect();
      app.extras.style.left = `${Math.round(r.left)}px`; app.extras.style.top = `${Math.round(r.bottom + 8)}px`;
      app.extras.hidden = false; gear.setAttribute("aria-expanded", "true");
      window.addEventListener("keydown", onKey, true); document.addEventListener("pointerdown", onDown, true);
      app.extras.querySelector<HTMLElement>(".os-close")!.focus();
    });
    app.extras.querySelector(".os-close")!.addEventListener("click", close);
  }
}

export function installErrorCapture(app: App) {
  // Dev aid: keep the last errors where a debug run can read them.
  (window as any).__errs = [];
  window.addEventListener("error", (e) => (window as any).__errs.push(String(e.message) + " @ " + String(e.error?.stack || "").split("\n").slice(1, 4).join(" < ")));
  app.origError = console.error.bind(console);
  console.error = (...a: any[]) => { (window as any).__errs.push(a.map(String).join(" ").slice(0, 300)); app.origError(...a); };
}
