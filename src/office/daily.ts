// Today's dialog pack from the orchestrator: conversations, lines about the CEO (you) and
// gossip about the other robots, written once a day from what it has learned. Robots mix
// these into their chats so the office talks about what actually happened.

export type DailyPack = {
  date: string;
  convos?: string[][];
  ceo?: string[];
  gossip?: string[];
  botcord?: { channel?: string; user?: string; text: string }[];
};

let pack: DailyPack | null = null;
const used = new Set<string>();

export async function loadDaily() {
  try { pack = (await (window as any).lucid?.orchDialogs?.()) ?? null; } catch { pack = null; }
}
void loadDaily();
setInterval(() => void loadDaily(), 10 * 60 * 1000);

const fresh = <T,>(list: T[] | undefined, key: (x: T) => string): T | null => {
  if (!list?.length) return null;
  const left = list.filter((x) => !used.has(key(x)));
  const pool = left.length ? left : list;
  const x = pool[Math.floor(Math.random() * pool.length)];
  used.add(key(x));
  return x;
};

/** A conversation from today's pack (2 to 4 alternating lines), or null. */
export const dailyConvo = () => fresh(pack?.convos?.filter((c) => Array.isArray(c) && c.length >= 2), (c) => c[0]);
/** A single line about the CEO or another robot, or null. */
export const dailyLine = () => fresh([...(pack?.ceo ?? []), ...(pack?.gossip ?? [])], (l) => l);
/** A Botcord message from today's pack, or null. */
export const dailyBotcord = () => fresh(pack?.botcord?.filter((m) => m?.text), (m) => m.text);
