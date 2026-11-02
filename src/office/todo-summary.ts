// Turns the words of a prompt into the short task title an office's to-do list shows.
// It works on the text alone (no model call, no cost), so a title never changes once it is
// shown, and it never carries ids, file paths, links or code into the interface.

const MARKERS = /^\s*(?:your\s+(?:task|scope|job|goal)|(?:the\s+)?task|scope|goal|objective|mission|job)\s*[:\-]\s*/i;
const ROLE_LINE = /^\s*(?:you are|you're|your role\b|act as|as an? )/i;
const FILLER = [
  /^(?:hey|hi|hello|yo|ok(?:ay)?|so|and|also|now|then|well|alright|btw|um+|uh+|hm+|since|wait|actually|just|maybe|ah|oh)\b[\s,.!:-]*/i,
  /^(?:please|pls|plz|kindly)\b[\s,.!:-]*/i,
  /^(?:can|could|would|will)\s+(?:you|u)\s+(?:please\s+)?/i,
  /^i\s+(?:really\s+)?(?:want|need|would\s+like|'d\s+like|wish)(?:\s+(?:you|u))?\s+to\s+/i,
  /^i\s+(?:really\s+)?(?:want|need)\s+(?=\w)/i,
  /^(?:let'?s|lets)\s+/i,
  /^we\s+(?:need|have|should|must|want)\s+to\s+/i,
  /^you\s+(?:should|need\s+to|must|have\s+to)\s+/i,
  /^go\s+ahead\s+and\s+/i,
  /^make\s+sure\s+(?:that\s+|to\s+)?/i,
  /^(?:try|remember)\s+to\s+/i,
  /^(?:the\s+)?(?:user|ceo)\s+(?:wrote|said|wants|asked)\s*[:,]?\s*/i,
];
const TAIL = /[\s,.;:!?-]*(?:please|pls|plz|thanks|thank you|thx|yk|ya know|you know|y'?know|right|ok|okay|lol)[\s.!?]*$/i;
const STOP_END = /\s+(?:and|or|the|a|an|of|to|for|in|with|on|at|that|which|so|but|as|by|from|is|are|be|it|this|then|if|when|my|our|your|their|his|her|its)$/i;
const DANGLING = /\s+(?:like|way|thing|things|stuff|really|just|very|some|any|kind of|sort of|a lot|too|also|not|no|was|were|do|does|did|how|would|could|should|can|will|might|may|i|you|we|they|he|she|good|great|nice|new|better|best|more|less|same|other|each|every|all|big|bigger)$/i;
const CLAUSE = /,\s+|;\s+|\s+(?:and then|but|because|so that|so|which|since|while|although|then|until|unless)\s+|\s+[\u2013\u2014]\s+|\s-\s/i;
const MAX_WORDS = 8;
const MAX_CHARS = 56;

// An action verb a request leads with, and the pivots of "this should change".
const VERBS = "fix|add|make|ensure|improve|change|remove|update|show|build|create|write|implement|redesign|replace|move|rename|check|test|review|refactor|investigate|find|look|let|give|set|use|stop|keep|prevent|handle|support|enable|disable|clean|polish|animate|draw|design|connect|install|run|merge|push|pull|explain|tell|list|read|open|close|delete|load|sync|save|reorder|resize|unify|speed|optimi[sz]e|debug|rework|rewrite|extend|restore|revert|wire|hook|reply|answer|summari[sz]e|translate|plan|try|turn|bring|swap|split|combine|document|verify|audit|migrate|deploy|release|ship|finish|continue|start|launch";
const ACTION = new RegExp(`^(?:${VERBS})\\b`, "i");
const INNER_ACTION = /\s(?:fix|add|make|ensure|improve|change|remove|implement|redesign|refactor|investigate|unify|replace|rewrite)\b.+/i;
const WANT = /\b(?:should|shouldn'?t|needs? to|can be|could be|has to|must|wanna|want|would be)\b/i;
// "make it awesome" says how, not what: it only wins when nothing else is left
const GENERIC = /^(?:make|have|do)\s+(?:it|them|things|everything|that|this)\b/i;
// chatter that carries no task
const NOISE = /\b(?:yk|ya know|waht i mean|what i mean|etc|lol|lmao|lmfao|idk|tbh|ngl|imo|btw|pls|plz|please|kinda|basicly|basically|thingy|thingys|like that|and stuff|and so on|or something)\b[\s,.!?]*/gi;

// Everything that is not words: code, links, paths, ids, branch names, markup.
function clean(raw: string): string {
  return raw
    .replace(/<[a-z_][\w-]*[^>]*>[\s\S]*?<\/[a-z_][\w-]*>/gi, " ")      // referenced thread blocks and other tags
    .replace(/\n*Attached:[\s\S]*$/, " ")
    .replace(/^\s*-\s*(?:image|file):.*$/gim, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\b[a-z]:[\\/]\S*/gi, (m) => m.match(/([\w-]+\.[a-z0-9]{1,5})[?!.,;:)]*$/i)?.[1] ?? " ")   // C:\path, keeping a file name
    .replace(/(?:^|\s)~?\.{0,2}[\\/][\w.\-\\/]+/g, " ")                  // ./a/b, /a/b
    .replace(/\b[\w.-]+(?:[\\/][\w.-]+)+/g, " ")                         // a/b/c.ts, lucid/todo
    .replace(/\b[\w-]+:[0-9a-f]{8}-[0-9a-f-]{20,}\b/gi, " ")             // thread:uuid and friends
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, " ")
    .replace(/\b(?=[0-9a-f]{7,40}\b)(?=\w*\d)(?=\w*[a-f])[0-9a-f]+\b/gi, " ")   // commit hashes
    .replace(/\b(?:run|thread|turn|node|task)[:#]\S+/gi, " ")
    .replace(/[@#]\w+/g, " ")
    .replace(/[*_~>#|\[\]{}()"\u201c\u201d]/g, " ")
    .replace(/(^|\s)[-\u2022]\s+/g, "$1");
}

// The part a long delegated brief is really about: what follows a "Task:" or "Scope:" label.
function body(text: string): string {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => MARKERS.test(l) || /^\s*(?:YOUR\s+)?SCOPE\b/.test(l));
  if (at >= 0) {
    const rest = [lines[at].replace(MARKERS, "").replace(/^\s*(?:YOUR\s+)?SCOPE\s*[:-]?\s*/i, ""), ...lines.slice(at + 1)].join("\n");
    if (rest.trim()) return rest;
  }
  // a role preamble ("You are an implementation worker ...") is not the task
  const ps = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (ps.length > 1 && ROLE_LINE.test(ps[0])) return ps.slice(1).join("\n");
  return text;
}

function strip(s: string): string {
  let prev = "";
  let out = s.trim();
  while (out !== prev) {
    prev = out;
    for (const re of FILLER) out = out.replace(re, "");
    out = out.replace(/^[\s,.;:!?-]+/, "");
  }
  return out.replace(TAIL, "").trim();
}

function clauses(text: string): string[] {
  return text
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Za-z])|\s+(?:and\s+)?also\s+|;\s+/i)
    .map((c) => strip(c.replace(/[.!?]+$/, "")))
    .filter(Boolean);
}

const wordCount = (s: string) => (s.match(/\S+/g) || []).length;

export function taskTitle(raw: string, files = 0): string {
  const none = files ? "Look at the attached files" : "New request";
  const list = clauses(clean(body(String(raw || ""))));
  // the first clause that asks for something; failing that one that says what should change
  const real = list.filter((c) => !GENERIC.test(c));
  const from = real.length ? real : list;
  let pick = from.find((c) => wordCount(c) >= 2 && ACTION.test(c))
    ?? from.find((c) => wordCount(c) >= 3 && WANT.test(c))
    ?? from.find((c) => wordCount(c) >= 3)
    ?? from.join(", ");
  // a request that leads into its verb ("the bots are slow, fix that"): start at the verb
  if (!ACTION.test(pick)) {
    const m = pick.match(INNER_ACTION);
    if (m && wordCount(m[0]) >= 3) pick = strip(m[0]);
  }
  if (!pick || wordCount(pick) < 1) return none;
  // cut at the first natural break once there is enough to read, then at a word boundary
  let title = pick;
  for (const part of pick.split(CLAUSE)) {
    const t = strip(part);
    if (wordCount(t) >= 3) { title = t; break; }
  }
  const words = title.split(/\s+/);
  if (words.length > MAX_WORDS || title.length > MAX_CHARS) {
    let cut = words.slice(0, MAX_WORDS).join(" ");
    if (cut.length > MAX_CHARS) cut = cut.slice(0, MAX_CHARS).replace(/\s+\S*$/, "");
    title = cut;
  }
  title = strip(title).replace(/\s*:\s*\S{0,3}$/, "");
  for (let n = 0; n < 3; n++) title = title.replace(STOP_END, "").replace(DANGLING, "");
  title = title.replace(/[\s,.;:-]+$/, "");
  if (title.length < 2) return none;
  return title[0].toUpperCase() + title.slice(1);
}

// The prompt's own words, cleaned of ids and paths, for the full text behind a title.
export function readable(raw: string, max = 260): string {
  const t = clean(body(String(raw || ""))).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, "")}\u2026` : t;
}
