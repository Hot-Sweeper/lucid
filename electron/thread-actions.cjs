// Stop, rename and archive: T3's own thread commands, validated here as well as in the UI.
// A linked computer's thread (id with "::") goes to that computer, never to the local T3.

const BUSY = new Set(["running", "starting", "preparing", "queued", "waiting", "awaiting_input"]);

/** The T3 command for one action, or a readable refusal. `local` reads the local thread state. */
function threadCommand(action, input, { local = null, reserved = () => null } = {}) {
  const threadId = input?.threadId;
  if (typeof threadId !== "string" || !threadId || threadId.length > 300) throw Error("Choose a thread first.");
  const state = threadId.includes("::") || !local ? null : local(threadId);
  const busy = state ? BUSY.has(state.run?.status) || state.pendingRuns > 0 : null;
  if (action === "stop") {
    if (busy === false) throw Error("Nothing is running in this thread.");
    // T3 holds queued messages after a stop; they wait until you send or resume.
    return { type: "thread.stop", threadId };
  }
  if (action === "rename") {
    const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : "";
    if (!title) throw Error("Enter a name for this thread.");
    if (title.length > 120) throw Error("Keep the name under 120 characters.");
    return { type: "thread.metadata.update", threadId, title };
  }
  if (action === "archive") {
    if (reserved(threadId)) throw Error(reserved(threadId));
    if (busy) throw Error("Stop this thread before archiving it.");
    return { type: "thread.archive", threadId };
  }
  throw Error("Unknown thread action.");
}

module.exports = { threadCommand };
