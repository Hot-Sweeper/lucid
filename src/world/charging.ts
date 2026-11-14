import type { RoomExtension } from "../office/world";
import { Walker, type RobotLook, type Facing } from "../robot";
import { recovery, subscriptionBatteries, type Battery } from "../office/battery";
import { PAL, RoomStage, type Pt } from "./room";
import "./charging.css";

type Thread = { id: string; provider: string; title: string; name?: string | null; model?: string | null; look?: RobotLook; battery?: Battery; threadId?: string | null };
type Resident = { w: Walker; info: Thread; slot: number; leaving: boolean; generation: number; label: HTMLElement; meter: HTMLProgressElement; time: HTMLElement };
export const chargingSize = (count: number) => ({ w: 1500, h: Math.max(800, 230 + Math.ceil(Math.max(6, count) / 6) * 300) });

export class ChargingRoom implements RoomExtension {
  el: HTMLElement;
  onSelect: (id: string) => void = () => {};
  onExit?: (id: string, at: Pt, face: Facing) => boolean;
  onDeparture?: (id: string, walker: Walker) => void;
  private stage: RoomStage;
  private residents = new Map<string, Resident>();
  private entries = new Map<string, Pt>();
  private timer: number;
  private dead = false;
  private opened = false;
  private empty: HTMLElement;
  constructor(host: HTMLElement, readonly w: number, readonly h: number) {
    this.stage = new RoomStage(host, w, h, { wall: "#b9c0ba", trim: "#8b9790", floor: "#68736d", seam: "#526059", accent: PAL.mint },
      chargingWall(w), "world-charging", chargingFloor(w, h));
    this.el = this.stage.el;
    const capacity = Math.floor((h - 230) / 300) * 6;
    for (let slot = 0; slot < capacity; slot++) {
      const p = this.spot(slot);
      // The pedestal sits beside the robot, so its screen stays visible while
      // occupied. Its cable reaches the circular contact pad from behind.
      this.stage.prop(p.x - 68, p.y - 20, 136, 44, p.y - 3,
        `<ellipse cx="68" cy="26" rx="66" ry="17" fill="#283c32" opacity=".22"/><ellipse cx="68" cy="20" rx="62" ry="16" fill="#45564c"/><ellipse cx="68" cy="18" rx="52" ry="12" fill="#819b7e"/><path d="M35 16h12m42 0h12" stroke="#b8c9a4" stroke-width="3" stroke-linecap="round"/>`, "charging-pad");
      this.stage.prop(p.x - 92, p.y - 158, 142, 153, p.y - 25, chargingStation(), "charging-station");
    }
    // Equipment stays north of the docking routes or beside the clear center aisle.
    this.stage.prop(w / 2 - 139, 138, 278, 104, 240, powerCabinets(), "charging-power-bank");
    this.stage.prop(w / 2 - 100, h - 142, 68, 88, h - 54, serviceTrolley(), "charging-tool-trolley");
    this.stage.prop(w / 2 + 34, h - 129, 64, 68, h - 61, spareCells(), "charging-spare-cells");
    this.empty = document.createElement("p");
    this.empty.className = "charging-empty";
    this.empty.style.top = `${h - 210}px`;
    this.empty.textContent = "Robots recharge here when their subscription reaches a limit.";
    this.el.append(this.empty);
    this.timer = window.setInterval(() => this.paint(), 1000);
    document.addEventListener("visibilitychange", this.onVisible);
  }
  private onVisible = () => { if (!document.hidden) this.paint(); };
  private spot(slot: number) {
    const col = slot % 6;
    return { x: this.w / 2 + (col < 3 ? (col - 3) * 205 : (col - 2) * 205), y: 280 + Math.floor(slot / 6) * 300 };
  }
  private door() { return { x: this.w / 2, y: this.h - 50 }; }
  enterFrom(id: string, at: Pt) { this.entries.set(id, at); }
  setThreads(list: Thread[]) {
    const wanted = new Set(list.map(t => t.id));
    for (const [id, r] of this.residents) if (!wanted.has(id) && !r.leaving) { r.leaving = true; void this.leave(id, r); }
    for (const info of list) {
      const existing = this.residents.get(info.id);
      if (existing) {
        existing.info = info;
        if (existing.leaving) { existing.leaving = false; existing.generation++; existing.w.stop(); void this.dock(existing); }
        continue;
      }
      const taken = new Set([...this.residents.values()].map(r => r.slot));
      let slot = 0; while (taken.has(slot)) slot++;
      const w = new Walker(this.stage.layer, { ...info, name: info.name || undefined, model: info.model || undefined, scale: .42 });
      const threadId = info.threadId === undefined ? info.id : info.threadId;
      const label = document.createElement(threadId ? "button" : "div");
      if (threadId) label.setAttribute("type", "button");
      label.className = "charging-readout";
      const name = document.createElement("strong"), detail = document.createElement("span"), meter = document.createElement("progress"), time = document.createElement("span");
      name.textContent = info.name || info.title; detail.className = "charging-source"; time.className = "charging-time";
      meter.max = 1; meter.setAttribute("aria-label", "Subscription reset progress");
      label.append(name, detail, meter, time); label.addEventListener("click", e => { e.stopPropagation(); if (threadId) this.onSelect(threadId); });
      w.el.addEventListener("click", e => { e.stopPropagation(); if (threadId) this.onSelect(threadId); });
      const p = this.spot(slot); label.style.cssText = `left:${p.x - 94}px;top:${p.y + 26}px`;
      this.stage.layer.append(label);
      const r: Resident = { w, info, slot, leaving: false, generation: 0, label, meter, time };
      this.residents.set(info.id, r);
      const entry = this.entries.get(info.id); this.entries.delete(info.id);
      if (!entry && !this.opened) {
        w.setPos(p.x, p.y); w.face("down"); w.do("charge", { quota: true });
      } else {
        const start = entry || this.door();
        w.setPos(start.x, start.y); void this.dock(r);
      }
    }
    if (list.length) this.opened = true;
    this.empty.hidden = list.length > 0;
    this.paint();
  }
  private async dock(r: Resident) {
    const generation = ++r.generation, p = this.spot(r.slot);
    r.label.hidden = true;
    await r.w.walkPath([{ x: this.w / 2, y: r.w.y }, { x: this.w / 2, y: p.y + 55 }, { x: p.x, y: p.y + 55 }, p]);
    if (this.dead || r.leaving || r.generation !== generation) return;
    r.w.face("down"); r.w.do("charge", { quota: true }); r.label.hidden = false;
  }
  private async leave(id: string, r: Resident) {
    const generation = ++r.generation, p = this.spot(r.slot);
    r.label.hidden = true; r.w.calm();
    this.onDeparture?.(id, r.w);
    await r.w.walkPath([{ x: p.x, y: p.y + 55 }, { x: this.w / 2, y: p.y + 55 }, this.door()]);
    if (this.dead || !r.leaving || r.generation !== generation) return;
    // Remove ownership before the synchronous hall handoff can refresh residents.
    this.residents.delete(id); r.label.remove();
    this.onExit?.(id, { x: r.w.x, y: r.w.y }, r.w.facing); r.w.destroy();
  }
  private paint() {
    if (this.dead || document.hidden || this.el.closest(".culled")) return;
    for (const r of this.residents.values()) {
      const battery = r.info.battery || subscriptionBatteries.get(r.info.provider);
      const state = recovery(battery);
      // A banked reset credit can end the wait now (the resets button in a Limits header opens Use reset).
      const credits = battery.resetCredits ? `, ${battery.resetCredits} reset ${battery.resetCredits === 1 ? "credit" : "credits"} banked` : "";
      const source = `${battery.name}: ${battery.windows.map(w => w.label).join(", ")}${credits}`;
      const detail = r.label.querySelector(".charging-source")!;
      if (detail.textContent !== source) detail.textContent = source;
      if (r.time.textContent !== state.text) r.time.textContent = state.text;
      r.meter.hidden = state.progress === null;
      if (state.progress !== null) r.meter.value = state.progress;
      r.label.title = `${r.info.name || r.info.title}. ${source}. ${state.text}. Progress measures the wait for the subscription reset.`;
    }
  }
  destroy() {
    this.dead = true; clearInterval(this.timer); document.removeEventListener("visibilitychange", this.onVisible);
    for (const r of this.residents.values()) { r.w.destroy(); r.label.remove(); }
    this.residents.clear(); this.entries.clear(); this.stage.destroy();
  }
}

function chargingWall(w: number) {
  return `<path d="M340 40H${w - 360}q18 0 18 18v30M${w / 2} 40v64" fill="none" stroke="#697b70" stroke-width="13" stroke-linejoin="round"/>
    <path d="M340 37H${w - 360}q18 0 18 18v30M${w / 2 - 2} 40v64" fill="none" stroke="#d3d9ce" stroke-width="4"/>
    ${[390, 600, 930, 1110].filter(x => x < w - 365).map(x => `<rect x="${x}" y="30" width="7" height="20" rx="2" fill="#4b5b52"/>`).join("")}
    <rect x="48" y="35" width="267" height="49" rx="4" fill="#dce1d6"/><text x="68" y="68" font-family="var(--font)" font-size="26" font-weight="600" fill="#34463b">Charging room</text>
    <rect x="${w - 296}" y="27" width="124" height="66" rx="5" fill="#75867a"/><rect x="${w - 291}" y="31" width="114" height="56" rx="3" fill="#8e9e8f"/>
    ${[43, 52, 61, 70].map(y => `<path d="M${w - 277} ${y}h84" stroke="#4d6253" stroke-width="3" stroke-linecap="round"/>`).join("")}
    <rect x="${w - 128}" y="31" width="63" height="59" rx="4" fill="#4a5b50"/><rect x="${w - 121}" y="38" width="49" height="45" rx="2" fill="#c9bc77"/><path d="M${w - 95} 44l-12 19h12l-6 15 18-24h-12l5-10Z" fill="#3c483e"/>`;
}

function chargingFloor(w: number, h: number) {
  const seams: string[] = [], bolts: string[] = [];
  for (let x = 28; x < w; x += 180) {
    seams.push(`M${x} 110V${h - 16}`);
    for (let y = 124; y < h - 22; y += 180) bolts.push(`<circle cx="${x + 8}" cy="${y}" r="2" fill="#a4b2a4" opacity=".42"/>`);
  }
  for (let y = 116; y < h - 16; y += 180) seams.push(`M16 ${y}H${w - 16}`);
  return `<path d="${seams.join(" ")}" fill="none" stroke="#4f6255" stroke-width="2" opacity=".65"/>${bolts.join("")}
    <rect x="${w / 2 - 25}" y="126" width="50" height="${h - 158}" fill="#405e4a" opacity=".22"/>
    <path d="M${w / 2 - 22} 140V${h - 38}M${w / 2 + 22} 140V${h - 38}" stroke="#96a28a" stroke-width="2" opacity=".28"/>
    <path d="M${w / 2 - 76} 255V${h - 35}M${w / 2 + 76} 255V${h - 35}" fill="none" stroke="#c0ac70" stroke-width="3" stroke-dasharray="18 21" opacity=".7"/>
    ${[180, w - 294].map(x => `<rect x="${x}" y="${h - 74}" width="114" height="35" rx="3" fill="#44584a"/><path d="${Array.from({ length: 10 }, (_, i) => `M${x + 10 + i * 10} ${h - 68}v23`).join(" ")}" stroke="#263f2e" stroke-width="4"/>`).join("")}`;
}

function chargingStation() {
  return `<ellipse cx="42" cy="138" rx="32" ry="9" fill="#28352d" opacity=".24"/>
    <path d="M43 120v12q0 12 20 12h17q20 0 20-18" fill="none" stroke="#283e31" stroke-width="7" stroke-linecap="round"/>
    <path d="M43 121v11q0 9 20 9h17q17 0 17-15" fill="none" stroke="#647d69" stroke-width="2"/>
    <rect x="18" y="9" width="48" height="126" rx="13" fill="#37473f"/><rect x="18" y="5" width="48" height="123" rx="13" fill="#53645c"/>
    <path d="M27 13h29" stroke="#8a998e" stroke-width="4" stroke-linecap="round"/>
    <rect x="25" y="25" width="34" height="48" rx="5" fill="#152b23"/><path d="M44 31l-11 23h10l-5 16 16-26H43l1-13Z" fill="#6db99a"/>
    <rect x="23" y="82" width="38" height="17" rx="4" fill="#21372c"/><path d="M29 88h24" stroke="#10251c" stroke-width="3" stroke-linecap="round"/>
    <circle cx="42" cy="115" r="8" fill="#30483a"/><circle cx="42" cy="115" r="4" fill="#1e3428"/>
    <rect x="94" y="116" width="11" height="15" rx="3" fill="#bac4a6"/><path d="M97 115v-4m5 4v-4" stroke="#526957" stroke-width="3"/>
    <rect x="19" y="132" width="46" height="6" rx="2" fill="#b7a16a"/><path d="M26 132l-5 6m16-6l-5 6m16-6l-5 6m16-6l-5 6" stroke="#465344" stroke-width="4"/>`;
}

function powerCabinets() {
  return `<ellipse cx="139" cy="96" rx="136" ry="8" fill="#2b4333" opacity=".2"/>
    ${[8, 102, 196].map(x => `<rect x="${x}" y="5" width="78" height="91" rx="4" fill="#465f4d"/><rect x="${x}" y="2" width="78" height="86" rx="4" fill="#95a48e"/><rect x="${x + 6}" y="10" width="66" height="71" rx="2" fill="#7b907a"/>
      <path d="M${x + 12} 18h54m-54 6h54m-54 6h54" stroke="#536e56" stroke-width="3"/>
      <rect x="${x + 12}" y="43" width="25" height="22" rx="2" fill="#b8aa71"/><path d="M${x + 26} 45l-8 12h7l-3 7 10-14h-7l1-5Z" fill="#43543f"/><rect x="${x + 60}" y="47" width="4" height="17" rx="2" fill="#405c45"/>
      <rect x="${x + 12}" y="91" width="10" height="9" rx="2" fill="#3b5140"/><rect x="${x + 56}" y="91" width="10" height="9" rx="2" fill="#3b5140"/>`).join("")}`;
}

function serviceTrolley() {
  return `<ellipse cx="34" cy="80" rx="31" ry="7" fill="#263e2d" opacity=".2"/><circle cx="13" cy="78" r="6" fill="#2e4234"/><circle cx="55" cy="78" r="6" fill="#2e4234"/>
    <path d="M8 18v58h52V18" fill="none" stroke="#435d49" stroke-width="6"/><rect x="3" y="13" width="62" height="12" rx="3" fill="#a6ac87"/><rect x="9" y="31" width="49" height="34" rx="3" fill="#788969"/>
    <path d="M14 42h39m-39 12h39" stroke="#4d6951" stroke-width="2"/><path d="M28 37h12m-12 13h12" stroke="#c5c5a5" stroke-width="3" stroke-linecap="round"/>
    <path d="M16 12V6h19v6" fill="none" stroke="#465d44" stroke-width="4"/><path d="M46 9l7-5 4 5-7 5" fill="#b8aa79"/>`;
}

function spareCells() {
  return `<ellipse cx="32" cy="59" rx="30" ry="7" fill="#263e2d" opacity=".2"/><rect x="3" y="22" width="58" height="37" rx="4" fill="#4a6550"/><rect x="3" y="19" width="58" height="11" rx="3" fill="#8c9a78"/>
    ${[14, 29, 44].map(x => `<rect x="${x}" y="8" width="10" height="22" rx="3" fill="#b3b997"/><rect x="${x + 3}" y="5" width="4" height="5" rx="1" fill="#506b52"/><path d="M${x + 2} 19h6" stroke="#6c8e70" stroke-width="5"/>`).join("")}
    <path d="M11 40h42m-42 8h42" stroke="#72876a" stroke-width="2"/>`;
}
