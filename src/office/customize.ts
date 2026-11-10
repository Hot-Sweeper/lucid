import gsap from "gsap";
import { GEOM, UNIT, type DeskRig, type Pt, type RobotLook, type SeatedRobot } from "./rig";
import { brandFor, harnessName } from "./brand";
import type { Roster, RobotProfile } from "./roster";
import { TopDownRobot } from "../world/seated";
import { PALETTES } from "../world/seated-parts";
import {
  ACCENTS, ACCESSORIES, ANTENNA_TIPS, BUILDS, COLOR_NAMES, EYES, GLOWS, HATS, HEAD_SIZES, randomLook, resolveLook, STICKERS, stickerSvg, TINTS,
  portraitSvg, tintPalette, type View,
} from "../world/look";

// The customize dialog: a live preview of the robot at a little desk, plus every look option.
// Opened from a desk's right-click menu (openCustomizeFor) and from the hiring screen (openCustomize).

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
type Tab = "body" | "hat" | "face" | "extras";
const TABS: [Tab, string][] = [["body", "Body"], ["hat", "Hat"], ["face", "Face"], ["extras", "Extras"]];

export type CustomizeOptions = {
  name: string;
  provider: string;
  look: RobotLook;
  level?: number;                       // company level: rare items unlock with it
  model?: string | null;                // printed on the preview's back plate
  onSave: (look: RobotLook, name: string) => void | Promise<void>;
  /** Shown in an empty name field; with it the name may stay empty (a fresh hire gets a random name). */
  namePlaceholder?: string;
};

/** The company level saved in the app settings (the hiring screen is opened without it). */
export function savedLevel() {
  try { return Number(JSON.parse((window as any).lucid?.settingsLoad?.() || "{}").level) || 0; } catch { return 0; }
}

/** Customize the robot sitting at a desk: saves to the roster and updates the desk robot right away. */
export function openCustomizeFor(desk: { profile: RobotProfile | null; robot: SeatedRobot; threadId?: string | null; info?: object | null }, roster: Roster, level = 0) {
  const profile = desk.profile ?? (desk.threadId ? roster.byThread(desk.threadId) : null);
  if (!profile) return;
  openCustomize({
    name: profile.name, provider: profile.provider, look: profile.look, level, model: (desk.info as { model?: string | null } | null | undefined)?.model ?? null,
    onSave: async (look, name) => {
      roster.rename(profile.id, name);
      roster.setLook(profile.id, look);
      const { headphones: _keep, ...rest } = profile.look;   // music decides the headphones, not the dialog
      desk.robot.setLook?.(rest);
    },
  });
}

export function openCustomize(o: CustomizeOptions) {
  const level = o.level ?? 0;
  const brand = brandFor(o.provider), base = PALETTES[brand];
  let look: RobotLook = { ...resolveLook(o.look) };
  delete look.headphones;
  if (!look.accent) look.accent = ACCENTS[0];
  const baseline = JSON.stringify(look);
  let tab: Tab = "body", view: View = "back", phones = false;
  const before = document.activeElement as HTMLElement | null;

  const wrap = document.createElement("div");
  wrap.className = "dialog-wrap cz-wrap";
  wrap.innerHTML = `
    <form class="dialog cz" role="dialog" aria-modal="true" aria-labelledby="cz-title">
      <div class="cz-left">
        <div class="cz-stage"><div class="cz-scene" style="transform:translate(${-VIEW_BOX.x * ZOOM}px, ${-VIEW_BOX.y * ZOOM}px) scale(${ZOOM})">${sceneSvg()}<div class="robot-host"></div></div></div>
        <div class="chips cz-view" role="radiogroup" aria-label="Preview side">
          <button type="button" role="radio" aria-checked="true" data-v="back">Back</button>
          <button type="button" role="radio" aria-checked="false" data-v="front">Front</button>
          <button type="button" role="switch" aria-checked="false" class="cz-phones">Headphones</button>
        </div>
      </div>
      <div class="cz-right">
        <h2 id="cz-title">Customize robot</h2>
        <label class="cz-name"><span class="hire-label">Name</span><input type="text" maxlength="32" value="${esc(o.name)}" placeholder="${esc(o.namePlaceholder ?? "")}" spellcheck="false"></label>
        <div class="chips cz-tabs" role="tablist" aria-label="Options">${TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === tab}" aria-controls="cz-panel" data-tab="${k}">${l}</button>`).join("")}</div>
        <div class="cz-panel" id="cz-panel" role="tabpanel"></div>
        <div class="dialog-actions cz-actions">
          <button type="button" class="ghost" data-a="random">Randomize</button>
          <span class="cz-msg" role="status"></span>
          <button type="button" class="ghost" data-a="cancel">Cancel</button>
          <button type="submit" class="primary">Save</button>
        </div>
      </div>
    </form>`;
  document.body.appendChild(wrap);
  const form = wrap.querySelector("form") as HTMLFormElement;
  const panel = form.querySelector(".cz-panel") as HTMLElement;
  const msg = form.querySelector(".cz-msg") as HTMLElement;
  const nameIn = form.querySelector(".cz-name input") as HTMLInputElement;

  // ---- live preview ----
  const scene = form.querySelector(".cz-scene") as HTMLElement;
  const robot = new TopDownRobot(scene.querySelector(".robot-host") as HTMLElement, previewDesk(scene));
  robot.setBrand(o.provider);
  robot.setModel(o.model ?? null);
  robot.setLook({ ...look, headphones: false });
  robot.setPose("type");
  robot.setTyping(true);

  const setView = (v: View) => {
    view = v;
    form.querySelectorAll<HTMLElement>(".cz-view [data-v]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === v)));
    if (v === "front") robot.setPose("ask");
    else { robot.setPose("type"); robot.setTyping(true); }
    render();
  };
  form.querySelector(".cz-view")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button") as HTMLElement | null;
    if (!b) return;
    if (b.classList.contains("cz-phones")) { phones = !phones; b.setAttribute("aria-checked", String(phones)); robot.setHeadphones?.(phones); robot.setGroove?.(phones ? 108 : 0); return; }
    if (b.dataset.v) setView(b.dataset.v as View);
  });
  form.querySelector(".cz-stage")!.addEventListener("click", () => robot.react(view === "front" ? "laugh" : "cheer"));

  // ---- options ----
  const dirty = () => JSON.stringify(look) !== baseline || nameIn.value.trim() !== o.name;
  const update = (patch: Partial<RobotLook>) => {
    look = { ...look, ...patch };
    robot.setLook({ ...look, headphones: phones });
    render();
  };
  const locked = (unlock?: number) => (unlock ?? 0) > level;
  const lockTag = (unlock?: number) => (locked(unlock) ? `<small class="cz-lock">Level ${unlock}</small>` : "");
  const tile = (key: string, value: string, label: string, art: string, selected: boolean, unlock?: number) =>
    `<button type="button" role="radio" class="cz-tile" aria-checked="${selected}" data-k="${key}" data-val="${esc(value)}" ${locked(unlock) ? `disabled aria-label="${esc(label)}, unlocks at company level ${unlock}"` : ""}>${art}<b>${esc(label)}</b>${lockTag(unlock)}</button>`;
  const row = (label: string, body: string, value = "") => `<div class="cz-row"><span class="hire-label">${label}${value ? ` <i class="cz-val">${esc(value)}</i>` : ""}</span>${body}</div>`;
  const named = (c: string) => COLOR_NAMES[c.toLowerCase()] ?? "Custom";
  const chips = (key: string, items: { id: string; label: string; unlock?: number }[], cur: string) =>
    `<div class="chips" role="radiogroup" aria-label="${key}">${items.map((i) => `<button type="button" role="radio" aria-checked="${i.id === cur}" data-k="${key}" data-val="${i.id}" ${locked(i.unlock) ? "disabled" : ""}>${esc(i.label)}${lockTag(i.unlock)}</button>`).join("")}</div>`;
  const swatches = (key: string, items: { val: string; color: string; label: string }[], cur: string) =>
    `<div class="cz-sw" role="radiogroup" aria-label="${key}">${items.map((i) => `<button type="button" role="radio" aria-checked="${i.val === cur}" data-k="${key}" data-val="${esc(i.val)}" aria-label="${esc(i.label)}"><span style="background:${i.color}"></span></button>`).join("")}</div>`;
  const pal = base;
  const portrait = (l: RobotLook, bust = false, v: View = "front") => portraitSvg({ ...look, ...l }, pal, { size: bust ? 74 : 58, bust, view: v, cls: "cz-art" });

  function render() {
    const L = resolveLook(look);
    let html = "";
    if (tab === "body") {
      const hsIdx = HEAD_SIZES.indexOf(L.head) >= 0 ? HEAD_SIZES.indexOf(L.head) : 2;
      html = row("Build", chips("build", BUILDS, L.build)) +
        row("Head size", `<div class="cz-range"><input type="range" min="0" max="${HEAD_SIZES.length - 1}" step="1" value="${hsIdx}" data-k="head" aria-label="Head size" aria-valuetext="${Math.round(L.head * 100)} percent"><output>${Math.round(L.head * 100)}%</output></div>`) +
        row("Shell tint", swatches("tint", TINTS.map((t) => ({ val: t.id, color: tintPalette(base, t.id).shell, label: t.label })), L.tint) + `<small class="cz-note">A slight shift of the ${esc(harnessName(o.provider))} shell</small>`, TINTS.find((t) => t.id === L.tint)?.label) +
        row("Trim and fabric", swatches("accent", ACCENTS.map((c) => ({ val: c, color: c, label: named(c) })), L.accent ?? ACCENTS[0]), named(L.accent ?? ACCENTS[0]));
    } else if (tab === "hat") {
      html = `<div class="cz-tiles" role="radiogroup" aria-label="Hat">${HATS.map((h) => tile("hat", h.id, h.label, portrait({ hat: h.id }), h.id === L.hat, h.unlock)).join("")}</div>`;
    } else if (tab === "face") {
      html = row("Eyes", `<div class="cz-tiles" role="radiogroup" aria-label="Eyes">${EYES.map((e) => tile("eyes", e.id, e.label, portrait({ eyes: e.id, hat: "none" }), e.id === L.eyes, e.unlock)).join("")}</div>`) +
        row("Glow", swatches("glow", [{ val: "", color: base.glow, label: `${harnessName(o.provider)} glow` }, ...GLOWS.filter((g) => g.toLowerCase() !== base.glow.toLowerCase()).map((g) => ({ val: g, color: g, label: named(g) }))], L.glow ?? ""), L.glow ? named(L.glow) : `${harnessName(o.provider)} glow`) +
        row("Antenna tip", chips("antennaTip", ANTENNA_TIPS, L.antennaTip)) +
        row("Cheeks", `<div class="chips" role="radiogroup" aria-label="Cheeks"><button type="button" role="radio" aria-checked="${!L.blush}" data-k="blush" data-val="">Plain</button><button type="button" role="radio" aria-checked="${L.blush}" data-k="blush" data-val="1">Blush</button></div>`);
    } else {
      html = row("Accessory", `<div class="cz-tiles wide" role="radiogroup" aria-label="Accessory">${ACCESSORIES.map((a) => tile("accessory", a.id, a.label, portrait({ accessory: a.id, hat: "none" }, true, a.covers ? "back" : "front"), a.id === L.accessory, a.unlock)).join("")}</div>`) +
        row("Sticker", `<div class="cz-tiles small" role="radiogroup" aria-label="Sticker">${STICKERS.map((s) => tile("sticker", s.id, s.label, `<svg class="cz-art" viewBox="-20 -20 40 40" width="34" height="34" aria-hidden="true">${s.id === "none" ? `<circle r="11" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="3 3"/>` : stickerSvg(s.id)}</svg>`, s.id === L.sticker, s.unlock)).join("")}</div>`);
    }
    // re-rendering replaces the buttons: keep the scroll position and the keyboard focus
    const scroll = panel.scrollTop, fe = document.activeElement as HTMLElement | null;
    const fk = fe && panel.contains(fe) ? fe.dataset.k : undefined, fv = fe?.dataset.val;
    panel.innerHTML = html;
    panel.scrollTop = scroll;
    if (fk) (panel.querySelector<HTMLElement>(fv !== undefined ? `[data-k="${fk}"][data-val="${CSS.escape(fv)}"]` : `[data-k="${fk}"]`))?.focus({ preventScroll: true });
    msg.textContent = dirty() ? "Unsaved changes" : "";
  }

  panel.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button[data-k]") as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    const k = b.dataset.k!, v = b.dataset.val ?? "";
    if (k === "blush") update({ blush: v === "1" });
    else if (k === "glow") update({ glow: v || null });
    else update({ [k]: v } as Partial<RobotLook>);
    // the robot shows off the new hat or accessory from the side where you can see it
    if (k === "accessory" && ACCESSORIES.find((a) => a.id === v)?.covers && view === "front") setView("back");
  });
  panel.addEventListener("input", (e) => {
    const r = e.target as HTMLInputElement;
    if (r.dataset.k === "head") update({ head: HEAD_SIZES[Number(r.value)] });
  });
  nameIn.addEventListener("input", () => { msg.textContent = dirty() ? "Unsaved changes" : ""; });

  const tabs = form.querySelector(".cz-tabs") as HTMLElement;
  const pickTab = (t: Tab, focus = false) => {
    tab = t;
    tabs.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => { b.setAttribute("aria-selected", String(b.dataset.tab === t)); b.tabIndex = b.dataset.tab === t ? 0 : -1; if (focus && b.dataset.tab === t) b.focus(); });
    panel.scrollTop = 0;
    render();
    if (t === "face" && view === "back") setView("front");
  };
  tabs.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("[data-tab]") as HTMLElement | null; if (b) pickTab(b.dataset.tab as Tab); });
  tabs.addEventListener("keydown", (e) => {
    const i = TABS.findIndex(([k]) => k === tab);
    if (e.key === "ArrowRight") { e.preventDefault(); pickTab(TABS[(i + 1) % TABS.length][0], true); }
    if (e.key === "ArrowLeft") { e.preventDefault(); pickTab(TABS[(i + TABS.length - 1) % TABS.length][0], true); }
  });

  form.querySelector('[data-a="random"]')!.addEventListener("click", () => {
    const r = randomLook(Math.random, level);
    delete r.headphones;
    look = { ...look, ...r };
    robot.setLook({ ...look, headphones: phones });
    robot.react("surprised");
    render();
  });

  // ---- closing ----
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener("keydown", onKey, true);
    gsap.to(wrap, { opacity: 0, duration: 0.15, onComplete: () => { robot.destroy(); wrap.remove(); before?.focus?.(); } });
  };
  // Escape closes only the topmost dialog (this one can sit over the hiring screen).
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || [...document.querySelectorAll(".dialog-wrap")].pop() !== wrap) return;
    e.stopImmediatePropagation();
    close();
  };
  window.addEventListener("keydown", onKey, true);
  wrap.addEventListener("click", (e) => { if (e.target === wrap || (e.target as HTMLElement).closest('[data-a="cancel"]')) close(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameIn.value.trim();
    if (!name && o.namePlaceholder === undefined) { msg.textContent = "Give it a name first."; nameIn.focus(); return; }
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    try {
      const out: RobotLook = { ...look };
      delete out.headphones;
      await o.onSave(out, name);
      close();
    } catch (err: any) {
      msg.textContent = `Could not save: ${err?.message || err}. Your changes are still here.`;
      btn.disabled = false;
    }
  });

  render();
  gsap.fromTo(form, { opacity: 0, y: 14, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(1.6)" });
  nameIn.focus();
  nameIn.select();
  return { close };
}

// ---- the preview desk ----------------------------------------------------------------------
// The preview shows desk-unit x 93..307 and y 158..381: the front edge of a desk with a keyboard,
// the robot on its chair and a bit of floor.
const VIEW_BOX = { x: 93, y: 158, w: 214, h: 223 };
const ZOOM = 1.4;                        // the stage is 300 x 312 px
const KB_ROWS = ["1234567890-=", "qwertyuiop[]", "asdfghjkl;'\n", "zxcvbnm,./  "];

function keyCenters() {
  const kb = GEOM.keyboard, rowH = (kb.h - 8) / 4, colW = kb.w / 12;
  const out = new Map<string, Pt & { hand: "left" | "right" }>();
  KB_ROWS.forEach((row, r) => [...row].forEach((ch, c) => out.set(ch, { x: kb.x + c * colW + colW / 2, y: kb.y + 2 + r * rowH + rowH / 2, hand: c < 6 ? "left" : "right" })));
  out.set(" ", { x: kb.x + kb.w / 2, y: kb.y + kb.h - 3, hand: "right" });
  return out;
}

function previewDesk(scene: HTMLElement): DeskRig {
  const keys = keyCenters();
  const alias: Record<string, string> = { Enter: "\n", Backspace: "=", Tab: "q" };
  const keyEls = scene.querySelectorAll<SVGRectElement>(".cz-key");
  return {
    keyPos: (k) => keys.get(alias[k] ?? (k.length === 1 ? k.toLowerCase() : k)) ?? keys.get(" ")!,
    pressKey: (k) => {
      const c = keys.get(alias[k] ?? (k.length === 1 ? k.toLowerCase() : k));
      if (!c) return;
      const kb = GEOM.keyboard, i = Math.floor(((c.x - kb.x) / kb.w) * 12) + Math.floor(((c.y - kb.y - 2) / ((kb.h - 8) / 4))) * 12;
      const el = keyEls[i];
      if (el) { el.classList.add("down"); window.setTimeout(() => el.classList.remove("down"), 110); }
    },
    homeLeft: { ...keys.get("f")! },
    homeRight: { ...keys.get("j")! },
    mouse: { ...GEOM.mouse }, moveMouse: () => {},
    mug: { ...GEOM.mug }, moveMug: () => {},
    phoneRest: { ...GEOM.phoneRest }, showPhone: () => {},
  };
}

function sceneSvg() {
  const t = GEOM.table, kb = GEOM.keyboard, rowH = (kb.h - 8) / 4, colW = kb.w / 12;
  const keys: string[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++)
    keys.push(`<rect class="cz-key" x="${(kb.x + c * colW + 1.2).toFixed(1)}" y="${(kb.y + 2 + r * rowH + 0.8).toFixed(1)}" width="${(colW - 2.4).toFixed(1)}" height="${(rowH - 1.6).toFixed(1)}" rx="1.6"/>`);
  const planks = Array.from({ length: 8 }, (_, i) => `<rect x="0" y="${t.y + t.h + t.front + 14 + i * 26}" width="${UNIT.w}" height="1.5" fill="#a87c52" opacity="0.5"/>`).join("");
  return `<svg class="cz-desk" viewBox="0 0 ${UNIT.w} ${UNIT.h + 30}" aria-hidden="true">
    <rect width="${UNIT.w}" height="${UNIT.h + 30}" fill="#c49a6c"/>${planks}
    <ellipse cx="${t.x + t.w / 2}" cy="${t.y + t.h + t.front + 8}" rx="${t.w / 2 + 6}" ry="12" fill="#2b1d10" opacity="0.18"/>
    <rect x="${t.x}" y="${t.y + t.h - 4}" width="${t.w}" height="${t.front + 4}" rx="6" fill="#b48a5e"/>
    <rect x="${t.x}" y="${t.y - 40}" width="${t.w}" height="${t.h + 40}" rx="8" fill="#d7b48a"/>
    <rect x="${kb.x - 5}" y="${kb.y - 3}" width="${kb.w + 10}" height="${kb.h + 7}" rx="7" fill="#2e3242"/>${keys.join("")}
    <rect x="${GEOM.mouse.x - 24}" y="${GEOM.mouse.y - 22}" width="48" height="44" rx="10" fill="#4a5063" opacity="0.55"/>
    <ellipse cx="${GEOM.mouse.x}" cy="${GEOM.mouse.y}" rx="9" ry="12" fill="#2e3242"/><ellipse cx="${GEOM.mouse.x}" cy="${GEOM.mouse.y - 3}" rx="6" ry="7" fill="#4a5063"/>
  </svg>`;
}
