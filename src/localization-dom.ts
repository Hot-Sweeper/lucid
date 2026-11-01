import { canonicalText, getLocale, onLocaleChange, translateEntries, uiText } from "./localization";

const protectedElements = "script,style,svg,canvas,pre,code,input,textarea,[contenteditable], [data-no-localize], .os-clock, .so-kb, .phone-keyboard";
const brands = new Set(["Lucid", "BotTube", "BotTube Shorts", "Botcord", "BotsApp", "Botify", "Botword", "Cellsheet", "Slidedeck", "Telegrid", "Chirp", "Instabot", "Snapbot", "Spool", "Sparkplug", "T3 Code", "Codex", "GitHub Desktop"]);
type Slot = { source: string; shown: string; locale: string };

/** Only attach to fictional game content. Never attach to a real thread or the app shell. */
export function localizeGameDOM(root: HTMLElement, context: string): () => void {
  if (root.closest("[data-game-localized]")) return () => {};
  root.setAttribute("data-game-localized", "");
  const records = new WeakMap<Text, Slot>();
  const attempted = new Map<string, number>();
  const cached = new Map<string, string>();
  const attributes = new WeakMap<Element, Map<string, {source:string;shown:string}>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dead = false, busy = false, dirty = false, visible = false, generation = 0;
  const schedule = () => {
    dirty = true;
    if (dead || busy || timer || !visible || document.hidden) return;
    timer = setTimeout(() => { timer = undefined; void flush(); }, 650);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root, { subtree: true, childList: true, characterData: true });
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) schedule(); });
  intersection.observe(root);
  const visibility = () => { if (!document.hidden) schedule(); };
  document.addEventListener("visibilitychange", visibility);
  const stopLocale = onLocaleChange(() => { generation++; attempted.clear(); schedule(); });

  async function flush() {
    if (dead || busy || !visible || document.hidden || !root.isConnected) return;
    dirty = false;
    const locale = getLocale(), version = generation;
    // Translate labels only, never editable values or the text of real code fields.
    for (const element of root.querySelectorAll?.("[title],[aria-label],[placeholder]") ?? []) {
      if (element.closest("pre,code,script,style,[data-no-localize]")) continue;
      let slots = attributes.get(element);
      if (!slots) { slots = new Map(); attributes.set(element, slots); }
      for (const name of ["title", "aria-label", "placeholder"]) {
        const raw = element.getAttribute(name); if (!raw) continue;
        let slot = slots.get(name);
        if (!slot || raw !== slot.shown) { slot = {source:raw,shown:raw}; slots.set(name,slot); }
        slot.shown = uiText(slot.source); element.setAttribute(name,slot.shown);
      }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const pending: { node: Text; slot: Slot; id: string }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node as Text, parent = text.parentElement;
      if (!parent || parent.closest(protectedElements)) continue;
      // Handles and names are identities, including robot and channel names.
      if (/(?:^|[-_ ])(?:user|username|handle|avatar|name|time|timestamp)(?:$|[-_ ])/i.test(parent.className)) continue;
      const raw = text.data;
      let slot = records.get(text);
      if (!slot || raw !== slot.shown) { slot = { source: canonicalText(raw), shown: raw, locale: "en" }; records.set(text, slot); }
      const source = slot.source.trim();
      if (!source || source.length > 2000 || !/[a-zA-Z]{2}/.test(source) || brands.has(source) || /^(?:[@#]|https?:\/\/|[\w.-]+@)/.test(source)) continue;
      if (locale === "en") { if (text.data !== slot.source) text.data = slot.source; slot.shown = slot.source; slot.locale = locale; continue; }
      if (slot.locale === locale) continue;
      const local = uiText(source);
      if (local !== source) { slot.shown = slot.source.replace(source, local); slot.locale = locale; text.data = slot.shown; continue; }
      const key = `${locale}:${source}`;
      const saved = cached.get(key);
      if (saved) { slot.shown = slot.source.replace(source, saved); slot.locale = locale; text.data = slot.shown; continue; }
      if ((attempted.get(key) ?? 0) > Date.now()) continue;
      if (pending.length >= 80) { dirty = true; break; }
      pending.push({ node: text, slot, id: String(pending.length) });
    }
    if (!pending.length) return;
    busy = true;
    for (const { slot } of pending) attempted.set(`${locale}:${slot.source.trim()}`, Date.now() + 30000);
    // Batches preserve nearby setup, reply and punchline context.
    try {
      const entries = await translateEntries(pending.map(({ id, slot }) => ({ id, text: slot.source.trim(), context })), locale);
      if (dead || generation !== version || getLocale() !== locale) return;
      const result = new Map(entries.map(entry => [entry.id, entry.text]));
      for (const { node: text, slot, id } of pending) {
        const translated = result.get(id);
        if (!translated || !root.contains(text) || text.data !== slot.shown) continue;
        if (translated !== slot.source.trim()) {
          cached.set(`${locale}:${slot.source.trim()}`, translated);
          slot.locale = locale;
        }
        slot.shown = slot.source.replace(slot.source.trim(), translated); text.data = slot.shown;
      }
    } catch { /* Keep the original scene usable when the translation service is unavailable. */ }
    finally {
      busy = false;
      if (attempted.size > 1000) attempted.clear();
      while (cached.size > 1000) cached.delete(cached.keys().next().value!);
      if (dirty) schedule();
    }
  }
  return () => {
    dead = true; generation++;
    if (timer) clearTimeout(timer);
    observer.disconnect(); intersection.disconnect(); stopLocale();
    root.removeAttribute("data-game-localized");
    document.removeEventListener("visibilitychange", visibility);
  };
}
