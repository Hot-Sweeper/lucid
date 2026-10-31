import type { Item, ThreadInfo } from "../director";
import type { BossInfo } from "./boss";
import "./boss-monitor.css";

type MonitorApi = typeof window.lucid & {
  itemsSince(id: string, since: string | null): Promise<Item[]>;
  threadInfo(id: string): Promise<ThreadInfo>;
};

export function monitorEntry(item: Item): { label: string; text: string } | null {
  const d = item.data ?? {};
  const text = (v: unknown) => typeof v === "string" ? v : "";
  switch (item.type) {
    case "assistant_message": return { label: "Orchestrator", text: text(d.text) };
    case "user_message": return { label: "You", text: text(d.text) };
    case "reasoning": return { label: "Thinking", text: text(d.text) };
    case "command_execution": return { label: "Terminal", text: text(d.input) };
    case "file_change": return { label: "Editing", text: text(d.fileName) || text(d.changes?.[0]?.path) };
    case "web_search": return { label: "Searching", text: text(d.query) || text(d.patterns?.[0]) };
    case "dynamic_tool": return { label: "Using a tool", text: text(d.toolName).replace(/^mcp__.+?__/, "").replace(/_/g, " ") };
    default: return null;
  }
}

/** A live, bounded view of the existing orchestrator thread, loaded on demand. */
export class BossMonitor {
  readonly el = document.createElement("div");
  onSelect: (id: string) => void = () => {};
  private id: string | null = null;
  private open = false;
  private epoch = 0;
  private items = new Map<string, Item>();
  private unsub: (() => void)[] = [];
  private back: HTMLButtonElement;
  private front: HTMLElement;
  private list: HTMLElement;
  private status: HTMLElement;
  private api = window.lucid as MonitorApi;

  constructor(parent: HTMLElement, x: number, y: number) {
    this.el.className = "boss-monitor";
    this.el.style.left = `${x}px`; this.el.style.top = `${y}px`;
    this.el.innerHTML = `<div class="bm-turn"><button type="button" class="bm-back" aria-label="Turn the orchestrator screen toward you" aria-expanded="false"><span></span></button>
      <section class="bm-front" aria-label="Orchestrator screen" inert>
        <header><strong>Orchestrator</strong><button type="button" class="bm-close">Turn back</button></header>
        <p class="bm-status"></p><div class="bm-activity" tabindex="0" aria-label="Recent orchestrator activity"></div>
        <footer><button type="button" class="bm-chat">Open conversation</button></footer>
      </section></div>`;
    parent.append(this.el);
    this.back = this.el.querySelector(".bm-back")!;
    this.front = this.el.querySelector(".bm-front")!;
    this.list = this.el.querySelector(".bm-activity")!;
    this.status = this.el.querySelector(".bm-status")!;
    this.back.addEventListener("click", () => this.turn(true));
    this.el.querySelector(".bm-close")!.addEventListener("click", () => this.turn(false));
    this.el.querySelector(".bm-chat")!.addEventListener("click", () => { if (this.id) this.onSelect(this.id); });
    for (const event of ["pointerdown", "click", "dblclick", "wheel"]) this.el.addEventListener(event, e => e.stopPropagation());
    this.el.addEventListener("keydown", e => { if(e.key === "Escape" && this.open) { e.preventDefault(); e.stopPropagation(); this.turn(false); } });
    if (this.api?.onItems) this.unsub.push(this.api.onItems(({threadId,items}) => { if(threadId===this.id && this.open) this.merge(items); }));
    if (this.api?.onInfo) this.unsub.push(this.api.onInfo(({threadId,info}) => { if(threadId===this.id && !info.error) this.setStatus(info); }));
    this.set(null);
  }

  set(info: BossInfo | null) {
    const id = info?.id ?? null;
    if(id!==this.id) { ++this.epoch; this.turn(false); this.items.clear(); this.list.replaceChildren(); this.id=id; }
    this.back.disabled = !id;
    this.back.title = id ? "View the orchestrator screen" : "Hire an orchestrator to view its screen";
    this.status.textContent = info?.running ? "Working" : "Ready";
  }

  private setStatus(info: ThreadInfo) {
    this.status.textContent = info.run?.status ? info.run.status.replace(/_/g," ") : "Ready";
  }

  private turn(open: boolean) {
    if(open && !this.id) return;
    this.open=open;
    this.el.classList.toggle("is-open",open);
    this.back.setAttribute("aria-expanded",String(open));
    this.back.inert=open; this.front.inert=!open;
    if(open) {
      this.el.querySelector<HTMLButtonElement>(".bm-close")!.focus({preventScroll:true});
      void this.load();
    } else {
      ++this.epoch;
      if(this.front.contains(document.activeElement)) this.back.focus({preventScroll:true});
    }
  }

  private async load() {
    const id=this.id, epoch=++this.epoch;
    if(!this.items.size) this.list.textContent="Loading activity…";
    try {
      const [items,info]=await Promise.all([this.api.itemsSince(id!,null),this.api.threadInfo(id!)]);
      if(this.id!==id || this.epoch!==epoch || !this.open) return;
      this.merge(items); if(!info.error) this.setStatus(info);
    } catch {
      if(this.id!==id || this.epoch!==epoch || !this.open) return;
      if(!this.items.size) this.list.textContent="Activity could not load. Turn back and open the screen to retry.";
    }
  }

  private merge(items: Item[]) {
    for(const item of items) {
      const old=this.items.get(item.id);
      if(!old || item.updatedAt>=old.updatedAt) this.items.set(item.id,item);
    }
    const ordered=[...this.items.values()].sort((a,b)=>a.ordinal-b.ordinal).slice(-60);
    this.items=new Map(ordered.map(item=>[item.id,item]));
    const stick=this.list.scrollHeight-this.list.scrollTop-this.list.clientHeight<32;
    const scroll=this.list.scrollTop;
    const rows=ordered.map(monitorEntry).filter((entry): entry is NonNullable<typeof entry> => !!entry?.text.trim()).slice(-12);
    const nodes=rows.map(entry=>{
      const row=document.createElement("article"),label=document.createElement("b"),body=document.createElement("p");
      label.textContent=entry.label;body.textContent=entry.text.slice(0,4000);row.append(label,body);return row;
    });
    if(nodes.length) this.list.replaceChildren(...nodes); else this.list.textContent="No activity yet.";
    this.list.scrollTop=stick?this.list.scrollHeight:scroll;
  }

  destroy() { ++this.epoch; for(const off of this.unsub) off(); this.el.remove(); }
}
