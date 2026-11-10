import type { World, WorldData, WThread } from "../office/world";
import { eventLine, type LineFact } from "./index";

// Watches successive T3 snapshots and lets a seated robot remark on what really changed for
// its thread: a run finished or stopped, a question started waiting, a run has been going for
// a long time, the work was settled. The first snapshot only primes the watcher, so opening
// the app never replays old events. Remarks are rare: one per thread a minute, one per office
// every few seconds, and never over a bubble that is already showing.

type Seen = { run: string | null; question: boolean; settled: boolean; startedAt: string | null };
const ACTIVE = /^(running|starting|preparing|queued|waiting)$/;
const STOPPED = /^(failed|interrupted|cancelled|canceled|error)$/;
const LONG_MARKS = [30, 60, 120, 240];
const THREAD_GAP = 60_000, OFFICE_GAP = 6_000;

const minutesBetween = (from: string | null | undefined, to: string | number) => {
  const a = Date.parse(String(from ?? "")), b = typeof to === "number" ? to : Date.parse(to);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? (b - a) / 60000 : null;
};

/** Pure: the facts between two snapshots of one thread (exported for checks). */
export function threadFacts(prev: Seen | undefined, t: WThread, now: number, marks: Map<string, number>): LineFact[] {
  const facts: LineFact[] = [];
  const title = t.title || "";
  if (prev && ACTIVE.test(prev.run ?? "")) {
    if (t.runStatus === "completed") {
      const minutes = minutesBetween(prev.startedAt, t.updatedAt);
      facts.push(minutes && minutes >= 2 && minutes < 24 * 60 ? { kind: "finished", title, minutes } : { kind: "finished", title });
    } else if (STOPPED.test(t.runStatus ?? "")) facts.push({ kind: "stopped", title });
  }
  if (prev && !prev.question && t.question) facts.push({ kind: "question", title });
  if (prev && !prev.settled && t.settled) facts.push({ kind: "settled", title });
  if (ACTIVE.test(t.runStatus ?? "") && t.runStartedAt) {
    const minutes = minutesBetween(t.runStartedAt, now), key = `${t.id}\n${t.runStartedAt}`;
    const mark = minutes === null ? undefined : [...LONG_MARKS].reverse().find(m => minutes >= m);
    // Crossing a mark is remembered per run; the first sighting of an old run is silent.
    if (mark && marks.has(key) && mark > marks.get(key)!) facts.push({ kind: "longRun", title, minutes: minutes! });
    if (minutes !== null) marks.set(key, Math.max(marks.get(key) ?? 0, mark ?? 0));
  }
  return facts;
}

export class ThreadEventLines {
  private seen = new Map<string, Seen>();
  private marks = new Map<string, number>();
  private spoke = new Map<string, number>();
  private officeAt = 0;
  private environment: string | undefined = undefined;
  private primed = false;
  constructor(private world: World) {}

  observe(data: WorldData) {
    if (data.environmentId !== this.environment) { this.environment = data.environmentId; this.seen.clear(); this.marks.clear(); this.primed = false; }
    const now = Date.now(), due: [string, LineFact][] = [];
    for (const t of data.threads) {
      const prev = this.seen.get(t.id);
      const facts = threadFacts(this.primed ? prev : undefined, t, now, this.marks);
      if (this.primed) for (const f of facts) due.push([t.id, f]);
      this.seen.set(t.id, { run: t.runStatus, question: !!t.question, settled: t.settled, startedAt: t.runStartedAt ?? prev?.startedAt ?? null });
    }
    const live = new Set(data.threads.map(t => t.id));
    for (const id of this.seen.keys()) if (!live.has(id)) this.seen.delete(id);
    for (const key of this.marks.keys()) if (!live.has(key.slice(0, key.indexOf("\n")))) this.marks.delete(key);
    this.primed = true;
    // After the world applies this snapshot, so a robot that just stood up stays quiet.
    if (due.length) setTimeout(() => { for (const [id, fact] of due) this.remark(id, fact); }, 0);
  }

  private remark(id: string, fact: LineFact) {
    const now = Date.now(), desk = this.world.deskFor(id);
    if (document.hidden || !desk || now - this.officeAt < OFFICE_GAP || now - (this.spoke.get(id) ?? 0) < THREAD_GAP) return;
    const text = eventLine(fact, desk.profile?.name);
    if (!text || !desk.remark(text)) return;
    this.officeAt = now; this.spoke.set(id, now);
    if (this.spoke.size > 200) this.spoke.delete(this.spoke.keys().next().value!);
  }
}
