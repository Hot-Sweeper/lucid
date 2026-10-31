import { Director, type Item, type ThreadInfo } from "../director";
import { WM } from "../os/wm";
import { DeferredRobot } from "../perf/deferred-robot";
import { setRenderView, releaseRenderView } from "../perf/render";
import { logoFor } from "../office/brand";
import type { BossInfo } from "./boss";
import "./boss-monitor.css";

type MonitorApi = typeof window.lucid & {
  itemsSince(id: string, since: string | null): Promise<Item[]>;
  threadInfo(id: string): Promise<ThreadInfo>;
};
const turned = new Map<string, boolean>();

/** The ordinary robot desktop, viewed through a monitor that can swivel. */
export class BossMonitor {
  readonly el = document.createElement("div");
  private id: string | null = null;
  private open = false;
  private epoch = 0;
  private unsub: (() => void)[] = [];
  private screen: HTMLElement;
  private wm: WM | null = null;
  private director: Director | null = null;
  private visible = true;
  private observer: IntersectionObserver | null = null;
  private api = window.lucid as MonitorApi;

  constructor(parent: HTMLElement, x: number, y: number) {
    this.el.className = "boss-monitor";
    this.el.style.left = `${x}px`; this.el.style.top = `${y}px`;
    this.el.setAttribute("role", "button"); this.el.tabIndex = 0;
    this.el.innerHTML = `<div class="bm-turn"><div class="bm-back"><span></span></div><div class="bm-front"><div class="screen" inert></div></div></div>`;
    this.screen = this.el.querySelector(".screen")!;
    parent.append(this.el);
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      setRenderView(this.screen,this.open && this.visible,entry.boundingClientRect.width * 98 / 110 || 98);
    });
    this.observer.observe(this.el);
    this.el.addEventListener("click", () => this.turn(!this.open));
    this.el.addEventListener("keydown", e => {
      if(e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); this.turn(!this.open); }
    });
    for(const event of ["pointerdown", "click", "dblclick"]) this.el.addEventListener(event, e => e.stopPropagation());
    if(this.api?.onItems) this.unsub.push(this.api.onItems(({threadId,items,initial}) => {
      if(threadId === this.id && this.open) this.director?.push(items,initial);
    }));
    if(this.api?.onInfo) this.unsub.push(this.api.onInfo(({threadId,info}) => {
      if(threadId === this.id && !info.error) this.director?.setInfo(info);
    }));
    this.set(null);
  }

  set(info: BossInfo | null) {
    const id = info?.id ?? null;
    if(id !== this.id) {
      ++this.epoch; this.director?.reset(); this.id = id;
      this.turn(id ? turned.get(id) ?? false : false);
    }
    this.el.setAttribute("aria-disabled", String(!id));
    this.el.tabIndex = id ? 0 : -1;
    this.label();
  }

  private label() {
    const label = !this.id ? "Orchestrator monitor" : this.open ? "Turn the orchestrator monitor away" : "Turn the orchestrator monitor toward you";
    this.el.setAttribute("aria-label", label); this.el.title = label;
    this.el.setAttribute("aria-pressed", String(this.open));
  }

  private desktop() {
    if(this.director) return;
    // Boss already owns the physical robot. The desktop needs no second rig.
    const robot = new DeferredRobot(this.el, () => { throw Error("Monitor has no second robot"); });
    this.wm = new WM(this.screen, robot);
    this.director = new Director(this.wm,robot,{say(){},setPlan(){},setGlow(){},sleepy(){}},
      url => this.api.peek(url), path => this.api.image(path), path => this.api.readText(path));
    this.director.present = () => this.open && this.visible && this.el.isConnected;
  }

  private turn(open: boolean) {
    if(open && !this.id) return;
    ++this.epoch; this.open = open;
    if(this.id) turned.set(this.id,open);
    this.el.classList.toggle("is-open",open); this.label();
    if(open) { this.desktop(); void this.load(); }
    setRenderView(this.screen,open && this.visible,this.screen.getBoundingClientRect().width || 98);
  }

  private async load() {
    const id = this.id!, epoch = this.epoch;
    try {
      const [items,info] = await Promise.all([this.api.itemsSince(id,null),this.api.threadInfo(id)]);
      if(this.id !== id || this.epoch !== epoch || !this.open) return;
      if(!info.error) {
        const logo = logoFor(info.provider); if(logo) this.wm!.setWallpaperLogo(logo);
        this.director!.setInfo(info);
      }
      this.director!.push(items,true);
    } catch { /* Retain the desktop and retry on the next toggle. */ }
  }

  destroy() {
    ++this.epoch;
    for(const off of this.unsub) off();
    this.observer?.disconnect();
    this.director?.reset(); this.wm?.destroy(); releaseRenderView(this.screen); this.el.remove();
  }
}
