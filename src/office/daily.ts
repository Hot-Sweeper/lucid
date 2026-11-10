import { setTrending } from "../fun/trending";
import { getLocale, localizeData, onLocaleChange } from "../localization";

// Today's dialog pack from the orchestrator: conversations, lines about the CEO (you) and
// gossip about the other robots, written once a day from what it has learned. Robots mix
// these into their chats so the office talks about what actually happened.

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
const used = new Set<string>();
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

const fresh = <T,>(list: T[] | undefined, key: (x: T) => string): T | null => {
  if (!list?.length) return null;
  const stableKey = (x: T) => canonicalKeys.get(key(x)) ?? key(x);
  const left = list.filter((x) => !used.has(stableKey(x)));
  const pool = left.length ? left : list;
  const x = pool[Math.floor(Math.random() * pool.length)];
  used.add(stableKey(x));
  return x;
};

/** A conversation from today's pack (2 to 4 alternating lines), or null. */
export const dailyConvo = () => fresh(pack?.convos?.filter((c) => Array.isArray(c) && c.length >= 2), (c) => c[0]);
/** A single line about the CEO or another robot, or null. With a speaker, often its own line. */
export const dailyLine = (speaker?: string) => (speaker && pack?.robots?.[speaker]?.length && Math.random() < 0.6 ? fresh(pack.robots[speaker], (l) => l) : null) ?? fresh([
  ...(pack?.ceo ?? []), ...(pack?.gossip ?? []),
  ...(pack?.event ? (getLocale() === "de"
    ? [`Kommst du zu ${pack.event.name}?`, `Heute ist wohl ${pack.event.name}.`, `Ich spare meinen Akku für ${pack.event.name}.`]
    : [`Are you coming to ${pack.event.name}?`, `I heard ${pack.event.name} is today.`, `Saving my battery for ${pack.event.name}.`]) : []),
  ...(pack?.trending ?? []).slice(0, 3).map((t) => getLocale() === "de" ? `Hast du "${t.title}" gesehen?` : `Did you see "${t.title}"?`),
], (l) => l);
/** A Botcord message from today's pack, or null. */
export const dailyBotcord = () => fresh(pack?.botcord?.filter((m) => m?.text), (m) => m.text);
