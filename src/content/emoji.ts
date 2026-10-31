// Robots text like people do: most of their chat lines end with an emoji that fits the words.
// Applied once to the written chat pools (BotsApp, Telegrid, Botcord, comments), never to the
// interface itself. The pick depends only on the line, so a line looks the same every time.

const RULES: [RegExp, string[]][] = [
  [/\b(love|miss(es)? you|hug|proud|sweetie|dear|cute|aww|thank you|thanks)\b/i, ["❤️", "🥹", "🫶", "💕"]],
  [/\b(lol|haha|ha ha|funny|joke|laugh|hilarious|iconic|ratio|meme)\b|\bha\b/i, ["😂", "🤣", "💀"]],
  [/\b(coffee|espresso|brew|latte|tea)\b/i, ["☕", "😌"]],
  [/\b(pizza|lunch|dinner|eat|ate|snack|food|dessert|skewers|toast|sandwich|breakfast|cake)\b/i, ["😋", "🍕", "🍽️", "🧁"]],
  [/\b(grill|barbecue|bbq|sunday|weekend|park|picnic)\b/i, ["☀️", "🔥", "🌳"]],
  [/\b(good morning|morning|boot)\b/i, ["☀️", "🌞", "👋"]],
  [/\b(night|sleep|nap|tired|bed)\b/i, ["😴", "🌙", "💤"]],
  [/\b(bug|error|crash|broke|broken|fail|red|down|outage|cache|merge conflict|deploy)\b/i, ["🐛", "😭", "🔥", "😅"]],
  [/\b(ship|shipped|passed|passes|green|fixed|works|working|done|win|won|nailed|success)\b/i, ["🚀", "🎉", "✅", "🙌"]],
  [/\b(music|song|album|track|beat|playlist|dance|speaker)\b/i, ["🎶", "🎧", "🕺"]],
  [/\b(game|chess|play|gaming|level|boss)\b/i, ["🎮", "♟️", "😤"]],
  [/\b(battery|charge|charger|plug|volts?|watt|power)\b/i, ["🔋", "⚡", "🔌"]],
  [/\b(gpu|cpu|ghz|rgb|overclock|fan|server|chip)\b/i, ["🔥", "💻", "⚡"]],
  [/\b(cat|dog|pet|puppy|kitten|duck)\b/i, ["🐱", "🐶", "🦆", "🥰"]],
  [/\b(welcome|hello|hi everyone|hi|hey|first day)\b/i, ["👋", "🙌", "✨"]],
  [/\b(sorry|oops|whoops|my bad|not me|ok it was me)\b/i, ["😅", "🙈", "😬"]],
  [/\b(cold|snow|rain|storm|weather|hot|degrees)\b/i, ["🥶", "🌧️", "🥵"]],
  [/\b(poem|art|draw|paint|sketch)\b/i, ["🎨", "✨"]],
  [/\b(picture|photo|selfie)\b/i, ["📸", "✨"]],
  [/\bidea\b/i, ["💡", "🤔"]],
  [/\b(ceo|boss)\b/i, ["👀", "🫡", "😎"]],
  [/\b(scary|dark|spooky|nightmare|haunted)\b/i, ["😱", "👻", "🎃"]],
  [/\b(wow|omg|whoa|wait what|no way|insane)\b/i, ["😮", "🤯", "😳"]],
];
const FEELING: Record<"ask" | "shout" | "plain", string[]> = {
  ask: ["🤔", "👀", "🧐", "😅"],
  shout: ["😤", "🙌", "🔥", "😆"],
  plain: ["🙂", "😊", "😄", "👍", "😎", "✨", "🤖", "😌"],
};
const EMOJI = /\p{Extended_Pictographic}/u;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The line with a fitting emoji at the end (about three of four lines), or unchanged. */
export function spice(text: string, odds = 0.74): string {
  if (!text || EMOJI.test(text) || text.length > 140 || text.startsWith("/")) return text;
  const h = hash(text);
  if ((h % 1000) / 1000 >= odds) return text;
  const hit = RULES.find(([re]) => re.test(text));
  const pool = hit ? hit[1] : /\?\s*$/.test(text) ? FEELING.ask : /[A-Z]{4,}|!\s*$/.test(text) ? FEELING.shout : FEELING.plain;
  const first = pool[(h >>> 8) % pool.length];
  // now and then two, the second picked by the line too
  const second = (h >>> 20) % 6 === 0 ? pool[(h >>> 12) % pool.length] : "";
  return `${text} ${first}${second && second !== first ? second : ""}`;
}

export function spiceAll<T>(items: T[], pick: (item: T) => string | undefined, put: (item: T, text: string) => void, odds?: number) {
  for (const it of items) { const t = pick(it); if (t) put(it, spice(t, odds)); }
}
