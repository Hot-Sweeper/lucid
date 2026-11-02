export type SettledContext = {
  id: string; projectId: string; provider: string; model: string | null;
  title: string; request: string; recent: string; updatedAt: string;
};
export type ContextMatch = { thread: SettledContext; score: number; terms: string[] };
const STOP = new Set("a an and are as at be been bot bots build can change code could do does done etc file files fix for from get give good have help here how i if in into is it job just like make me my need new of on or our please project really should so some task that the their them then there these they this those thread threads to up use using want was we what when where which will with work would yk you your awesome ensure implement add update".split(" "));
const documents = new WeakMap<SettledContext, { title: Set<string>; request: Set<string>; recent: Set<string> }>();

function terms(text: string) {
  const split = text.replace(/([a-z])([A-Z])/g, "$1 $2").normalize("NFKC").toLowerCase();
  const words = split.match(/[\p{L}\p{N}_]+(?:[./-][\p{L}\p{N}_]+)*/gu) ?? [];
  return new Set(words.flatMap(word => [word, ...word.split(/[./_-]/)]).filter(word => word.length >= 3 && !STOP.has(word)).map(word => word.length > 5 && word.endsWith("s") ? word.slice(0, -1) : word));
}

// A small weighted keyword search. Titles and original requests matter more than
// incidental words in a recent reply. Common filler never qualifies as context.
export function matchSettledContexts(prompt: string, contexts: SettledContext[], projectId: string, provider: string): ContextMatch[] {
  const query = [...terms(prompt)].slice(0, 80);
  if (!query.length || !projectId || !provider) return [];
  const corpus = contexts.filter(t => t.projectId === projectId && t.provider === provider).map(thread => {
    let doc = documents.get(thread);
    if (!doc) { doc = { title: terms(thread.title), request: terms(thread.request), recent: terms(thread.recent) }; documents.set(thread, doc); }
    return { thread, ...doc };
  });
  const weight = new Map(query.map(term => [term, 1 + Math.log(1 + corpus.length / (1 + corpus.filter(t => t.title.has(term) || t.request.has(term) || t.recent.has(term)).length))]));
  const total = query.reduce((sum, term) => sum + weight.get(term)!, 0);
  return corpus.flatMap(({ thread, title, request, recent }) => {
    const matched = query.filter(term => title.has(term) || request.has(term) || recent.has(term));
    const coverage = matched.reduce((sum, term) => sum + weight.get(term)!, 0) / total;
    // A single descriptive title term (including a filename) is useful. A lone
    // incidental body word is too weak to reopen an old conversation.
    if (coverage < 0.2 || !(matched.length >= 2 || matched.some(term => term.length >= 6 && title.has(term)))) return [];
    const score = matched.reduce((sum, term) => sum + weight.get(term)! * (title.has(term) ? 3 : request.has(term) ? 2 : 1), 0) * coverage;
    return [{ thread, score, terms: matched }];
  }).sort((a, b) => b.score - a.score || b.thread.updatedAt.localeCompare(a.thread.updatedAt) || a.thread.id.localeCompare(b.thread.id));
}

export function contextForRobot(robot: { threadId: string | null; done?: string[] }, matches: ContextMatch[]) {
  const owned = new Set([robot.threadId, ...(robot.done ?? [])]);
  // Prefer its own history when equally relevant. Otherwise any free robot can
  // take over the best matching settled conversation on the selected harness.
  return matches.find(m => owned.has(m.thread.id) && m.score >= (matches[0]?.score ?? Infinity) * 0.8) ?? matches[0] ?? null;
}
