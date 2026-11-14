// Renderer-side queue playground for visual review (scripts/review/verify-queue-ui.cjs evaluates it
// in a LUCID_SHOT window). It drives the real chat panel and queue code with a fake conversation
// and a fake T3 session, so nothing reaches a real thread: every queue action only changes the
// fake state below, and `deliver()` plays T3 handing the next message to the robot.
(() => {
  const chat = window.__chat;
  if (!chat) throw new Error("No chat panel (window.__chat). Run a LUCID_SHOT build.");
  const T = "queue-review-thread", t0 = Date.now() - 12 * 60_000, iso = (ms) => new Date(ms).toISOString();
  const IMG = (n) => `/home/spacestation/.t3/userdata/lucid-attachments/17946525648${n}-image.png`;
  const attached = (...paths) => `\n\nAttached:\n${paths.map((p) => `- ${/\.png$/.test(p) ? "image" : "file"}: ${p}`).join("\n")}`;
  const ref = `<referenced_thread id="ref-1" title="Nameplates: one-line topics" project="Token Industries" harness="claudeAgent">\nThe user points you to this T3 Code thread.\n</referenced_thread>`;
  const LONG = 'why does this look different on hoover bruigh also we neee dto find a better way for these tag label thingys yk they currently suck and constantly get "..." at teh end and multiple lines etc its just garbage cmon man fix it. also have the needs you above the working ones pülease';
  const PARAS = "Before you ship the room signs, check these cases:\n\n1. A project title with one very long word, like Supercalifragilisticexpialidocious-Industries, at the narrowest chat width.\n2. A German title with umlauts and a question mark.\n3. The folded rail: the dot and the tooltip must agree with the thread list.\n4. Night blue, OLED and Follow T3, light and dark.\n\nIf any of them wraps to three lines, shorten by meaning, never with an ellipsis. Send me before and after screenshots.";
  let live = true, held = false, run = 100, now = t0;
  const work = (status) => ({ status, startedAt: iso(t0 + 60_000), completedAt: status === "running" ? null : iso(Date.now()), sig: `${status}:${run}`, commands: 6, edits: 3, searches: 1, tools: 2, agents: 1, failed: 0, total: 4,
    lines: [{ k: "cmd", t: "npm run typecheck", s: "completed" }, { k: "edit", t: "src/office/nameplates.ts", s: "completed" }, { k: "agent", t: "Linked T3 devices as offices", s: status === "running" ? "running" : "completed" }, { k: "cmd", t: "npm test", s: status === "running" ? "running" : "completed" }] });
  let msgs = [
    { id: "u1", role: "user", at: iso(t0), orderAt: iso(t0), streaming: false, text: "Make the office cards readable at every zoom level.", run: "running", attachments: [] },
    { id: "a1", role: "assistant", at: iso(t0 + 90_000), orderAt: iso(t0 + 90_000), streaming: false, text: "Looking at the nameplate layout and the hover card first.", attachments: [] },
    { id: "work:r1", role: "work", at: iso(t0 + 60_000), orderAt: iso(t0 + 90_000) + "~", streaming: false, text: "", attachments: [], work: work("running") },
  ];
  let queue = [];
  const calls = [];
  const item = (id, text, extra = {}) => ({ id, run: `run-${id}`, text, at: iso((now += 30_000)), attachments: [], ...extra });
  const conversation = () => [...msgs, ...queue.map((q, i) => ({ id: q.id, role: "user", at: q.at, orderAt: q.at, streaming: false, text: q.text, run: "queued", queue: i + 1, queueRunId: q.run, steerTarget: live ? "r-live" : null, queueHeld: held, queueFixed: !!q.fixed, queueGuest: false, attachments: q.attachments }))];
  const refresh = () => chat.refresh();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const t3 = {
    status: async () => ({ paired: true, error: null, selection: null }),
    providers: async () => [],
    setModel: async () => ({}),
    stop: async () => { calls.push(["stop"]); live = false; held = queue.length > 0; refresh(); },
    reorder: async (o) => { calls.push(["reorder", o]); await wait(120); const q = queue.find((x) => x.run === o.runId); queue = queue.filter((x) => x !== q); const at = o.beforeRunId ? queue.findIndex((x) => x.run === o.beforeRunId) : queue.length; queue.splice(at, 0, q); },
    cancel: async (o) => { calls.push(["cancel", o]); await wait(120); queue = queue.filter((x) => x.run !== o.runId); },
    edit: async (o) => { calls.push(["edit", o]); await wait(150); const q = queue.find((x) => x.run === o.runId); if (q) q.text = o.text; },
    steer: async (o) => { calls.push(["steer", o]); await wait(150); const q = queue.find((x) => x.run === o.queuedRunId); queue = queue.filter((x) => x !== q); msgs.push({ id: q.id, role: "user", at: iso(Date.now()), orderAt: iso(Date.now()), streaming: false, text: q.text, run: "running", attachments: q.attachments }); },
    startQueued: async (o) => { calls.push(["startQueued", o]); await wait(150); held = false; live = true; sim.deliver(o.runId); },
  };
  chat.api = {
    ...chat.api,
    conversation: async () => conversation(),
    conversationPage: async () => ({ messages: conversation(), cursor: null, hasMore: false }),
    sendMessage: async (o) => { calls.push(["send", o]); await wait(400); if (live || queue.length) queue.push(item(`s${calls.length}`, o.message)); else msgs.push({ id: `s${calls.length}`, role: "user", at: iso(Date.now()), orderAt: iso(Date.now()), streaming: false, text: o.message, run: "running", attachments: [] }); return { ok: true }; },
    saveAttachment: async (name) => `/tmp/${name}`,
    reviewPapers: async () => [], sourceReport: async () => null,
    t3,
  };
  const status = () => chat.setThreadStatus(live ? { label: "Working", tone: "working", run: true, detail: "" } : { label: "", tone: null, run: false, detail: "Stopped" });
  const sim = {
    calls,
    open() {
      chat.open({ threadId: T, planSteps: [], info: { title: "Polish office cards and device offices", provider: "claudeAgent", model: "claude-opus-5-5", projectTitle: "Token Industries" }, profile: { name: "Nimbus" } }, false);
      status();
    },
    empty() { queue = []; live = true; held = false; status(); refresh(); },
    one() { queue = [item("q1", LONG + attached(IMG(22), IMG(23), IMG(24)))]; refresh(); },
    several() {
      queue = [item("q1", LONG + attached(IMG(22), IMG(23), IMG(24))), item("q2", "Also keep the hover card inside the window at the narrowest width."),
        item("q3", PARAS + "\n\n" + ref + attached("/home/spacestation/Applications/token-work/queue/DESIGN.md")), item("q4", "Then run the nameplate checks again.")];
      refresh();
    },
    held() { live = false; held = queue.length > 0; status(); refresh(); },
    /** T3 finished the turn and delivers the next queued message (or the given run). */
    deliver(runId) {
      const q = runId ? queue.find((x) => x.run === runId) : queue[0];
      if (!q) return;
      queue = queue.filter((x) => x !== q);
      for (const m of msgs) if (m.run === "running") m.run = "completed";
      const w = msgs.find((m) => m.role === "work" && m.work.status === "running"); if (w) { w.work = work("completed"); w.orderAt = iso(Date.now() - 2000); }
      msgs.push({ id: `final-${run}`, role: "assistant", at: iso(Date.now() - 1000), orderAt: iso(Date.now() - 1000), streaming: false, text: "Done: nameplates fit on one line at every zoom. Screenshots are in the report.", attachments: [] });
      run++;
      const at = iso(Date.now());
      msgs.push({ id: q.id, role: "user", at: q.at, orderAt: at, streaming: false, text: q.text, run: "running", attachments: q.attachments });
      msgs.push({ id: `work:r${run}`, role: "work", at, orderAt: at + "~", streaming: false, text: "", attachments: [], work: { ...work("running"), lines: [], total: 0, commands: 0, edits: 0, searches: 0, tools: 0, agents: 0 } });
      live = true; held = false; status(); refresh();
    },
    theme(id) { localStorage.setItem("lucid.interfaceTheme", id); },
  };
  window.__queueSim = sim;
  return "queue playground ready";
})();
