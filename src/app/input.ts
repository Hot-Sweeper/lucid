// Global input: the middle-click paste guard and keyboard shortcuts.
import { openShortcutHelp, isShortcutHelpOpen, typing } from "../office/shortcuts";
import { $ } from "./dom";
import type { App } from "./context";

export function installInput(app: App) {
  // Linux pastes the selection clipboard on a middle click. You pan the office with the middle
  // button, so that paste would land in the focused chat box. Only a middle click inside a text
  // field itself still pastes there.
  {
    let middleAt = -1e9, middleTarget: Node | null = null, keyPasteAt = -1e9;
    window.addEventListener("keydown", (e) => {
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") || (e.shiftKey && e.key === "Insert")) keyPasteAt = performance.now();
    }, true);
    const editable = (n: EventTarget | null) => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA)$/.test(n.tagName));
    for (const type of ["mousedown", "mouseup", "auxclick"] as const) window.addEventListener(type, (e) => {
      if (e.button !== 1) return;
      middleAt = performance.now(); middleTarget = e.target as Node;
      if (!editable(e.target)) e.preventDefault();
    }, true);
    window.addEventListener("paste", (e) => {
      if (performance.now() - middleAt > 800 || performance.now() - keyPasteAt < 300) return;
      const into = e.target as Node | null;
      if (into && middleTarget && (into === middleTarget || into.contains(middleTarget))) return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
  }
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const mod = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey, key = e.key.toLowerCase();
    if (mod && key === "b") { e.preventDefault(); if (app.ui.sideAuto) app.sidePeek.toggle(); else app.toggleRail(!app.ui.rail); app.saveSettings(); return; }
    // Shortcuts that open something stay quiet while another dialog has the keyboard.
    if (document.querySelector(".dialog-wrap:not(.closing), .pop-menu")) return;
    if (mod && key === "n") { e.preventDefault(); app.startNewTask(); return; }
    if (mod && key === "k") { e.preventDefault(); app.findThread(); return; }
    if (mod && key === "j") { e.preventDefault(); app.nextNeedingYou(); return; }
    if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e) && !isShortcutHelpOpen()) { e.preventDefault(); openShortcutHelp(); }
  });
  if (app.ui.sideAuto) { app.ui.sideAuto = false; app.foldRail(true, false); app.setSideAuto(true); }
  else if (app.ui.rail) app.toggleRail(true, false);
}
