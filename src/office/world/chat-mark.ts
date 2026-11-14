// Which robot belongs to the open chat. Close up and at middle distance the scene itself says it:
// its desk's nameplate carries the accent ring, the monitor's bezel catches the accent and a soft
// warm light pools on the floor round its chair (or at a walking robot's feet). Nothing covers
// the robot, its face, accessories or keyboard. Far out a small accent pin of constant screen size
// stands above the desk (or the walking robot) so it can be found on the campus. When the robot
// is out of view, a portrait at the office edge points toward it and takes the camera there. The
// reverse holds too: clicking a robot opens its chat and hovering one names its conversation
// (world/plates.ts). "Show this robot" glides the camera to it and the light blooms once on arrival.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { portraitSvg, PALETTES, brandFor, GEOM } from "../../robot";
import gsap from "gsap";
import { reducedMotion } from "../../util/dom";
import type { Desk } from "../desk";
import type { World } from "../world";
import { edgePoint, PIN_BELOW, pinScale } from "./edge-point";
import "../chat-mark.css";

/** Where an open chat's robot is: seated at a desk (also in a folded office) or a walking actor. */
type RobotSpot = { desk: Desk; office: World } | { walker: HTMLElement; office: World };

export class WorldChatMark {
  mountChatMark(this: World) {
    const light = document.createElement("div");
    light.className = "chat-light"; light.setAttribute("aria-hidden", "true");
    light.innerHTML = `<i class="cl-bloom"></i>`;
    this.chatLight = light;
    // A map pin drawn at its screen size (18 by 24px); the camera scale is undone on it.
    const pin = document.createElement("div");
    pin.className = "chat-pin"; pin.setAttribute("aria-hidden", "true");
    pin.innerHTML = `<i class="cpn-ring"></i><svg viewBox="0 0 18 24" width="18" height="24"><path class="cpn-body" d="M9 23C9 23 1.6 14.6 1.6 9a7.4 7.4 0 0 1 14.8 0C16.4 14.6 9 23 9 23z"/><circle class="cpn-dot" cx="9" cy="9" r="2.9"/></svg>`;
    this.chatPin = pin;
    const beacon = document.createElement("button");
    beacon.type = "button"; beacon.className = "chat-beacon"; beacon.hidden = true;
    beacon.innerHTML = `<span class="cb-face"></span><span class="cb-arrow" aria-hidden="true"></span>`;
    beacon.addEventListener("click", (e) => { e.stopPropagation(); if (this.chatThread) this.showRobot(this.chatThread); });
    beacon.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.scene.append(beacon);
    this.chatBeacon = beacon;
    // Clicking any walking robot opens its chat (interact.ts asks with this event).
    this.root.addEventListener("robot-chat", (e) => {
      const id = (e as CustomEvent<string>).detail;
      if (!this.lastData?.threads.some((t) => t.id === id)) return;
      e.stopPropagation(); this.onWatchChat(id);
    });
    // Hovering a robot names its conversation (world/plates.ts).
    this.mountPlateCard();
  }

  deskAt(this: World, el: HTMLElement) {
    for (const d of this.allDesks) if (d.el === el) return d;
    for (const entry of this.neighbors.values()) for (const d of entry.office?.allDesks ?? []) if (d.el === el) return d;
    return null;
  }

  /** The chat that is open now (null: none). Its robot carries the marks. */
  setChatThread(this: World, id: string | null) {
    if (this.chatThread === id) return;
    this.chatThread = id;
    window.clearInterval(this.chatMarkTimer); this.chatMarkTimer = 0;
    if (id) this.chatMarkTimer = window.setInterval(() => { if (!document.hidden && !this.scene.inert) this.paintChatMark(); }, 400);
    this.paintChatMark();
  }

  /** Finds the robot of a thread: seated at its desk, or walking somewhere in this or a linked building. */
  locateRobot(this: World, id: string): RobotSpot | null {
    const offices: World[] = [this, ...[...this.neighbors.values()].flatMap((e) => e.office ? [e.office] : [])];
    for (const office of offices) {
      const desk = office.desks.get(id);
      if (desk && (!desk.el.classList.contains("arriving") || desk.folded)) return { desk, office };
    }
    const walker = this.root.querySelector<HTMLElement>(`.world-walker[data-id="${CSS.escape(id)}"]`);
    if (walker) return { walker, office: this };
    return null;
  }

  /** Lights the robot's spot, rings its nameplate, shows the far pin and keeps the edge pointer in step. */
  paintChatMark(this: World) {
    const light = this.chatLight, pin = this.chatPin, beacon = this.chatBeacon;
    if (!light || !pin || !beacon) return;
    const id = this.chatThread, spot = id ? this.locateRobot(id) : null;
    const plate = spot && "desk" in spot ? spot.desk.el : null;
    // This runs on camera frames while a chat is open: track the ringed desk instead of searching the campus for it.
    if (this.chatOpenDesk !== plate) { this.chatOpenDesk?.classList.remove("chat-open"); this.chatOpenDesk = plate; }
    if (plate && !plate.classList.contains("chat-open")) plate.classList.add("chat-open");
    const host = !spot ? null : "desk" in spot ? spot.desk.el : spot.walker;
    if (!host || ("desk" in spot! && spot.desk.folded)) { light.remove(); pin.remove(); }
    if (!host) { beacon.hidden = true; return; }
    if ("desk" in spot! && spot.desk.folded) { this.paintBeacon(spot!, host); return; }
    const walker = !("desk" in spot!);
    if (light.parentElement !== host) {
      // under the robot: before the seated robot's layer, or first inside a walking robot
      light.classList.toggle("on-walker", walker); pin.classList.toggle("on-walker", walker);
      if (walker) host.prepend(light); else host.insertBefore(light, host.querySelector(".robot-host"));
    }
    // Far out the pin keeps one size on screen; closer in the scene's own light is enough. A
    // desk's pin lives on the world's top layer (above the room names) with its tip on the
    // monitor, clear of the robot; a walking robot carries its own over its head.
    const far = this.cam.s < PIN_BELOW;
    if (walker) { if (pin.parentElement !== host) host.append(pin); }
    else if (far) {
      if (pin.parentElement !== this.root) this.root.append(pin);
      const r = host.getBoundingClientRect(), o = this.root.getBoundingClientRect(), k = 1 / (this.cam.s || 1);
      const left = `${((r.left - o.left) * k + GEOM.monitor.x + GEOM.monitor.w / 2).toFixed(1)}px`, top = `${((r.top - o.top) * k + GEOM.monitor.y + GEOM.monitor.h * 0.45).toFixed(1)}px`;
      if (pin.style.left !== left || pin.style.top !== top) Object.assign(pin.style, { left, top });
    }
    if (pin.classList.contains("on") !== far) pin.classList.toggle("on", far);
    const scale = pinScale(this.cam.s).toFixed(3);
    if (pin.style.scale !== scale) pin.style.scale = scale;
    this.paintBeacon(spot!, "desk" in spot! ? spot.desk.el.querySelector<HTMLElement>(".robot-host") ?? host : host);
  }

  /** A portrait at the edge of the office that points toward the chat's robot when it is out of view. */
  paintBeacon(this: World, spot: RobotSpot, robot: HTMLElement) {
    const beacon = this.chatBeacon!, id = this.chatThread!;
    // Hidden while the camera is already on its way (a glide, a flight or following a robot).
    if (this.glideAnim || this.followEl || this.cameraTween?.isActive()) { beacon.hidden = true; return; }
    const box = this.sceneBox ??= this.scene.getBoundingClientRect();
    // A folded office points at its facade; its desks are not drawn.
    const target = "desk" in spot && spot.desk.folded ? spot.office.roomById(spot.desk.room)?.el ?? robot : robot;
    const r = target.getBoundingClientRect();
    const x = r.left + r.width / 2 - box.left, y = r.top + r.height / 2 - box.top;
    const at = edgePoint(x, y, { left: this.journeyInsets.left + 40, right: box.width - this.journeyInsets.right - this.panelWidth - 40, top: 84, bottom: box.height - 88 }, 30);
    if (!at) { if (!beacon.hidden) beacon.hidden = true; return; }
    const worker = this.roster.forJob(id), sig = `${worker?.id}|${worker?.provider}|${JSON.stringify(worker?.look ?? {})}`;
    if (beacon.dataset.sig !== sig) {
      beacon.dataset.sig = sig;
      beacon.querySelector(".cb-face")!.innerHTML = portraitSvg(worker?.look ?? {}, PALETTES[brandFor(worker?.provider)], { size: 30 });
      const label = `Show ${worker?.name ?? "this robot"}`;
      beacon.title = `${label}: it is out of view`; beacon.setAttribute("aria-label", label);
    }
    const shown = beacon.hidden;
    beacon.hidden = false;
    beacon.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
    beacon.style.setProperty("--dir", `${at.angle.toFixed(3)}rad`);
    if (shown && !reducedMotion()) gsap.fromTo(beacon.querySelector(".cb-face"), { scale: .9, opacity: 0 }, { scale: 1, opacity: 1, duration: .2, ease: "power3.out", clearProps: "scale,opacity" });
  }

  /** "Show this robot": glide to the chat's robot wherever it is; its light blooms when the camera arrives. */
  showRobot(this: World, id: string) {
    const spot = this.locateRobot(id);
    if (!spot) return false;
    if ("walker" in spot) this.follow(spot.walker);
    else if (spot.office === this) this.focusOn(spot.desk);   // its desk with the chat beside it (a folded office opens first)
    else {
      // a linked computer's desk: the camera goes over to that building
      const entry = [...this.neighbors.values()].find((e) => e.office === spot.office);
      if (!entry) return false;
      const d = spot.desk, x = entry.x + parseFloat(d.el.style.left), y = entry.y + parseFloat(d.el.style.top);
      this.flyTo({ x: x - 20, y: y - 40, w: 440, h: 440 }, 30, .9, this.panelWidth);
    }
    // a followed walker is reached by the follow camera's own easing, a little later
    this.pingChatMark("walker" in spot ? 650 : 60);
    return true;
  }

  /** Once the camera settles on the robot, its light blooms once (the far pin drops in) and the robot looks up. */
  pingChatMark(this: World, delay = 60) {
    window.clearTimeout(this.chatPingTimer);
    const started = performance.now();
    const ping = () => {
      const moving = this.cameraTween?.isActive() || !!this.glideAnim;
      if (moving && performance.now() - started < 2500) { this.chatPingTimer = window.setTimeout(ping, 60); return; }
      this.paintChatMark();
      const marks = [this.chatLight, this.chatPin].filter((el): el is HTMLElement => !!el?.isConnected);
      if (!marks.length) return;
      for (const el of marks) { el.classList.remove("ping"); void el.offsetWidth; el.classList.add("ping"); }
      this.chatPingTimer = window.setTimeout(() => { for (const el of marks) el.classList.remove("ping"); }, 760);
      const id = this.chatThread, spot = id ? this.locateRobot(id) : null;
      if (spot && "desk" in spot && !spot.desk.folded && !reducedMotion()) spot.desk.robot.react("shy");
    };
    this.chatPingTimer = window.setTimeout(ping, delay);
  }
}
