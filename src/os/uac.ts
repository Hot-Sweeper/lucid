// The permission prompt on a robot's screen. When T3 really has an approval open for this
// robot (a command, a file change, a tool), the screen dims and a small dialog asks, in the app's
// own style: who asks, what it wants to do, Yes and No. It only shows what T3 reports as pending
// and goes away when T3 says the request is settled: the pressed button is the real decision,
// made in the chat by you or by the Orchestrator. The buttons are not clickable here on purpose,
// so a stray click on a monitor can never approve anything.
import gsap from "gsap";
import type { WM } from "./wm";
import { esc } from "./typing";

type Approval = { id: string; type: string; requestKind?: string; prompt?: string; detail?: string; options?: { decision: string; label: string; warning: string | null }[] };
export type UacDeps = {
  pending(threadId: string): Promise<Approval[]>;
  outcome(threadId: string, requestId: string): Promise<{ status: string; decision: string | null } | null>;
};
export type UacWho = { name: string; harness: string };

const ASK: Record<string, { title: string; wants: string }> = {
  command: { title: "Can I run this on your machine?", wants: "Run" },
  "file-change": { title: "Can I change these files?", wants: "Change" },
  "file-read": { title: "Can I read this file?", wants: "Read" },
  "mcp-elicitation": { title: "Can I use this tool?", wants: "Use" },
};
const ASK_DEFAULT = { title: "Can I go ahead with this?", wants: "Do" };
const GENERIC_NOTE = /^this (command|action|request) requires approval\.?$/i;

// a robot shield: two eyes, like the robots themselves
const SHIELD = `<svg viewBox="0 0 32 36" aria-hidden="true"><path d="M16 1.5 29 6v10.2c0 8.4-5.4 15.2-13 18.3C8.4 31.4 3 24.6 3 16.2V6Z" fill="currentColor"/><rect x="9" y="12" width="14" height="8" rx="4" fill="#141a33"/><circle cx="13" cy="16" r="1.7" fill="#7fe0ff"/><circle cx="19" cy="16" r="1.7" fill="#7fe0ff"/><rect x="15.2" y="7" width="1.6" height="3.4" rx=".8" fill="#141a33"/></svg>`;

const isYes = (d: string | null) => !!d && /^accept/.test(d);

export class UacPrompt {
  private el: HTMLElement | null = null;
  private id: string | null = null;
  private timer = 0;
  private epoch = -1;
  private generation = 0;
  constructor(private wm: WM, private deps: UacDeps) {}

  get isUp() { return !!this.el; }

  /** An approval item arrived or changed. It is shown only while T3 really has it open. */
  async sync(threadId: string, requestId: string | undefined, who: UacWho) {
    if (!threadId || !requestId || this.id) return;
    const epoch = this.wm.epoch, generation = this.generation;
    const open = (await this.deps.pending(threadId).catch(() => [])).find((r) => r.id === requestId && r.type === "approval");
    if (!open || this.id || epoch !== this.wm.epoch || generation !== this.generation) return;
    this.show(threadId, open, who);
  }

  private show(threadId: string, r: Approval, who: UacWho) {
    this.generation++;
    this.id = r.id;
    this.epoch = this.wm.epoch;
    const kind = ASK[r.requestKind ?? ""] ?? ASK_DEFAULT;
    const warn = r.options?.map((o) => o.warning).find(Boolean) ?? null;
    const note = [warn, r.detail && !GENERIC_NOTE.test(r.detail.trim()) ? r.detail : ""].filter(Boolean).join(" ").trim();
    const risky = !!warn || /dangerous|destructive|irreversible|delete/i.test(r.detail || "");
    const prompt = (r.prompt || "").trim();
    const el = document.createElement("div");
    el.className = `uac${risky ? " risky" : ""}`;
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-label", kind.title);
    el.innerHTML = `
      <div class="uac-box">
        <div class="uac-head"><span class="uac-shield">${SHIELD}</span><h4>${esc(kind.title)}</h4></div>
        <dl class="uac-rows">
          <dt>Robot</dt><dd>${esc(who.name)}${who.harness ? ` <i>${esc(who.harness)}</i>` : ""}</dd>
          ${prompt ? `<dt>${esc(kind.wants)}</dt><dd><code>${esc(prompt.slice(0, 600))}</code></dd>` : ""}
          ${note ? `<dt>T3 says</dt><dd>${esc(note.slice(0, 240))}</dd>` : ""}
        </dl>
        <div class="uac-btns"><span class="uac-yes">Yes</span><span class="uac-no">No</span></div>
        <p class="uac-foot">Answer in this robot's chat</p>
      </div>`;
    this.wm.root.appendChild(el);
    this.el = el;
    const box = el.querySelector(".uac-box") as HTMLElement, shield = el.querySelector(".uac-shield") as HTMLElement;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.set(el, { opacity: 1 });
    else {
      // the desktop dims first, then the dialog comes forward out of the dark
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.out" });
      gsap.fromTo(box, { opacity: 0, y: 16, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, delay: 0.14, ease: "expo.out", transformOrigin: "50% 40%" });
      gsap.fromTo(shield, { scale: 1 }, { scale: 1.14, duration: 0.18, delay: 0.5, yoyo: true, repeat: 1, ease: "power2.out" });
    }
    this.timer = window.setInterval(() => void this.poll(threadId), 1200);
  }

  // is it still open? when it is not, show how it was decided
  private async poll(threadId: string) {
    const id = this.id, el = this.el, generation = this.generation;
    if (!id || !this.el) return;
    if (this.epoch !== this.wm.epoch) { this.drop(); return; }
    const current = () => this.id === id && this.el === el && this.generation === generation && this.epoch === this.wm.epoch;
    const still = (await this.deps.pending(threadId).catch(() => null))?.some((r) => r.id === id);
    if (!current() || still !== false) return;   // unknown (the read failed) is not a decision
    const out = await this.deps.outcome(threadId, id).catch(() => null);
    if (!current()) return;
    this.settle(out?.decision ?? null);
  }

  private settle(decision: string | null) {
    this.generation++;
    const el = this.el;
    window.clearInterval(this.timer);
    this.timer = 0;
    if (!el) return;
    this.el = null;
    this.id = null;   // settled: a later request can come up at once
    const pressed = decision ? (isYes(decision) ? ".uac-yes" : ".uac-no") : null;
    const other = pressed === ".uac-yes" ? ".uac-no" : pressed ? ".uac-yes" : null;
    if (pressed) el.querySelector(pressed)!.classList.add("pressed");
    if (other) el.querySelector(other)!.classList.add("faded");
    const box = el.querySelector(".uac-box") as HTMLElement;
    gsap.timeline({ onComplete: () => el.remove() })
      .to(el.querySelector(pressed ?? ".uac-btns")!, { scale: 0.94, duration: 0.1, yoyo: true, repeat: 1 }, 0)
      .to(box, { opacity: 0, y: 6, scale: 0.97, duration: 0.3, ease: "power2.in" }, 0.55)
      .to(el, { opacity: 0, duration: 0.4, ease: "power1.in" }, 0.65);
  }

  private drop() {
    this.generation++;
    window.clearInterval(this.timer);
    this.timer = 0;
    this.el?.remove();
    this.el = null;
    this.id = null;
  }

  /** The robot's screen was reset (another thread took the desk). */
  reset() { this.drop(); }
}
