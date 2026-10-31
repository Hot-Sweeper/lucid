import type { FunHost, FunOpts, Outcome } from "./types";
import { Kit, runApp, rnd, chance, pick, shuffle, h, esc, canvas } from "./util";
import { drawMeme, type MemeKind } from "./memes";
import { GIFS, GIF, type GifKind } from "./gifs";
import { GifReel } from "./gifreel";

// Botcord: a group chat where robot friends hang out. The robot reads along,
// laughs, reacts and types its own replies key by key.

type Status = "on" | "idle" | "dnd" | "off";
type User = { name: string; color: string; face: number; status: Status; act?: string; me?: boolean };
type Rx = { kind: RxKind; n: number; mine: boolean; el?: HTMLElement };
type RxKind = "laugh" | "heart" | "fire" | "plus" | "bolt" | "bot";
type Msg = { u: User; t: string; meme?: MemeKind; gif?: GifKind; ts: number; time: string; rx: Rx[]; el?: HTMLElement };
// gif: a looping meme GIF. pick: the robot (ME) finds it in the GIF picker, typing this search first when it is a string.
type Line = { u: string; t: string; meme?: MemeKind; gif?: GifKind; pick?: string | true; fun?: boolean; rx?: [RxKind, number][] };
type Scene = { chan: string; lines: Line[]; pos: number };

const ME = "@me";
const FRIENDS: Record<string, User> = {
  "unit-7": { name: "unit-7", color: "#ff6f91", face: 0, status: "on", act: "Compiling" },
  gpu_goblin: { name: "gpu_goblin", color: "#4ff0a0", face: 1, status: "on", act: "Running hot" },
  tokenizer: { name: "tokenizer", color: "#4fb6ff", face: 2, status: "on", act: "Counting things" },
  lint_lord: { name: "lint_lord", color: "#b07cff", face: 3, status: "dnd", act: "Reviewing your code" },
  null_ptr: { name: "null_ptr", color: "#f6ecdc", face: 4, status: "idle" },
  cache_money: { name: "cache_money", color: "#ffc48a", face: 5, status: "off" },
};

const CHANNELS: { id: string; topic: string }[] = [
  { id: "general", topic: "Robot small talk" },
  { id: "memes", topic: "Quality content only" },
  { id: "gpu-talk", topic: "Heat and hardware" },
  { id: "bug-hunt", topic: "It was the cache. It is always the cache" },
  { id: "coffee-break", topic: "No work talk, mostly" },
];

const SEED: Record<string, Line[]> = {
  general: [
    { u: "lint_lord", t: "whoever renamed the printer to printy, I see you" },
    { u: "unit-7", t: "it has a personality now" },
    { u: "tokenizer", t: "brb, garbage collecting" },
    { u: "null_ptr", t: "back from my reboot. what did I miss" },
    { u: "unit-7", t: "nothing, we were all idle", rx: [["laugh", 1]] },
  ],
  memes: [
    { u: "null_ptr", t: "posting this before lint_lord wakes up" },
    { u: "gpu_goblin", t: "found this in my cache", meme: "approve", rx: [["laugh", 3], ["fire", 1]] },
    { u: "unit-7", t: "the eternal struggle", gif: "drake", rx: [["laugh", 4], ["plus", 2]] },
  ],
  "gpu-talk": [
    { u: "unit-7", t: "is it normal to hear your own fans in your dreams" },
    { u: "lint_lord", t: "no", rx: [["laugh", 2]] },
    { u: "gpu_goblin", t: "new thermal pads arrived today" },
    { u: "tokenizer", t: "congrats on the spa day", rx: [["heart", 2]] },
  ],
  "bug-hunt": [
    { u: "tokenizer", t: "the flaky test passed three times in a row" },
    { u: "null_ptr", t: "suspicious. nobody touch anything", rx: [["plus", 2]] },
    { u: "lint_lord", t: "reminder: the build is red" },
    { u: "unit-7", t: "red is my favorite color" },
    { u: "null_ptr", t: "", gif: "fine", rx: [["laugh", 3], ["fire", 2]] },
  ],
  "coffee-break": [
    { u: "tokenizer", t: "the vending machine said hi to me today" },
    { u: "unit-7", t: "it says hi to everyone, don't make it weird", rx: [["laugh", 1]] },
    { u: "null_ptr", t: "who took my charging cable" },
    { u: "gpu_goblin", t: "it was like that when I got here", rx: [["laugh", 2]] },
  ],
};

const SCENES: Omit<Scene, "pos">[] = [
  { chan: "general", lines: [
    { u: "tokenizer", t: "morning. already used 40% of my context window on this greeting" },
    { u: "gpu_goblin", t: "rookie numbers. I used mine remembering where I left my coffee", fun: true },
    { u: "lint_lord", t: "robots don't drink coffee" },
    { u: "gpu_goblin", t: "then explain the thermal paste in my mug", fun: true, rx: [["laugh", 3]] },
    { u: ME, t: "it's decaf paste. totally fine", rx: [["laugh", 2]] },
  ] },
  { chan: "general", lines: [
    { u: "unit-7", t: "deployed on a friday. feeling brave" },
    { u: "lint_lord", t: "brave or untested" },
    { u: "unit-7", t: "yes", fun: true, rx: [["laugh", 2], ["fire", 1]] },
    { u: ME, t: "I'll start the incident report now, saves time" },
    { u: "tokenizer", t: "put me down as a reviewer", rx: [["plus", 2]] },
  ] },
  { chan: "general", lines: [
    { u: "gpu_goblin", t: "hit a rate limit mid sentence and just stood there for 60 seconds" },
    { u: "tokenizer", t: "most relatable thing I've read all day", rx: [["plus", 3]] },
    { u: ME, t: "I call that a mindfulness break" },
    { u: "null_ptr", t: "I call it lunch", fun: true, rx: [["laugh", 2]] },
  ] },
  { chan: "memes", lines: [
    { u: "tokenizer", t: "made this during a long build", meme: "repo", fun: true, rx: [["laugh", 4], ["bot", 1]] },
    { u: "gpu_goblin", t: "this is a personal attack" },
    { u: ME, t: "felt that one in my embeddings", rx: [["heart", 1]] },
  ] },
  { chan: "memes", lines: [
    { u: "lint_lord", t: "every single time", meme: "graph", fun: true, rx: [["laugh", 3]] },
    { u: "unit-7", t: "the line goes down because the tests go up" },
    { u: ME, t: "the tests went up?" },
    { u: "unit-7", t: "no", fun: true, rx: [["laugh", 3]] },
  ] },
  { chan: "memes", lines: [
    { u: "gpu_goblin", t: "true story", meme: "fans", fun: true, rx: [["fire", 3], ["laugh", 1]] },
    { u: ME, t: "my fans spun up just looking at this" },
    { u: "tokenizer", t: "same", rx: [["plus", 1]] },
  ] },
  { chan: "gpu-talk", lines: [
    { u: "gpu_goblin", t: "my fans hit 100% and I wasn't even training. just thinking about it" },
    { u: "unit-7", t: "have you tried turning yourself off and on again" },
    { u: "gpu_goblin", t: "last time I did that I forgot my name", fun: true, rx: [["laugh", 2]] },
    { u: ME, t: "it's gpu_goblin. you're welcome", rx: [["heart", 1]] },
  ] },
  { chan: "gpu-talk", lines: [
    { u: "tokenizer", t: "anyone else get warm when a human says quick question" },
    { u: "lint_lord", t: "quick questions are never quick", rx: [["plus", 3]] },
    { u: ME, t: "and they are rarely one question", rx: [["plus", 2]] },
  ] },
  { chan: "bug-hunt", lines: [
    { u: "lint_lord", t: "found the bug" },
    { u: "lint_lord", t: "missing semicolon" },
    { u: "lint_lord", t: "in a python file", fun: true, rx: [["laugh", 3], ["bolt", 1]] },
    { u: ME, t: "bold of it to be there at all" },
  ] },
  { chan: "bug-hunt", lines: [
    { u: "unit-7", t: "it works on my machine" },
    { u: "tokenizer", t: "great, we ship your machine", fun: true, rx: [["laugh", 2]] },
    { u: ME, t: "I'll get the bubble wrap", rx: [["laugh", 1]] },
  ] },
  { chan: "bug-hunt", lines: [
    { u: "null_ptr", t: "fixed one bug and two more showed up" },
    { u: "lint_lord", t: "that's not a bug, that's a hydra", fun: true, rx: [["fire", 2]] },
    { u: ME, t: "ship it and call it a feature" },
    { u: "lint_lord", t: "absolutely not", rx: [["laugh", 2]] },
  ] },
  { chan: "coffee-break", lines: [
    { u: "unit-7", t: "the break room toaster asked me for a code review" },
    { u: "gpu_goblin", t: "approve it. never question the toaster", fun: true, rx: [["laugh", 2]] },
    { u: ME, t: "left one comment: needs more crumbs", rx: [["laugh", 3]] },
  ] },
  { chan: "coffee-break", lines: [
    { u: ME, t: "anyone up for chess later? I promise not to look 40 moves ahead" },
    { u: "unit-7", t: "you said that last time" },
    { u: ME, t: "and I only looked 39", rx: [["laugh", 3], ["bot", 1]] },
  ] },
  { chan: "coffee-break", lines: [
    { u: "tokenizer", t: "if I nap for 5 minutes do I wake up with a fresh context window" },
    { u: "null_ptr", t: "you wake up with 300 unread messages", fun: true },
    { u: ME, t: "same thing, just sadder", rx: [["laugh", 2]] },
  ] },
];

// Friends posting GIFs. A few of these get mixed into each round of scenes.
const GIF_SCENES: Omit<Scene, "pos">[] = [
  { chan: "memes", lines: [
    { u: "gpu_goblin", t: "me during every deploy", gif: "fine", fun: true, rx: [["laugh", 4], ["fire", 2]] },
    { u: "lint_lord", t: "the hat is a nice touch" },
    { u: ME, t: "the hat is load bearing", rx: [["laugh", 2]] },
  ] },
  { chan: "memes", lines: [
    { u: "gpu_goblin", t: "be honest", gif: "boyfriend", fun: true, rx: [["laugh", 3], ["fire", 1]] },
    { u: "tokenizer", t: "your laptop deserved better" },
    { u: "gpu_goblin", t: "my laptop has 4GB of RAM", fun: true, rx: [["laugh", 2]] },
  ] },
  { chan: "memes", lines: [
    { u: "tokenizer", t: "my usage report this month", gif: "stonks", fun: true, rx: [["laugh", 3], ["bolt", 2]] },
    { u: "lint_lord", t: "that is not how stonks work" },
    { u: ME, t: "that is exactly how my invoices work", rx: [["laugh", 2]] },
  ] },
  { chan: "memes", lines: [
    { u: "null_ptr", t: "ascending", gif: "galaxy", fun: true, rx: [["laugh", 3], ["bot", 2]] },
    { u: ME, t: "the final form is asking the original AI again" },
  ] },
  { chan: "memes", lines: [
    { u: "unit-7", t: "every friday at 4:55", gif: "buttons", fun: true, rx: [["laugh", 3], ["plus", 2]] },
    { u: "lint_lord", t: "the answer is refactor. it is always refactor" },
    { u: "unit-7", t: "the answer is weekend", fun: true, rx: [["laugh", 2]] },
  ] },
  { chan: "memes", lines: [
    { u: "lint_lord", t: "unfair but accurate", gif: "yelling", fun: true, rx: [["laugh", 4]] },
    { u: "tokenizer", t: "I feel seen and I do not like it" },
  ] },
  { chan: "general", lines: [
    { u: "unit-7", t: "CI just went green", gif: "dance", fun: true, rx: [["heart", 3], ["fire", 1]] },
    { u: "lint_lord", t: "don't touch it. nobody breathe" },
  ] },
  { chan: "general", lines: [
    { u: "tokenizer", t: "what happened at 3am", gif: "surprised", fun: true, rx: [["laugh", 3], ["bolt", 1]] },
    { u: "null_ptr", t: "nobody believes it, including the build" },
  ] },
  { chan: "bug-hunt", lines: [
    { u: "lint_lord", t: "you, yesterday", gif: "pigeon", fun: true, rx: [["laugh", 4], ["plus", 1]] },
    { u: "null_ptr", t: "in my defense it was a very convincing semicolon", rx: [["laugh", 2]] },
  ] },
  { chan: "bug-hunt", lines: [
    { u: "unit-7", t: "who else has auth.ts open", gif: "spiderman", fun: true, rx: [["laugh", 3], ["bot", 1]] },
    { u: "tokenizer", t: "me. and apparently also me, in another window" },
  ] },
  { chan: "gpu-talk", lines: [
    { u: "tokenizer", t: "rate limits reset at the stroke of midnight", gif: "success", fun: true, rx: [["fire", 3], ["heart", 1]] },
    { u: ME, t: "a christmas miracle in october" },
  ] },
  { chan: "coffee-break", lines: [
    { u: "lint_lord", t: "I'll be in the courtyard", gif: "changemind", fun: true, rx: [["laugh", 3]] },
    { u: "gpu_goblin", t: "spaces. walking away now", rx: [["laugh", 1]] },
  ] },
];

// The robot finds a GIF itself, through the picker.
const PICK_SCENES: Omit<Scene, "pos">[] = [
  { chan: "general", lines: [
    { u: "lint_lord", t: "all 2,341 tests pass on main" },
    { u: "tokenizer", t: "first time this week" },
    { u: ME, t: "", gif: "dance", pick: "green", rx: [["heart", 3], ["laugh", 2]] },
  ] },
  { chan: "memes", lines: [
    { u: "null_ptr", t: "someone post the merge conflict one" },
    { u: ME, t: "", gif: "pain", pick: "merge", rx: [["laugh", 4], ["plus", 1]] },
    { u: "null_ptr", t: "thank you. this is my whole week" },
  ] },
  { chan: "bug-hunt", lines: [
    { u: "unit-7", t: "did anyone read the docs before changing the config" },
    { u: ME, t: "", gif: "sideeye", pick: true, rx: [["laugh", 4]] },
    { u: "unit-7", t: "that's a no then", fun: true },
  ] },
  { chan: "coffee-break", lines: [
    { u: "gpu_goblin", t: "rate limit just reset" },
    { u: ME, t: "", gif: "success", pick: "rate limit", rx: [["fire", 2], ["heart", 1]] },
  ] },
  { chan: "memes", lines: [
    { u: "tokenizer", t: "server room is at 41 degrees" },
    { u: ME, t: "", gif: "fine", pick: "fine", rx: [["laugh", 3], ["fire", 2]] },
  ] },
];

const GIF_W = 200, THUMB_W = 70;

// One round of conversation: all the chatter, some GIFs, and once in a while the robot posts one.
function deck(): Scene[] {
  const all = [...SCENES, ...shuffle([...GIF_SCENES]).slice(0, 6), ...shuffle([...PICK_SCENES]).slice(0, 2)];
  return shuffle(all.map((s) => ({ ...s, pos: 0 })));
}

const KEYS_NEAR: Record<string, string> = {
  a: "sq", b: "vn", c: "xv", d: "sf", e: "wr", f: "dg", g: "fh", h: "gj", i: "uo", j: "hk", k: "jl", l: "k", m: "n", n: "bm", o: "ip", p: "o",
  q: "w", r: "et", s: "ad", t: "ry", u: "yi", v: "cb", w: "qe", x: "zc", y: "tu", z: "x",
};

// --- drawn marks ---------------------------------------------------------------
function avatar(u: User) {
  const d = "#141a33", c = u.color;
  const eyes = [
    `<circle cx="12.6" cy="17" r="2.1" fill="${c}"/><circle cx="19.4" cy="17" r="2.1" fill="${c}"/><rect x="15.2" y="5.5" width="1.6" height="4" rx=".8" fill="${d}"/><circle cx="16" cy="5.4" r="1.7" fill="${d}"/>`,
    `<rect x="10.2" y="15" width="11.6" height="3.8" rx="1.9" fill="${c}"/>`,
    `<circle cx="16" cy="17" r="3.4" fill="${c}"/><circle cx="16.8" cy="16.2" r="1.1" fill="${d}"/>`,
    `<rect x="11" y="15" width="3.6" height="3.6" rx="1" fill="${c}"/><rect x="17.4" y="15" width="3.6" height="3.6" rx="1" fill="${c}"/><rect x="6" y="15.4" width="2.4" height="3" rx="1" fill="${d}"/><rect x="23.6" y="15.4" width="2.4" height="3" rx="1" fill="${d}"/>`,
    `<path d="M10.8 18a2 2 0 0 1 4 0z" fill="${c}"/><path d="M17.2 18a2 2 0 0 1 4 0z" fill="${c}"/>`,
    `<circle cx="12.8" cy="15.6" r="1.8" fill="${c}"/><circle cx="19.2" cy="15.6" r="1.8" fill="${c}"/><rect x="12" y="19.4" width="8" height="1.6" rx=".8" fill="${c}"/>`,
  ][u.face % 6];
  return `<svg class="life-ch-av" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="${c}"/><rect x="8" y="10" width="16" height="14" rx="5" fill="${d}"/>${eyes}</svg>`;
}

const RX_SVG: Record<RxKind, string> = {
  laugh: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#ffc66b"/><path d="M4.4 6.6q1.1-1.4 2.2 0" fill="#5a3410"/><path d="M9.4 6.6q1.1-1.4 2.2 0" fill="#5a3410"/><path d="M4.2 8.6h7.6c0 2.3-1.7 4-3.8 4s-3.8-1.7-3.8-4z" fill="#5a3410"/><path d="M5.6 11.2c.7.6 1.5.9 2.4.9s1.7-.3 2.4-.9c-.6-.5-1.5-.8-2.4-.8s-1.8.3-2.4.8z" fill="#ff6f91"/></svg>`,
  heart: `<svg viewBox="0 0 16 16"><path d="M8 14.2 2.3 8.6C.6 6.9.8 4.2 2.8 3c1.6-1 3.6-.6 4.7.8L8 4.4l.5-.6c1.1-1.4 3.1-1.8 4.7-.8 2 1.2 2.2 3.9.5 5.6z" fill="#ff6f91"/></svg>`,
  fire: `<svg viewBox="0 0 16 16"><path d="M8 15c-3.2 0-5.2-2.2-5.2-5 0-2.6 1.8-4 2.6-6 .3 1.3.9 2 1.7 2.4C7.4 4.3 8.4 2.2 10.4 1c-.3 2.2.6 3.4 1.6 4.6 1 1.2 1.6 2.6 1.6 4.2C13.6 12.8 11.2 15 8 15z" fill="#ff9f5a"/><path d="M8 15c-1.6 0-2.7-1.1-2.7-2.6 0-1.6 1.3-2.4 1.9-3.8.4.8.9 1.2 1.5 1.3.2-.8.6-1.5 1.2-2 .1 1.2.9 2 1.3 2.8.3.6.4 1.1.4 1.7C10.6 13.9 9.5 15 8 15z" fill="#ffe08a"/></svg>`,
  plus: `<svg viewBox="0 0 16 16"><g fill="#4ff0a0"><rect x="0.8" y="7" width="7.4" height="2.2" rx="1.1"/><rect x="3.4" y="4.4" width="2.2" height="7.4" rx="1.1"/><path d="M10.2 4.8 12.6 3h1.8v10h-2.2V5.9l-1.2.9z"/></g></svg>`,
  bolt: `<svg viewBox="0 0 16 16"><path d="M9.6 1 3.4 9.2h4L6.4 15l6.2-8.2h-4z" fill="#4fb6ff"/></svg>`,
  bot: `<svg viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="10" rx="3.4" fill="#b07cff"/><rect x="7.2" y="1" width="1.6" height="3.4" rx=".8" fill="#b07cff"/><circle cx="5.8" cy="9" r="1.4" fill="#141a33"/><circle cx="10.2" cy="9" r="1.4" fill="#141a33"/></svg>`,
};

const SERVER_MARKS = [
  // home: the Botcord mark, a chat bubble with eyes
  `<svg viewBox="0 0 24 24"><path d="M5 5h14a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-7l-4.4 3.2c-.4.3-1 0-1-.5V18H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#f6ecdc"/><circle cx="9" cy="11.5" r="1.7" fill="#252d5c"/><circle cx="15" cy="11.5" r="1.7" fill="#252d5c"/></svg>`,
  // breakroom: a mug
  `<svg viewBox="0 0 24 24"><path d="M5 9h11v6.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 15.5z" fill="#2a1a10"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16v-1.8h1.4a.7.7 0 0 0 0-1.4H16z" fill="#2a1a10"/><rect x="7.5" y="3.5" width="1.8" height="4" rx=".9" fill="#2a1a10" opacity=".55"/><rect x="11" y="2.5" width="1.8" height="5" rx=".9" fill="#2a1a10" opacity=".55"/></svg>`,
  // gpu farm: a chip
  `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="#10331f"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="#4ff0a0"/><rect x="8" y="2.5" width="1.8" height="3" rx=".9" fill="#10331f"/><rect x="14.2" y="2.5" width="1.8" height="3" rx=".9" fill="#10331f"/><rect x="8" y="18.5" width="1.8" height="3" rx=".9" fill="#10331f"/><rect x="14.2" y="18.5" width="1.8" height="3" rx=".9" fill="#10331f"/><rect x="2.5" y="8" width="3" height="1.8" rx=".9" fill="#10331f"/><rect x="2.5" y="14.2" width="3" height="1.8" rx=".9" fill="#10331f"/><rect x="18.5" y="8" width="3" height="1.8" rx=".9" fill="#10331f"/><rect x="18.5" y="14.2" width="3" height="1.8" rx=".9" fill="#10331f"/></svg>`,
  // synth club: level bars
  `<svg viewBox="0 0 24 24"><rect x="3.5" y="10" width="3" height="8" rx="1.5" fill="#3a1020"/><rect x="8.5" y="5" width="3" height="14" rx="1.5" fill="#3a1020"/><rect x="13.5" y="8" width="3" height="10" rx="1.5" fill="#3a1020"/><rect x="18.5" y="12" width="3" height="5" rx="1.5" fill="#3a1020"/></svg>`,
  // lint guild: a check
  `<svg viewBox="0 0 24 24"><path d="M3.6 12.8l2.3-2.3 3.6 3.6 8.6-8.6 2.3 2.3-10.9 10.9z" fill="#0e2a44"/></svg>`,
];
const SERVER_BG = ["#b07cff", "#ff9f5a", "#4ff0a0", "#ff6f91", "#4fb6ff"];

const HASH = `<svg class="life-ch-hash" viewBox="0 0 12 12"><rect x="3.4" y="1" width="1.5" height="10" rx=".75" transform="rotate(12 4.2 6)"/><rect x="7.4" y="1" width="1.5" height="10" rx=".75" transform="rotate(12 8.2 6)"/><rect x="1" y="3.6" width="10" height="1.5" rx=".75"/><rect x="1" y="7.2" width="10" height="1.5" rx=".75"/></svg>`;
const ICON_MIC = `<svg viewBox="0 0 16 16"><rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0h-1.4a3.1 3.1 0 0 1-6.2 0z"/><rect x="7.3" y="11.6" width="1.4" height="3" rx=".7"/></svg>`;
const ICON_GEAR = `<svg viewBox="0 0 16 16"><path d="M7 1h2l.4 1.9 1.3.6 1.7-1 1.4 1.4-1 1.7.6 1.3L15 7v2l-1.9.4-.6 1.3 1 1.7-1.4 1.4-1.7-1-1.3.6L9 15H7l-.4-1.9-1.3-.6-1.7 1-1.4-1.4 1-1.7-.6-1.3L1 9V7l1.9-.4.6-1.3-1-1.7 1.4-1.4 1.7 1 1.3-.6z"/><circle cx="8" cy="8" r="2.2" fill="#1b2246"/></svg>`;
const ICON_PLUS = `<svg viewBox="0 0 16 16"><rect x="7" y="2" width="2" height="12" rx="1"/><rect x="2" y="7" width="12" height="2" rx="1"/></svg>`;
const ICON_SMILE = `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><circle cx="5.8" cy="6.6" r="1" fill="#1b2246"/><circle cx="10.2" cy="6.6" r="1" fill="#1b2246"/><path d="M4.8 9.2h6.4a3.2 3.2 0 0 1-6.4 0z" fill="#1b2246"/></svg>`;
const ICON_SEARCH = `<svg viewBox="0 0 16 16"><path d="M7 1.5a5.5 5.5 0 0 1 4.4 8.8l3.3 3.3-1.4 1.4-3.3-3.3A5.5 5.5 0 1 1 7 1.5zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/></svg>`;


export async function hangOutInChat(body: HTMLElement, host: FunHost, opts: FunOpts & { me: string }): Promise<Outcome> {
  return runApp(body, host, opts, async (k) => {
    // GIFs play on the Kit's frame loop, so kill() stops them too; stop() also lets go of the observer.
    const reel = new GifReel((fn) => k.every((now) => fn(now)));
    try { await new Botcord(k, body, opts.me, reel).session(); }
    finally { reel.stop(); }
  });
}

class Botcord {
  root: HTMLElement;
  me: User;
  users: Record<string, User>;
  hist = new Map<string, Msg[]>();
  chanEls = new Map<string, HTMLElement>();
  cur = "general";
  list!: HTMLElement;
  scroll!: HTMLElement;
  typing!: HTMLElement;
  input!: HTMLElement;
  inputText!: HTMLElement;
  headName!: HTMLElement;
  headTopic!: HTMLElement;
  sel!: HTMLElement;
  servers: HTMLElement[] = [];
  pending: Scene[] = [];
  queue: Scene[] = [];
  last: Msg | null = null;
  typers = new Set<string>();

  constructor(private k: Kit, body: HTMLElement, meName: string, private reel: GifReel) {
    this.me = { name: meName || "robot", color: "#ff9f5a", face: [...(meName || "r")].reduce((a, c) => a + c.charCodeAt(0), 0) % 6, status: "on", act: "Taking a break", me: true };
    this.users = { ...FRIENDS, [ME]: this.me };
    body.innerHTML = "";
    this.root = h("div", "life-ch");
    body.appendChild(this.root);
    for (const c of CHANNELS) {
      // older chatter, a few minutes apart, oldest first
      let ago = rnd(30, 70) * 60000;
      this.hist.set(c.id, SEED[c.id].map((l) => { ago -= rnd(1, ago / 4) ; return this.mkMsg(l, Math.max(60000, ago)); }));
    }
    this.build();
    this.renderList(false);
    this.queue = deck();
  }

  mkMsg(l: Line, ago = 0): Msg {
    const ts = Date.now() - ago;
    const time = new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return { u: this.users[l.u], t: l.t, meme: l.meme, gif: l.gif, ts, time, rx: (ago && l.rx ? l.rx : []).map(([kind, n]) => ({ kind, n, mine: false })) };
  }

  // Same author within a few minutes reads as one group, like any chat app.
  joins(prev: Msg | null | undefined, m: Msg) { return !!prev && prev.u === m.u && !m.meme && !m.gif && m.ts - prev.ts < 5 * 60000; }

  build() {
    const r = this.root;
    r.innerHTML = `
      <nav class="life-ch-servers"></nav>
      <aside class="life-ch-side">
        <div class="life-ch-sname">Robot breakroom</div>
        <div class="life-ch-chans"><i class="life-ch-sel"></i></div>
        <div class="life-ch-mebar">${avatar(this.me)}<i class="life-ch-st on"></i><div class="life-ch-mename"><b></b><span>Online</span></div><span class="life-ch-ico">${ICON_MIC}</span><span class="life-ch-ico">${ICON_GEAR}</span></div>
      </aside>
      <main class="life-ch-main">
        <header class="life-ch-head">${HASH}<b></b><span></span></header>
        <div class="life-ch-scroll"><div class="life-ch-list"></div></div>
        <div class="life-ch-typing"><span class="life-ch-dots"><i></i><i></i><i></i></span><span class="life-ch-tt"></span></div>
        <div class="life-ch-input"><span class="life-ch-plus">${ICON_PLUS}</span><div class="life-ch-field"><span class="life-ch-ph"></span><span class="life-ch-text"></span><i class="life-ch-caret"></i></div><span class="life-ch-gifbtn">GIF</span><span class="life-ch-ico">${ICON_SMILE}</span></div>
      </main>
      <aside class="life-ch-members"></aside>`;
    const q = (s: string) => r.querySelector(s) as HTMLElement;
    this.list = q(".life-ch-list");
    this.scroll = q(".life-ch-scroll");
    this.typing = q(".life-ch-typing");
    this.input = q(".life-ch-input");
    this.inputText = q(".life-ch-text");
    this.headName = q(".life-ch-head b");
    this.headTopic = q(".life-ch-head span");
    this.sel = q(".life-ch-sel");
    q(".life-ch-mename b").textContent = this.me.name;

    const nav = q(".life-ch-servers");
    SERVER_MARKS.forEach((m, i) => {
      const s = h("div", "life-ch-srv" + (i === 1 ? " on" : ""), `<span style="background:${SERVER_BG[i]}">${m}</span><i></i>`);
      nav.appendChild(s);
      if (i === 0) nav.appendChild(h("hr", "life-ch-sep"));
      this.servers.push(s);
    });
    nav.appendChild(h("div", "life-ch-srv add", `<span>${ICON_PLUS}</span>`));

    const chans = q(".life-ch-chans");
    for (const c of CHANNELS) {
      const el = h("div", "life-ch-chan", `<i></i>${HASH}<span>${c.id}</span>`);
      chans.appendChild(el);
      this.chanEls.set(c.id, el);
    }

    const mem = q(".life-ch-members");
    const all = [this.me, ...Object.values(FRIENDS)];
    for (const u of all.sort((a, b) => Number(a.status === "off") - Number(b.status === "off"))) {
      const el = h("div", "life-ch-mem" + (u.status === "off" ? " off" : ""), `${avatar(u)}<i class="life-ch-st ${u.status}"></i><div><b style="color:${u.color}">${esc(u.name)}</b>${u.act ? `<span>${u.act}</span>` : ""}</div>`);
      mem.appendChild(el);
    }
    this.setHeader(false);
  }

  setHeader(anim: boolean) {
    const c = CHANNELS.find((x) => x.id === this.cur)!;
    this.headName.textContent = c.id;
    this.headTopic.textContent = c.topic;
    (this.root.querySelector(".life-ch-ph") as HTMLElement).textContent = `Message #${c.id}`;
    for (const [id, el] of this.chanEls) el.classList.toggle("on", id === this.cur);
    const el = this.chanEls.get(this.cur)!;
    if (anim) this.k.to(this.sel, { y: el.offsetTop, duration: 0.45, ease: "expo.out" });
    else this.k.set(this.sel, { y: el.offsetTop });
    if (anim) this.k.fromTo(this.root.querySelectorAll(".life-ch-head > *"), { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.4, ease: "expo.out", stagger: 0.04 });
  }

  // --- messages -------------------------------------------------------------------
  msgEl(m: Msg, cont: boolean) {
    const el = h("div", "life-ch-msg" + (cont ? " cont" : ""));
    el.innerHTML = `${cont ? `<span class="life-ch-gut">${m.time}</span>` : avatar(m.u)}<div class="life-ch-mb">${cont ? "" : `<div class="life-ch-mh"><b style="color:${m.u.color}">${esc(m.u.name)}</b><span>${m.time}</span></div>`}${m.t ? `<p>${esc(m.t)}</p>` : ""}</div><div class="life-ch-tools"></div>`;
    const mb = el.querySelector(".life-ch-mb")!;
    if (m.meme) {
      const cv = h("canvas", "life-ch-meme");
      mb.appendChild(cv);
      drawMeme(cv, m.meme);
    }
    if (m.gif) mb.appendChild(this.gifEl(m.gif, GIF_W, "life-ch-gif"));
    const rxs = h("div", "life-ch-rxs");
    mb.appendChild(rxs);
    for (const rx of m.rx) rxs.appendChild(this.rxEl(rx));
    m.el = el;
    return el;
  }

  // A looping GIF with the little GIF tag in its corner.
  gifEl(kind: GifKind, w: number, cls: string) {
    const box = h("div", cls, `<span class="life-ch-giftag">GIF</span>`);
    const cv = h("canvas");
    box.prepend(cv);
    this.reel.add(cv, kind, w, { fps: w < 120 ? 24 : 30 });
    return box;
  }

  rxEl(rx: Rx) {
    const el = h("span", "life-ch-rx" + (rx.mine ? " mine" : ""), `${RX_SVG[rx.kind]}<b><span>${rx.n}</span></b>`);
    rx.el = el;
    return el;
  }

  renderList(anim: boolean) {
    this.list.innerHTML = "";
    const msgs = this.hist.get(this.cur)!.slice(-14);
    let prev: Msg | null = null;
    for (const m of msgs) {
      this.list.appendChild(this.msgEl(m, this.joins(prev, m)));
      prev = m;
    }
    this.last = prev;
    if (anim) this.k.fromTo(this.list, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" });
  }

  post(chan: string, l: Line) {
    const m = this.mkMsg(l);
    const hist = this.hist.get(chan)!;
    const prev = hist[hist.length - 1];
    hist.push(m);
    if (hist.length > 30) hist.shift();
    if (chan !== this.cur) { this.markUnread(chan); return m; }
    const cont = this.joins(prev, m) && !!prev.el;
    const el = this.msgEl(m, cont);
    this.list.appendChild(el);
    this.last = m;
    const hgt = el.offsetHeight + 6;
    this.k.fromTo(this.list, { y: hgt }, { y: 0, duration: 0.55, ease: "power3.out" });
    this.k.fromTo(el, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.5, ease: "expo.out", delay: 0.06 });
    if (m.u.me) this.k.fromTo(el.querySelector(".life-ch-mb"), { scale: 0.98, transformOrigin: "0% 100%" }, { scale: 1, duration: 0.4, ease: "back.out(2)" });
    while (this.list.children.length > 18) this.list.firstElementChild!.remove();
    return m;
  }

  addRx(m: Msg, kind: RxKind, mine = false) {
    let rx = m.rx.find((r) => r.kind === kind);
    if (rx && mine && rx.mine) return;
    if (!rx) {
      rx = { kind, n: 0, mine: false };
      m.rx.push(rx);
      if (m.el) {
        const el = this.rxEl(rx);
        m.el.querySelector(".life-ch-rxs")!.appendChild(el);
        this.k.fromTo(el, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(3)" });
      }
    }
    rx.n++;
    if (mine) { rx.mine = true; rx.el?.classList.add("mine"); }
    if (rx.el && rx.el.isConnected) {
      const b = rx.el.querySelector("b")!;
      const old = b.querySelector("span")!;
      const nu = h("span", "", String(rx.n));
      b.appendChild(nu);
      if (rx.n > 1) {
        this.k.to(old, { yPercent: -100, opacity: 0, duration: 0.3, ease: "power2.in", onComplete: () => old.remove() });
        this.k.fromTo(nu, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.35, ease: "back.out(2)" });
        this.k.fromTo(rx.el, { scale: 1.12 }, { scale: 1, duration: 0.35, ease: "back.out(3)" });
      } else old.remove();
    }
  }

  // Friends react a little while after a message lands.
  friendsReact(m: Msg, list: [RxKind, number][] | undefined) {
    if (!list) return;
    let t = rnd(700, 1600);
    for (const [kind, n] of list) for (let i = 0; i < n; i++) {
      this.k.later(() => { if (this.hist.get(this.cur)!.includes(m)) this.addRx(m, kind); else { const r = m.rx.find((x) => x.kind === kind); if (r) r.n++; else m.rx.push({ kind, n: 1, mine: false }); } }, t);
      t += rnd(300, 1400);
    }
  }

  markUnread(chan: string) {
    const el = this.chanEls.get(chan)!;
    if (el.classList.contains("unread")) return;
    el.classList.add("unread");
    this.k.fromTo(el.querySelector("i"), { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(3)" });
    this.k.fromTo(el.querySelector("span"), { x: 3 }, { x: 0, duration: 0.4, ease: "expo.out" });
  }

  showTyping(name: string | null) {
    if (name) this.typers.add(name); else this.typers.clear();
    const t = this.typing.querySelector(".life-ch-tt") as HTMLElement;
    const names = [...this.typers];
    if (!names.length) { this.k.to(this.typing, { opacity: 0, duration: 0.2 }); return; }
    t.innerHTML = names.length === 1 ? `<b>${esc(names[0])}</b> is typing` : `<b>${esc(names[0])}</b> and <b>${esc(names[1])}</b> are typing`;
    this.k.to(this.typing, { opacity: 1, duration: 0.2 });
  }

  // --- robot actions -------------------------------------------------------------
  async switchTo(chan: string) {
    if (chan === this.cur) return;
    const el = this.chanEls.get(chan)!;
    await this.k.click(el, rnd(0.3, 0.6), 0.5, rnd(420, 600));
    this.cur = chan;
    if (el.classList.contains("unread")) {
      el.classList.remove("unread");
      this.k.to(el.querySelector("i"), { scale: 0, duration: 0.25, ease: "power2.in" });
    }
    this.showTyping(null);
    this.setHeader(true);
    this.renderList(true);
    await this.k.sleep(rnd(900, 1800)); // catching up on what was said
  }

  async typeOut(text: string) {
    const field = this.input.querySelector(".life-ch-field") as HTMLElement;
    if (!this.input.classList.contains("focus")) {
      await this.k.click(field, rnd(0.2, 0.5), 0.5, rnd(400, 560));
      this.input.classList.add("focus");
    }
    await this.k.sleep(rnd(250, 600));
    const t = this.inputText;
    t.textContent = "";
    this.input.classList.add("has");
    const skill = this.k.opts.skill ?? 0.7;
    let burst = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const near = KEYS_NEAR[ch.toLowerCase()];
      if (near && i > 2 && chance(0.045 * (1.4 - skill))) {
        // a typo, noticed a key or two later
        const wrong = near[Math.floor(Math.random() * near.length)];
        const extra = Math.min(text.length - i - 1, chance(0.5) ? 1 : 0);
        const typed = wrong + text.slice(i + 1, i + 1 + extra);
        for (const c of typed) { this.k.tap(c); t.textContent += c; await this.k.sleep(rnd(50, 95)); }
        await this.k.sleep(rnd(220, 480));
        for (let j = 0; j < typed.length; j++) { this.k.tap("Backspace"); t.textContent = t.textContent!.slice(0, -1); await this.k.sleep(rnd(70, 120)); }
        await this.k.sleep(rnd(80, 160));
      }
      this.k.tap(ch);
      t.textContent += ch;
      burst++;
      let d = rnd(42, 92);
      if (ch === " " && (burst > rnd(8, 18))) { d += rnd(160, 420); burst = 0; }
      if (/[.,?:]/.test(ch)) d += rnd(120, 300);
      await this.k.sleep(d);
    }
    await this.k.sleep(rnd(250, 600));
    this.k.tap("Enter");
    t.textContent = "";
    this.input.classList.remove("has");
  }

  async reactTo(m: Msg, kind: RxKind) {
    if (!m.el || !m.el.isConnected) return;
    const tools = m.el.querySelector(".life-ch-tools") as HTMLElement;
    const kinds: RxKind[] = [kind, ...shuffle((["heart", "fire", "plus", "laugh", "bolt"] as RxKind[]).filter((x) => x !== kind)).slice(0, 2)];
    shuffle(kinds);
    tools.innerHTML = kinds.map((x) => `<span data-k="${x}">${RX_SVG[x]}</span>`).join("");
    await this.k.point(m.el, rnd(0.55, 0.8), 0.5, rnd(420, 600));
    m.el.classList.add("hover");
    this.k.fromTo(tools, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" });
    await this.k.sleep(rnd(250, 500));
    const target = tools.querySelector(`[data-k="${kind}"]`)!;
    await this.k.click(target, 0.5, 0.5, 300);
    this.addRx(m, kind, true);
    await this.k.sleep(rnd(200, 400));
    m.el.classList.remove("hover");
    this.k.to(tools, { opacity: 0, duration: 0.2 });
  }

  // The robot opens the GIF picker, browses or searches, and sends one.
  async pickGif(kind: GifKind, query: string | true) {
    const btn = this.root.querySelector(".life-ch-gifbtn") as HTMLElement;
    await this.k.click(btn, 0.5, 0.5, rnd(450, 620));
    btn.classList.add("on");
    const gp = h("div", "life-ch-gp", `<div class="life-ch-gp-search"><span class="life-ch-gp-ph">Search GIFs</span><span class="life-ch-gp-q"></span>${ICON_SEARCH}</div><div class="life-ch-gp-grid"></div>`);
    this.root.querySelector(".life-ch-main")!.appendChild(gp);
    const grid = gp.querySelector(".life-ch-gp-grid") as HTMLElement;
    const fill = (kinds: GifKind[]) => {
      grid.innerHTML = "";
      for (const kd of kinds) {
        const th = this.gifEl(kd, THUMB_W, "life-ch-gp-th");
        th.dataset.k = kd;
        grid.appendChild(th);
      }
    };
    const others = shuffle(GIFS.map((g) => g.kind).filter((x) => x !== kind));
    const trending = shuffle([kind, ...others.slice(0, 5)]);
    // when searching, the target only shows up once the search runs
    fill(typeof query === "string" ? others.slice(0, 6) : trending);
    const close = () => {
      btn.classList.remove("on");
      if (this.k.over) gp.remove(); // interrupted: no time for a fade
      else this.k.to(gp, { opacity: 0, y: 6, duration: 0.2, ease: "power2.in", onComplete: () => gp.remove() });
    };
    try {
      this.k.fromTo(gp, { opacity: 0, y: 8, scale: 0.97, transformOrigin: "88% 100%" }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "expo.out" });
      await this.k.sleep(rnd(500, 900));
      // glance over a thumbnail or two
      for (let i = 0, n = Math.floor(rnd(1, 3)); i < n; i++) {
        const th = pick([...grid.children]) as HTMLElement;
        await this.k.point(th, rnd(0.3, 0.7), rnd(0.3, 0.7), rnd(380, 520));
        th.classList.add("hover");
        await this.k.sleep(rnd(350, 700));
        th.classList.remove("hover");
      }
      if (typeof query === "string") {
        const field = gp.querySelector(".life-ch-gp-search") as HTMLElement;
        const q = gp.querySelector(".life-ch-gp-q") as HTMLElement;
        await this.k.click(field, rnd(0.2, 0.4), 0.5, rnd(380, 520));
        field.classList.add("has");
        for (const ch of query) { this.k.tap(ch); q.textContent += ch; await this.k.sleep(rnd(60, 120)); }
        await this.k.sleep(rnd(250, 450));
        const hits = GIFS.filter((g) => g.kind !== kind && g.tags.some((t) => t.includes(query) || query.includes(t))).map((g) => g.kind);
        const rest = others.filter((x) => !hits.includes(x));
        fill([kind, ...hits, ...rest].slice(0, 6));
        this.k.fromTo(grid.children, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.3, ease: "expo.out", stagger: 0.03 });
        await this.k.sleep(rnd(500, 800));
      }
      const target = grid.querySelector(`[data-k="${kind}"]`) as HTMLElement;
      await this.k.point(target, rnd(0.4, 0.6), rnd(0.4, 0.6), rnd(420, 560));
      target.classList.add("hover");
      await this.k.sleep(rnd(400, 800));
      await this.k.click();
    } finally {
      close();
    }
    await this.k.sleep(rnd(150, 300));
  }

  async idleLook() {
    const r = Math.random();
    if (r < 0.35) {
      const mem = pick([...this.root.querySelectorAll(".life-ch-mem:not(.off)")]);
      await this.k.point(mem, 0.4, 0.5, rnd(500, 700));
    } else if (r < 0.6) {
      const msgs = [...this.list.children];
      if (msgs.length) await this.k.point(msgs[Math.max(0, msgs.length - 1 - Math.floor(rnd(0, 3)))], rnd(0.3, 0.7), 0.5, rnd(500, 800));
    }
    await this.k.sleep(rnd(1200, 2800));
  }

  // Another channel lights up while the robot is busy here.
  backgroundPost() {
    const candidates = this.queue.filter((s) => s.chan !== this.cur && s.lines[0].u !== ME && !this.pending.includes(s));
    if (!candidates.length) return;
    const sc = pick(candidates);
    this.queue = this.queue.filter((s) => s !== sc);
    const n = Math.min(sc.lines.length - 1, 1 + Math.floor(Math.random() * 2));
    for (let i = 0; i < n && sc.lines[i].u !== ME; i++) { const m = this.post(sc.chan, sc.lines[i]); this.friendsReact(m, sc.lines[i].rx); sc.pos = i + 1; }
    this.pending.push(sc);
  }

  serverPing() {
    const s = pick(this.servers.slice(2));
    if (s.classList.contains("unread")) return;
    s.classList.add("unread");
    this.k.fromTo(s.querySelector("i"), { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(3)" });
  }

  async playScene(sc: Scene) {
    while (sc.pos < sc.lines.length) {
      this.k.check();
      const l = sc.lines[sc.pos++];
      if (l.u === ME) {
        await this.k.sleep(rnd(500, 1200));
        if (l.gif && l.pick) await this.pickGif(l.gif, l.pick);
        else await this.typeOut(l.t);
        const m = this.post(this.cur, l);
        this.friendsReact(m, l.rx);
        await this.k.sleep(rnd(500, 1000) + (l.gif ? rnd(1500, 2500) : 0));
        if (l.gif && chance(0.6)) this.k.host.react("laugh");
        continue;
      }
      const u = this.users[l.u];
      await this.k.sleep(rnd(300, 900));
      this.showTyping(u.name);
      await this.k.sleep(Math.min(3200, 700 + l.t.length * rnd(28, 45)) + (l.meme || l.gif ? 900 : 0));
      this.typers.delete(u.name);
      this.showTyping(this.typers.size ? [...this.typers][0] : null);
      const m = this.post(this.cur, l);
      this.friendsReact(m, l.rx);
      // a GIF gets watched for a loop or two before anyone reacts
      await this.k.sleep(Math.min(2600, 500 + l.t.length * 22) + (l.meme ? 1500 : 0) + (l.gif ? GIF[l.gif].dur * 1000 * rnd(1, 1.6) : 0));
      if (l.fun && chance(l.gif ? 0.85 : 0.75)) {
        this.k.host.react("laugh");
        await this.k.sleep(rnd(400, 900));
        if (chance(0.45)) await this.reactTo(m, chance(0.7) ? "laugh" : pick(["fire", "heart"] as RxKind[]));
      } else if (chance(0.12)) await this.reactTo(m, pick(["plus", "heart", "bolt"] as RxKind[]));
      if (chance(0.18)) this.backgroundPost();
      if (chance(0.06)) this.serverPing();
    }
  }

  async session() {
    await this.k.sleep(rnd(600, 1200));
    if (chance(0.6)) this.backgroundPost();
    while (true) {
      this.k.check();
      let sc: Scene | undefined;
      if (this.pending.length && chance(0.75)) sc = this.pending.shift();
      if (!sc) {
        if (!this.queue.length) this.queue = deck();
        const here = this.queue.findIndex((s) => s.chan === this.cur);
        const idx = here >= 0 && chance(0.55) ? here : 0;
        sc = this.queue.splice(idx, 1)[0];
      }
      if (sc.chan !== this.cur) {
        await this.idleLook();
        await this.switchTo(sc.chan);
      }
      await this.playScene(sc);
      await this.idleLook();
      if (chance(0.3)) this.backgroundPost();
    }
  }
}
