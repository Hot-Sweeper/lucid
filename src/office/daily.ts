import { setTrending } from "../fun/trending";
import { getLocale, localizeData, onLocaleChange } from "../localization";
import { lineId, lineMemory } from "../lines/memory";

// Today's dialog pack from the headless writer (daily-writer.cjs): conversations, lines each
// robot says in its own voice, lines about the CEO (you) and gossip, written once a day from
// the robots' personas. It is the third layer of the line system (src/lines), after the
// built-in base set and lines about real T3 events.

export type DailyPack = {
  date: string;
  convos?: string[][];
  ceo?: string[];
  gossip?: string[];
  botcord?: { channel?: string; user?: string; text: string }[];
  trending?: { title: string; channel?: string; views?: string }[];
  event?: { name: string; blurb?: string };
  /** Written from the robots' personas in this language (daily-writer.cjs). */
  language?: string;
  /** Lines each robot says in its own voice, by robot name. */
  robots?: Record<string, string[]>;
};

let pack: DailyPack | null = null;
const canonicalKeys = new Map<string, string>();
let loading = false;
let reload = false;

async function translatePack(source: DailyPack): Promise<DailyPack> {
  const prose = {
    convos: source.convos ?? [], ceo: source.ceo ?? [], gossip: source.gossip ?? [],
    botcord: source.botcord?.map((m) => m.text) ?? [],
    trending: source.trending?.map((t) => t.title) ?? [],
    event: source.event ? [source.event.name, source.event.blurb ?? ""] : [],
  };
  const translated = await localizeData(prose, "Orchestrator-authored robot downtime. Each conversation is one coherent alternating exchange. Adapt jokes as a whole. Preserve names and factual events.");
  canonicalKeys.clear();
  const remember = (original: string, shown: string) => { canonicalKeys.set(shown, original); return shown; };
  return {
    ...source,
    convos: translated.convos.map((lines, i) => lines.map((line, j) => remember(prose.convos[i][j], line))),
    ceo: translated.ceo.map((line, i) => remember(prose.ceo[i], line)),
    gossip: translated.gossip.map((line, i) => remember(prose.gossip[i], line)),
    botcord: source.botcord?.map((m, i) => ({ ...m, text: remember(m.text, translated.botcord[i]) })),
    trending: source.trending?.map((t, i) => ({ ...t, title: translated.trending[i] })),
    event: source.event ? { name: translated.event[0], blurb: translated.event[1] } : undefined,
  };
}

export async function loadDaily() {
  if (loading) { reload = true; return; }
  loading = true;
  const locale = getLocale();
  try {
    const source: DailyPack | null = (await (window as any).lucid?.orchDialogs?.()) ?? null;
    // A pack written in the current language is shown as written.
    const next = source ? source.language === locale ? (canonicalKeys.clear(), source) : await translatePack(source) : null;
    if (locale !== getLocale()) { reload = true; return; }
    pack = next;
    // Only today's pack counts: yesterday's event is over.
    if (pack && pack.date !== new Date().toLocaleDateString("en-CA")) pack = { ...pack, event: undefined, trending: pack.trending };
    setTrending(pack?.trending);
    onDaily(pack);
  } catch {
    // Keep the last working daily pack when fetching or translation is unavailable.
  } finally {
    loading = false;
    if (reload) { reload = false; void loadDaily(); }
  }
}
/** Called whenever a new pack is loaded (the building sign shows today's event). */
export let onDaily: (p: DailyPack | null) => void = () => {};
export function watchDaily(f: (p: DailyPack | null) => void) { onDaily = f; f(pack); }
void loadDaily();
onLocaleChange(() => { pack = null; setTrending(undefined); onDaily(null); void loadDaily(); });
setInterval(() => void loadDaily(), 10 * 60 * 1000);

/** Today's pack as shown (translated when needed). Lines are chosen in src/lines. */
export const dailyPack = () => pack;
/** The canonical (as written) text of a shown pack line, so repetition history survives language changes. */
export const dailyKey = (text: string) => canonicalKeys.get(text) ?? text;
/** A Botcord message from today's pack, or null. */
export const dailyBotcord = () => {
  const list = pack?.botcord?.filter((m) => m?.text) ?? [];
  return lineMemory.pick(list.map((m) => ({ id: lineId(dailyKey(m.text)), value: m })));
};
