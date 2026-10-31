import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "../styles.css";
import "./office.css";
import "../world/world.css";
import { openCustomize } from "./customize";
import { openHire, BUILTIN_ROLES } from "./hire";
import { Roster } from "./roster";
import { randomLook, seeded } from "../world/look";

// Customize dialog test bench. URL params:
//   dialog=customize|hire     which dialog opens
//   tab=body|hat|face|extras  starting tab (customize)
//   view=back|front           preview side (customize)
//   level=0..10               company level (locks)
//   brand=claudeAgent|codex|grok|other
// Capture scripts read window.capShots.

const qs = new URLSearchParams(location.search);
const level = Number(qs.get("level") ?? 3);
document.body.style.background = "#141a33";
(window as any).capShots = [Number(qs.get("at") ?? 1800)];

if (qs.get("dialog") === "hire") {
  localStorage.clear();
  const roster = new Roster();
  roster.assign([{ id: "t1", provider: "claudeAgent" }, { id: "t2", provider: "codex" }, { id: "t3", provider: "grok" }, { id: "t4", provider: "claudeAgent" }], new Set(["t1", "t2", "t3", "t4"]), new Set());
  roster.robots.forEach((r, i) => (r.look = randomLook(seeded("hire" + i), 6)));
  openHire({
    room: "p:demo", roomTitle: "Lucid", seat: 2, team: roster.freeTeam(new Set(["t1", "t2", "t3", "t4"])), providers: ["codex", "claudeAgent"],
    models: { codex: ["gpt-5.5-codex", "gpt-5.5-codex-mini"], claudeAgent: ["claude-opus-5-5", "claude-sonnet-5-5"] }, roles: BUILTIN_ROLES,
    onNewRole: () => {}, projects: null, onHire: async () => {}, level,
  });
} else {
  const brand = qs.get("brand") || "claudeAgent";
  openCustomize({
    name: "Mochi", provider: brand, model: "claude-opus-5-5", level,
    look: { accent: "#4fb6ff", antennaTip: "star", hat: "beanie", accessory: "scarf", eyes: "round", tint: "warm", build: "regular", head: 1.05, sticker: "star" },
    onSave: (look, name) => console.log("saved", name, JSON.stringify(look)),
  });
  const tab = qs.get("tab");
  if (tab) (document.querySelector(`[data-tab="${tab}"]`) as HTMLElement | null)?.click();
  if (qs.get("view") === "front") (document.querySelector('[data-v="front"]') as HTMLElement | null)?.click();
}

// test=1 (with dialog=hire): drives the customize flow and prints the results on the page.
if (qs.get("test") === "1") {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  void (async () => {
    const out: Record<string, unknown> = {};
    await wait(400);
    (document.querySelector(".cand-edit") as HTMLElement).click();
    await wait(300);
    out.opened = !!document.querySelector(".cz-wrap");
    (document.querySelector('[data-tab="hat"]') as HTMLElement).click();
    (document.querySelector('[data-k="hat"][data-val="tophat"]') as HTMLElement).click();
    out.lockedCrown = (document.querySelector('[data-k="hat"][data-val="crown"]') as HTMLButtonElement).disabled;
    const name = document.querySelector(".cz-name input") as HTMLInputElement;
    name.value = "Tess"; name.dispatchEvent(new Event("input"));
    out.dirtyMsg = document.querySelector(".cz-msg")?.textContent;
    (document.querySelector(".cz form, form.cz") as HTMLFormElement).requestSubmit();
    await wait(400);
    const r = Roster.current!.robots.find((x) => x.name === "Tess");
    out.saved = r ? { hat: r.look.hat, name: r.name } : null;
    out.cardName = document.querySelector(".cand b")?.textContent;
    out.cardHasTophat = (document.querySelector(".cand svg")?.innerHTML ?? "").includes("#2a2e3b");
    (document.querySelector(".cand-edit") as HTMLElement).click();
    await wait(300);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wait(400);
    out.afterEsc = { customize: !!document.querySelector(".cz-wrap"), hire: !!document.querySelector(".hire-wrap") };
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wait(400);
    out.afterEsc2 = { hire: !!document.querySelector(".hire-wrap") };
    document.body.insertAdjacentHTML("beforeend", `<pre id="out" style="position:fixed;left:10px;top:10px;color:#fff;font:14px monospace;z-index:999">${JSON.stringify(out, null, 1)}</pre>`);
  })();
}
