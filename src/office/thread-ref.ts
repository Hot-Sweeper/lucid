// A thread you point a robot to: dragged from the sidebar into the chat, shown as a chip in the
// message box, and sent as a short block the receiving agent can read (and look up by its id).

export type ThreadRef = {
  id: string;
  title: string;
  project: string;
  provider?: string | null;
  ask?: string;    // the last thing the user asked in that thread
  reply?: string;  // the last answer there
};

const TAG = "referenced_thread";
const attr = (s: string) => String(s ?? "").replace(/"/g, "'").replace(/[\r\n]+/g, " ").trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// Text without earlier references, file lists and extra whitespace, for a one-glance summary.
export function plain(text: string) {
  return stripRefs(text).body
    .replace(/\n*Attached:\n(?:- (?:image|file): .+(?:\n|$))+\s*$/, "")
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

const RE = new RegExp(`\\n*<${TAG} id="([^"]*)" title="([^"]*)" project="([^"]*)"(?: harness="([^"]*)")?>[\\s\\S]*?</${TAG}>`, "g");

// Splits a sent message into what you typed and the threads it referenced.
export function stripRefs(text: string): { body: string; refs: { id: string; title: string; project: string; harness?: string }[] } {
  const refs: { id: string; title: string; project: string; harness?: string }[] = [];
  const body = text.replace(RE, (_m, id, title, project, harness) => { refs.push({ id, title, project, harness }); return ""; }).trim();
  return { body, refs };
}
