// Queued messages as T3 holds them, shared by the local reader (conversation.cjs, t3.cjs) and
// linked computers (remote-building.cjs), so every surface agrees on what is still waiting.

/** A run T3 cancelled before it started: a message removed from the queue (the agent never saw it). */
const withdrawn = (run) => !!run && (run.status === "cancelled" || run.status === "canceled") && !run.startedAt;

/** T3 delivers by queuePosition (set when you reorder), then by ordinal. */
const deliveryOrder = (a, b) => (a.queuePosition ?? a.ordinal) - (b.queuePosition ?? b.ordinal) || a.ordinal - b.ordinal;

/** A queued message as one line for the robot's to-do app: its words, with files and threads as a short note. */
function queuedText(m) {
  const raw = String(m?.context?.guest?.text ?? m?.text ?? "");
  const files = (raw.match(/^\s*-\s*(image|file):/gim) || []).length + (m?.attachments?.length || 0);
  const refs = (raw.match(/<referenced_thread\b/g) || []).length;
  const words = raw.replace(/<referenced_thread\b[\s\S]*?<\/referenced_thread>/g, " ").replace(/\s*Attached:[\s\S]*$/, "").replace(/\s+/g, " ").trim().slice(0, 140);
  const notes = [files ? (files > 1 ? `${files} attachments` : "attachment") : "", refs ? (refs > 1 ? `${refs} threads` : "thread") : ""].filter(Boolean);
  return words + (notes.length ? `${words ? " " : ""}(+ ${notes.join(", ")})` : "");
}

module.exports = { withdrawn, deliveryOrder, queuedText };
