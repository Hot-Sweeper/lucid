// The robots' one line system. Three layers feed every speech bubble:
//   1. the built-in base set (catalog.ts, authored English and German),
//   2. event lines about real T3 activity (events.ts, only facts the data shows),
//   3. today's pack from the headless writer (office/daily.ts), written from each persona.
// Every pick goes through one memory (memory.ts), office-wide and per robot, so robots do not
// repeat themselves, and hobby-tagged lines keep each robot's personality.
import type { Hobby } from "../office/roster";
import { getLocale } from "../localization";
import { localizedFlavor } from "../content/localized";
import { CONVOS, THOUGHTS, type Place } from "../content";
import { dailyKey, dailyPack } from "../office/daily";
import { BASE, JOKES, SMALL_TALK, authorPair, type Exchange, type LineKind, type Pair } from "./catalog";
import { eventCandidates, type LineFact } from "./events";
import { lineId, lineMemory, type Candidate } from "./memory";

export type { LineKind } from "./catalog";
export type { LineFact } from "./events";
export { testOutcome } from "./events";

/** Who is speaking: a robot (by its persistent name) or nobody in particular. */
export type Who = { name?: string | null } | string | null | undefined;
const nameOf = (who: Who) => (typeof who === "string" ? who : who?.name) || null;

let hobbyOf: (name: string) => Hobby | null | undefined = () => null;
/** Where the line system reads a robot's hobby (the roster). */
export function setPersonaSource(source: (name: string) => Hobby | null | undefined) { hobbyOf = source; }

const fill = (text: string, vars?: Record<string, string | number>) => vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;

/** A base line of this kind for this robot, in the current language. */
export function line(kind: LineKind, who?: Who, vars?: Record<string, string | number>): string {
  const name = nameOf(who), hobby = name ? hobbyOf(name) : null, de = getLocale() === "de";
  const pairs = (BASE[kind] as readonly Pair[]).filter(p => !p[2] || (hobby && p[2].includes(hobby)));
  const list: Candidate<Pair>[] = pairs.map(p => ({ id: lineId(fill(p[0], vars)), value: p, weight: p[2] ? 2.5 : 1 }));
  const pair = lineMemory.pick(list, name) ?? pairs[0];
  const en = fill(pair[0], vars), local = fill(pair[1], vars);
  if (vars) authorPair(en, local);
  return de ? local : en;
}

/** A line about a real T3 event. Falls back to nothing rather than to an invented detail. */
export function eventLine(fact: LineFact, who?: Who): string | null {
  const language = getLocale() === "de" ? "de" : "en";
  const options = eventCandidates(fact, language);
  const choice = lineMemory.pick(options.map(o => ({ id: lineId(o.en), value: o })), nameOf(who));
  if (!choice) return null;
  authorPair(choice.en, eventCandidates(fact, "de").find(o => o.en === choice.en)?.text ?? choice.en);
  return choice.text;
}

const exchange = (list: readonly Exchange[], who?: Who) => {
  const pair = lineMemory.pick(list.map(j => ({ id: lineId(j[0][0]), value: j })), nameOf(who)) ?? list[0];
  return [...pair[getLocale() === "de" ? 1 : 0]];
};
/** A classic joke as [setup, punchline] in the current language. */
export const joke = () => exchange(JOKES);
/** Two lines of small talk while waiting, started by `who`. */
export const smallTalk = (who?: Who) => exchange(SMALL_TALK, who);

/** A conversation for two robots: today's pack sometimes, a written scene, or a joke. */
export function conversation(): string[] {
  const daily = (dailyPack()?.convos ?? []).filter(c => Array.isArray(c) && c.length >= 2);
  if (daily.length && Math.random() < 0.3) {
    const convo = lineMemory.pick(daily.map(c => ({ id: lineId(dailyKey(c[0])), value: c })));
    if (convo) return [...convo];
  }
  if (Math.random() < 0.8) {
    const scene = lineMemory.pick(CONVOS.map(c => ({ id: lineId(c.lines[0]), value: c })))!;
    return [...localizedFlavor(scene, "break-room conversations").lines];
  }
  return joke();
}

const thoughtPools = new Map<string, Candidate<string>[]>();
/** A passing thought for a place (from the written content pack). */
export function thought(who?: Who, place?: Place): string {
  const key = place ?? "any";
  let pool = thoughtPools.get(key);
  if (!pool) thoughtPools.set(key, pool = THOUGHTS.filter(t => (place ? t.place === place : !t.place)).map(t => ({ id: lineId(t.text), value: t.text })));
  return localizedFlavor(lineMemory.pick(pool, nameOf(who)) ?? "", "robot thoughts");
}

/** Something a robot says or thinks on its own: often its own line from today's pack, then
 *  the office's news (the CEO, gossip, today's event or videos), otherwise a thought. */
export function musing(who?: Who, place?: Place): { text: string; spoken: boolean } {
  const pack = dailyPack(), name = nameOf(who);
  const own = name ? pack?.robots?.[name] ?? [] : [];
  if (own.length && Math.random() < 0.35) {
    const text = lineMemory.pick(own.map(l => ({ id: lineId(dailyKey(l)), value: l })), name);
    if (text) return { text, spoken: true };
  }
  const news: Candidate<() => string>[] = [...(pack?.ceo ?? []), ...(pack?.gossip ?? [])].map(l => ({ id: lineId(dailyKey(l)), value: () => l }));
  if (pack?.event?.name) news.push({ id: `event:${pack.event.name}`, value: () => line("dailyEvent", who, { name: pack.event!.name }) });
  for (const t of (pack?.trending ?? []).slice(0, 3)) news.push({ id: `video:${t.title}`, value: () => line("dailyVideo", who, { name: t.title }) });
  if (news.length && Math.random() < 0.25) {
    const say = lineMemory.pick(news, name);
    if (say) return { text: say(), spoken: true };
  }
  return { text: thought(who, place), spoken: false };
}
