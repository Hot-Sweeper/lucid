import gsap from "gsap";
import { GEOM, UNIT, type DeskRig, type Pt } from "../robot/rig";

// A stand-in desk for the demo: same geometry, keyboard layout and DeskRig behavior as the
// real desk in src/office/desk.ts, without the computer behind it.

const ROWS = ["1234567890-=", "qwertyuiop[]", "asdfghjkl;'\n", "zxcvbnm,./\u0001\u0002"];
const KEY_ALIASES: Record<string, string> = { Enter: "\n", ArrowLeft: "\u0001", ArrowDown: "\u0001", ArrowRight: "\u0002", ArrowUp: "\u0002", Backspace: "=", Tab: "q", Space: " " };

export class DemoDesk {
  el: HTMLElement;
  host: HTMLElement;
  rig: DeskRig;
  screen: HTMLElement;
  private keys = new Map<string, SVGRectElement>();
  private centers = new Map<string, Pt & { hand: "left" | "right" }>();

  constructor(parent: HTMLElement) {
    const el = document.createElement("div");
    el.className = "world-demo-desk";
    el.style.cssText = `width:${UNIT.w}px;height:${UNIT.h}px`;
    el.innerHTML = `${this.table()}
      <div class="world-demo-monitor" style="left:${GEOM.monitor.x}px;top:${GEOM.monitor.y}px;width:${GEOM.monitor.w}px;height:${GEOM.monitor.h}px"><div class="world-demo-screen" style="left:${GEOM.screen.x - GEOM.monitor.x}px;top:${GEOM.screen.y - GEOM.monitor.y}px;width:${GEOM.screen.w}px;height:${GEOM.screen.h}px"><div class="world-demo-code"></div></div></div>
      <div class="world-demo-robot"></div>
      <div class="world-demo-phone"><div class="world-demo-phone-screen"><i></i><i></i><i></i><i></i></div></div>`;
    parent.appendChild(el);
    this.el = el;
    this.host = el.querySelector(".world-demo-robot")!;
    this.screen = el.querySelector(".world-demo-code")!;
    for (const k of el.querySelectorAll<SVGRectElement>("[data-key]")) this.keys.set(k.dataset.key!, k);
    const held = el.querySelector(".world-demo-phone") as HTMLElement;
    gsap.set(held, { scale: 0.3, transformOrigin: "0 0" });
    const mouseG = el.querySelector("[data-d=mouse]") as SVGGElement;
    const mugG = el.querySelector("[data-d=mug]") as SVGGElement;
    const phoneG = el.querySelector("[data-d=phone]") as SVGGElement;
    const me = this;
    const { mouse, mug, phoneRest } = GEOM;
    const norm = (key: string) => KEY_ALIASES[key] ?? (key.length === 1 ? key.toLowerCase() : key);
    this.rig = {
      keyPos: (key) => me.centers.get(norm(key)) ?? me.centers.get(" ") ?? null,
      pressKey(key) {
        const k = me.keys.get(norm(key));
        if (!k) return;
        k.classList.add("down");
        setTimeout(() => k.classList.remove("down"), 110);
      },
      homeLeft: { ...this.centers.get("f")! },
      homeRight: { ...this.centers.get("j")! },
      mouse: { ...mouse },
      moveMouse(p, turn = 0) { mouseG.setAttribute("transform", `translate(${(p.x - mouse.x).toFixed(2)} ${(p.y - mouse.y).toFixed(2)}) rotate(${turn.toFixed(1)} ${mouse.x} ${mouse.y})`); },
      mug: { ...mug },
      moveMug(p, tilt = 0) {
        mugG.setAttribute("transform", p ? `translate(${(p.x - mug.x).toFixed(1)} ${(p.y - mug.y).toFixed(1)}) rotate(${tilt} ${mug.x} ${mug.y})` : "");
      },
      phoneRest: { ...phoneRest },
      showPhone(at, tilt = 0) {
        phoneG.style.opacity = at ? "0" : "1";
        held.classList.toggle("on", !!at);
        if (at) gsap.set(held, { x: at.x, y: at.y, rotation: tilt });
      },
    };
  }

  typeOnScreen(ch: string) {
    if (ch === "\n" || ch === "Enter") this.screen.textContent += "\n";
    else if (ch === "Backspace") this.screen.textContent = this.screen.textContent!.slice(0, -1);
    else this.screen.textContent += ch;
    const lines = this.screen.textContent!.split("\n");
    if (lines.length > 9) this.screen.textContent = lines.slice(-9).join("\n");
  }

  private table() {
    const t = GEOM.table, kb = GEOM.keyboard, m = GEOM.mouse, mug = GEOM.mug, ph = GEOM.phoneRest, st = GEOM.stand;
    const rowH = (kb.h - 8) / 4, colW = kb.w / 12;
    const keys: string[] = [];
    ROWS.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const x = kb.x + c * colW + 1.2, y = kb.y + 2 + r * rowH + 0.8;
        this.centers.set(ch, { x: x + colW / 2 - 1.2, y: y + rowH / 2 - 0.8, hand: c < 6 ? "left" : "right" });
        keys.push(`<rect class="world-demo-key" data-key="${ch.replace(/"/g, "&quot;")}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(colW - 2.4).toFixed(1)}" height="${(rowH - 1.6).toFixed(1)}" rx="1.6"/>`);
      });
    });
    const sy = kb.y + 2 + 4 * rowH + 0.6;
    this.centers.set(" ", { x: kb.x + kb.w / 2, y: sy + 2.5, hand: "right" });
    keys.push(`<rect class="world-demo-key" data-key=" " x="${kb.x + colW * 3}" y="${sy}" width="${colW * 6}" height="5" rx="2"/>`);
    return /* svg */ `
    <svg class="world-demo-table" viewBox="0 0 ${UNIT.w} ${UNIT.h}" style="width:${UNIT.w}px;height:${UNIT.h}px" aria-hidden="true">
      <ellipse cx="${t.x + t.w / 2}" cy="${t.y + t.h + t.front + 8}" rx="${t.w / 2 + 6}" ry="12" fill="#2b1d10" opacity="0.18"/>
      <rect x="${t.x}" y="${t.y + t.h - 4}" width="${t.w}" height="${t.front + 4}" rx="6" fill="#b48a5e"/>
      <rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="8" fill="#d7b48a"/>
      <rect x="${t.x + 6}" y="${t.y + 4}" width="${t.w - 12}" height="3" rx="1.5" fill="#fff" opacity="0.25"/>
      <ellipse cx="${st.x}" cy="${st.base}" rx="30" ry="9" fill="#4a5063"/>
      <ellipse cx="${st.x}" cy="${st.base - 2}" rx="24" ry="6" fill="#5a6177"/>
      <rect x="${st.x - 7}" y="${st.top}" width="14" height="${st.base - st.top - 2}" fill="#3a3f4f"/>
      <g><rect x="38" y="172" width="58" height="40" rx="3" fill="#f4f1ea" transform="rotate(-6 67 192)"/><rect x="46" y="176" width="58" height="40" rx="3" fill="#fbf9f4" transform="rotate(4 75 196)"/></g>
      <rect x="${kb.x - 5}" y="${kb.y - 3}" width="${kb.w + 10}" height="${kb.h + 7}" rx="7" fill="#2e3242"/>
      <g>${keys.join("")}</g>
      <rect x="${m.x - 24}" y="${m.y - 22}" width="48" height="44" rx="10" fill="#4a5063" opacity="0.55"/>
      <g data-d="mouse"><ellipse cx="${m.x}" cy="${m.y}" rx="9" ry="12" fill="#2e3242"/><ellipse cx="${m.x}" cy="${m.y - 3}" rx="6" ry="7" fill="#4a5063"/><rect x="${m.x - 0.75}" y="${m.y - 11}" width="1.5" height="6" fill="#2e3242"/></g>
      <g data-d="phone"><rect x="${ph.x - 11}" y="${ph.y - 19}" width="22" height="38" rx="5" fill="#22263a"/><rect x="${ph.x - 9}" y="${ph.y - 16}" width="18" height="32" rx="3" fill="#353b58"/></g>
      <g data-d="mug">
        <ellipse cx="${mug.x + 3}" cy="${mug.y + 6}" rx="13" ry="5" fill="#2b1d10" opacity="0.2"/>
        <path d="M${mug.x + 9} ${mug.y - 4} q8 0 8 6 q0 6 -8 6" stroke="#e8673c" stroke-width="3.5" fill="none"/>
        <rect x="${mug.x - 10}" y="${mug.y - 12}" width="20" height="20" rx="5" fill="#ff8a65"/>
        <ellipse cx="${mug.x}" cy="${mug.y - 11}" rx="9" ry="4" fill="#5a2b1e"/>
      </g>
    </svg>`;
  }
}
