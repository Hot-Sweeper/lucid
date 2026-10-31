// Demo of the outdoors around the real World class: the floor plan world.ts lays out (queue,
// main office, break room, three project offices and the freelancers: 7 rooms), the shop, the
// park robots and the weather canvas. Nothing here talks to T3 Code.
// URL params:
//   date=2026-01-12T22:30   pretend it is that local time (season, snow and night follow it)
//   weather=clear|clouds|rain|drizzle|snow|storm|fog   temp=-4   (default: rain, 12 C)
//   view=overview|far|walk|shop|park|plots|office
// Scripted: window.fitView(name), window.measure(ms), window.counts(), window.cam(s, x, y)

import "@fontsource-variable/lexend";
import "../styles.css";
import "../office/office.css";
import "../world/world.css";
import "../decor/decor.css";

const qs = new URLSearchParams(location.search);
const fake = qs.get("date");
if (fake) {
  const R = Date, off = new R(fake).getTime() - R.now();
  class D extends R {
    constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(R.now() + off); }
    static now() { return R.now() + off; }
  }
  (globalThis as any).Date = D;
}

const { World } = await import("../office/world");
const { ShopFront } = await import("../office/shopfront");
const { Wallet } = await import("../office/shop");

const scene = document.getElementById("scene") as HTMLElement;
scene.classList.add("scene");
const world = new World(scene, { peek: async () => null, image: async () => null, readText: async () => null });
const wallet = new Wallet(() => ({ ledger: { welcome: 40 }, spent: 0, owned: [] }), () => {});
const shop = new ShopFront(scene, wallet, () => 3);
world.attachShop(shop);

const iso = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const projects = ["Lucid", "Atlas", "Harbor"].map((t, i) => ({ id: `p${i}`, title: t, root: `C:/code/${t}`, icon: null, scratch: false }));
const threads: any[] = [];
let n = 0;
const t = (projectId: string, o: any = {}) => threads.push({ id: `t${n++}`, projectId, title: `Task ${n}`, updatedAt: iso(n * 3), provider: n % 2 ? "claude" : "codex",
  runStatus: null, pinned: false, settled: false, question: null, model: null, ...o });
for (let i = 0; i < 4; i++) t("p0", { runStatus: "running" });
for (const p of ["p0", "p1", "p2"]) for (let i = 0; i < 3; i++) t(p);
t("scratch", {}); t("scratch", {});
t("p1", { question: "Ship it?" });
for (let i = 0; i < 14; i++) t("p2", { settled: true, updatedAt: iso(600 + i * 30) });
projects.push({ id: "scratch", title: "Scratch", root: "C:/scratch", icon: null, scratch: true });
// robots belong to other parts of the app; if one of them fails to draw, the city still shows
try { world.update({ projects, threads }); } catch (e) { console.warn("world.update:", e); }
try { world.setWeather({ kind: (qs.get("weather") as any) || "rain", tempC: Number(qs.get("temp") ?? 12), windKmh: 14, isDay: true, sunrise: null, sunset: null,
  place: "Demo", observedAt: new Date().toISOString() }); } catch (e) { console.warn("setWeather:", e); }

const W = world as any;
const VIEWS: Record<string, () => { x: number; y: number; w: number; h: number } | null> = {
  overview: () => { const p = W.outdoor?.park; return p && { x: -120, y: -170, w: p.x + p.w + 240, h: Math.max(W.size.h, p.y + p.h) + 290 }; },
  far: () => W.outdoor && { x: W.outdoor.x, y: W.outdoor.y, w: W.outdoor.w, h: W.outdoor.h },
  walk: () => { const s = W.shopRect, p = W.outdoor?.park; return s && p && { x: W.size.w - 500, y: p.y - 150, w: p.x + p.w - W.size.w + 650, h: p.h + 500 }; },
  shop: () => W.shopRect && { x: W.shopRect.x - 400, y: W.shopRect.y - 300, w: W.shopRect.w + 800, h: W.shopRect.h + 600 },
  park: () => W.outdoor?.park,
  city: () => W.city && { x: W.city.bounds.x, y: W.city.bounds.y, w: W.city.bounds.w, h: W.city.bounds.h },
  plots: () => { const ps = W.city?.plots; if (!ps?.length) return null; const x = Math.min(...ps.map((p: any) => p.x)), y = Math.min(...ps.map((p: any) => p.y));
    return { x: x - 200, y: y - 200, w: Math.max(...ps.map((p: any) => p.x + p.w)) - x + 400, h: Math.max(...ps.map((p: any) => p.y + p.h)) - y + 400 }; },
};
const fitView = (v: string) => { const r = VIEWS[v]?.(); if (r) W.flyTo(r, 20, 0.01); else world.overview(); };
setTimeout(() => fitView(qs.get("view") || "overview"), 50);

(window as any).world = world;
(window as any).fitView = fitView;
(window as any).cam = (s: number, x: number, y: number) => { W.cam.s = s; W.cam.x = x; W.cam.y = y; W.apply(); };
(window as any).counts = () => {
  const img = document.querySelector(".outside-img") as HTMLImageElement | null;
  const live = document.querySelector(".outside-live");
  return { liveElements: live ? live.querySelectorAll("*").length : 0, animations: document.getAnimations().length, outsideAnimations: live ? live.getAnimations({ subtree: true }).length : 0, img: !!img };
};
(window as any).measure = (ms = 5000) => new Promise((done) => {
  const gaps: number[] = [];
  let last = 0;
  const t0 = performance.now();
  const step = (t: number) => {
    if (last) gaps.push(t - last);
    last = t;
    if (t - t0 < ms) requestAnimationFrame(step);
    else {
      gaps.sort((a, b) => a - b);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length, q = (p: number) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))];
      done({ frames: gaps.length, fps: Math.round(1000 / mean), mean: +mean.toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +gaps[gaps.length - 1].toFixed(1) });
    }
  };
  requestAnimationFrame(step);
});
// Zooms the camera in and out around the current view for `ms` while measuring frames.
(window as any).zoomMeasure = (ms = 4000) => {
  const c = { ...W.cam }, cx = innerWidth / 2, cy = innerHeight / 2, t0 = performance.now();
  let on = true;
  const tick = () => {
    if (!on) return;
    const k = 1 + 0.6 * Math.sin((performance.now() - t0) / 700), s = c.s * k;
    W.cam.s = s; W.cam.x = cx - ((cx - c.x) * s) / c.s; W.cam.y = cy - ((cy - c.y) * s) / c.s; W.apply();
    requestAnimationFrame(tick);
  };
  tick();
  return (window as any).measure(ms).then((m: any) => { on = false; return m; });
};
// Shapes in the still image (every subpath counts) and elements in the live layer.
(window as any).shapes = async () => {
  const { outsideSvg } = await import("../office/outside");
  const { outdoorLook } = await import("../weather/season");
  const args = { ...W.outArgs, ...outdoorLook(new Date(), W.weather) };
  const count = (svg: string) => {
    const doc = new DOMParser().parseFromString(svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '), "image/svg+xml");
    let elements = 0, shapes = 0;
    doc.querySelectorAll("*").forEach((e) => {
      elements++;
      if (e.tagName === "path") shapes += Math.max(1, (e.getAttribute("d") ?? "").match(/[Mm]/g)?.length ?? 1);
      else if (["rect", "circle", "ellipse", "line", "text", "polygon", "polyline"].includes(e.tagName)) shapes++;
    });
    return { elements, shapes, kb: Math.round(svg.length / 1024) };
  };
  const still = count(outsideSvg({ ...args, layer: "still" }));
  return { still, stats: (await import("../office/outside")).lastStats, live: count(outsideSvg({ ...args, layer: "live" })), plots: W.city?.plots };
};
