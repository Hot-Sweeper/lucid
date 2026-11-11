// The layout pass: from T3's threads to rooms, seats, desks and journeys. Runs on every refresh;
// classification, seat reservations, the floor plan, room DOM, desk places and walkers in transit.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { officeColumns, mountOfficeWidth } from "../office-width";
import { setRobotModes, type Pt } from "../../robot";
import { subscriptionBatteries, needsCharge } from "../battery";
import { chargingSize } from "../../world/charging";
import gsap from "gsap";
import { Desk, shortTitle } from "../desk";
import { officePlan } from "../floor-plan";
import { buildingFootprint } from "../building-footprint";
import { hasOfficeWork, hasOfficeDesk, reserveRoomSeats, remainingDeskExtras, snakeSeat, projectRoomSeats, layoutMeeting, layoutWaitingSpots, layoutSafeAt, addDeskPlace, FOLDED_OFFICE } from "../room-policy";
import { vectorOwner } from "../../perf/shared-vector";
import { cacheStaticArt } from "../../perf/static-art";
import { icon } from "../../ui/icons";
import type { World } from "../world";
import type { WThread, WorldData, Room, RoomKind, PhysicalRoomPlan } from "./types";
import { WALL_FACE, SLOT_W, SLOT_H, GAP, HALL, LOUNGE, officeSize, columnsForRoom, floorSlots, needsLounge } from "./geometry";
import { roomSvg } from "./room-art";

export class WorldLayout {
  // --- layout -------------------------------------------------------------------
  update(this: World, data: WorldData) {
    if (!this.hostWorld) for (const entry of this.neighbors.values()) if (entry.office?.needsRefresh && entry.office.lastData) entry.office.update(entry.office.lastData);
    if (this.lastData?.environmentId !== data.environmentId || !this.lastData && this.hostWorld) {
      if (this.lastData) this.rememberLayout();
      // A visible neighbor may have newer layout choices than its last saved file.
      for (const entry of this.neighbors.values()) entry.office?.rememberLayout();
      this.applyOfficeLayout(this.layoutForEnvironment(data.environmentId));
    }
    data = { ...data, threads: data.threads.map(t => ({ ...t, coinPending: !data.environmentId && this.coinHolds.has(t.id), completionPending: this.completionHolds.has(t.id) && !t.settled, kept: !data.environmentId && !!t.settled && this.keptDesks.has(t.id), reviewPending: !data.environmentId && this.reports.has(t.id) && !t.settled })) };
    this.lastData = data;
    setRobotModes(data.threads, this.root);
    if (!this.hostWorld) subscriptionBatteries.setEnabled(!data.environmentId);
    for (const [id] of this.reports) {
      const t = data.threads.find(t => t.id === id);
      if (!t || t.pinned || t.settled || hasOfficeWork(t)) this.reports.delete(id);
    }
    if (this.hasLayout && this.touchLayoutHeld) { this.touchLayoutPending = true; return; }
    if (this.deskDragActive || this.layoutHeld) return; // no physical layout changes under any held drag
    this.touchLayoutPending = false;
    const seatsBefore = JSON.stringify([...this.seats]);
    const byProject = new Map(data.projects.map((p) => [p.id, p]));
    const byThread = new Map(data.threads.map((t) => [t.id, t]));
    const previousPhysical = new Map(this.physicalPlans.flatMap((p) => p.threads.flatMap((t) => t ? [[t.id, p.id] as const] : [])));
    const retiringIds = new Set([...this.desks].filter(([id, desk]) => {
      if (this.roomOf.get(id) !== desk.room) return false;
      const t = byThread.get(id);
      return !t || needsCharge(t) || (!!t.question && desk.room !== "queue") || !hasOfficeDesk(t, this.revealedThread) || this.homeForThread(t, data.projects) !== desk.room;
    }).map(([id]) => id));
    const indoorJourney = [...this.transit.values()].some((w) => !this.outside(w));
    // Park visitors walk to the park gate outside the building. Their exit never
    // touches office geometry, so it must not hold a fold or expansion.
    const indoorExits = [...this.exits].filter(([, ex]) => ex.from !== "park").map(([id]) => id);
    const wasHeld = this.physicalLayoutHeld;
    let holdPhysical = this.hasLayout && this.physicalPlans.length > 0 && (retiringIds.size > 0 || indoorJourney || indoorExits.length > 0 || this.layoutParticipants.size > 0);
    const classifiedRoom = new Map<string, string>();
    const queue: WThread[] = [], main: WThread[] = [], brk: WThread[] = [], charging: WThread[] = [];
    const perProject = new Map<string, WThread[]>();
    const freelance: WThread[] = [];
    const heldPark: WThread[] = [];
    const residents = new Map<string, WThread[]>();
    let orchT: WThread | null = null;
    for (const t of data.threads) {
      const depleted = needsCharge(t);
      if (t.id === this.orchThread && !depleted) { orchT = t; continue; }
      const home = this.homeForThread(t, data.projects);
      // Keep historical reservations without keeping their computers and room floor alive.
      if (!residents.has(home)) residents.set(home, []);
      residents.get(home)!.push(t);
      const report = this.reports.get(t.id);
      // A worker with a report writes it at the desk, carries it to the orchestrator and waits in
      // its line until the review is decided. Approval sends it back to its desk to be collected.
      // A folded office keeps its robots at their desks: folding only changes how it is drawn.
      const want = depleted ? "charging" : t.question ? "queue" : report ? (report.writing || report.approved ? home : "queue") : (t.coinPending || t.completionPending) && t.runStatus === 'completed' ? home : hasOfficeDesk(t, this.revealedThread) ? home : "break";
      // Existing actors finish their old-floor journey first. A newly started robot
      // waits in its current room until its physical desk can safely be opened.
      const currentRoom = this.roomOf.get(t.id) ?? null;
      const barrier = wasHeld && !retiringIds.has(t.id) && !this.transit.has(t.id) && !this.exits.has(t.id);
      const deferred = want !== "charging" && ((barrier && want !== currentRoom) || (holdPhysical && want !== "queue" && want !== "break" && !previousPhysical.has(t.id)));
      const room = deferred ? this.roomOf.get(t.id) ?? null : this.settleRoom(t, want);
      if (!room) continue;
      classifiedRoom.set(t.id, room);
      if (room === "queue") queue.push(t);
      else if (room === "charging") { if (!t.settled || this.roster.byThread(t.id)) charging.push(t); }
      else if (room === "main") main.push(t);
      else if (room === "break") { if (!t.settled) brk.unshift(t); else brk.push(t); }   // visitors on a break get a spot first
      else if (room === "freelance") freelance.push(t);
      else if (room === "park") heldPark.push(t);
      else {
        const pid = room.slice(2);
        if (!perProject.has(pid)) perProject.set(pid, []);
        perProject.get(pid)!.push(t);
      }
    }
    // Preserve session order; newcomers take free places and removals close the snake.
    const seatOrder = (roomId: string, list: WThread[]) => {
      const prev = [...(this.seats.get(roomId) ?? [])];
      const previousSeats = [...prev];
      // a robot hired at a specific desk sits exactly there
      const ps = this.pendingSeat;
      if (ps && ps.room === roomId && ps.threadId && list.some((t) => t.id === ps.threadId)) {
        // Physical desk k is reservation k, so the clicked desk is the seat.
        const index = Math.max(0, ps.index);
        while (prev.length <= index) prev.push(null);
        const old = prev.indexOf(ps.threadId);
        if (old >= 0) prev[old] = null;
        const displaced = prev[index];
        prev[index] = ps.threadId;
        // A quiet thread that held this place gives it up. Active work is never
        // under an empty desk, so nobody working is moved.
        const displacedThread = displaced && displaced !== ps.threadId ? list.find((t) => t.id === displaced) : undefined;
        if (displacedThread && hasOfficeDesk(displacedThread, this.revealedThread)) prev.push(displaced);
        this.pendingSeat = null;
      }
      let seats = reserveRoomSeats(prev, list, this.revealedThread);
      const extra = this.extra.get(roomId) ?? 0;
      if (extra > 0) this.extra.set(roomId, remainingDeskExtras(previousSeats, seats, extra));
      // Nothing of this room is on screen yet: pack its places once, so empty places
      // saved from old history never stretch the room.
      if (!this.physicalPlans.some((p) => p.id === roomId)) seats = seats.filter((id): id is string => !!id);
      // reserveRoomSeats closes gaps in order without replacing desk/session objects.
      this.seats.set(roomId, seats);
      const byId = new Map(list.map((t) => [t.id, t]));
      return seats.map((id) => (id ? byId.get(id) ?? null : null));
    };
    type Plan = PhysicalRoomPlan;
    const office = (id: string, kind: RoomKind, title: string, icon: string | null, threads: WThread[]): Plan => {
      const reserved = residents.get(id) ?? threads;
      seatOrder(id, reserved);
      const extra = this.extra.get(id) ?? 0;
      const projection = projectRoomSeats(this.seats.get(id)!, reserved, this.isRoomExpanded(id), this.revealedThread, extra, this.collapsedRooms.has(id));
      const { slots, collapsed } = projection;
      const ghost = addDeskPlace(projection.threads, collapsed, kind) !== null;
      const { w, h } = collapsed ? FOLDED_OFFICE : officeSize(slots + (ghost ? 1 : 0), needsLounge(this.themes.get(id)) ? LOUNGE : 0, officeColumns(this.roomColumns.get(id)));
      return { id, kind, title, icon, threads: projection.threads, slots, w, h, collapsed, ghost };
    };
    let top: Plan[] = [
      { id: "queue", kind: "queue", title: "Questions for you", icon: null, threads: queue, slots: 0, w: 720, h: 800, collapsed: false },
      office("main", "main", "Main office", null, main),
      { id: "break", kind: "break", title: "Break room", icon: null, threads: brk.slice(0, 8), slots: 0, w: 1900, h: 800, collapsed: false },
    ];
    const standbyCharging = this.roster.robots.filter(r => (!r.threadId || !byThread.has(r.threadId) && !r.threadId.includes("::") && !data.environmentId) && subscriptionBatteries.get(r.provider).charging);
    this.chargingCapacity = Math.max(this.chargingCapacity, charging.length + standbyCharging.length);
    top.push({ id: "charging", kind: "charging", title: "Charging room", icon: null, threads: charging, slots: 0, ...chargingSize(this.chargingCapacity), collapsed: false });
    let bottom: Plan[] = [];
    for (const p of [...data.projects].filter((p) => !p.scratch).sort((a, b) => a.id.localeCompare(b.id))) {
      const pid = p.id, list = perProject.get(pid) ?? [];
      if (this.hidden.has(pid)) continue;
      bottom.push(office(`p:${pid}`, "project", p.title, p.icon, list));
    }
    if (!this.hidden.has("freelance")) bottom.push(office("freelance", "freelance", "Freelancers", null, freelance));
    bottom = this.orderRooms(bottom);
    const policyKey = (plans: Plan[]) => plans.map((p) => `${p.id}:${p.w}:${p.h}:${p.slots}:${p.slots ? p.threads.map((t) => t?.id ?? "").join(",") : ""}`).join("|");
    const desiredPlans = [...top, ...bottom];
    const physicalChange = policyKey(desiredPlans) !== policyKey(this.physicalPlans);
    // Source-room exits are registered by move() later in this update. Include
    // them now, before moving that room, or its door hands the robot over using
    // an animated old origin that no longer belongs to the current floor.
    const departingResidents = new Set([...classifiedRoom].filter(([id, destination]) => {
      const source = this.roomOf.get(id);
      return source !== destination && (source === 'break' || source === 'queue' || source === 'charging') &&
        !this.transit.has(id) && !this.exits.has(id);
    }).map(([id]) => id));
    if (this.hasLayout && departingResidents.size) holdPhysical = true;
    // Folding the main office must not move the entrance corridor out from under
    // its occupants. Keep that corridor for the folded state and its expansion,
    // so evacuation can finish in the hall instead of crossing the entire campus.
    const hallTop = this.collapsedRooms.has('main') ? this.topH : 0;
    const desiredFloor = officePlan(top, bottom, HALL, GAP, hallTop);
    const oldMeeting = this.pendingMeeting;
    const oldSpots = JSON.stringify([...this.meetingSpots]);
    if (holdPhysical && physicalChange) {
      for (const id of departingResidents) this.layoutParticipants.add(id);
      for (const id of retiringIds) this.layoutParticipants.add(id);
      for (const id of indoorExits) this.layoutParticipants.add(id);
      for (const [id, walker] of this.transit) if (!this.outside(walker)) this.layoutParticipants.add(id);
      for (const id of this.layoutParticipants) if (!this.transit.has(id) && !indoorExits.includes(id) && !retiringIds.has(id) && !departingResidents.has(id)) this.layoutParticipants.delete(id);
      this.pendingMeeting = layoutMeeting(this.floorPlan, desiredFloor, HALL);
      this.meetingSpots = layoutWaitingSpots(this.floorPlan, desiredFloor, [...this.layoutParticipants], HALL);
      const ready = [...this.layoutParticipants].every((id) => {
        const actor = this.transit.get(id);
        // Waiting spots guide evacuation, but reaching one is not a barrier.
        // Promote as soon as everyone clears the changing rooms, then re-plan
        // their existing journeys against the new floor instead of forming a line.
        return !!actor && !this.exits.has(id) && layoutSafeAt(actor, this.floorPlan, desiredFloor, HALL);
      });
      if (ready) holdPhysical = false;
    } else holdPhysical = false;
    this.physicalLayoutHeld = holdPhysical;
    if (!holdPhysical) { this.layoutParticipants.clear(); this.pendingMeeting = null; this.meetingSpots.clear(); }
    const meetingChanged = oldMeeting?.x !== this.pendingMeeting?.x || oldMeeting?.y !== this.pendingMeeting?.y || oldSpots !== JSON.stringify([...this.meetingSpots]);
    if (wasHeld !== holdPhysical || meetingChanged) {
      this.layoutRevision++;
      for (const walker of this.transit.values()) walker.stop();
      this.wakeRoutes();
    }
    if (holdPhysical) {
      const latest = new Map([...top, ...bottom].map((p) => [p.id, p]));
      const held = this.physicalPlans.map((p) => ({ ...p, title: latest.get(p.id)?.title ?? p.title, icon: latest.get(p.id)?.icon ?? p.icon,
        threads: p.threads.map((t) => t ? byThread.get(t.id) ?? t : null) }));
      top = held.filter((p) => p.kind === "queue" || p.kind === "main" || p.kind === "break" || p.kind === "charging");
      bottom = held.filter((p) => p.kind === "project" || p.kind === "freelance");
    }

    // Full-size project offices in stable columns, joined by real cross halls.
    const rooms: Room[] = [];
    const floorPlan = officePlan(top, bottom, HALL, GAP, holdPhysical ? this.topH : hallTop);
    const topH = floorPlan.topH;
    this.topH = topH;
    this.floorPlan = floorPlan;
    // Robots: working threads get one (reusing free teammates first), resting ones keep theirs.
    const working = [...queue, ...main, ...freelance, ...[...perProject.values()].flat(), ...charging.filter(t => !t.settled)];
    const otherBuildings = this.roster.robots.flatMap(r => r.threadId && (r.threadId.includes('::') ? r.threadId.split('::')[0] : '') !== (data.environmentId || '') ? [r.threadId] : []);
    this.roster.assign(working, new Set(brk.map((t) => t.id)), new Set([...data.threads.map(t => t.id), ...otherBuildings]), new Set(data.threads.filter(t => t.pinned).map(t => t.id)));
    const resting = this.roster.restingFor(brk.slice(0, 8));
    const restingIds = new Set(resting.map((r) => r.thread));
    const brkShown = brk.filter((t) => restingIds.has(t.id)).slice(0, 8);
    // Historical threads whose robot moved to another job are not park residents.
    const parkVisitors = [...new Map([...heldPark, ...brk.slice(8)]
      .filter(t => this.roster.byThread(t.id))
      .map(t => [t.id, t])).values()].slice(0, 6);
    const idsOf = (r: Plan) => r.threads.filter((t): t is WThread => !!t).map((t) => t.id);
    const plans = [...top, ...bottom];
    for (const r of plans) rooms.push({ id: r.id, kind: r.kind, title: r.title, icon: r.icon, ...floorPlan.rooms.get(r.id)!, el: null as any, threadIds: idsOf(r), collapsed: r.collapsed });
    this.physicalPlans = plans.map((p) => ({ ...p, threads: [...p.threads] }));
    this.size = floorPlan.size;
    const geometryKey = rooms.map((r) => `${r.id}:${r.x}:${r.y}:${r.w}:${r.h}`).join("|");
    if (geometryKey !== this.geometryKey) {
      this.geometryKey = geometryKey;
      this.footprint = buildingFootprint([...rooms, ...floorPlan.halls]);
      this.layoutRevision++;
      // Old waypoints can now lie inside a moved room. Stop at the same position;
      // each existing trip resumes through current corridors and furniture only.
      for (const walker of this.transit.values()) walker.stop();
      this.wakeRoutes();
    }

    const key = rooms.map((r, i) => `${r.id}:${floorSlots(plans[i])}:${r.w}:${r.h}:${r.x}:${r.y}:${r.icon ? 1 : 0}:${r.title}:${JSON.stringify(this.themes.get(r.id) ?? null)}`).join("|");
    if (key !== this.lastKey) {
      this.lastKey = key;
      // Keep unchanged artwork and residents alive while neighboring rooms move.
      const animate = this.hasLayout && !document.hidden && !this.scene.inert && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!animate) this.finishRoomTransitions();
      const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.room[data-room-id]');
      const focusedId = focused?.dataset.roomId;
      const focusedWidth = (document.activeElement as HTMLElement | null)?.closest('.office-width-controls, .office-width-handle') ? (document.activeElement as HTMLElement).className || (document.activeElement as HTMLElement).textContent : null;
      const focusedSize = (document.activeElement as HTMLElement | null)?.classList.contains('room-size-hit');
      const oldRooms = new Map(this.rooms.map((r) => [r.id, r]));
      rooms.forEach((r, i) => {
        const old = oldRooms.get(r.id);
        const signature = JSON.stringify([r.kind, r.title, r.icon, r.w, r.h, floorSlots(plans[i]), this.themes.get(r.id)]);
        const utility = r.kind === 'break' || r.kind === 'queue' || r.kind === 'charging';
        if (old && old.w === r.w && old.h === r.h && (utility || old.el.dataset.artSignature === signature)) {
          r.el = old.el;
          if (animate) this.tweenRoom(r.el, { left: r.x, top: r.y });
          else { this.roomTweens.get(r.el)?.kill(); gsap.set(r.el, { left: r.x, top: r.y }); }
          const ext = utility ? this.ext[r.kind as "break" | "queue" | "charging"] : undefined;
          if (ext) ext.onDeparture = (id, w) => this.prepareDeparture(id, w, () => ({ x: parseFloat(r.el.style.left), y: parseFloat(r.el.style.top) }));
          if (ext) ext.onExit = (id, at, face) => this.handOver(id, { x: at.x + parseFloat(r.el.style.left), y: at.y + parseFloat(r.el.style.top) }, face);
          oldRooms.delete(r.id);
          return;
        }
        if (old) { if (r.kind === "charging") { this.ext.charging?.destroy(); delete this.ext.charging; } this.retireRoom(old.el, animate);oldRooms.delete(r.id); }
        const el = document.createElement("div");
        el.className = `room room-${r.kind}${r.collapsed ? " room-folded" : ""}`;
        el.dataset.roomId = r.id; el.dataset.artSignature = signature;
        el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
        const make = r.kind === "break" || r.kind === "queue" || r.kind === "charging" ? this.extFactory[r.kind] : undefined;
        if (make) {
          const ext = make(el, r.w, r.h);
          ext.onSelect = (id) => this.onSelectThread(id);
          ext.onDeparture = (id, w) => this.prepareDeparture(id, w, () => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) }));
          ext.onExit = (id, at, face) => this.handOver(id, { x: at.x + r.x, y: at.y + r.y }, face);
          this.ext[r.kind as "break" | "queue" | "charging"] = ext;
        } else {el.dataset.vectorOwner=vectorOwner("room");el.innerHTML=roomSvg(r,floorSlots(plans[i]),this.themes.get(r.id),el.dataset.vectorOwner)}
        this.roomLayer.appendChild(el);
        const art=el.querySelector<SVGSVGElement>(":scope > .room-art");if(art)cacheStaticArt(art);
        this.cull.observe(el);
        r.el = el;
        if (animate && old) {
          el.style.left = `${old.x}px`; el.style.top = `${old.y}px`; el.style.opacity = '.35';
          el.style.clipPath = `inset(0 ${Math.max(0, r.w - old.w)}px ${Math.max(0, r.h - old.h)}px 0)`;
          this.tweenRoom(el, { left: r.x, top: r.y, opacity: 1, clipPath: 'inset(0px 0px 0px 0px)' });
        }
      });
      for (const old of oldRooms.values()) this.retireRoom(old.el, animate);
      const hall = this.root.querySelector(".hall") as HTMLElement;
      hall.classList.add("hall-network");
      hall.style.cssText = `top:0;height:${this.size.h}px;width:${this.size.w}px`;
      hall.innerHTML = floorPlan.halls.map((h) => `<div class="hall-strip${h.axis === "y" ? " hall-strip-vertical" : ""}" style="left:${h.x}px;top:${h.y}px;width:${h.w}px;height:${h.h}px"></div>`).join("");
      // the outdoors: grass and trees around the building, a park beside the entrance
      this.layoutGrounds();
      // the room sign is the handle for office options
      for (const r of rooms) {
        if (r.kind !== "project" && r.kind !== "freelance" && r.kind !== "main") continue;
        if (r.el.querySelector(".room-sign-hit")) continue;
        const hit = document.createElement("button");
        hit.type = "button";
        hit.className = "room-sign-hit";
        hit.dataset.roomId = r.id;
        if (r.collapsed) hit.style.width = `${r.w - 120}px`;
        hit.title = this.hostWorld ? `Show ${r.title} office` : `${r.title}${r.collapsed ? ": open office or drag to rearrange" : ": office options or drag to rearrange"}`;
        hit.setAttribute("aria-label", `${r.title} office options`);
        hit.addEventListener("click", (e) => { e.stopPropagation(); this.onRoomMenu(this.rooms.find(room => room.id === r.id) ?? r, e.clientX, e.clientY); });
        r.el.appendChild(hit);
        const size = document.createElement('button'); size.type = 'button'; size.className = 'room-size-hit';
        size.dataset.roomId = r.id;
        size.innerHTML = `<span class="room-size-label"></span>${icon("chevronDown", 24)}`;
        size.addEventListener('click', event => { event.stopPropagation(); this.setRoomExpanded(r.id, !this.isRoomExpanded(r.id)); });
        size.addEventListener('pointerdown', event => event.stopPropagation());
        r.el.append(size);
        if (!r.collapsed) {
          mountOfficeWidth(r.el, r.title, columnsForRoom(r), SLOT_W,
            held => this.setLayoutHeld(held), columns => this.setRoomColumns(r.id, columns));
          // Collapse joins Narrow and Widen in one toolbar
          r.el.querySelector(".office-width-controls")?.append(size);
        }
        if (r.collapsed) {
          const open = document.createElement("button");
          open.type = "button"; open.className = "room-reopen-hit";
          open.setAttribute("aria-label", `Open ${r.title} office`); open.title = `Open ${r.title} office`;
          open.style.cssText = `position:absolute;left:${r.kind === "main" ? r.w / 2 - 34 : r.w - 78}px;top:${r.kind === "main" ? r.h - 68 : 12}px;width:68px;height:${r.kind === "main" ? 68 : 102}px;border:0;background:transparent;cursor:pointer`;
          open.addEventListener("click", (e) => { e.stopPropagation(); this.setRoomExpanded(r.id, true); this.showRoom(r.id); });
          r.el.appendChild(open);
        }
      }
      if (focusedId) rooms.find(r => r.id === focusedId)?.el.querySelector<HTMLElement>(focusedSize ? '.room-size-hit' : '.room-sign-hit')?.focus({ preventScroll: true });
      if (focusedId && focusedWidth) {
        const room = rooms.find(r => r.id === focusedId);
        [...(room?.el.querySelectorAll<HTMLButtonElement>('.office-width-controls button, .office-width-handle') ?? [])].find(b => b.className === focusedWidth || b.textContent === focusedWidth)?.focus({ preventScroll: true });
      }
      this.paintClock();
    } else rooms.forEach((r, i) => (r.el = this.rooms[i]?.el ?? r.el));
    this.rooms = rooms;
    for (const room of rooms) {
      const button = room.el.querySelector<HTMLButtonElement>('.room-size-hit'); if (!button) continue;
      const pinned = this.isRoomExpanded(room.id);
      button.setAttribute('aria-expanded', String(!room.collapsed)); button.setAttribute('aria-pressed', String(pinned));
      button.setAttribute('aria-label', `${pinned ? 'Collapse' : 'Expand'} ${room.title} office`);
      button.title = pinned ? 'Collapse office' : 'Expand office';
      button.classList.toggle('is-pinned', pinned);
      button.querySelector('.room-size-label')!.textContent = pinned ? 'Collapse' : 'Expand';
    }

    // Desks: keep each thread's desk, slide it to its new slot, create or retire as needed.
    const slots: { key: string; x: number; y: number; t: WThread | null; folded: boolean }[] = [];
    plans.forEach((p, i) => {
      if (!p.slots) return;
      const r = rooms[i];
      const cols = columnsForRoom(rooms[i]);
      for (let k = 0; k < p.slots; k++) {
        // Keep the old floor safe for departing walkers, without keeping a settled
        // worker's computer and nameplate alive throughout the layout barrier.
        const occupant = p.threads[k];
        if (occupant?.settled && !hasOfficeDesk(occupant)) continue;
        const { c, row } = snakeSeat(k, cols);
        slots.push({ key: `${p.id}#${k}`, x: r.x + 70 + c * SLOT_W, y: r.y + WALL_FACE + 40 + row * SLOT_H, t: p.threads[k] ?? null, folded: p.collapsed });
      }
    });
    const wanted = new Set(slots.filter((s) => s.t).map((s) => s.t!.id));
    // where every robot is right now, so a robot changing rooms can walk over
    const desksBefore = new Map<string, Pt>();
    for (const [id, d] of this.desks) if (!d.el.classList.contains("arriving")) desksBefore.set(id, this.pendingPlacement?.id === id && this.pendingPlacement.origin ? this.pendingPlacement.origin : this.deskPos(d));
    const nowRoom = new Map<string, string>();
    for (const s of slots) if (s.t && classifiedRoom.get(s.t.id) === s.key.split("#")[0]) nowRoom.set(s.t.id, s.key.split("#")[0]);
    if (holdPhysical) for (const [id, room] of classifiedRoom) if ((room === "main" || room === "freelance" || room.startsWith("p:")) && previousPhysical.get(id) !== room) nowRoom.set(id, room);
    brkShown.forEach((t) => nowRoom.set(t.id, "break"));
    queue.forEach((t) => nowRoom.set(t.id, "queue"));
    charging.forEach((t) => nowRoom.set(t.id, "charging"));
    if (orchT) nowRoom.set(orchT.id, "queue");
    if (!this.outdoorsWet) parkVisitors.forEach((t) => { if (!nowRoom.has(t.id)) nowRoom.set(t.id, "park"); });
    const first = !this.hasLayout;
    this.drawBuildings();
    this.hasLayout = true;
    const moving: { t: WThread; from: string | null; to: string | null }[] = [];
    if (!first) {
      for (const t of data.threads) {
        if (t.id === this.orchThread && !this.roomOf.has(t.id) && !nowRoom.has(t.id)) continue;
        const from = this.roomOf.get(t.id) ?? null, to = nowRoom.get(t.id) ?? null;
        if (from !== to) moving.push({ t, from, to });   // a new robot comes in from outside; one with no place left goes out
      }
      for (const [id, from] of this.roomOf) {
        const t = this.known.get(id);
        if (!nowRoom.has(id) && t && id !== this.orchThread && !data.threads.some((x) => x.id === id)) moving.push({ t, from, to: null });   // its thread is gone
      }
    }
    this.known = new Map(data.threads.map((t) => [t.id, t]));
    this.roomOf = nowRoom;
    this.placeDeskGhosts(plans, rooms);
    for (const [id, d] of this.desks) if (!wanted.has(id)) { if (this.selected === d) this.select(null); this.cull.unobserve(d.el); d.destroy(); this.allDesks.delete(d); this.desks.delete(id); for (const [k, v] of this.slotDesks) if (v === d) this.slotDesks.delete(k); }
    const slotKeys = new Set(slots.map((s) => s.key));
    for (const k of [...this.slotDesks.keys()]) if (!slotKeys.has(k)) this.slotDesks.delete(k);
    this.freeDesks = [];
    const unfolding = new Map<string, number>();
    const foldMotion = !first && !document.hidden && !this.scene.inert && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const s of slots) {
      let d: Desk | undefined;
      const here = this.slotDesks.get(s.key);
      if (s.t) {
        d = this.desks.get(s.t.id);
        if (!d) {
          // a newcomer takes the empty desk already standing in its seat
          d = here && !here.threadId ? here : this.makeDesk(s.x, s.y);
          d.assign({ id: s.t.id, title: s.t.title, provider: s.t.provider, model: s.t.model }, this.roster.byThread(s.t.id));
          d.folder = s.t.folder ?? null;
          this.desks.set(s.t.id, d);
        }
        d.setCompactTitle(shortTitle(s.t.title));
        // which room it sits in now, and in shared rooms which project it works on
        d.room = s.key.split("#")[0];
        const proj = byProject.get(s.t.projectId);
        d.setPinned(s.t.pinned);
        d.setProject(d.room === "main" || d.room === "queue" ? (proj && !proj.scratch ? { title: proj.title, icon: proj.icon } : { title: "No project", icon: null }) : null);
      } else {
        d = here && !here.threadId ? here : this.makeDesk(s.x, s.y);
        if (d.threadId) d.assign(null);
        this.freeDesks.push(d);
      }
      this.slotDesks.set(s.key, d);
      d.room = s.key.split("#")[0];
      d.el.dataset.slot = s.key;
      d.el.querySelector<HTMLButtonElement>('.empty-desk-remove')!.disabled = !this.canRemoveEmptyDesk(s.key);
      const appearance = this.themes.get(d.room);
      const computer = appearance?.computers?.[s.key] ?? appearance?.computer ?? "classic";
      d.el.dataset.computer = computer;
      if (d.threadId && (nowRoom.get(d.threadId) !== d.room || moving.some((m) => m.t.id === d!.threadId) || this.transit.has(d.threadId))) d.setSeated(false);
      if (d.threadId) d.el.classList.toggle("orch-desk", d.threadId === this.orchThread);
      // Folding hides a desk where it stands; opening places it at once and unfolds it.
      if (s.folded !== d.folded) {
        const room = s.key.split("#")[0], order = unfolding.get(room) ?? 0;
        if (!s.folded) unfolding.set(room, order + 1);
        this.setDeskFolded(d, s.folded, s, foldMotion, order);
      } else if (!d.folded) {
        const cur = { x: parseFloat(d.el.style.left), y: parseFloat(d.el.style.top) };
        if (Math.abs(cur.x - s.x) > 1 || Math.abs(cur.y - s.y) > 1) this.slideDesk(d, s);
      }
    }
    this.playDeskBuild();
    // desks whose seat disappeared are retired properly (their robot and computer stop)
    const inUse = new Set(this.slotDesks.values());
    for (const d of this.allDesks) if (!inUse.has(d)) { this.allDesks.delete(d); if (this.selected === d) this.select(null); this.cull.unobserve(d.el); d.destroy(); }
    // leaving a desk: it gets up from its chair; leaving the break room, questions or park: that
    // room walks it to its door and hands it over there
    for (const m of moving) this.move(m.t, m.from, m.to, desksBefore.get(m.t.id) ?? null);
    for (const [id, walker] of this.transit) {
      const thread = byThread.get(id);
      walker.setRunning(!!thread && hasOfficeWork(thread) && !thread.question && !!this.desks.get(id)?.el.classList.contains("arriving"));
    }
    // robots that finished longer ago than the break room's latest eight go out to the park
    const info = (t: WThread) => ({ id: t.id, provider: t.provider, title: t.title, model: t.model, name: this.roster.byThread(t.id)?.name, look: this.roster.byThread(t.id)?.look });
    // in rain, storms or snow nobody stays in the park
    const wet = this.outdoorsWet;
    this.park.wet = wet;
    this.park.rainSoon = wet && !["rain", "drizzle", "storm", "snow"].includes(this.weather?.kind ?? "");
    const chargingList: (ReturnType<typeof info> & { battery: ReturnType<typeof subscriptionBatteries.get>; threadId?: string | null })[] = charging.map(t => ({ ...info(t), battery: subscriptionBatteries.get(t.provider) }));
    const occupiedRobots = new Set(charging.map(t => this.roster.byThread(t.id)?.id));
    for (const r of standbyCharging) if (!occupiedRobots.has(r.id)) chargingList.push({ id: `charging:${r.id}`, threadId: r.threadId, provider: r.provider, title: r.name, model: r.lastModel || null, name: r.name, look: r.look, battery: subscriptionBatteries.get(r.provider) });
    const chargingRoom = rooms.find(r => r.id === "charging");
    if (chargingRoom) chargingRoom.threadIds = chargingList.map(r => r.id);
    this.extLists = { brk: brkShown.map(info), queue: queue.map((t) => ({ ...info(t), question: t.question || (this.reports.has(t.id) ? `Report: ${t.title}` : null), report: this.reports.has(t.id) })), charging: chargingList, park: wet ? [] : parkVisitors.map(info), orch: orchT ? { ...info(orchT), running: orchT.runStatus === "running" } : null };
    this.pushExt();
    this.recull();
    this.onRooms(rooms);
    for (const [id, report] of this.reports) {
      const desk = this.desks.get(id);
      if (!report.writing || report.started || !desk || desk.el.classList.contains("arriving")) continue;
      report.started = true;
      void desk.director.writeReport(report.title, report.response || "").catch(() => {}).finally(() => {
        if (this.reports.get(id) !== report) return;
        report.writing = false;
        if (this.lastData) this.update(this.lastData);
      });
    }
    if (JSON.stringify([...this.seats]) !== seatsBefore) this.onLayoutChange();
    this.syncPlacementPreview();
    if (wasHeld && !holdPhysical) this.reconcilePhysicalLayout(true);
  }
}
