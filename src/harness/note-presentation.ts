import { renderFps, renderLoop } from "../perf/render";
import { scheduleLayout } from "./layout";

type Entry = { paragraph: HTMLElement; text: string; dirty: boolean; done: boolean; version: number; key: string };
type Box = { owner: HTMLElement; epoch: number; generation: number; entries: Map<HTMLElement, Entry>; stop: (() => void) | null; dead: boolean };

/** Logical note updates continue while hidden; only visible presentation measures layout. */
export class NotePresentation {
  private boxes = new Map<HTMLElement, Box>();
  private generation = 0;
  constructor(private epoch: () => number, private pressKey: (key: string) => void) {}

  reset() {
    this.generation++;
    for (const box of this.boxes.values()) { box.dead = true; box.stop?.(); }
    this.boxes.clear();
  }
  private valid(box: Box) { return !box.dead && box.epoch === this.epoch() && box.generation === this.generation && box.owner.isConnected; }
  private remove(box: Box) { box.dead = true; box.stop?.(); if (this.boxes.get(box.owner) === box) this.boxes.delete(box.owner); }
  private paint(box: Box) {
    if (!this.valid(box)) { this.remove(box); return; }
    if (!renderFps(box.owner)) return;
    let changed = false;
    for (const [paragraph, entry] of box.entries) {
      if (!paragraph.isConnected || !box.owner.contains(paragraph)) { box.entries.delete(paragraph); continue; }
      if (entry.dirty) {
        entry.dirty = false;
        if (paragraph.textContent !== entry.text) { paragraph.textContent = entry.text; changed = true; }
        if (entry.key) { this.pressKey(entry.key); entry.key = ""; }
      }
      if (entry.done) box.entries.delete(paragraph);
    }
    if (changed) scheduleLayout(box.owner, () => {
      // Visibility/assignment can change after text paint but before this batch.
      if (!this.valid(box) || !renderFps(box.owner)) return null;
      const target = Math.max(0, box.owner.scrollHeight - box.owner.clientHeight);
      return Math.abs(target - box.owner.scrollTop) < .5 ? null : () => {
        if (this.valid(box) && renderFps(box.owner)) box.owner.scrollTop = target;
      };
    });
    if (!box.entries.size) {
      // Keep the box valid until its queued final scroll batch has completed.
      box.stop?.(); box.stop = null;
      if (this.boxes.get(box.owner) === box) this.boxes.delete(box.owner);
    }
  }
  async write(owner: HTMLElement, paragraph: HTMLElement, target: string, speed: number) {
    for (const box of this.boxes.values()) if (!this.valid(box)) this.remove(box);
    if (!owner.isConnected || !paragraph.isConnected) return;
    let box = this.boxes.get(owner);
    if (!box) { box = { owner, epoch: this.epoch(), generation: this.generation, entries: new Map(), stop: null, dead: false }; this.boxes.set(owner, box); }
    for (const p of box.entries.keys()) if (!p.isConnected || !owner.contains(p)) box.entries.delete(p);
    let entry = box.entries.get(paragraph);
    if (!entry) { entry = { paragraph, text: paragraph.textContent || "", dirty: false, done: false, version: 0, key: "" }; box.entries.set(paragraph, entry); }
    const version = ++entry.version;
    entry.done = false; entry.key = "";
    const current = () => this.valid(box!) && paragraph.isConnected && entry!.version === version;
    const queue = () => { if (!box!.stop) box!.stop = renderLoop(owner, () => this.paint(box!)); };
    const initial = entry.text;
    let shown = target.startsWith(initial) ? initial.length : target.length;
    if (shown === target.length) { entry.text = target; entry.dirty = true; queue(); }
    while (shown < target.length && current()) {
      const fps = renderFps(owner);
      if (!fps) { entry.text = target; entry.dirty = true; queue(); break; }
      const cadence = Math.max(22 / Math.max(.1, speed), 1000 / fps);
      const step = Math.max(3, Math.round(cadence * 3 * Math.max(.1, speed) / 22));
      entry.key = target[shown] || " ";
      shown = Math.min(target.length, shown + step);
      entry.text = target.slice(0, shown); entry.dirty = true; queue();
      await new Promise<void>((resolve) => setTimeout(resolve, cadence));
    }
    if (!current()) {
      if (!this.valid(box)) this.remove(box);
      else if (!paragraph.isConnected && box.entries.get(paragraph) === entry) box.entries.delete(paragraph);
      return;
    }
    entry.text = target; entry.dirty = true; entry.done = true; queue();
  }
}
