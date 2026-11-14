import { messageParts, splitRefs, type MessageRef } from "./message-parts";
import { NO_PROJECT, type ProjectMark } from "../ui/project-icon";

// A thread you point a robot to: dragged from the sidebar into the chat, shown as a chip in the
// message box, and sent as a short block the receiving agent can read (and look up by its id).

export type ThreadRef = {
  id: string;
  title: string;
  project: string;
  /** The project's own icon, when the thread list knows it. */
  projectIcon?: string | null;
  provider?: string | null;
  ask?: string;    // the last thing the user asked in that thread
  reply?: string;  // the last answer there
};

/** A referenced thread's project mark: "No project" (or none) is the dashed square. */
export const refMark = (r: { project?: string; projectIcon?: string | null }): ProjectMark =>
  !r.project || r.project === NO_PROJECT ? null : { title: r.project, icon: r.projectIcon ?? null };

const TAG = "referenced_thread"; // read back by message-parts.ts
const attr = (s: string) => String(s ?? "").replace(/"/g, "'").replace(/[\r\n]+/g, " ").trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// Text without earlier references, file lists and extra whitespace, for a one-glance summary.
export function plain(text: string) {
  return messageParts(text).body
    .replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/\s+/g, " ")
    .trim();
}

// The last request and the last reply of a conversation (as the chat panel loads it).
export function summarize(msgs: { role: string; text: string; run?: string | null }[]): { ask?: string; reply?: string } {
  const past = msgs.filter((m) => !(m.role === "user" && m.run === "queued"));
  const ask = [...past].reverse().find((m) => m.role === "user" && plain(m.text));
  const reply = [...past].reverse().find((m) => m.role === "assistant" && plain(m.text));
  return { ask: ask ? clip(plain(ask.text), 280) : undefined, reply: reply ? clip(plain(reply.text), 420) : undefined };
}

// The block that goes along with the message. Agents read it as context; T3's thread tools take the id.
export function refBlock(r: ThreadRef, harness?: string) {
  const lines = [
    `<${TAG} id="${attr(r.id)}" title="${attr(r.title)}" project="${attr(r.project)}"${harness ? ` harness="${attr(harness)}"` : ""}>`,
    "The user points you to this T3 Code thread. Read more of it with the T3 thread tools and this thread id if the summary is not enough.",
  ];
  if (r.ask) lines.push(`Last user request: ${r.ask}`);
  if (r.reply) lines.push(`Last reply: ${r.reply}`);
  if (!r.ask && !r.reply) lines.push("No messages loaded for a summary.");
  lines.push(`</${TAG}>`);
  return lines.join("\n");
}

// Splits a sent message into what you typed and the threads it referenced.
export function stripRefs(text: string): { body: string; refs: MessageRef[] } {
  const { body, refs } = splitRefs(text);
  return { body, refs };
}
