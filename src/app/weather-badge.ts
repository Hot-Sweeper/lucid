// Real weather where you are, with a menu to pin a weather for a while.
import { esc, $ } from "./dom";
import type { App } from "./context";
const WX_NAME: Record<string, string> = { clear: "Clear", clouds: "Cloudy", rain: "Rain", drizzle: "Drizzle", snow: "Snow", storm: "Storm", fog: "Fog" };

/** Registers this module's functions on the app (before anything runs, like function hoisting). */
export function defineWeatherBadge(app: App) {
  app.weatherFix = function weatherFix(): string | null {
    const f = app.settings.weatherFix;
    return f && Date.now() - f.at < app.WX_FIX_MS ? f.kind : null;
  };

  app.showWeather = function showWeather() {
    const fix = app.weatherFix();
    const w = app.liveWeather && fix ? { ...app.liveWeather, kind: fix, rainSoonMin: undefined, manual: true } : app.liveWeather;
    app.world.setWeather(w);
    (window as any).__weatherNow = w;   // the robots' Weather app shows the real weather
    const el = $("wx");
    el.hidden = !w;
    if (w) {
      el.textContent = `${WX_NAME[w.kind] ?? w.kind}, ${Math.round(w.tempC)}°C`;
      const soon = w.rainSoonMin != null ? `, rain in about ${w.rainSoonMin} min` : "";
      el.title = `${w.place}: ${WX_NAME[w.kind] ?? w.kind}${soon}, ${w.tempC.toFixed(1)}°C, wind ${Math.round(w.windKmh)} km/h${w.manual ? " (set by you)" : ""}. Click if the sky looks different.`;
      el.classList.toggle("fixed", !!w.manual);
    }
  };

  app.weatherMenu = function weatherMenu() {
    document.querySelector(".wx-menu")?.remove();
    const btn = $("wx"), r = btn.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "wx-menu";
    menu.setAttribute("role", "menu");
    menu.style.cssText = `left:${r.left}px;top:${r.bottom + 6}px`;
    const fix = app.weatherFix();
    const opts: [string | null, string][] = [["rain", "It's raining"], ["snow", "It's snowing"], ["clouds", "It's dry"], ["clear", "It's sunny"], [null, "Use live weather"]];
    menu.innerHTML = `<p>What's the sky doing?</p>` + opts.map(([k, label]) => `<button type="button" role="menuitemradio" aria-checked="${k === fix}" data-k="${k ?? ""}">${label}</button>`).join("");
    document.body.appendChild(menu);
    const close = () => { menu.remove(); window.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", esc, true); };
    const away = (e: Event) => { if (!menu.contains(e.target as Node) && e.target !== btn) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); btn.focus(); } };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc, true);
    menu.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      app.settings.weatherFix = b.dataset.k ? { kind: b.dataset.k, at: Date.now() } : undefined;
      app.saveSettings();
      close();
      app.showWeather();
    });
    (menu.querySelector('[aria-checked="true"]') as HTMLElement ?? menu.querySelector("button"))?.focus();
  };

  app.pollWeather = async function pollWeather() {
    try {
      const r = await (window as any).lucid.weather();
      app.liveWeather = r?.weather ?? null;
      app.showWeather();
    } catch (err) { console.error("weather failed", err); }
  };
}

export function mountWeather(app: App) {
  // Real weather where you are: it rains, snows or storms over the office, and the season shows outside.
  // The weather service is sometimes behind the sky. You can tell the app what it is really doing;
  // the correction holds for two hours, then live weather takes over again.
  app.liveWeather = null;
  app.WX_FIX_MS = 2 * 60 * 60 * 1000;
  $("wx").addEventListener("click", () => document.querySelector(".wx-menu") ? document.querySelector(".wx-menu")!.remove() : app.weatherMenu());
  void app.pollWeather();
  setInterval(app.pollWeather, 10 * 60 * 1000);
}
