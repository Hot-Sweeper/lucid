// The coin calendar: dollars of API-priced robot work per local day and T3 thread, kept after the
// harness logs roll out of usage.cjs's seven-day window. One coin is one dollar of work
// (src/office/wallet.ts). Only exact session ownership from coinBindings counts, so nothing is
// estimated or spread over threads. The renderer reads it for the coin ledger (src/stats/).
const path = require('node:path');
const { createJsonStore } = require('./json-store.cjs');

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const round = n => Math.round(n * 1e6) / 1e6;
const text = (v, max = 300) => typeof v === 'string' && v ? v.slice(0, max) : null;

function emptyCalendar() { return { v: 1, rev: 0, days: {}, threads: {} }; }

function normalize(raw) {
  const doc = emptyCalendar();
  if (!raw || typeof raw !== 'object') return doc;
  doc.rev = Number.isInteger(raw.rev) && raw.rev >= 0 ? raw.rev : 0;
  for (const [day, threads] of Object.entries(raw.days || {})) {
    if (!DAY.test(day) || !threads || typeof threads !== 'object') continue;
    for (const [id, usd] of Object.entries(threads)) if (typeof usd === 'number' && Number.isFinite(usd) && usd > 0) (doc.days[day] ??= {})[id] = usd;
  }
  for (const [id, t] of Object.entries(raw.threads || {})) if (t && typeof t === 'object') doc.threads[id] = { title: text(t.title) || 'Untitled thread', projectId: text(t.projectId, 200), project: text(t.project) };
  return doc;
}

/** Merges coin sources (usage.getCoinSources) into the calendar. Returns whether anything changed. */
function mergeCalendar(doc, sources) {
  // Sum each thread's sessions per day, then keep the highest total ever read: the logs only grow
  // or roll out of the window, so the highest reading is the fullest real one.
  const totals = new Map();
  for (const s of sources || []) {
    if (!s?.threadId || !s.days) continue;
    for (const [day, usd] of Object.entries(s.days)) {
      if (!DAY.test(day) || !(usd > 0)) continue;
      const key = `${day}\n${s.threadId}`;
      totals.set(key, (totals.get(key) || 0) + usd);
    }
  }
  let changed = false;
  for (const [key, usd] of totals) {
    const [day, id] = key.split('\n');
    const value = round(usd);
    if (value <= (doc.days[day]?.[id] ?? 0)) continue;
    (doc.days[day] ??= {})[id] = value;
    changed = true;
  }
  for (const s of sources || []) {
    if (!s?.threadId || !(s.threadId in doc.threads || Object.values(s.days || {}).some(v => v > 0))) continue;
    const meta = { title: text(s.title) || 'Untitled thread', projectId: text(s.projectId, 200), project: text(s.project) };
    const old = doc.threads[s.threadId];
    if (old && old.title === meta.title && old.projectId === meta.projectId && old.project === meta.project) continue;
    doc.threads[s.threadId] = meta;
    changed = true;
  }
  if (changed) doc.rev++;
  return changed;
}

function createCoinCalendar(file) {
  const store = createJsonStore(file, { fallback: '{}' });
  let doc;
  try { doc = normalize(JSON.parse(store.load())); } catch { doc = emptyCalendar(); }
  return {
    observe(sources) {
      if (mergeCalendar(doc, sources)) store.save(JSON.stringify(doc)).catch(() => {});
      return doc.rev;
    },
    read: () => doc,
    flush: () => store.flush(),
  };
}

/** Owns the coin IPC: `coins:usage` for the desks' coins, `coins:calendar` for the ledger. */
function register(ipcMain, { usage, t3, dir }) {
  const calendar = createCoinCalendar(path.join(dir, 'coin-calendar.json'));
  const read = async () => {
    const result = await usage.getCoinSources(t3.coinBindings());
    const calendarRev = calendar.observe(result.sources);
    return { usage: result.usage, sources: result.sources.map(({ days, ...source }) => source), calendarRev };
  };
  ipcMain.handle('coins:usage', read);
  // The renderer refreshes coins:usage first, so this never repeats the log scan.
  ipcMain.handle('coins:calendar', () => calendar.read());
  return calendar;
}

module.exports = { register, createCoinCalendar, mergeCalendar, normalize };
