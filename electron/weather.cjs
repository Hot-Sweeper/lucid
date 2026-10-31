// Current weather for wherever this computer is, from Open-Meteo (free, no key).
// The location comes from an IP lookup (ipwho.is, then ipapi.co), falling back to Berlin.
// Weather is cached for 20 minutes, the location for a day (in memory, and on disk when
// running inside Electron so a restart does not repeat the lookup).
//
// getWeather() never throws. It resolves to
//   { kind, tempC, windKmh, isDay, sunrise, sunset, place, observedAt, ... }
// or, when nothing could be fetched, to null; lastError() then says why. If a fetch fails but
// an earlier report is less than 3 hours old, that report comes back with stale: true and error.

const fs = require("node:fs");
const path = require("node:path");

const WEATHER_TTL = 10 * 60 * 1000;
const PLACE_TTL = 24 * 60 * 60 * 1000;
const STALE_OK = 3 * 60 * 60 * 1000;
const BERLIN = { lat: 52.52, lon: 13.405, place: "Berlin", source: "fallback" };

let electron = null;
try { const e = require("electron"); if (e && typeof e === "object") electron = e; } catch { /* plain node */ }

let placeCache = null;   // { lat, lon, place, source, at }
let weatherCache = null; // { data, at }
let inflight = null;
let lastErr = null;

function cacheFile() {
  try { if (electron?.app?.isReady()) return path.join(electron.app.getPath("userData"), "weather-place.json"); } catch { /* not ready */ }
  return null;
}

async function fetchJson(url, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const useNet = electron?.net?.fetch && electron.app?.isReady();
    const res = await (useNet ? electron.net.fetch(url, { signal: ctl.signal }) : fetch(url, { signal: ctl.signal, headers: { "user-agent": "Lucid/0.1" } }));
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error(`${new URL(url).host} timed out`);
    throw e;
  } finally { clearTimeout(timer); }
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function locate() {
  if (placeCache && Date.now() - placeCache.at < PLACE_TTL) return placeCache;
  const file = cacheFile();
  if (!placeCache && file) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      if (saved && Date.now() - saved.at < PLACE_TTL && num(saved.lat) != null) return (placeCache = saved);
    } catch { /* none yet */ }
  }
  const lookups = [
    async () => {
      const j = await fetchJson("https://ipwho.is/");
      if (j.success === false) throw new Error(`ipwho.is: ${j.message || "lookup failed"}`);
      return { lat: num(j.latitude), lon: num(j.longitude), place: [j.city, j.country_code].filter(Boolean).join(", ") };
    },
    async () => {
      const j = await fetchJson("https://ipapi.co/json/");
      if (j.error) throw new Error(`ipapi.co: ${j.reason || "lookup failed"}`);
      return { lat: num(j.latitude), lon: num(j.longitude), place: [j.city, j.country_code].filter(Boolean).join(", ") };
    },
  ];
  for (const look of lookups) {
    try {
      const p = await look();
      if (p.lat == null || p.lon == null) continue;
      placeCache = { ...p, place: p.place || "Here", source: "ip", at: Date.now() };
      if (file) { try { fs.writeFileSync(file, JSON.stringify(placeCache)); } catch { /* read-only */ } }
      return placeCache;
    } catch { /* try the next one */ }
  }
  // remember the fallback for an hour only, so a flaky network does not pin us to Berlin all day
  placeCache = { ...BERLIN, at: Date.now() - PLACE_TTL + 60 * 60 * 1000 };
  return placeCache;
}

// WMO weather interpretation codes, as used by Open-Meteo.
function kindFor(code) {
  if (code == null) return "clear";
  if (code <= 1) return "clear";
  if (code <= 3) return "clouds";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "clouds";
}

// Open-Meteo gives local wall-clock times plus the UTC offset; turn them into real instants.
function toIso(local, offsetSec) {
  if (typeof local !== "string") return null;
  const ms = Date.parse(local + "Z");
  return Number.isFinite(ms) ? new Date(ms - (offsetSec || 0) * 1000).toISOString() : null;
}

async function fetchWeather() {
  const p = await locate();
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${p.lat.toFixed(3)}&longitude=${p.lon.toFixed(3)}`
    + "&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day,cloud_cover,precipitation,snowfall"
    + "&minutely_15=precipitation,weather_code&past_minutely_15=1&forecast_minutely_15=4"
    + "&daily=sunrise,sunset&timezone=auto&forecast_days=1&wind_speed_unit=kmh";
  const j = await fetchJson(url);
  const c = j.current;
  if (!c || num(c.temperature_2m) == null) throw new Error("open-meteo: no current weather in the answer");
  const off = j.utc_offset_seconds || 0;
  const code = num(c.weather_code);
  // The "current" code often lags behind real rain. The 15-minute data is finer: any rain
  // measured now upgrades a dry code, and rain in the next hour is reported as rainSoonMin.
  let kind = kindFor(code);
  const m = j.minutely_15 || {};
  const slots = (m.time || []).map((t, i) => ({ at: Date.parse(toIso(t, off) || ""), mm: num(m.precipitation?.[i]) ?? 0, kind: kindFor(num(m.weather_code?.[i])) }));
  const now = Date.now();
  const cur = slots.filter((s) => s.at <= now && now - s.at < 15 * 60 * 1000)[0];
  const mmNow = Math.max(num(c.precipitation) ?? 0, cur ? cur.mm : 0);
  if ((kind === "clear" || kind === "clouds") && mmNow > 0) kind = (num(c.snowfall) ?? 0) > 0 ? "snow" : mmNow >= 0.5 ? "rain" : "drizzle";
  const wetKind = (k) => k === "rain" || k === "drizzle" || k === "storm" || k === "snow";
  const next = slots.find((s) => s.at > now && s.at - now < 60 * 60 * 1000 && (s.mm > 0 || wetKind(s.kind)));
  return {
    kind,
    precipMm: mmNow,
    rainSoonMin: !wetKind(kind) && next ? Math.max(1, Math.round((next.at - now) / 60000)) : undefined,
    tempC: Math.round(c.temperature_2m * 10) / 10,
    windKmh: Math.round(num(c.wind_speed_10m) ?? 0),
    isDay: c.is_day === 1,
    sunrise: toIso(j.daily?.sunrise?.[0], off),
    sunset: toIso(j.daily?.sunset?.[0], off),
    place: p.place,
    observedAt: toIso(c.time, off) || new Date().toISOString(),
    windDir: num(c.wind_direction_10m) ?? undefined,
    cloudCover: num(c.cloud_cover) ?? undefined,
    code: code ?? undefined,
    lat: p.lat,
    lon: p.lon,
  };
}

async function getWeather() {
  if (weatherCache && Date.now() - weatherCache.at < WEATHER_TTL) return weatherCache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await fetchWeather();
      weatherCache = { data, at: Date.now() };
      lastErr = null;
      return data;
    } catch (e) {
      lastErr = (e && e.message) || String(e);
      if (weatherCache && Date.now() - weatherCache.at < STALE_OK) return { ...weatherCache.data, stale: true, error: lastErr };
      return null;
    } finally { inflight = null; }
  })();
  return inflight;
}

function lastError() { return lastErr; }

module.exports = { getWeather, lastError };
