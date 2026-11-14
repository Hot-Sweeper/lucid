// Visual review of the chat queue in a running LUCID_SHOT build, driven over the DevTools port:
//   node scripts/review/verify-queue-ui.cjs <port> <out dir>
// It refuses any page that is not this checkout's dist/index.html (other apps grab test ports),
// loads queue-sim.js (fake conversation and fake T3: nothing reaches a real thread), then plays
// the states with real input events and saves after-*.png per theme.
const fs = require("node:fs");
const path = require("node:path");
const [port = "9381", out = "."] = process.argv.slice(2);
const root = path.join(__dirname, "..", "..");
const sim = fs.readFileSync(path.join(__dirname, "queue-sim.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const want = `file://${path.join(root, "dist", "index.html")}`;
  const page = pages.find((p) => p.type === "page" && decodeURI(p.url).startsWith(want));
  if (!page) throw new Error(`Port ${port} is not this checkout's app (${pages.map((p) => p.url).join(", ")})`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const waiting = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.j(new Error(m.error.message)) : w.r(m.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; waiting.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  return { send, close: () => ws.close() };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const cdp = await connect();
  const js = async (expr) => { const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const rect = (sel) => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const shot = async (name) => {
    const r = await rect(".chat-panel");
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(data, "base64"));
    console.log("saved", name);
  };
  const mouse = (type, x, y, extra = {}) => cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
  const click = async (sel) => { await js(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: "nearest" }), true`); await sleep(100); const r = await rect(sel); if (!r) throw new Error(`missing ${sel}`); const x = r.x + r.w / 2, y = r.y + r.h / 2; await mouse("mouseMoved", x, y, { button: "none" }); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); await sleep(250); };
  const key = async (k, code, mods = 0) => { await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: { ArrowUp: 38, ArrowDown: 40, Escape: 27, Enter: 13 }[k] || 0, modifiers: mods }); await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, modifiers: mods }); await sleep(300); };
  const check = async (what, expr) => { const ok = await js(expr); console.log(ok ? "ok  " : "FAIL", what); if (!ok) process.exitCode = 1; };
  const bubbles = (needle) => `[...document.querySelectorAll('.cp-list .cp-msg.you')].filter((b) => b.textContent.includes(${JSON.stringify(needle)})).length`;
  const rows = `document.querySelectorAll('.cp-queue li:not(.pending)').length`;
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });

  // Night blue, then Follow T3 with the system (and so T3) in dark appearance
  for (const [id, scheme, theme] of [["night", "dark", "night"], ["t3", "dark", "t3dark"]]) {
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
    await js(`localStorage.setItem("lucid.interfaceTheme", ${JSON.stringify(id)}); location.reload(); true`).catch(() => {});
    await sleep(6000);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await js(sim);
    await js("__queueSim.open(), true");
    await sleep(1500);
    await js("__queueSim.empty(), true"); await sleep(900);
    await shot(`after-empty-${theme}`);
    await check("while the robot works the composer says Queue", `document.querySelector('.cp-send span').textContent === 'Queue'`);

    await js("__queueSim.one(), true"); await sleep(900);
    await shot(`after-one-${theme}`);
    await check("one queued: in the queue, not in the transcript", `${rows} === 1 && ${bubbles("tag label thingys")} === 0`);

    await js("__queueSim.several(), true"); await sleep(900);
    await shot(`after-several-${theme}`);
    await click(".cp-queue li:nth-child(3) .cq-more");
    await sleep(300);
    await shot(`after-expanded-${theme}`);
    await check("Show all reveals the full text", `document.querySelector('.cp-queue li:nth-child(3)').classList.contains('open')`);
    await click(".cp-queue li:nth-child(3) .cq-more");

    // edit the second message in place
    await click('.cp-queue li:nth-child(2) [data-act="edit"]');
    await cdp.send("Input.insertText", { text: " Also on OLED." });
    await sleep(200);
    await shot(`after-editing-${theme}`);
    await key("Escape", "Escape");

    // reorder: keyboard on the grip of the last row, then a mouse drag
    await js(`document.querySelector('.cp-queue li:nth-child(4) button.cq-grip').focus(), true`);
    await sleep(150);
    await key("ArrowUp", "ArrowUp");
    await sleep(400);
    await shot(`after-reorder-keyboard-${theme}`);
    await check("keyboard move asked T3 to reorder", `__queueSim.calls.some(([k]) => k === 'reorder')`);
    await js(`document.querySelector('.cp-queue ol').scrollTop = 0, true`); await sleep(100);
    const g = await rect(".cp-queue li:nth-child(1) button.cq-grip");
    const r1 = await rect(".cp-queue li:nth-child(1)"), r2 = await rect(".cp-queue li:nth-child(2)");
    const t = { h: r2.y + r2.h / 2 - (r1.y + r1.h / 2) }; // far enough to pass the second row's middle
    await mouse("mouseMoved", g.x + g.w / 2, g.y + g.h / 2, { button: "none" });
    await mouse("mousePressed", g.x + g.w / 2, g.y + g.h / 2);
    for (let i = 1; i <= 8; i++) { await mouse("mouseMoved", g.x + g.w / 2, g.y + g.h / 2 + (t.h + 10) * i / 8); await sleep(30); }
    await sleep(200);
    await shot(`after-dragging-${theme}`);
    await mouse("mouseReleased", g.x + g.w / 2, g.y + g.h / 2 + t.h + 10);
    await sleep(700);
    await shot(`after-reordered-${theme}`);

    await click('.cp-queue li:nth-child(4) [data-act="remove"]');
    await shot(`after-remove-confirm-${theme}`);
    await key("Escape", "Escape");

    // composing while the robot works: the message waits in the queue, marked Adding
    await js(`(() => { const ta = document.querySelector('.cp-form textarea'); ta.focus(); return true; })()`);
    await cdp.send("Input.insertText", { text: "One more thing: keep the sidebar order." });
    await key("Enter", "Enter");
    await sleep(120);
    await shot(`after-adding-${theme}`);
    await check("a message sent while working shows only in the queue", `${bubbles("keep the sidebar order")} === 0 && [...document.querySelectorAll('.cp-queue li')].some((li) => li.textContent.includes('keep the sidebar order'))`);
    await sleep(1600);

    // T3 delivers the next message: it leaves the queue and rises into the transcript
    await js(`document.querySelector('.cp-queue ol').scrollTop = 0, true`);
    const first = await js(`document.querySelector('.cp-queue li .cq-text').textContent.slice(0, 30)`);
    await js("__queueSim.deliver(), true");
    for (const [i, ms] of [[1, 40], [2, 90], [3, 90], [4, 120], [5, 400]]) { await sleep(ms); await shot(`after-delivery-${i}-${theme}`); }
    await check("delivered message is in the transcript once and gone from the queue", `${bubbles(first)} === 1 && ![...document.querySelectorAll('.cp-queue li')].some((li) => li.textContent.includes(${JSON.stringify(first)}))`);

    await js("__queueSim.held(), true"); await sleep(900);
    await shot(`after-held-${theme}`);
    await check("after a stop the queue is paused with Resume and the composer says Send", `!document.querySelector('.cq-resume').hidden && document.querySelector('.cp-send span').textContent === 'Send'`);
  }
  cdp.close();
})().catch((err) => { console.error(err); process.exit(1); });
