export type ChatMessage = {
  id: string; role: string; at: string; orderAt?: string; sourceOrder?: number; streaming: boolean; text: string; run?: string | null; queue?: number | null;
  artifact?: { html: string; title: string; height: number };
  attachments: { type: string; name: string; mime: string; size: number; path: string | null }[];
  event?: { kind: "compaction" | "handoff" | "harness" | "model"; status?: string; from?: { provider?: string; model?: string }; to?: { provider?: string; model?: string } };
  queueRunId?: string; steerTarget?: string | null; queueFixed?: boolean; queueGuest?: boolean;
  work?: TurnWork;
};
/** What one turn did, from T3's turn items (electron/conversation.cjs). */
export type TurnWork = {
  status: string; startedAt: string | null; completedAt: string | null; sig: string;
  commands: number; edits: number; searches: number; tools: number; agents: number; failed: number; total: number;
  lines: { k: "cmd" | "edit" | "search" | "tool" | "agent" | "error"; t: string; s: string; a?: string; src?: string }[];
};

// Keep message references rather than serialized copies of the conversation in
// DOM attributes. IPC creates new objects even when their contents are unchanged.
export function sameChatMessage(a: ChatMessage | undefined, b: ChatMessage) {
  if (a === b) return true;
  if (!a || a.id !== b.id || a.role !== b.role || a.at !== b.at || a.orderAt !== b.orderAt
    || a.sourceOrder !== b.sourceOrder || a.streaming !== b.streaming || a.text !== b.text
    || a.run !== b.run || a.queue !== b.queue || a.queueRunId !== b.queueRunId
    || a.steerTarget !== b.steerTarget || a.queueFixed !== b.queueFixed || a.queueGuest !== b.queueGuest
    || a.work?.sig !== b.work?.sig || a.artifact?.html !== b.artifact?.html || a.artifact?.title !== b.artifact?.title || a.artifact?.height !== b.artifact?.height) return false;
  const x = a.event, y = b.event;
  if (x !== y && (!x || !y || x.kind !== y.kind || x.status !== y.status
    || !!x.from !== !!y.from || !!x.to !== !!y.to
    || x.from?.provider !== y.from?.provider || x.from?.model !== y.from?.model
    || x.to?.provider !== y.to?.provider || x.to?.model !== y.to?.model)) return false;
  return a.attachments.length === b.attachments.length && a.attachments.every((file, i) => {
    const next = b.attachments[i];
    return file.type === next.type && file.name === next.name && file.mime === next.mime && file.size === next.size && file.path === next.path;
  });
}
