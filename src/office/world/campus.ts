// The campus: other linked computers as neighbouring buildings, drawn and refreshed next to this
// one, with their own offices embedded read-only until opened.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { releaseOfficeWidth } from "../office-width";
import { wait as pause } from "../../robot";
import { gameSound } from "../sound";
import gsap from "gsap";
import { Desk } from "../desk";
import { forestPlan } from "../forest-plan";
import { campusPlan, districtPlan } from "../campus-plan";
import { buildingState, buildingDetail, buildingMood } from "../environments";
import { CLOSED_BUILDING, closedBuildingSvg } from "../closed-building";
import { PARK_W, PARK_H } from "../outside";
import type { World } from "../world";
import type { WorldData } from "./types";
import { HALL, releaseRoomVectors } from "./geometry";
import { markScale } from "./edge-point";

export class WorldCampus {
  activityDeskFor(this: World, id: string) { return this.deskFor(id) ?? this.campusDesks.find(row => row.id === id)?.desk ?? null; }

  setBuildings(this: World, buildings: typeof this.buildings, open: (id: string) => Promise<void>, load: (id: string) => Promise<WorldData>, reread: () => void = () => {}) {
    this.buildings = buildings; this.openBuilding = open; this.loadBuilding = load; this.rereadBuildings = reread; this.drawBuildings();
    if (!this.campusTimer) {
      this.campusTimer = window.setInterval(() => { if (!document.hidden && !this.scene.inert) void this.refreshBuildings(); }, 15000);
      window.addEventListener('pagehide', this.destroyBuildings, { once: true });
    }
    void this.refreshBuildings();
  }

  destroyEmbedded(this: World) {
    for (const room of this.rooms) releaseOfficeWidth(room.el);
    this.layoutObserver?.disconnect(); this.layoutObserver = null;
    document.removeEventListener('visibilitychange', this.visibilityPresentation);
    this.cancelCameraTween(); this.cancelOutsideWarm(); window.clearTimeout(this.zoomEnd); cancelAnimationFrame(this.resharpen); this.resharpen = 0;
    this.cancelTouchLayoutFlush();
    this.deskBuildTween?.progress(1).kill(); this.deskBuildTween = null;
    for (const g of this.ghosts.values()) { window.clearTimeout(g.timer); gsap.killTweensOf(g.el); }
    for (const walker of this.transit.values()) walker.destroy(); this.transit.clear(); this.trips.clear(); this.wakeRoutes();
    for (const d of this.allDesks) d.destroy(); this.allDesks.clear(); this.desks.clear();
    for (const extension of Object.values(this.ext)) extension?.destroy();
    this.park.destroy(); this.fx?.destroy();
    this.landscape?.destroy(); this.landscape = null;
    this.finishRoomTransitions();
    for (const room of this.rooms) releaseRoomVectors(room.el);
    this.root.remove();
  }

  async refreshBuildings(this: World) {
    for (const [id, entry] of this.neighbors) {
      const building = this.buildings.find(b => b.id === id);
      if (entry.busy || !building?.canOpen) continue;
      // A computer that failed (offline, refused) is asked again once a minute, not on every campus refresh.
      if (entry.ok === false && Date.now() < entry.retryAt) continue;
      entry.busy = true;
      try {
        const data = await this.loadBuilding(id);
        if (this.neighbors.get(id) !== entry) continue;
        if (entry.ok !== true) { entry.ok = true; this.rereadBuildings(); }
        if (!entry.office) {
          const host = document.createElement('div'); host.className = 'neighbor-office'; entry.el.append(host);
          const office = this.neighborOffice(host); office.scene = this.scene;
          office.building = this.buildings.find(b => b.id === id)!.label;
          office.extFactory = this.extFactory;
          office.onLayoutChange = () => { office.rememberLayout(); this.drawBuildings(); this.syncBuildings(); this.onLayoutChange(); };
          office.onRoomMenu = room => office.showRoom(room.id);
          office.onSelectThread = threadId => { void this.openBuilding(id).then(() => this.onSelectThread(threadId)).catch(error => { entry.status.textContent = error instanceof Error ? error.message : 'Could not open this session. Try again.'; }); };
          const openDesk = (desk: Desk, screen: boolean, slot = '', x = 0, y = 0) => {
            const threadId = desk.threadId, roomId = desk.room;
            entry.status.textContent = 'Opening computer...';
            void this.openBuilding(id).then(async () => {
              if (this.lastData?.environmentId !== data.environmentId) return;
              this.setRoomExpanded(roomId, true);
              if (threadId) this.onSelectThread(threadId);
              // Activating a building may still be evacuating the previous floor.
              // Retain the click until that computer exists in the active world.
              let target = threadId ? this.desks.get(threadId) : this.slotDesks.get(slot);
              for (let attempt = 0; !target && attempt < 150; attempt++) {
                await pause(.1);
                if (this.lastData?.environmentId !== data.environmentId) return;
                target = threadId ? this.desks.get(threadId) : this.slotDesks.get(slot);
              }
              if (!target) throw Error('This computer changed. Open its office and try again.');
              if (threadId) { this.select(target); if (screen) this.focusScreen(target); else this.focusOn(target); }
              else this.onFreeDesk(target, slot, x, y);
            }).catch(error => { entry.status.textContent = error instanceof Error ? error.message : 'Could not open this computer. Try again.'; });
          };
          office.onOpenDesk = (desk, screen) => openDesk(desk, screen);
          office.onFreeDesk = (desk, slot, x, y) => openDesk(desk, false, slot, x, y);
          office.onFreeDeskMenu = office.onFreeDesk;
          office.onRemoveEmptyDesk = slot => { void this.openBuilding(id).then(() => { if (this.lastData?.environmentId === data.environmentId) this.onRemoveEmptyDesk(slot); }).catch(error => { entry.status.textContent = String(error.message || error); }); };
          office.onAddDesk = room => { void this.openBuilding(id).then(() => this.onAddDesk(room)).catch(error => { entry.status.textContent = String(error.message || error); }); };
          entry.office = office;
        }
        entry.office.update(data);
        entry.el.dataset.projects = String(data.projects.length); entry.el.dataset.sessions = String(data.threads.length);
        entry.status.textContent = ''; entry.open.disabled = false;
        this.drawBuildings(); this.syncBuildings(); this.onCampusChange();
      } catch (error) {
        if (this.neighbors.get(id) !== entry) continue;
        entry.retryAt = Date.now() + 60000;
        // The sign takes its state from the next inventory read; the line says what failed now.
        if (entry.ok !== false) { entry.ok = false; this.rereadBuildings(); }
        if (entry.office) entry.status.textContent = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not refresh this computer. Retrying shortly.';
      } finally { entry.busy = false; }
    }
  }

  syncBuildings(this: World) {
    // Building signs stay readable from the campus overview (about 24px tall, at most 3x their size).
    const sign = Math.min(3, markScale(this.cam.s, 64, 24)).toFixed(2);
    if (sign !== this.signScale) { this.signScale = sign; this.root.style.setProperty('--sign-scale', sign); }
    for (const entry of this.neighbors.values()) if (entry.office) {
      const office = entry.office;
      office.cam = { x: this.cam.x + (parseFloat(entry.el.style.left) || entry.x) * this.cam.s, y: this.cam.y + (parseFloat(entry.el.style.top) || entry.y) * this.cam.s, s: this.cam.s };
      office.sceneBox = this.sceneBox; office.journeyInsets = this.journeyInsets; office.root.classList.toggle('overview', this.cam.s < .3);
      office.recull();
    }
  }

  drawBuildings(this: World) {
    if (this.hostWorld) return;
    const buildings = this.buildings.filter(b => this.lastData?.environmentId ? b.id !== this.lastData.environmentId : !b.local);
    const keep = new Set(buildings.map(b => b.id));
    for (const [id, entry] of this.neighbors) if (!keep.has(id)) { entry.office?.rememberLayout(); entry.office?.destroyEmbedded(); this.roomTweens.get(entry.el)?.kill(); entry.el.remove(); this.neighbors.delete(id); }
    const campus = campusPlan([
      { id: 'active', ...this.size, entranceY: this.topH + HALL / 2 },
      ...buildings.map(b => { const office = this.neighbors.get(b.id)?.office;
        // An open office draws its own park beside its entrance, so its district reserves it.
        return { id: b.id, outdoors: !!office, w: office?.size.w ?? CLOSED_BUILDING.w, h: office?.size.h ?? CLOSED_BUILDING.h, entranceY: office ? office.topH + HALL / 2 : CLOSED_BUILDING.h / 2 }; }),
    ], { w: PARK_W, h: PARK_H });
    this.campusRight = campus.bounds.w; this.campusHeight = campus.bounds.h;
    let createdOffice = false;
    for (const building of buildings) {
      const district = campus.districts.get(building.id)!;
      const { x, y } = district.building;
      let entry = this.neighbors.get(building.id);
      if (!entry) {
        const el = document.createElement('section'); el.className = 'neighbor-building'; el.dataset.environment = building.id;
        // The sign: the computer's name with its connection state, like this building's own plate.
        const open = document.createElement('button'); open.type = 'button'; open.className = 'neighbor-open';
        const dot = document.createElement('span'); dot.className = 'bp-dot';
        const name = document.createElement('b'), state = document.createElement('span'); state.className = 'neighbor-link';
        open.append(dot, name, state);
        const status = document.createElement('p'); status.className = 'neighbor-status'; status.setAttribute('role', 'status');
        const facade = document.createElement('div'); facade.className = 'neighbor-facade';
        const created = { el, office: null, x, y, busy: false, status, open, facade, lit: null, ok: null, retryAt: 0 }; entry = created;
        open.addEventListener('click', async () => { if (open.disabled) return; open.disabled = true; gameSound.at('open', open); try { await this.openBuilding(building.id); } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not open this computer. Try again.'; } finally { const b = this.buildings.find(b => b.id === building.id); open.disabled = !b?.canOpen || buildingMood(b) === 'offline'; } });
        el.append(facade, open, status); this.root.append(el); this.neighbors.set(building.id, entry); createdOffice = true;
      }
      const mood = buildingMood(building);
      // An offline computer or one that keeps its sessions to T3 shows no offices or robots.
      if (entry.office && (mood === 'offline' || !building.canOpen)) {
        entry.office.rememberLayout(); entry.office.destroyEmbedded(); entry.office = null;
        entry.el.querySelector('.neighbor-office')?.remove(); delete entry.el.dataset.projects; delete entry.el.dataset.sessions;
        this.onCampusChange();
      }
      (entry.open.querySelector('b') as HTMLElement).textContent = building.label;
      const state = buildingState(building), link = entry.open.querySelector('.neighbor-link') as HTMLElement;
      if (link.textContent !== state) link.textContent = state;
      entry.open.disabled = !building.canOpen || mood === 'offline';
      const detail = buildingDetail(building);
      const note = detail || (mood === 'connecting' && !entry.office ? 'Reading projects and sessions from T3 Code' : '');
      if (!entry.office || mood !== 'open') { if (entry.status.textContent !== note) entry.status.textContent = note; }
      else if (entry.ok) entry.status.textContent = '';
      entry.el.dataset.state = mood;
      entry.open.title = building.canOpen ? `Open ${building.label}` : building.reason || state;
      entry.el.setAttribute('aria-label', `${building.label}, ${state}`);
      // Roof on until a real read opens the building; skylights stay dark while it is offline.
      const lit = mood !== 'offline';
      entry.facade.hidden = !!entry.office;
      if (!entry.office && entry.lit !== lit) { entry.lit = lit; entry.facade.innerHTML = closedBuildingSvg(lit); }
      const moving = entry.el.style.left && (entry.x !== x || entry.y !== y);
      entry.x = x; entry.y = y;
      if (moving && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) this.tweenRoom(entry.el, { left: x, top: y, onUpdate: () => this.syncBuildings() });
      else if (!this.roomTweens.has(entry.el)) { entry.el.style.left = `${x}px`; entry.el.style.top = `${y}px`; }
      const office = entry.office;
      const width = office ? office.size.w : CLOSED_BUILDING.w;
      const height = district.bounds.h;
      entry.el.style.width = `${width}px`; entry.el.style.height = `${height}px`;

    }
    // Outdoor positions stay local to each computer, even when campus rows wrap.
    for (const { office } of [{ office: this }, ...[...this.neighbors.values()].filter(e => e.office).map(e => ({ office: e.office! }))]) {
      const position = districtPlan({ id: '', ...office.size, entranceY: office.topH + HALL / 2 }, { w: PARK_W, h: PARK_H }).park;
      if (office.parkPosition?.x !== position.x || office.parkPosition?.y !== position.y) { office.parkPosition = position; office.layoutGrounds(); }
    }
    // Every computer's district (building and park) stays clear of woodland.
    const districts = this.campusDistricts();
    const areas = districts.flatMap(d => [d.building, ...(d.park ? [d.park] : [])]);
    const routes = districts.flatMap(d => {
      const b = d.building, top = d.door - HALL / 2, out = [{ x: b.x + b.w - 40, y: top - 30, w: PARK_W + 350, h: 220 }];
      if (d.park) out.push({ x: d.park.x - 100, y: Math.min(top, d.park.y), w: d.park.w + 200, h: d.park.y + d.park.h - Math.min(top, d.park.y) });
      return out;
    });
    const signature = JSON.stringify([areas,routes]);
    if(signature!==this.forestSig){this.forestSig=signature;this.forestAreas=areas;this.forestRoutes=routes;this.forestBounds=forestPlan(areas,routes).bounds;this.redrawOutside(true);}
    if (createdOffice) void this.refreshBuildings();
  }
}
