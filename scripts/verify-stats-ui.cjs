// DOM behavior checks for stats, with no Electron, server or browser process.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.parent = null; this.attributes = {}; this.style = {}; this.listeners = {}; this.hidden = false; this.className = ""; this.text = ""; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(""); }
  set textContent(value) { this.text = value; this.children = []; }
  get classList() {
    return {
      toggle: (name, enabled) => { const set = new Set(this.className.split(" ").filter(Boolean)); const add = enabled === undefined ? !set.has(name) : enabled; add ? set.add(name) : set.delete(name); this.className = [...set].join(" "); return add; },
      add: (name) => this.classList.toggle(name, true), remove: (name) => this.classList.toggle(name, false), contains: (name) => this.className.split(" ").includes(name),
    };
  }
  append(...children) { children.forEach((c) => this.insertBefore(c, null)); }
  insertBefore(child, before) { child.remove(); const i = before ? this.children.indexOf(before) : this.children.length; this.children.splice(i, 0, child); child.parent = this; }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  removeEventListener(k) { delete this.listeners[k]; }
  click() { this.listeners.click?.(); }
}
const find = (element, cls) => element.children.flatMap((e) => [...(e.classList.contains(cls) ? [e] : []), ...find(e, cls)]);
const tick = () => new Promise((r) => setImmediate(r));
function fixture() {
  let source = fs.readFileSync(path.join(__dirname, "../src/stats/stats.ts"), "utf8");
  source = source.replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  const document = { createElement: (tag) => new Element(tag), addEventListener() {}, removeEventListener() {}, hidden: false };
  const context = { document, logoFor: () => null, harnessName: (h) => h === "codex" ? "Codex" : "Claude", setInterval: () => 1, clearInterval() {} };
  vm.createContext(context);
  vm.runInContext(stripTypeScriptTypes(source) + "\nthis.mountStats = mountStats;", context);
  return { host: new Element("div"), mount: context.mountStats };
}
const totals = { tokens: 30, input: 20, output: 10, cacheRead: 0, cacheWrite: 0, costUsd: 1, byHarness: {}, byModel: {}, byProject: {
  alpha: { name: "A long project name that must remain readable", tokens: 20, costUsd: 0.8, priced: true, sources: { session: 20, cwd: 0, unassigned: 0 } },
  unassigned: { name: "Unassigned", tokens: 10, costUsd: 0.2, priced: false, sources: { session: 0, cwd: 0, unassigned: 10 } },
} };
test("equal-duration pools keep separate stable rows; missing/stale percentages never become zero claims", async () => {
  const f = fixture();
  let data = { updatedAt: "2026-10-31T12:00:00Z", windows: { today: totals, week: totals, last5h: totals }, errors: [], limits: { claude: null, codex: { primary: null, secondary: null, observedAt: "2026-10-31T12:00:00Z", windows: [
    { id: "codex:primary", usedPercent: 10, windowMinutes: 300, resetsAt: null },
    { id: "model:primary", label: "Model pool", usedPercent: 80, windowMinutes: 300, resetsAt: null },
    { id: "unknown:primary", label: "Unknown pool", usedPercent: null, windowMinutes: 300, resetsAt: null },
    { id: "stale:primary", label: "Old pool", usedPercent: 100, windowMinutes: 300, resetsAt: "2026-01-01T00:00:00Z", stale: true },
  ] } } };
  const mounted = f.mount(f.host, async () => data); await tick();
  const rows = find(f.host, "st-limit");
  assert.equal(rows.length, 4);
  assert.match(rows[0].textContent, /10%/); assert.match(rows[1].textContent, /80%/);
  assert.match(rows[2].textContent, /usage unavailable.*n\/a/);
  assert.doesNotMatch(rows[2].textContent, /0%/);
  assert.match(rows[3].textContent, /no reading since reset/);
  assert.doesNotMatch(rows[3].textContent, /100%/);
  assert.match(find(f.host, "st-limit-note")[0].textContent, /Claude limits unavailable/);
  const projects = find(f.host, "st-projects-wrap")[0];
  assert.match(projects.textContent, /A long project name that must remain readable/);
  assert.match(projects.textContent, /Unassigned/);
  assert.match(projects.textContent, /\$0\.20\*/);
  assert.match(find(projects, "st-mname")[0].title, /linked by T3 session/);
  const projectToggle = find(f.host, "st-toggle").find((e) => e.textContent.startsWith("By project"));
  projectToggle.click(); assert.equal(projectToggle.getAttribute("aria-expanded"), "true");
  assert.ok(f.host.children[0].classList.contains("st-projects-open"));
  data.limits.codex.windows[1].usedPercent = 81;
  mounted.refresh(); await tick();
  assert.equal(find(f.host, "st-limit")[1], rows[1]);
  assert.match(rows[1].textContent, /81%/);
  mounted.destroy(); assert.equal(f.host.children.length, 0);
});

test("official provider instances retain separate names, rows and source timestamps", async () => {
  const f = fixture(), at = "2026-10-31T12:00:00Z";
  let data = { updatedAt: at, windows: { today: totals, week: totals, last5h: totals }, errors: [], limitSource: { source: "T3 Code", status: "current", detail: "" }, limits: {
    codex: null, claude: null,
    "t3:personal": { harness: "codex", name: "Personal Codex", source: "T3 Code", observedAt: at, windows: [{ id: "personal:session", label: "5 hour", labelIsComplete: true, usedPercent: 20, windowMinutes: 300, observedAt: at }] },
    "t3:work": { harness: "codex", name: "Work Codex", source: "T3 Code", observedAt: at, windows: [{ id: "work:session", label: "5 hour", labelIsComplete: true, usedPercent: 80, windowMinutes: 300, observedAt: at }] },
    "t3:claude": { harness: "claude", name: "Claude", source: "T3 Code", observedAt: at, windows: [{ id: "claude:weekly", label: "Weekly", labelIsComplete: true, usedPercent: 70, windowMinutes: 10080, observedAt: at, stale: true, staleReason: "T3 reading is out of date" }] },
  } };
  const mounted = f.mount(f.host, async () => data); await tick();
  const rows = find(f.host, "st-limit");
  assert.equal(rows.length, 3);
  assert.match(rows[0].textContent, /Personal Codex 5 hour.*20%/);
  assert.match(rows[1].textContent, /Work Codex 5 hour.*80%/);
  assert.match(rows[0].title, /T3 Code, reported/);
  assert.match(rows[2].textContent, /T3 reading is out of date/);
  assert.doesNotMatch(find(f.host, "st-limit-note")[0].textContent, /limits unavailable/);
  data.limits["t3:work"].windows[0].usedPercent = 81; mounted.refresh(); await tick();
  assert.equal(find(f.host, "st-limit")[1], rows[1]); mounted.destroy();
});
