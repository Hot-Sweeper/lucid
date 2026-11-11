// Which robot belongs to the open chat. Its desk's nameplate carries the accent ring and a small
// chat tag floats over the robot's head (at its desk, walking, resting or in another building),
// kept readable at every zoom. When the robot is out of view, a portrait at the office edge points
// toward it and takes the camera there. The reverse holds too: clicking a robot opens its chat and
// hovering one names its conversation. "Show this robot" glides the camera to it and the tag pings
// once it arrives.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { portraitSvg, PALETTES, brandFor, GEOM } from "../../robot";
import gsap from "gsap";
import { icon } from "../../ui/icons";
import { reducedMotion } from "../../util/dom";
import type { Desk } from "../desk";
import type { World } from "../world";
import { edgePoint, markScale } from "./edge-point";
import "../chat-mark.css";

/** Where an open chat's robot is: seated at a desk (also in a folded office) or a walking actor. */
type RobotSpot = { desk: Desk; office: World } | { walker: HTMLElement; office: World };
const TAG = 30;   // the chat tag's size in world pixels at zoom 1
const TAG_MIN_PX = 22;   // never smaller than this on screen

export class WorldChatMark {
  mountChatMark(this: World) {
    const tag = document.createElement("div");
    tag.className = "chat-mark"; tag.setAttribute("aria-hidden", "true");
    tag.innerHTML = `<i class="cm-ping"></i>${icon("chat", 16)}`;
    this.chatTag = tag;
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
    // Hovering a robot names its conversation and lights up its desk's nameplate.
    this.root.addEventListener("pointerover", (e) => {
      const hit = (e.target as Element | null)?.closest<HTMLElement>(".world-walker[data-id], .desk-unit .poke-head, .desk-unit .robot-host");
      if (!hit || hit === this.hoverRobot) return;
      this.hoverRobot?.closest(".desk-unit")?.classList.remove("robot-hover");
      this.hoverRobot = hit;
      const desk = hit.closest<HTMLElement>(".desk-unit");
      const id = desk ? this.deskAt(desk)?.threadId : hit.dataset.id;
      if (!id) return;
      desk?.classList.add("robot-hover");
      const about = this.robotTitle(id);
      if (about) (desk ? desk.querySelector<HTMLElement>(".poke-head")! : hit).title = about;
    });
    this.root.addEventListener("pointerout", (e) => {
      const hit = this.hoverRobot;
      if (!hit || hit.contains(e.relatedTarget as Node | null)) return;
      hit.closest(".desk-unit")?.classList.remove("robot-hover");
      this.hoverRobot = null;
    });
  }

  deskAt(this: World, el: HTMLElement) {
    for (const d of this.allDesks) if (d.el === el) return d;
    for (const entry of this.neighbors.values()) for (const d of entry.office?.allDesks ?? []) if (d.el === el) return d;
    return null;
  }

  /** "Juno: Fix the website. This chat is open" (the name, the conversation and what a click does). */
  robotTitle(this: World, id: string) {
    const offices = [this, ...[...this.neighbors.values()].flatMap((e) => e.office ? [e.office] : [])];
    const t = offices.flatMap((o) => o.lastData?.threads ?? []).find((x) => x.id === id);
    if (!t) return "";
    const robot = this.roster.forJob(id);
    return `${robot?.name ? `${robot.name}: ` : ""}${t.title}\n${id === this.chatThread ? "This chat is open" : "Click to open this chat"}`;
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

  /** Puts the chat tag on the robot, the accent ring on its nameplate and keeps the edge pointer in step. */
  paintChatMark(this: World) {
    const tag = this.chatTag, beacon = this.chatBeacon;
    if (!tag || !beacon) return;
    const id = this.chatThread, spot = id ? this.locateRobot(id) : null;
    const plate = spot && "desk" in spot ? spot.desk.el : null;
    for (const el of this.root.querySelectorAll(".desk-unit.chat-open")) if (el !== plate) el.classList.remove("chat-open");
    plate?.classList.add("chat-open");
    const host = !spot ? null : "desk" in spot ? spot.desk.el : spot.walker;
    if (!host) { tag.remove(); beacon.hidden = true; return; }
    if (tag.parentElement !== host) {
      host.append(tag);
      // over the seated robot's head, or over a walking robot's head (its height is --head-top)
      tag.classList.toggle("on-walker", !("desk" in spot!));
      if ("desk" in spot!) Object.assign(tag.style, { left: `${GEOM.head.x}px`, top: `${GEOM.head.y - 58}px` });
      else Object.assign(tag.style, { left: "0px", top: "" });
    }
    // Far away it keeps a readable size on screen; close up it is its own size in the room.
    const scale = markScale(this.cam.s, TAG, TAG_MIN_PX).toFixed(3);
    if (tag.style.scale !== scale) tag.style.scale = scale;
    this.paintBeacon(spot!, tag);
  }

  /** A portrait at the edge of the office that points toward the chat's robot when it is out of view. */
  paintBeacon(this: World, spot: RobotSpot, tag: HTMLElement) {
    const beacon = this.chatBeacon!, id = this.chatThread!;
    // Hidden while the camera is already on its way (a glide, a flight or following a robot).
    if (this.glideAnim || this.followEl || this.cameraTween?.isActive()) { beacon.hidden = true; return; }
    const box = this.sceneBox ??= this.scene.getBoundingClientRect();
    // A folded office points at its facade; its desks are not drawn.
    const target = "desk" in spot && spot.desk.folded ? spot.office.roomById(spot.desk.room)?.el ?? tag : tag;
    const r = target.getBoundingClientRect();
    const x = r.left + r.width / 2 - box.left, y = r.top + r.height / 2 - box.top;
    const at = edgePoint(x, y, { left: this.journeyInsets.left + 40, right: box.width - this.journeyInsets.right - this.panelWidth - 40, top: 84, bottom: box.height - 88 }, 30);
    if (!at) { if (!beacon.hidden) beacon.hidden = true; return; }
    const robot = this.roster.forJob(id), sig = `${robot?.id}|${robot?.provider}|${JSON.stringify(robot?.look ?? {})}`;
    if (beacon.dataset.sig !== sig) {
      beacon.dataset.sig = sig;
      beacon.querySelector(".cb-face")!.innerHTML = portraitSvg(robot?.look ?? {}, PALETTES[brandFor(robot?.provider)], { size: 30 });
      const label = `Show ${robot?.name ?? "this robot"}`;
      beacon.title = `${label}: it is out of view`; beacon.setAttribute("aria-label", label);
    }
    const shown = beacon.hidden;
    beacon.hidden = false;
    beacon.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
    beacon.style.setProperty("--dir", `${at.angle.toFixed(3)}rad`);
    if (shown && !reducedMotion()) gsap.fromTo(beacon.querySelector(".cb-face"), { scale: .9, opacity: 0 }, { scale: 1, opacity: 1, duration: .2, ease: "power3.out", clearProps: "scale,opacity" });
  }

  /** "Show this robot": glide to the chat's robot wherever it is; the tag pings when the camera arrives. */
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

  /** Once the camera settles on the robot, its tag pings and the robot looks up. */
  pingChatMark(this: World, delay = 60) {
    window.clearTimeout(this.chatPingTimer);
    const started = performance.now();
    const ping = () => {
      const moving = this.cameraTween?.isActive() || !!this.glideAnim;
      if (moving && performance.now() - started < 2500) { this.chatPingTimer = window.setTimeout(ping, 60); return; }
      this.paintChatMark();
      const tag = this.chatTag;
      if (!tag?.isConnected) return;
      tag.classList.remove("ping"); void tag.offsetWidth; tag.classList.add("ping");
      this.chatPingTimer = window.setTimeout(() => tag.classList.remove("ping"), 900);
      const id = this.chatThread, spot = id ? this.locateRobot(id) : null;
      if (spot && "desk" in spot && !spot.desk.folded && !reducedMotion()) spot.desk.robot.react("shy");
    };
    this.chatPingTimer = window.setTimeout(ping, delay);
  }
}
