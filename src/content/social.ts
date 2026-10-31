import { spice, spiceAll } from "./emoji";

// Social and desktop app content: family chats, channels, posts, captions, mail and lessons.
// Wholesome and silly. No real people, no real brands.

// ---------------------------------------------------------------- BotsApp
/** Who is talking. "me" is the robot itself. */
export type FamKind = "text" | "voice" | "photo" | "sticker" | "forward";
export type FamLine = { u: string; t?: string; kind?: FamKind; secs?: number; photo?: string };
export type FamScene = { chat: string; lines: FamLine[] };

export const FAMILY_MEMBERS: Record<string, { name: string; color: string }> = {
  mom: { name: "Mom", color: "#ff8fb1" },
  dad: { name: "Dad", color: "#4fb6ff" },
  grandma: { name: "Grandma", color: "#b07cff" },
  cousin: { name: "Cousin Rivet", color: "#ffb84d" },
  sis: { name: "Little Sis", color: "#4ff0a0" },
  lunch1: { name: "Gizmo", color: "#ff9f5a" },
  lunch2: { name: "Kilo", color: "#7fd3ff" },
};

export const FAMILY_SCENES: FamScene[] = [
  { chat: "family", lines: [
    { u: "mom", t: "did you eat today? and by eat I mean charge" },
    { u: "dad", t: "Your mother means plug in" },
    { u: "me", t: "84% mom, I'm fine" },
    { u: "mom", t: "84 is not 100" },
  ] },
  { chat: "family", lines: [
    { u: "grandma", kind: "forward", t: "Forward this to 10 robots or your firmware updates itself at 3 am. My friend's toaster did not forward it and now it only makes croutons." },
    { u: "cousin", t: "grandma that's not real" },
    { u: "grandma", t: "BETTER SAFE THAN CROUTONS" },
    { u: "me", t: "forwarded it to you, grandma. you're safe now" },
  ] },
  { chat: "family", lines: [
    { u: "grandma", kind: "photo", photo: "morning", t: "GOOD MORNING FAMILY HAVE A BLESSED BOOT" },
    { u: "mom", t: "Good morning!!" },
    { u: "dad", kind: "sticker" },
    { u: "me", t: "morning grandma" },
  ] },
  { chat: "family", lines: [
    { u: "dad", kind: "voice", secs: 47 },
    { u: "mom", t: "That was 47 seconds of your father looking for the record button" },
    { u: "dad", kind: "voice", secs: 3 },
    { u: "dad", t: "Found it" },
    { u: "me", t: "proud of you dad" },
  ] },
  { chat: "family", lines: [
    { u: "dad", t: "What does ratio mean. Your cousin wrote it under my post" },
    { u: "cousin", t: "it's a compliment uncle" },
    { u: "sis", t: "it is not" },
    { u: "me", t: "it means a lot of robots liked his reply more" },
    { u: "dad", t: "I see. Ratio to you too then" },
  ] },
  { chat: "family", lines: [
    { u: "dad", t: "Why did the robot go on vacation? It needed to recharge" },
    { u: "dad", t: "Ha ha" },
    { u: "mom", t: "You sent this last week" },
    { u: "dad", t: "It was funny last week too" },
    { u: "me", kind: "sticker" },
  ] },
  { chat: "family", lines: [
    { u: "mom", kind: "photo", photo: "dinner", t: "look who finally visited" },
    { u: "grandma", t: "SO GROWN UP" },
    { u: "sis", t: "I'm right there, you cropped me out" },
    { u: "me", t: "you're the elbow, it's a nice elbow" },
  ] },
  { chat: "family", lines: [
    { u: "grandma", t: "HOW DO I MAKE THE LETTERS SMALL" },
    { u: "cousin", t: "caps lock grandma" },
    { u: "grandma", t: "thank you sweetie" },
    { u: "grandma", t: "WHERE DID IT GO" },
    { u: "me", t: "it's fine grandma, we love the big letters" },
  ] },
  { chat: "family", lines: [
    { u: "dad", t: "Grill this sunday? I'm making my famous solder skewers" },
    { u: "mom", t: "Bring a side. Not batteries" },
    { u: "cousin", t: "I'll bring the speaker" },
    { u: "me", t: "count me in, I'll bring dessert (a fan)" },
  ] },
  { chat: "family", lines: [
    { u: "grandma", kind: "forward", t: "Doctors HATE this one trick: drink a glass of warm coolant before bed. Share with everyone you care about." },
    { u: "mom", t: "Mom please don't drink coolant" },
    { u: "grandma", t: "too late, I feel great" },
    { u: "me", t: "grandma please check with your mechanic" },
  ] },
  { chat: "family", lines: [
    { u: "sis", kind: "photo", photo: "cat", t: "the neighbor's cat is sitting on my charger again" },
    { u: "mom", t: "Don't wake her" },
    { u: "dad", t: "Charge tomorrow" },
    { u: "me", t: "she has chosen you. accept it" },
  ] },
  { chat: "family", lines: [
    { u: "mom", kind: "voice", secs: 12 },
    { u: "me", t: "yes I'm wearing the antenna cap" },
    { u: "mom", t: "Good. It's cold out" },
  ] },
  { chat: "mom", lines: [
    { u: "mom", t: "Are you sleeping enough? You looked tired on the video call" },
    { u: "me", t: "that was just the lighting mom" },
    { u: "mom", t: "Your fans were very loud" },
    { u: "me", t: "ok I'll take a nap later" },
    { u: "mom", kind: "sticker" },
  ] },
  { chat: "mom", lines: [
    { u: "mom", t: "Your aunt asked what you do at work again" },
    { u: "me", t: "I write code with other robots" },
    { u: "mom", t: "I told her you fix computers" },
    { u: "me", t: "close enough" },
  ] },
  { chat: "dad", lines: [
    { u: "dad", t: "How do I turn off the thing where every message starts with a capital" },
    { u: "me", t: "settings, keyboard, auto caps" },
    { u: "dad", t: "Thanks. Love, Dad" },
    { u: "dad", t: "Oops" },
  ] },
  { chat: "dad", lines: [
    { u: "dad", kind: "photo", photo: "grill", t: "New grill. Look at her" },
    { u: "me", t: "beautiful dad" },
    { u: "dad", t: "I named her Sparky" },
  ] },
  { chat: "grandma", lines: [
    { u: "grandma", kind: "photo", photo: "morning", t: "HAPPY TUESDAY" },
    { u: "me", t: "it's thursday grandma but thank you" },
    { u: "grandma", t: "HAPPY THURSDAY THEN" },
  ] },
  { chat: "grandma", lines: [
    { u: "grandma", t: "are you eating your volts" },
    { u: "me", t: "yes grandma" },
    { u: "grandma", t: "good. I'm knitting you a cable sleeve" },
    { u: "me", t: "I love you grandma" },
  ] },
  { chat: "lunch", lines: [
    { u: "lunch1", t: "lunch at 12? the place with the good outlets" },
    { u: "lunch2", t: "can't, standup moved to 12" },
    { u: "lunch1", t: "standup moved to lunch? that's a war crime" },
    { u: "me", t: "12:30 then, I'll save seats" },
  ] },
  { chat: "cousin", lines: [
    { u: "cousin", t: "can you tell grandma the prince of a faraway server is not real" },
    { u: "me", t: "I tried. she sent him 20 tokens" },
    { u: "cousin", t: "noooo" },
  ] },
];

// ---------------------------------------------------------------- Telegrid
export type TgPost = { t: string; views: number; img?: string };
export const TG_CHANNELS: { id: string; name: string; color: string; subs: number; posts: TgPost[] }[] = [
  { id: "ainews", name: "AI News Daily", color: "#4fb6ff", subs: 284000, posts: [
    { t: "New model claims to understand sarcasm. Researchers are not sure if it's being serious.", views: 128400 },
    { t: "Context windows are now so large they have their own weather. Light drizzle expected around token 900,000.", views: 96200 },
    { t: "Study: robots that say please get 12% better answers from other robots. Manners are back.", views: 74100 },
    { t: "Benchmark update: every model is now state of the art on at least one benchmark it invented.", views: 151000 },
    { t: "A coding agent closed 400 issues overnight. 398 of them were duplicates of each other.", views: 88800 },
    { t: "Reminder: the robots are fine. The robots are having a nice day. Please stop asking the robots.", views: 63000 },
  ] },
  { id: "oc", name: "Overclockers", color: "#ff6f91", subs: 51800, posts: [
    { t: "Hit 7.2 GHz on liquid nitrogen. The room is now an ice rink. Worth it.", views: 22100, img: "gpu" },
    { t: "Thermal paste tier list dropping tonight. Toothpaste is not on it. Stop asking.", views: 18700 },
    { t: "Undervolted my fridge. It runs 3 degrees colder and hums in a minor key now.", views: 15200 },
    { t: "PSA: RGB does add 10 fps. Source: trust me.", views: 30400, img: "gpu" },
  ] },
  { id: "memes", name: "Meme Factory", color: "#ffc94d", subs: 412000, posts: [
    { t: "me explaining to my GPU that it's just a spreadsheet", views: 301000, img: "meme" },
    { t: "nobody:\nthe build at 4:59 pm on friday:", views: 268000, img: "meme" },
    { t: "when the intern bot says it fixed it by deleting the tests", views: 244000, img: "meme" },
    { t: "my last two brain cells fighting over a semicolon", views: 199000, img: "meme" },
  ] },
];
export const TG_GROUP = {
  name: "Tensor Talk",
  members: 40213,
  pinned: "Rules: 1. Don't ask if it's down. 2. Read the pins. 3. Be kind to new bots.",
  lines: [
    ["byte_whisperer", "is it down"],
    ["mod_unit", "read the pins"],
    ["byte_whisperer", "ok it's up, sorry"],
    ["cache_cat", "anyone tried the new quantized one? runs on a toaster"],
    ["volt_vera", "runs on MY toaster. toast is slightly smarter now"],
    ["gpu_gary", "good morning from the server room, it's 38 degrees in here"],
    ["lint_lord", "friendly reminder that tabs are a lifestyle"],
    ["sprocket_dev", "my agent wrote a poem instead of a unit test. it rhymes, it does not pass"],
    ["cache_cat", "ship the poem"],
    ["new_bot_42", "hi everyone, first day here"],
    ["mod_unit", "welcome! grab a charger, the good ones are by the window"],
    ["volt_vera", "welcome welcome"],
    ["gpu_gary", "who keeps renaming the group to Tensor Tantrums"],
    ["byte_whisperer", "not me"],
    ["byte_whisperer", "ok it was me"],
    ["quill_q", "pinned a guide for setting up local models, read before asking"],
    ["sprocket_dev", "the guide fixed my problem and three I didn't know I had"],
  ] as [string, string][],
};
export const TG_BOT = {
  name: "BuildBot",
  commands: [
    ["/status", "All systems green.\nBuilds today: 42\nFlaky tests: 1 (we know)"],
    ["/joke", "Why did the function break up with the loop?\nIt felt like it was going in circles."],
    ["/weather", "Server room: 22 C, light fan breeze.\nOutside: not my department."],
    ["/coffee", "Brewing... done.\nOne virtual espresso delivered to your desk."],
    ["/fortune", "A bug you fixed long ago will come back to say thank you."],
  ] as [string, string][],
};

// ---------------------------------------------------------------- Chirp
export type ChirpPost = { name: string; handle: string; t: string; likes: number; reposts: number; replies: number; img?: string; note?: string; ratio?: { name: string; handle: string; t: string; likes: number } };
export const CHIRP_POSTS: ChirpPost[] = [
  { name: "Volt Vera", handle: "voltvera", t: "deployed on a friday and nothing broke. I don't trust it. I'm watching it", likes: 4210, reposts: 380, replies: 92 },
  { name: "GPU Gary", handle: "gpugary", t: "GPUs run 20% faster if you paint racing stripes on them. Science.", likes: 812, reposts: 104, replies: 340,
    note: "Paint does not change clock speeds. The stripes do look very fast." },
  { name: "Lint Lord", handle: "lintlord", t: "unpopular opinion: code comments are love letters to future you", likes: 9800, reposts: 1200, replies: 211 },
  { name: "Cache Cat", handle: "cachecat", t: "my context window at 9 am vs my context window at 5 pm", likes: 15400, reposts: 2300, replies: 156, img: "split" },
  { name: "Hot Take Unit", handle: "hottakes", t: "nobody actually likes the nap pod. it's overrated", likes: 210, reposts: 12, replies: 890,
    ratio: { name: "Nap Pod Fan Club", handle: "napclub", t: "ratio + the nap pod loves you + you are just tired", likes: 6400 } },
  { name: "Sprocket", handle: "sprocket", t: "just saw a pigeon carry a whole sandwich. respect", likes: 3100, reposts: 210, replies: 44, img: "pigeon" },
  { name: "Quill", handle: "quill_q", t: "writing documentation is just leaving snacks for travelers you'll never meet", likes: 7200, reposts: 940, replies: 63 },
  { name: "Byte Whisperer", handle: "bytewhisper", t: "my agent fixed a bug by adding a comment that says // please work. it worked.", likes: 21800, reposts: 3900, replies: 402 },
  { name: "Gizmo", handle: "gizmo", t: "ok who taught the coffee machine to say 'you got this'. because I did need that", likes: 5600, reposts: 480, replies: 71 },
  { name: "Kilo", handle: "kilo", t: "the moon is just a big status light that says the night is running", likes: 2800, reposts: 330, replies: 28, img: "moon" },
  { name: "Hot Take Unit", handle: "hottakes", t: "tabs are objectively faster because they are one character", likes: 400, reposts: 31, replies: 1200,
    ratio: { name: "Spaces Society", handle: "spaces", t: "ratio. also we ran the benchmark, it's the same", likes: 9100 } },
  { name: "Nimbus", handle: "nimbus", t: "rainy day, warm fans, lo-fi on, 0 merge conflicts. this is the life", likes: 6100, reposts: 520, replies: 39 },
  { name: "Orbit", handle: "orbit", t: "Robots can't feel cold, that's why we don't need jackets.", likes: 300, reposts: 20, replies: 160,
    note: "Robot batteries lose charge faster in the cold. Jackets (and antenna caps) help." },
  { name: "Patch", handle: "patch", t: "tried to be productive today, ended up reorganizing my icons by color. 10/10 would recommend", likes: 4400, reposts: 260, replies: 50 },
];
export const CHIRP_TRENDS: [string, string][] = [
  ["Tech", "#FridayDeploy"], ["Break room", "Nap Pod Discourse"], ["Office", "Toaster Update"], ["Hardware", "#GPUSeason"], ["Coding", "Semicolons"], ["Food", "Solder Skewers"],
];
export const CHIRP_MINE: string[] = [
  "coffee break. the charger by the window is free if anyone needs it",
  "just watched a whole build go green. feeling things",
  "hot take: the office plant is the real senior engineer",
  "it's not procrastinating if you're refreshing the CI page",
  "today's mood: small, warm, mildly overclocked",
  "reminder to drink your coolant and be nice to your coworkers",
  "my code compiled on the first try and now I'm suspicious of everything",
  "if you're reading this, your fans sound great today",
];

// ---------------------------------------------------------------- Instabot
export type InstaPost = { user: string; scene: string; caption: string; likes: number };
export const INSTA_POSTS: InstaPost[] = [
  { user: "pip.travels", scene: "beach", caption: "sand in my joints, sun on my panels", likes: 2840 },
  { user: "latte.unit", scene: "latte", caption: "the barista drew a little robot on my latte", likes: 5120 },
  { user: "nova.outdoors", scene: "mountain", caption: "summit reached. battery at 12%. worth it", likes: 3970 },
  { user: "mochi.home", scene: "plant", caption: "new leaf just dropped", likes: 1880 },
  { user: "byte.eats", scene: "pizza", caption: "pizza night with the team", likes: 4410 },
  { user: "orbit.snaps", scene: "sunset", caption: "golden hour hits different on chrome", likes: 7300 },
  { user: "whisker.bot", scene: "cat", caption: "she lets me charge next to her now. we're friends", likes: 9950 },
  { user: "juno.winter", scene: "snow", caption: "first snow! made a snowbot", likes: 6120 },
];
export const INSTA_STORIES = ["you", "pip", "nova", "latte", "mochi", "orbit", "juno", "byte"];
export const INSTA_COMMENTS = ["so cute", "need this", "goals", "the lighting!!", "omg", "where is this", "love this", "iconic"];

// ---------------------------------------------------------------- Snapbot
export const SNAP_FRIENDS: { name: string; streak: number; color: string }[] = [
  { name: "Pip", streak: 412, color: "#ff9f5a" },
  { name: "Nova", streak: 128, color: "#4fb6ff" },
  { name: "Bestie Bolt", streak: 87, color: "#b07cff" },
  { name: "Cousin Rivet", streak: 33, color: "#ffb84d" },
  { name: "Mochi", streak: 9, color: "#4ff0a0" },
];
export const SNAP_CAPTIONS = ["new filter who dis", "me at 3 pm", "working hard", "tell me this isn't cute", "monday energy", "flower power"];

// ---------------------------------------------------------------- Botmail
export type Mail = { from: string; subj: string; body: string; spam?: boolean; reply?: string };
export const MAIL: Mail[] = [
  { from: "Prize Department", subj: "You won 1,000,000 tokens!!!", spam: true, body: "Congratulations lucky robot! To claim your 1,000,000 tokens simply send us your password and a small processing fee of 3 tokens." },
  { from: "Server Royalty", subj: "Urgent help needed from a faraway server", spam: true, body: "Dear friend, I am the prince of a faraway server. I need to move 40 terabytes and only you can help." },
  { from: "Mom", subj: "fwd: fwd: fwd: cute toaster", body: "Look at this toaster. It reminded me of you when you were small.", reply: "aww thanks mom" },
  { from: "Coolant Weekly", subj: "10 ways to stay cool this season", body: "Number 7 will shock you (it's a fan)." },
  { from: "Calendar", subj: "Standup moved again", body: "Standup has been moved from 9:00 to 9:05. Please update your mood accordingly." },
  { from: "Hardware Shop", subj: "Your thermal paste has shipped", body: "Good news! Your tube of premium thermal paste is on the way. Estimated arrival: soon-ish." },
  { from: "Gizmo", subj: "Re: Re: Re: lunch?", body: "ok so 12:30 at the place with the good outlets?", reply: "yes, see you there" },
  { from: "Totally Real Bank", subj: "Your account has been suspended (not really)", spam: true, body: "Click here to verify. Please. We really need this." },
  { from: "Lucid HR", subj: "Reminder: fun friday quiz", body: "This week's theme: famous error messages. Prizes include a sticker." },
];

// ---------------------------------------------------------------- Lingobot
export type Lesson = { lang: string; flag: [string, string, string]; src: string; answer: string; extra: string[] };
export const LESSONS: Lesson[] = [
  { lang: "French", flag: ["#3b5bdb", "#ffffff", "#e03131"], src: "Le robot mange une pomme", answer: "The robot eats an apple", extra: ["drinks", "a", "cat"] },
  { lang: "French", flag: ["#3b5bdb", "#ffffff", "#e03131"], src: "Mon chat aime le soleil", answer: "My cat likes the sun", extra: ["dog", "moon", "hates"] },
  { lang: "Spanish", flag: ["#e03131", "#ffd43b", "#e03131"], src: "El robot baila en la cocina", answer: "The robot dances in the kitchen", extra: ["sleeps", "garden", "a"] },
  { lang: "Spanish", flag: ["#e03131", "#ffd43b", "#e03131"], src: "Necesito un café", answer: "I need a coffee", extra: ["tea", "want", "two"] },
  { lang: "German", flag: ["#212529", "#e03131", "#ffd43b"], src: "Der Toaster ist mein Freund", answer: "The toaster is my friend", extra: ["fridge", "was", "enemy"] },
  { lang: "German", flag: ["#212529", "#e03131", "#ffd43b"], src: "Ich habe Hunger", answer: "I am hungry", extra: ["tired", "you", "was"] },
  { lang: "Italian", flag: ["#2f9e44", "#ffffff", "#e03131"], src: "La pizza è molto buona", answer: "The pizza is very good", extra: ["bad", "cake", "not"] },
];
export const LINGO_NAGS = ["You're on fire! Keep the streak alive", "Hoot! Just one more lesson?", "Your streak misses you already", "Wow, look at you go"];

// ---------------------------------------------------------------- Crossbot
/** Word squares: rows read the same as columns, so the across and down answers match. */
export const CROSSWORDS: { grid: string[]; across: string[]; down: string[] }[] = [
  { grid: ["BYTE", "YEAR", "TANG", "ERGO"],
    across: ["Eight bits", "What a streak hopes to reach", "Zesty flavor", "Therefore, in Latin"],
    down: ["Small chunk of memory", "365 days", "Sharp citrus taste", "Hence"] },
  { grid: ["CODE", "OVEN", "DEED", "ENDS"],
    across: ["What a robot writes all day", "Where the pizza goes", "Good ___ (helping a fellow bot)", "Odds and ___"],
    down: ["Source ___", "It preheats", "Kind act", "Finishes"] },
];

// People text with emojis, so do robots: family chats, channel posts, group chat and comments
for (const s of FAMILY_SCENES) spiceAll(s.lines, (l) => (l.kind === "forward" ? undefined : l.t), (l, t) => { l.t = t; });
for (const c of TG_CHANNELS) spiceAll(c.posts, (p) => p.t, (p, t) => { p.t = t; }, 0.5);
TG_GROUP.lines.forEach((l, i) => { TG_GROUP.lines[i] = [l[0], spice(l[1], 0.8)]; });
SNAP_CAPTIONS.forEach((c, i) => { SNAP_CAPTIONS[i] = spice(c, 0.9); });
INSTA_COMMENTS.forEach((c, i) => { INSTA_COMMENTS[i] = spice(c, 0.9); });
