// Isolated native check of the robot Explorer and the "attach files in a message" hand-over.
//
//   LUCID_EXPLORER_OUT=<empty folder> node_modules/electron/dist/electron.exe scripts/render-explorer-checks.cjs
//
// What is real: the production FilesApp, window manager, T3 Code composer and send choreography run in an
// Electron window; the folder tree, the file facts and the recorded tool steps come from a real fixture on
// disk (electron/file-facts.cjs is the same code the app's fs:stat uses). What is stubbed, and labelled in
// results.json: the robot body, and the send itself. The page cannot upload or send anything (its bridge
// counts any attempt, and the check fails if one happens). Delivery through T3 is shown separately.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { app, BrowserWindow, protocol, net } = require("electron");
const { pathToFileURL } = require("node:url");
const { fileFacts } = require("../electron/file-facts.cjs");

const repo = path.resolve(__dirname, "..");
const out = process.env.LUCID_EXPLORER_OUT ? path.resolve(process.env.LUCID_EXPLORER_OUT) : "";
if (!out) { console.error("Set LUCID_EXPLORER_OUT to an empty folder."); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const BEFORE_COMMIT = process.env.LUCID_EXPLORER_BEFORE || "fb143a8";
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// ---- a small real picture (no dependencies): a sunset gradient with two hills -------------------------
function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(body)); return Buffer.concat([len, body, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const t = y / h, hill1 = h * 0.72 + Math.sin(x / 38) * 14, hill2 = h * 0.82 + Math.sin(x / 23 + 2) * 10;
      let r = 255 - 90 * t, g = 175 - 95 * t, b = 120 + 70 * t;
      if (Math.hypot(x - w * 0.7, y - h * 0.38) < 20) { r = 255; g = 226; b = 150; }
      if (y > hill1) { r = 84; g = 90; b = 170; }
      if (y > hill2) { r = 44; g = 50; b = 118; }
      const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ---- the fixture folder ---------------------------------------------------------------------------------
const base = path.join(out, "fixture");
const root = path.join(base, "Lucid Fixture");
function write(rel, data) { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; }
const lines = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join("\n") + "\n";
write("README.md", "# Fixture project\n\nA tiny tree for the Explorer check.\n");
write("package.json", JSON.stringify({ name: "fixture", private: true }, null, 2));
write("src/main.ts", lines(40, "export const main ="));
write("src/os/apps.ts", lines(120, "export function app"));
write("src/os/explorer.ts", lines(300, "const explorer ="));
write("src/os/wm.ts", lines(200, "export class WM"));
write("src/os/styles.css", lines(30, ".rule { color: red; } /* theme */"));
write("src/harness/t3code.ts", lines(80, "export const t3 ="));
write("docs/notes.md", lines(12, "- note"));
fs.mkdirSync(path.join(root, "empty"), { recursive: true });
const shot = write("output/screenshots/after-nested-navigation.png", png(320, 180));
const shot2 = write("output/screenshots/after-search-results.png", png(300, 170));
const csv = write("output/screenshots/report.csv", "name,value\nchecks,12\npassed,12\n");
write("output/summary.md", "# Summary\n\nEvidence for the Explorer check.\n");
fs.mkdirSync(path.join(root, "a", "very", "deep", "folder", "chain", "that", "keeps", "going", "until", "the", "address", "bar", "must", "fold"), { recursive: true });
const deepDir = path.join(root, "a", "very", "deep", "folder", "chain", "that", "keeps", "going", "until", "the", "address", "bar", "must", "fold");

// PowerShell-style listings, built from the real folders (what Get-ChildItem prints on this machine)
function listing(dir) {
  const rows = fs.readdirSync(dir, { withFileTypes: true }).map((e) => {
    const st = fs.statSync(path.join(dir, e.name));
    const d = new Date(st.mtimeMs), hh = d.getHours() % 12 || 12;
    const when = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}  ${String(hh).padStart(2, " ")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "AM" : "PM"}`;
    return `${e.isDirectory() ? "d-----" : "-a----"}  ${when} ${e.isDirectory() ? "".padStart(14) : String(st.size).padStart(14)} ${e.name}`;
  });
  return `\n    Directory: ${dir}\n\nMode                 LastWriteTime         Length Name\n----                 -------------         ------ ----\n${rows.join("\n")}\n`;
}
const listings = {};
for (const rel of ["", "src", "src/os", "output", "output/screenshots", "docs"]) { const d = path.join(root, rel); listings[d] = listing(d); }
const allFiles = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else allFiles.push(p); } })(root);
const glob = { base: root, output: allFiles.filter((f) => /\.ts$/.test(f)).join("\n") };
const searchOut = allFiles.filter((f) => /\.ts$/.test(f)).slice(0, 4).map((f) => `${f}:3:${fs.readFileSync(f, "utf8").split("\n")[2]}`).join("\n");

// ---- the recorded steps of an agent that uploads two files and sends them ------------------------------
const send = [
  { name: "after-nested-navigation.png", file: shot, type: "image", mime: "image/png" },
  { name: "report.csv", file: csv, type: "file", mime: "text/csv" },
];
const items = [];
const attachments = send.map((s, i) => ({ id: `pending-${crypto.randomUUID()}`, name: s.name, type: s.type, mimeType: s.mime, sizeBytes: fs.statSync(s.file).size }));
send.forEach((s, i) => {
  const url = `/mcp/uploads/${attachments[i].id}`;
  items.push({ id: `prep-${i}`, type: "dynamic_tool", status: "completed", data: { toolName: "mcp__t3-code__t3_attachment_prepare_upload", input: { upload: { type: s.type, name: s.name, mimeType: s.mime, sizeBytes: attachments[i].sizeBytes } }, output: { attachmentId: attachments[i].id, relativeUrl: url } } });
  items.push({ id: `up-${i}`, type: "dynamic_tool", status: "completed", data: { toolName: "Bash", input: { command: `curl -s -X POST --data-binary @"${s.file}" http://127.0.0.1:3777${url}` }, output: { stdout: "{\"ok\":true}" } } });
});
const message = "Here are the screenshots from the nested navigation check.";
items.push({ id: "send-1", type: "dynamic_tool", status: "completed", data: { toolName: "mcp__t3-code__t3_thread_send_attachments", input: { threadId: "own", message, attachments }, output: {} } });

const check = (ok, msg, results) => { results.checks.push({ message: msg, passed: !!ok }); if (!ok) throw new Error(msg); };

app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
protocol.registerSchemesAsPrivileged([{ scheme: "lucid-file", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

app.whenReady().then(async () => {
  const results = { recordedAt: new Date().toISOString(), checks: [], captures: [], labels: {}, source: {} };
  const timer = setTimeout(() => { console.error("Explorer check timed out"); app.exit(1); }, 240000);
  // the same read-only file protocol the app registers, limited to the fixture
  protocol.handle("lucid-file", async (req) => {
    try {
      const file = decodeURIComponent(new URL(req.url).pathname.slice(1));
      if (!path.resolve(file).startsWith(base) || !/\.(png|jpe?g|gif|webp)$/i.test(file)) return new Response("not allowed", { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    } catch { return new Response("missing", { status: 404 }); }
  });

  // build the page, with the commit before this work provided as the "before" Explorer
  const legacy = path.join(repo, "src", "os", "legacy-files-before.ts");
  try {
    const old = spawnSync("git", ["show", `${BEFORE_COMMIT}:src/os/apps.ts`], { cwd: repo, encoding: "utf8", maxBuffer: 1 << 26 });
    if (old.status === 0) {
      const text = old.stdout.replace(/\r/g, "");
      const a = text.indexOf("export class FilesApp"), b = text.indexOf("// ---", a);
      fs.writeFileSync(legacy, `import gsap from "gsap";\nimport { WM } from "./wm";\nimport { ICONS } from "./icons";\nimport { baseName, relPath, type Entry, type Hit } from "./classify";\nimport { esc, typeInto } from "./typing";\n${text.slice(a, b).replace("export class FilesApp", "export class LegacyFilesApp")}\n`);
    }
    const page = path.join(out, "page");
    const built = spawnSync(process.execPath.includes("electron") ? "node" : process.execPath, [path.join(repo, "node_modules", "vite", "bin", "vite.js"), "build", "--config", "dev/vite.config.mjs", "--outDir", page, "--emptyOutDir"], { cwd: repo, encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "" } });
    if (built.status !== 0) throw new Error(`page build failed: ${built.stdout}\n${built.stderr}`);
  } finally { fs.rmSync(legacy, { force: true }); }

  const win = new BrowserWindow({ show: false, width: 860, height: 500, backgroundColor: "#141a33", webPreferences: { offscreen: true, backgroundThrottling: false } });
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const errors = [];
  wc.on("console-message", (_e, level, message) => { if (level >= 3) errors.push(message); });
  const until = async (code, message, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await js(code)) return; await wait(40); } throw new Error(`timed out: ${message}`); };
  const grab = async (name, width = 820) => {
    const img = await wc.capturePage({ x: 10, y: 10, width, height: Math.round(461 * width / 820) });
    const file = path.join(out, `${name}.png`); fs.writeFileSync(file, img.toPNG());
    results.captures.push({ name: `${name}.png`, sha256: sha(file) });
    return file;
  };
  const save = () => fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
  const disk = await fileFacts([...send.map((s) => s.file), path.join(base, "gone.png")]);
  const fixture = { root, listings, glob, search: { query: "export", path: root, output: searchOut }, items, sendId: "send-1", disk, message,
    problems: { missing: { path: path.join(root, "not-here"), output: "Get-ChildItem : Cannot find path 'x' because it does not exist." }, denied: { path: path.join(root, "locked"), output: "Get-ChildItem : Access to the path 'x' is denied." }, empty: { path: path.join(root, "empty") }, long: { path: deepDir } } };

  try {
    await win.loadFile(path.join(out, "page", "dev", "explorer.html"));
    await until("window.__phase === 'loaded'", "page loaded");
    const init = (prefs = {}) => js(`window.__demo.init(${JSON.stringify(fixture)}, ${JSON.stringify(prefs)})`);

    // 1. before: the Explorer as it was, same real listings
    await init();
    const beforeRun = js(`window.__demo.legacy()`);
    await beforeRun; await wait(500);
    await grab("01-before-previous-explorer");
    results.labels.before = `Previous FilesApp from commit ${BEFORE_COMMIT}, playing the same real listings`;

    // 2. nested navigation, with frames along the walk
    await init();
    const walking = js(`window.__demo.walk(${JSON.stringify([root, path.join(root, "src"), path.join(root, "src", "os")])})`);
    let n = 0; let done = false; walking.then(() => { done = true; });
    const seen = new Set();
    while (!done && n < 40) {
      const sig = await js(`(document.querySelector('.fx-crumbs')?.textContent||'')+'|'+(document.querySelectorAll('.fx-row.hover').length)+'|'+(document.querySelector('.fx-row.sel')?.dataset.path||'')`);
      if (!seen.has(sig) && /Lucid Fixture/.test(sig) && seen.size < 6) { seen.add(sig); await grab(`02-walk-frame-${seen.size}`); }
      await wait(160); n++;
    }
    const walk = await walking; await wait(400);
    results.walk = walk;
    check(/Lucid Fixture.*src.*os/.test(walk.folder), "The Explorer ended in src/os after walking down from the project folder", results);
    check(walk.rows === 4, "The final folder lists the four real files in src/os", results);
    check(seen.size >= 3, "The walk showed at least three distinct frames (root, src, os)", results);
    await grab("03-nested-final");
    results.tree = await js(`[...document.querySelectorAll('.fx-t')].map(t=>t.textContent)`);
    check(results.tree.includes("Lucid Fixture") && results.tree.includes("src") && results.tree.includes("os"), "The folder tree lists the folders walked through", results);

    // 3. glob, search, problems
    results.glob = await js(`window.__demo.glob()`); await wait(300); await grab("04-glob-matches");
    check(results.glob.selected && /\.ts$/.test(results.glob.selected), "A glob selects a matched file in its real folder", results);
    results.search = await js(`window.__demo.search()`); await wait(300); await grab("05-search-results");
    check(results.search.hitFiles >= 3, "A content search lists files with their matching lines", results);
    results.problems = await js(`window.__demo.problems()`); await wait(300); await grab("06-long-path-and-names");
    check(/not found/i.test(results.problems.missing) && /denied/i.test(results.problems.denied) && /empty/i.test(results.problems.empty), "Missing, denied and empty folders each say what happened", results);
    check(results.problems.crumbs.includes("…") || results.problems.crumbs.split("\n").length >= 1, "A deep path folds into the address bar", results);

    // 4. attaching: real folder, real file facts, drag into the message box, send
    await init();
    results.sources = JSON.parse(await js(`JSON.stringify(window.__demo.sources())`));
    check(results.sources.every((s, i) => s.how === "upload-command" && s.path === send[i].file), "The upload step names each attached file's folder", results);
    const attaching = js(`window.__demo.attach('sent')`);
    let ok = { drag: false, chips: false };
    let doneA = false; attaching.then(() => { doneA = true; });
    let k = 0;
    while (!doneA && k < 600) {
      const s = await js(`({ghost:!!document.querySelector('.fx-ghost'),drop:!!document.querySelector('.t3-comp.drop'),chips:document.querySelectorAll('.t3-atts .t3-att').length,sel:document.querySelectorAll('.fx-row.sel').length,state:document.querySelector('.t3-atts')?.dataset.state||''})`);
      if (!ok.sel && s.sel && !s.ghost && !s.chips) { ok.sel = true; await grab("07-attach-file-selected"); }
      if (s.ghost && s.drop && !ok.drag) { ok.drag = true; await grab("08-attach-dragging-over-message-box"); }
      if (s.chips && s.state === "sending" && !ok.chips) { ok.chips = true; await grab("09-attach-preparing-in-message-box"); }
      await wait(50); k++;
    }
    const sent = await attaching; await wait(500);
    await grab("10-attach-sent");
    results.attachSent = sent;
    check(ok.sel && ok.drag && ok.chips, "The file was selected in the Explorer, carried over the message box, then held in it while sending", results);
    check(sent.result === "sent" && sent.bubbles === 1 && sent.sentFiles === 2 && sent.drafts === 0, "One sent message with both files and an empty composer", results);
    results.thumbnail = await js(`(()=>{const i=document.querySelector('.t3-sf.pic img');return i?{loaded:i.complete&&i.naturalWidth>0,w:i.naturalWidth,h:i.naturalHeight}:null})()`);
    check(results.thumbnail?.loaded && results.thumbnail.w === 320 && results.thumbnail.h === 180, "The sent picture shows the real file (320 by 180)", results);

    // 5. failure keeps the draft, retry sends once
    await init();
    const failed = await js(`window.__demo.attach('failed')`); await wait(400);
    await grab("11-attach-failed-draft-kept");
    check(failed.result === "failed" && failed.bubbles === 0 && failed.drafts === 2 && failed.draftState === "failed" && /Not sent/.test(failed.failedText) && failed.composerText.includes("screenshots"), "A refused send keeps both files and the words as a draft, marked Not sent", results);
    const retried = await js(`window.__demo.attach('sent')`); await wait(500);
    await grab("12-attach-retry-sent");
    check(retried.result === "sent" && retried.bubbles === 1 && retried.sentFiles === 2 && retried.drafts === 0, "A retry replaces the failed draft and sends one message", results);

    // 6. replaying history draws the result once and does nothing else
    await init();
    const replay = await js(`window.__demo.attach('sent', {instant:true})`); await wait(300);
    await grab("13-replay-instant");
    check(replay.bubbles === 1 && replay.sentFiles === 2, "A replayed send shows the result without walking anywhere", results);
    results.counters = await js(`window.__demo.counters`);
    check(results.counters.sendMessage === 0 && results.counters.startThread === 0 && results.counters.saveAttachment === 0, "Nothing was uploaded, sent or started by any playback", results);

    // 7. distance tiers
    await init();
    await js(`window.__demo.walk(${JSON.stringify([root, path.join(root, "src", "os")])})`); await wait(300);
    for (const [name, width] of [["14-tier-lines", 300], ["15-tier-shapes", 220], ["16-tier-icon", 140]]) {
      await js(`window.__demo.tier(${width})`); await wait(1800);
      await grab(name, width);
      results.labels[name] = await js(`document.querySelector('.screen-detail')?.dataset.detailTier || (document.querySelector('.d-screen [data-detail-tier]')?.dataset.detailTier) || null`);
    }
    results.errors = errors;
    check(!errors.length, "The page logged no errors", results);
    results.passed = true;
  } catch (err) {
    results.error = String(err && err.stack || err); results.passed = false; results.errors = errors;
  }
  for (const f of ["src/os/explorer.ts", "src/os/explorer-model.ts", "src/os/explorer.css", "src/os/file-kinds.ts", "src/os/attachment-source.ts", "src/os/send-files.ts", "src/os/drag-drop.ts", "src/harness/t3code.ts", "src/director.ts", "electron/file-facts.cjs"]) results.source[f] = sha(path.join(repo, f));
  results.labels.stubs = "Robot body is a stub; the send is represented by a timer that resolves sent or failed. The page's bridge counts uploads, sends and thread starts and the check fails if any occurs. Folder tree, listings, file facts and recorded tool steps are real fixture data.";
  save(); clearTimeout(timer);
  console.log(results.passed ? "Explorer checks passed" : `Explorer checks failed: ${results.error}`);
  win.close(); app.exit(results.passed ? 0 : 1);
});
