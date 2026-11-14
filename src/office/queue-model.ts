// The chat's one source of truth for queued messages. A message lives in the queue while T3 holds
// its run as queued, and in the transcript only once the robot receives it. A message you just
// sent waits in the place it will land (the queue while the robot works), never in both.

export type QueueEntry = {
  id: string; role: string; at: string; orderAt?: string; text: string; run?: string | null; queue?: number | null;
  queueRunId?: string; steerTarget?: string | null; queueHeld?: boolean; queueFixed?: boolean; queueGuest?: boolean;
};

/** A message on its way to T3, shown before T3 has it. `sentAt` is set once the send call returned. */
export type PendingSend = { key: string; threadId: string; text: string; at: number; place: "queue" | "transcript"; sentAt?: number };

export const isQueued = (m: Pick<QueueEntry, "role" | "run">) => m.role === "user" && m.run === "queued";

/** The transcript and the queue (in T3's delivery order) of one conversation. */
export function splitQueue<T extends QueueEntry>(msgs: T[]): { timeline: T[]; queued: T[] } {
  const timeline: T[] = [], queued: T[] = [];
  for (const m of msgs) (isQueued(m) ? queued : timeline).push(m);
  queued.sort((a, b) => (a.queue ?? Infinity) - (b.queue ?? Infinity) || (a.orderAt || a.at).localeCompare(b.orderAt || b.at));
  return { timeline, queued };
}

/** Where a message you send waits until T3 has it: T3 queues it while the robot works or others wait. */
export const pendingPlace = (working: boolean, waiting: number): PendingSend["place"] => (working || waiting > 0 ? "queue" : "transcript");

/**
 * The sends still on their way. Each message T3 has (queued or delivered) takes the place of one
 * pending copy with the same text, so two identical messages sent in a row both stay until both
 * arrive. A send T3 accepted but never listed gives up after a minute.
 */
export function settlePending(pending: PendingSend[], threadId: string, msgs: Pick<QueueEntry, "role" | "text" | "at">[], now: number, ttl = 60_000): PendingSend[] {
  const arrived = new Map<string, number>();
  const earliest = Math.min(...pending.filter((p) => p.threadId === threadId).map((p) => p.at)) - 5 * 60_000;
  for (const m of msgs) if (m.role === "user" && Date.parse(m.at) >= earliest) arrived.set(m.text.trim(), (arrived.get(m.text.trim()) ?? 0) + 1);
  return pending.filter((p) => {
    if (p.threadId !== threadId) return true;
    const n = arrived.get(p.text.trim()) ?? 0;
    if (n > 0) { arrived.set(p.text.trim(), n - 1); return false; }
    return !p.sentAt || now - p.sentAt < ttl;
  });
}

/** Messages that were waiting and now appear in the transcript: T3 delivered them (or they joined the current turn). */
export function deliveredIds(wasQueued: string[], timeline: { id: string }[]): string[] {
  const shown = new Set(timeline.map((m) => m.id));
  return wasQueued.filter((id) => shown.has(id));
}

/** "Next", then plain positions, in delivery order. */
export const orderLabel = (i: number) => (i === 0 ? "Next" : String(i + 1));

/** The queue heading's count and state. */
export const queueSummary = (waiting: number, held: boolean) => `${waiting} waiting${held ? ", paused" : ""}`;

export type RowActions = {
  move: boolean; up: boolean; down: boolean;
  edit: boolean; editNote: string;
  send: "steer" | "start" | null; sendNote: string;
  remove: boolean;
};

/**
 * What a queued row can do, each mapped to a T3 operation: reorder (queued-run.reorder), edit
 * (queued-run.edit), remove (queued-run.cancel), and Send now, which joins the current turn while
 * the robot works (queued-message.promote-to-steer) or starts the next turn after a stop, when T3
 * holds the queue (queued-run.start). Automatic task reports cannot be changed.
 */
export function rowActions(items: QueueEntry[], index: number, canAct: boolean): RowActions {
  const m = items[index];
  const none: RowActions = { move: false, up: false, down: false, edit: false, editNote: "", send: null, sendNote: "", remove: false };
  if (!m || !canAct || !m.queueRunId || m.queueFixed) return none;
  const first = items.findIndex((x) => !x.queueFixed);
  const send = m.steerTarget ? "steer" : m.queueHeld ? "start" : null;
  return {
    move: true, up: index > first, down: index < items.length - 1,
    edit: !m.queueGuest, editNote: m.queueGuest ? "A guest's message cannot be edited" : "Edit",
    send, sendNote: send === "steer" ? "Send now: it joins the turn the robot is working on" : send === "start" ? "Send now: the robot starts with this message" : "",
    remove: true,
  };
}

/**
 * Moving a run to a new place: the new order, and the run T3 wants it to sit in front of
 * (null: the end of the queue). Automatic reports at the front keep their place.
 */
export function reorderPlan(items: Pick<QueueEntry, "queueRunId" | "queueFixed">[], runId: string, to: number): { order: string[]; beforeRunId: string | null; to: number } | null {
  const runs = items.map((m) => m.queueRunId ?? "");
  const from = runs.indexOf(runId);
  if (from < 0) return null;
  const min = Math.max(0, items.findIndex((m) => !m.queueFixed));
  to = Math.max(min, Math.min(runs.length - 1, to));
  if (to === from) return null;
  const order = runs.filter((r) => r !== runId);
  order.splice(to, 0, runId);
  return { order, beforeRunId: order[to + 1] ?? null, to };
}
