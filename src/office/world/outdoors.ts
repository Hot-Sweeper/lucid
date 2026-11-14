// Outside the building: grounds and park, weather and puddles, the landscape around the campus, the
// event banner, daylight and the room clocks.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { CLOSED_BUILDING } from "../closed-building";
import { currentTheme } from "../../themes/registry";
import { campusNight } from "../campus-light";
import { districtPlan } from "../campus-plan";
import { mountWeather, applySkyTint, type Weather } from "../../weather/effects";
import { outdoorLook } from "../../weather/season";
import { plainOutsideSvg, lookFor, groundsLayout, PARK_W, PARK_H } from "../outside";
import { groundWx, groundSig, isWet, puddleSpots } from "../../weather/ground";
import { gearFor } from "../../weather/gear";
import { LandscapeTiles } from "../landscape-tiles";
import { planLandscape, landColors } from "../landscape";
import { invalidateStaticArt } from "../../perf/static-art";
import type { World } from "../world";
import { HALL } from "./geometry";

export class WorldOutdoors {
  paintEvent(this: World) {
    const b = this.root.querySelector(".building-plate b") as HTMLElement | null;
    if (!b) return;
    b.textContent = this.eventName ? `${this.building}  ·  Today: ${this.eventName}` : this.building;
  }

  /** How the weather leaves the ground right now (puddles, frost, heat, snowmen). */
  ground(this: World) {
    const look = outdoorLook(new Date(), this.weather);
    return { look, g: groundWx(this.weather, look.snowCover, this.dry) };
  }

  setWeather(this: World, w: Weather | null) {
    const was = `${this.weather?.kind}|${this.outdoorsWet}`;
    if (isWet(w) || isWet(this.weather)) {
      // still raining, or it just stopped: the puddles start drying from now
      this.dry = { at: Date.now(), level: isWet(w) ? (w!.kind === "drizzle" ? 0.5 : 1) : this.dry?.level ?? 1 };
      try { localStorage.setItem("lucid:wx:dry", JSON.stringify(this.dry)); } catch { /* private mode */ }
    }
    this.weather = w;
    if (was !== `${w?.kind}|${this.outdoorsWet}` && this.lastData) this.update(this.lastData);   // the park empties or fills
    this.redrawOutside();
    this.daylight();
  }

  redrawOutside(this: World, force = false) {
    if (!this.outArgs) return;
    const { look, g } = this.ground();
    // puddles, frost and heat are part of the drawing, in coarse steps, so it is redrawn only when they change class
    const sig = JSON.stringify(look) + groundSig(g) + this.forestSig + (document.documentElement.dataset.theme ?? "");
    if (!force && sig === this.lookSig) return;
    this.lookSig = sig;
    // Finite static garden artwork, with no animated forest or extra cache owners.
    const layer = this.root.querySelector(".outside-layer") as HTMLElement;
    const bounds = this.forestBounds, base = this.outArgs;
    const width = bounds ? Math.max(base.ox+base.w,bounds.x+bounds.w)-base.ox : base.w;
    const height = bounds ? Math.max(base.oy+base.h,bounds.y+bounds.h)-base.oy : base.h;
    const { plan: land, parks } = this.landscapePlan(width, height);
    // The drawing reaches well past the woodland, so even the widest zoom shows forest, not a frame.
    const pad = Math.round(Math.max(1600, Math.max(width, height) * 0.4));
    layer.style.left = `${base.ox - pad}px`; layer.style.top = `${base.oy - pad}px`;
    layer.style.width = `${width + 2 * pad}px`; layer.style.height = `${height + 2 * pad}px`;
    // the connected computers' parks get the same furniture their robots use
    const own = base.park, otherParks = parks.filter(r => r.x !== own.x || r.y !== own.y);
    layer.innerHTML = plainOutsideSvg({ ...base, ox: base.ox - pad, oy: base.oy - pad, w: width + 2 * pad, h: height + 2 * pad, ...look, wx: g, glows: land.lamps, otherParks });
    // Terrain and woodland: reusable bitmap tiles under the overlay, kept across redraws.
    this.landscape ??= new LandscapeTiles();
    layer.prepend(this.landscape.el);
    const landLook = { ...lookFor({ ...look, wx: g }), frozen: look.frozen };
    this.landscape.setScene(land, landLook, { x: base.ox - pad, y: base.oy - pad }, { w: width + 2 * pad, h: height + 2 * pad });
    this.scene.style.setProperty("--scene-ground", landColors(landLook).edge);
    this.viewLandscape();
  }

  /** Click the woodland: the stream ripples where it was clicked, a tree drops leaves. */
  landClick(this: World, x: number, y: number) {
    const plan = this.landPlan;
    if (!plan || this.viewIndoors) return false;
    const st = plan.stream;
    if (st) for (let i = 1; i < st.pts.length; i++) {
      const [ax, ay] = st.pts[i - 1], [bx, by] = st.pts[i], dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) <= st.w / 2) { this.park.splashAt(x, y); return true; }
    }
    let best: { x: number; y: number; r: number } | null = null, bestD = Infinity;
    for (const t of plan.treeGrid.query({ x: x - 120, y: y - 120, w: 240, h: 240 })) {
      const d = Math.hypot(x - t.x, y - t.y);
      if (d <= t.r && d < bestD) { best = t; bestD = d; }
    }
    if (best) { this.park.rustleAt(x, y); return true; }
    return false;
  }

  /** This office and each connected one, with its own park beside it, in world coordinates. */
  campusDistricts(this: World) {
    type R = { x: number; y: number; w: number; h: number };
    const list: { building: R; park: R | null; door: number }[] = [];
    const add = (o: World, dx: number, dy: number) => {
      const m = (r: R | null | undefined) => r ? { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h } : null;
      list.push({ building: { x: dx, y: dy, w: o.size.w, h: o.size.h }, park: m(o.outdoor?.park), door: dy + o.topH + HALL / 2 });
    };
    add(this, 0, 0);
    for (const e of this.neighbors.values()) {
      if (e.office) add(e.office, e.x, e.y);
      // A closed building (roof on) still stands on cleared ground.
      else list.push({ building: { x: e.x, y: e.y, w: CLOSED_BUILDING.w, h: CLOSED_BUILDING.h }, park: null, door: e.y + CLOSED_BUILDING.h / 2 });
    }
    return list;
  }

  /** Woodland, paths and lawns for the current campus geometry; rebuilt only when that changes. */
  landscapePlan(this: World, width: number, height: number) {
    const base = this.outArgs!;
    const districts = this.campusDistricts();
    // each building's walk: from its door along the building into its park
    const paved: [number, number][][] = [];
    for (const d of districts) {
      const b = d.building, p = d.park; if (!p) continue;
      const walkX = b.x + b.w + 64, pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
      paved.push([[b.x + b.w, d.door], [walkX, d.door], [walkX, pcy], [pcx, pcy]]);
    }
    const areas = this.forestAreas.length ? this.forestAreas : districts.flatMap(d => [d.building, ...(d.park ? [d.park] : [])]);
    const parks = districts.flatMap(d => d.park ? [d.park] : []);
    const bounds = { x: base.ox, y: base.oy, w: width, h: height };
    const sig = JSON.stringify([bounds, areas, paved, this.forestRoutes, parks]);
    if (sig !== this.landSig || !this.landPlan) { this.landSig = sig; this.landPlan = planLandscape({ bounds, areas, parks, paved, routes: this.forestRoutes }); }
    return { plan: this.landPlan, parks };
  }

  viewLandscape(this: World) {
    if (!this.landscape || this.viewIndoors || this.hostWorld) return;
    const box = this.sceneBox ??= this.scene.getBoundingClientRect(), s = this.cam.s;
    if (!box.width || !box.height || !s) return;
    this.landscape.update({ x: -this.cam.x / s, y: -this.cam.y / s, w: box.width / s, h: box.height / s }, s * (window.devicePixelRatio || 1));
  }

  layoutGrounds(this: World) {
      const topH = this.topH, entY = topH + HALL / 2;
      const district = districtPlan({ id: "", ...this.size, entranceY: entY }, { w: PARK_W, h: PARK_H });
      // The same plan owns visible artwork, walking geometry and campus bounds.
      const park = district.park;
      // the grounds round it (grounds.ts): lawn, hedge and a tree belt that fades into the backdrop
      const building = { x: 0, y: 0, w: this.size.w, h: this.size.h };
      this.grounds = groundsLayout({ building, entranceY: entY, park });
      const cb = this.grounds.bounds;
      const out = { ox: cb.x, oy: cb.y, w: cb.w, h: cb.h };
      this.outdoor = { x: out.ox, y: out.oy, w: out.w, h: out.h, park };
      this.parkDoor = { x: this.size.w + 66, y: topH + HALL / 2 + 20 };
      this.park.setGeometry(park, this.parkDoor, undefined);
      const layer = this.root.querySelector(".outside-layer") as HTMLElement;
      layer.style.cssText = `left:${out.ox}px;top:${out.oy}px;width:${out.w}px;height:${out.h}px`;
      this.outArgs = { ...out, building, footprint: this.footprint, entranceY: entY, park, grounds: this.grounds };
      this.puddles = puddleSpots(this.grounds, building, park, entY);
      if (!this.hostWorld) this.redrawOutside(true);
      // the weather reaches well past the drawn grounds, so rain and cloud never stop at an edge
      const reach = Math.max(3000, cb.w * 0.6);
      const wr = { x: out.ox - reach, y: out.oy - reach, w: out.w + 2 * reach, h: out.h + 2 * reach, park, entranceY: topH + HALL / 2 };
      if (!this.hostWorld) { if (this.fx) this.fx.resize(wr); else { this.fx = mountWeather(this.root, wr); this.apply(); } }
      // puddles ripple in the rain, the paving shimmers in the heat, walkers leave prints in the snow
      this.fx?.setGround(this.puddles, [this.grounds.walk]);
      this.fx?.setSteppers(() => this.park.steppers());
      const shade = this.root.querySelector(".night-shade") as HTMLElement;
      shade.style.cssText = `left:0;top:0;width:${this.size.w}px;height:${this.size.h}px;right:auto;bottom:auto;background:none`;
      shade.innerHTML = `<svg width="${this.size.w}" height="${this.size.h}" aria-hidden="true"><path d="${this.footprint.path}" fill="#0b1030"/></svg>`;
      if (this.hostWorld) {
        let foundation = this.root.querySelector('.campus-foundation') as HTMLElement | null;
        if (!foundation) { foundation = document.createElement('div'); foundation.className = 'campus-foundation'; foundation.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none'; this.root.insertBefore(foundation,this.root.querySelector('.hall')); }
        foundation.innerHTML = `<svg width="${this.size.w}" height="${this.size.h}" style="overflow:visible" aria-hidden="true"><path d="${this.footprint.path}" fill="none" stroke="#a29174" stroke-width="82" stroke-linejoin="round"/><path d="${this.footprint.path}" fill="none" stroke="#d8c8a6" stroke-width="60" stroke-linejoin="round"/><path d="${this.footprint.path}" fill="#4a4f5c" stroke="#4a4f5c" stroke-width="26" stroke-linejoin="round"/></svg>`;
      }
      this.root.style.width = `${this.size.w}px`;
      this.root.style.height = `${this.size.h}px`;
      (this.root.querySelector(".building-plate b") as HTMLElement).textContent = this.building;
      this.paintEvent();
  }

  // --- daylight and the wall clock --------------------------------------------------
  daylight(this: World, now = new Date()) {
    if (this.hostWorld) { this.paintClock(); return; }
    // The interface theme can lock the office to midnight (the wall clock keeps real time).
    const themed = currentTheme().world;
    if (themed.alwaysMidnight) { now = new Date(now); now.setHours(0, 30, 0, 0); }
    const h = now.getHours() + now.getMinutes() / 60;
    const S = (sky1: string, sky2: string, stars: number, lamp: number, night: number, city: number) => ({ sky1, sky2, stars, lamp, night, city });
    const v = h < 5 || h >= 21.5 ? S("#0b1030", "#262c62", 1, 1, 0.3, 1)
      : h < 6.5 ? S("#2c3466", "#f2a08a", 0.4, 0.8, 0.18, 0.6)
      : h < 8 ? S("#86b7e8", "#ffd2a8", 0, 0.4, 0.05, 0.2)
      : h < 17 ? S("#6fb2ee", "#d4ecfb", 0, 0.1, 0, 0)
      : h < 19 ? S("#7a7fd0", "#ffbc85", 0, 0.5, 0.05, 0.3)
      : S("#2a2f6a", "#e0708a", 0.5, 0.95, 0.2, 0.9);
    // rain greys the sky and dims the light, storms more so
    const darkness = campusNight(now, this.weather);
    const sky = themed.nightSky && darkness > .6 ? { ...v, ...themed.nightSky, lamp: 1, stars: 1 } : darkness > .6 ? { ...v, sky1: "#080e24", sky2: "#172039", lamp: 1, stars: 1 } : v;
    const t = applySkyTint(sky, this.weather);
    const night = Math.min(.9, darkness + t.dim);
    const st = this.root.style;
    st.setProperty("--sky1", t.sky1); st.setProperty("--sky2", t.sky2);
    st.setProperty("--stars", String(sky.stars * t.stars)); st.setProperty("--lamp", String(Math.min(1, sky.lamp + t.dim * 0.8)));
    st.setProperty("--night", String(night * .45)); st.setProperty("--outdoor-night", String(night));
    // A near-invisible shade still costs a full-screen blend every frame; skip it by day.
    this.root.classList.toggle("no-night-shade", night * .45 * .9 < .02);
    // a warm low sun at dawn and dusk, fading under cloud
    const dusk = h >= 5 && h < 8 ? Math.max(0, 1 - Math.abs(h - 6.6) / 1.5) : h >= 16.5 && h < 21 ? Math.max(0, 1 - Math.abs(h - 18.6) / 2.2) : 0;
    st.setProperty("--outdoor-dusk", (dusk * Math.max(0, 1 - t.dim * 2.5)).toFixed(2)); st.setProperty("--city", String(v.city));
    // the grass beyond the drawn outdoors darkens with the same night tint
    this.root.parentElement?.style.setProperty("--scene-night", String(night));
    const { look, g } = this.ground();
    this.fx?.set(this.weather, { night, season: look.season, frozen: look.frozen, ground: { puddles: g.puddles, hot: g.hot, prints: look.snowCover >= 0.3 } });
    // the real wind sways the trees (ambient.css), fog puts halos round the lamps, frost rims the windows
    const w = this.weather;
    st.setProperty("--wind", (w ? Math.min(1, Math.max(0.1, w.windKmh / 55, w.kind === "storm" ? 0.85 : 0)) : 0.2).toFixed(2));
    st.setProperty("--fog", w?.kind === "fog" ? "1" : "0");
    st.setProperty("--frost", g.frost ? "1" : "0");
    this.park.setGear(gearFor(w));
    for (const entry of this.neighbors.values()) entry.office?.park.setGear(gearFor(w));
    this.redrawOutside();
    this.paintClock();
    this.syncBuildings();
    invalidateStaticArt();
  }

  paintClock(this: World) {
    const now = new Date();
    const m = now.getMinutes(), hr = (now.getHours() % 12) + m / 60;
    this.root.querySelectorAll<SVGElement>(".clock-h").forEach((e) => e.setAttribute("transform", `rotate(${hr * 30})`));
    this.root.querySelectorAll<SVGElement>(".clock-m").forEach((e) => e.setAttribute("transform", `rotate(${m * 6})`));
  }
}
