import gsap from "gsap";
import type { WM } from "./wm";

// Little glances people do: check the weather (the real weather where you are) and check the
// time on the clock in the corner of the screen.

type Weather = { kind: string; tempC: number; windKmh: number; place: string; sunrise?: string; sunset?: string } | null;
const NAME: Record<string, string> = { clear: "Clear", clouds: "Cloudy", rain: "Rain", drizzle: "Drizzle", snow: "Snow", storm: "Thunderstorm", fog: "Fog" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function icon(kind: string, size = 64) {
  const sun = `<circle cx="32" cy="30" r="13" fill="#ffd27a"/>${Array.from({ length: 8 }, (_, i) => `<rect x="31" y="6" width="2.6" height="7" rx="1.3" fill="#ffd27a" transform="rotate(${i * 45} 32 30)"/>`).join("")}`;
  const cloud = (dx = 0, dy = 0, c = "#e8ecff") => `<g transform="translate(${dx} ${dy})"><circle cx="24" cy="38" r="10" fill="${c}"/><circle cx="36" cy="33" r="13" fill="${c}"/><circle cx="46" cy="40" r="9" fill="${c}"/><rect x="16" y="38" width="38" height="11" rx="5.5" fill="${c}"/></g>`;
  const drops = (n: number) => Array.from({ length: n }, (_, i) => `<rect x="${20 + i * 9}" y="${52 + (i % 2) * 4}" width="2.6" height="7" rx="1.3" fill="#8fd6ff" transform="rotate(12 ${21 + i * 9} ${55})"/>`).join("");
  const flakes = Array.from({ length: 4 }, (_, i) => `<circle cx="${22 + i * 8}" cy="${55 + (i % 2) * 4}" r="2.2" fill="#fff"/>`).join("");
  const bolt = `<path d="M34 46 L28 56 L33 56 L30 64 L40 52 L35 52 L38 46 Z" fill="#ffd27a"/>`;
  const body = kind === "clear" ? sun
    : kind === "clouds" ? `${sun.replace(/32 30/g, "24 24").replace(/cx="32" cy="30"/, 'cx="24" cy="24"')}${cloud(2, 0)}`
    : kind === "rain" ? `${cloud(0, -4, "#c9d0ea")}${drops(4)}`
    : kind === "drizzle" ? `${cloud(0, -4, "#d6dcf2")}${drops(3)}`
    : kind === "snow" ? `${cloud(0, -4)}${flakes}`
    : kind === "storm" ? `${cloud(0, -6, "#9aa3c7")}${bolt}`
    : `${cloud(0, -2, "#c9d0ea")}<rect x="12" y="52" width="40" height="3" rx="1.5" fill="#c9d0ea" opacity="0.7"/><rect x="18" y="58" width="32" height="3" rx="1.5" fill="#c9d0ea" opacity="0.5"/>`;
  return `<svg viewBox="0 0 64 68" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}

export class WeatherApp {
  constructor(private wm: WM) {}

  async check() {
    const wm = this.wm, e = wm.epoch;
    const w: Weather = (window as any).__weatherNow ?? null;
    const win = await wm.open("weather", "Weather");
    const now = new Date();
    const kind = w?.kind ?? "clouds";
    const temp = w ? Math.round(w.tempC) : 12;
    // a plausible next few hours drifting from now
    const hours = Array.from({ length: 6 }, (_, i) => {
      const h = new Date(now.getTime() + (i + 1) * 3600e3);
      return { t: h.toLocaleTimeString([], { hour: "2-digit" }), c: temp + Math.round(Math.sin(i * 0.9 + now.getHours() / 4) * 2 - i * 0.3) };
    });
    const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
    win.body.innerHTML = `<div class="wx-app wx-${kind}">
      <div class="wx-now"><div>${icon(kind, 72)}</div><div><p class="wx-place">${esc(w?.place ?? "Outside")}</p><p class="wx-temp">${temp}°</p><p class="wx-kind">${esc(NAME[kind] ?? kind)}${w ? ` · wind ${Math.round(w.windKmh)} km/h` : ""}</p></div></div>
      <div class="wx-hours">${hours.map((h) => `<div><span>${h.t}</span>${icon(kind, 22)}<b>${h.c}°</b></div>`).join("")}</div>
      ${w?.sunrise ? `<p class="wx-sun">Sunrise ${time(w.sunrise)} · Sunset ${time(w.sunset)}</p>` : ""}
    </div>`;
    gsap.from(win.body.querySelectorAll(".wx-hours > div"), { opacity: 0, y: 6, duration: 0.3, stagger: 0.05 });
    wm.robot.setPose("read");
    await wm.pointAt(win.body.querySelector(".wx-hours")!, 0.2, 0.5, 400);
    await wm.moveTo(wm.pos(win.body.querySelector(".wx-hours")!, 0.85, 0.5).x, wm.pos(win.body.querySelector(".wx-hours")!, 0.85, 0.5).y, 1400);
    await wm.sleep(1800, e);
    return kind;
  }
}

/** Click the clock in the corner: a small calendar flyout with the time, then close it. */
export async function checkTime(wm: WM) {
  const e = wm.epoch;
  const clock = wm.root.querySelector(".os-clock") as HTMLElement | null;
  if (!clock) return;
  await wm.pointAt(clock, 0.5, 0.5, 420);
  await wm.click();
  const now = new Date();
  const fly = document.createElement("div");
  fly.className = "os-flyout";
  const first = new Date(now.getFullYear(), now.getMonth(), 1), days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  fly.innerHTML = `<p class="of-time">${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
    <p class="of-date">${now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</p>
    <div class="of-cal">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<i>${d}</i>`).join("")}${"<span></span>".repeat(lead)}${Array.from({ length: days }, (_, i) => `<span class="${i + 1 === now.getDate() ? "on" : ""}">${i + 1}</span>`).join("")}</div>`;
  wm.root.appendChild(fly);
  gsap.fromTo(fly, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.25 });
  const tick = window.setInterval(() => { (fly.querySelector(".of-time") as HTMLElement).textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }, 1000);
  try { await wm.sleep(2400, e); } finally {
    window.clearInterval(tick);
    gsap.to(fly, { opacity: 0, duration: 0.2, onComplete: () => fly.remove() });
  }
}
