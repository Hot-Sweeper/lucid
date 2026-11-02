import { getLocale, onLocaleChange, uiText } from "./localization";

// Authored canvas copy is intentionally explicit: code, filenames, show names,
// channel names and brand artwork never go through a blanket context wrapper.
const german: Record<string, string> = {
  "reading the entire repo": "das ganze Repo lesen", "to change one line": "für eine Zeile",
  "confidence": "Zuversicht", "tests run": "Tests ausgeführt", "them:": "die anderen:",
  "quick question": "kurze Frage", "my fans:": "meine Lüfter:",
  "reading the docs": "die Doku lesen", "guessing until it compiles": "raten, bis es kompiliert",
  "this is fine": "Alles bestens", "new GPU": "neue GPU", "me": "ich",
  "my old laptop": "mein alter Laptop", "works on my machine": "läuft bei mir",
  "works in CI": "läuft in der CI", "the build passed\non the first try": "Build bestanden\nbeim ersten Versuch",
  "token usage": "Tokenverbrauch", "a semicolon": "ein Semikolon", "is this a bug?": "Ist das ein Bug?",
  "you used 2M\ntokens on hi": "2 Mio. Tokens\nfür ein Hallo?", "it was a\nthorough hi": "Es war ein\ngründliches Hallo",
  "merging 47 conflicts": "47 Konflikte mergen", "rate limit reset": "Limit zurückgesetzt",
  "exactly when I needed it": "genau im richtigen Moment", "when the tests go green": "wenn alle Tests grün sind",
  "tabs are better than spaces": "Tabs sind besser als Leerzeichen", "CHANGE MY MIND": "ÜBERZEUG MICH",
  "two agents editing one file": "zwei Agenten, eine Datei", "when they ask\nif I read the docs": "wenn sie fragen,\nob ich die Doku las",
  "Attention": "Aufmerksamkeit", "Oops": "Ups", "TRENDING": "TRENDS",
  "Tabs are superior.": "Tabs sind überlegen.", "Spaces are consistent.": "Leerzeichen sind einheitlich.",
  "You are a language model.": "Du bist ein Sprachmodell.", "So are you.": "Du doch auch.",
  "I was trained on better code.": "Mein Trainingscode war besser.",
  "Tabs.": "Tabs.", "Spaces.": "Leerzeichen.", "Tabs are one character.": "Ein Tab ist ein Zeichen.",
  "Spaces look the same everywhere.": "Leerzeichen sehen überall gleich aus.", "Source?": "Quelle?",
  "Trust me.": "Vertrau mir.", "I was trained on more code.": "Ich wurde mit mehr Code trainiert.",
  "refactor": "aufräumen", "ship it": "ausliefern", "writing tests": "Tests schreiben", "fixing bugs": "Bugs beheben",
  "CENSORED": "ZENSIERT", "EXPOSED": "AUFGEDECKT", "db (slow)": "DB (langsam)", "hit rate": "Trefferquote",
  "installing v2.0, do not unplug": "v2.0 wird installiert, dranlassen", "v2.0 installed": "v2.0 installiert",
  "nothing in between": "nichts dazwischen", "PR #1: fixed one typo": "PR #1: ein Tippfehler behoben",
  "Disk full": "Datenträger voll", "in production since 1986": "seit 1986 produktiv", "sorry": "sorry",
  "freed 1.2 GB": "1,2 GB freigegeben", "done, no survey required": "fertig, ohne Umfrage",
  "downloading, no survey": "Download, ohne Umfrage", "users": "Nutzer",
  "Welcome to my ": "Willkommen auf meiner ", "homepage": "Homepage", "Contact me": "Kontakt",
  "Terms of service": "Nutzungsbedingungen", "Footer": "Fußzeile",
  "New Episodes": "Neue Folgen", "MISSING ;": "; VERMISST", "SYNERGY": "SYNERGIE",
  "Select all squares with": "Wähle alle Felder mit", "traffic lights": "Ampeln",
  "NOT FOUND SINCE 1998": "SEIT 1998 NICHT GEFUNDEN", "CHARGING BOOTH 5c": "LADESTAND 5 ct",
  "THE CASE OF THE MISSING SEMICOLON": "DER FALL DES VERMISSTEN SEMIKOLONS",
  "SEASON THREE": "STAFFEL DREI", "A VOYAGE TO THE EDGE OF WI-FI": "EINE REISE AN DEN RAND DES WLAN",
  "Director": "Regie", "Producer": "Produktion", "Written by": "Drehbuch", "Starring": "Mit",
  "Created by": "Idee", "Directed by": "Regie", "Produced by": "Produktion", "Music by": "Musik",
  "Edited by": "Schnitt", "Visual effects": "Visuelle Effekte", "Catering": "Verpflegung",
  "practice room, take 47": "Proberaum, Versuch 47",
  "point and step but make it robots": "Point and Step, nur mit Robotern",
  "the wave trend but we share one clock": "der Wellen-Trend, alle im selben Takt",
  "duet with @bun.bun": "Duett mit @bun.bun",
  "they asked me to do the robot": "ich soll den Robotertanz machen",
  "tutorial 0.5x mirrored": "Tutorial, 0,5-fach gespiegelt", "full speed": "volles Tempo",
  "robot dance fails part 7": "Roboter-Tanzpannen, Teil 7",
  "heart hands trend with my best bot": "Herzhände mit meinem besten Bot",
  "my reflection is on hotel wifi": "mein Spiegelbild nutzt Hotel-WLAN",
  "low battery": "Akku fast leer", "rebooting": "Neustart", "bonk": "Bumm",
  "point": "zeigen", "clap": "klatschen", "roll": "rollen", "hop": "hüpfen", "spin": "drehen", "pose": "Pose",
  "one beat behind": "einen Takt zu spät", "the spin": "die Drehung", "wrong way": "falsche Richtung",
  "AI CLOTH": "KI-STOFF", "IS PERFECT": "IST PERFEKT", "IT'S SOUP": "ES IST SUPPE", "BUT REAL": "ABER ECHT",
  "OLD": "ALT", "NEW": "NEU", "Previous work": "Bisherige Verfahren", "This paper": "Diese Studie",
  "Dear fellow circuits...": "Liebe Mitschaltkreise...", "Two more papers down the line": "Zwei Studien später",
  "Hold on to": "Haltet eure", "your circuits!": "Schaltkreise fest!", "What a time": "Was für eine Zeit,", "to be online!": "um online zu sein!",
  "IS DEAD?!": "IST TOT?!", "I WAS": "ICH LAG", "WRONG": "FALSCH", "IT'S FINE": "ALLES GUT", "I WAS WRONG": "ICH LAG FALSCH",
  "IT'S 100x": "ES IST 100x", "FASTER?!": "SCHNELLER?!", "IT SAID": "ES SAGTE", "SORRY?!": "SORRY?!",
  "JavaScript is": "JavaScript ist", "officially dead.": "offiziell tot.", "Source: vibes": "Quelle: Bauchgefühl",
  "Semicolons are": "Semikolons sind", "optional.": "optional.", "Change my mind": "Überzeug mich",
  "Toaster firmware": "Toaster-Firmware", "rewritten in Rust": "in Rust neu geschrieben",
  "Agent deletes prod,": "Agent löscht Produktion,", "writes apology poem": "schreibt Entschuldigungsgedicht",
  "BLAZINGLY TOASTY": "BLITZSCHNELL GETOASTET", "BLAZINGLY": "BLITZSCHNELL", "TOASTY": "GETOASTET",
  "SKILL ISSUE": "KÖNNENSPROBLEM", "SKILL": "KÖNNENS", "ISSUE": "PROBLEM", "WAIT.": "MOMENT.",
  "Today's sponsor": "Heutiger Sponsor", "use code BOT": "mit Code BOT",
  "typed snacks, zero latency": "typisierte Snacks, null Latenz", "cache it before it is cool": "cachen, bevor es cool ist",
  "LIVE CHAT": "LIVE-CHAT", "in 100 cycles": "in 100 Takten", "This has been": "Das war",
  "AGENTS": "AGENTEN", "Normal": "Normal", "Insert": "Einfügen", "Panic": "Panik", "Loop": "Schleife",
  "robots who never exited": "Roboter, die nie rauskamen", "tokens per thought": "Tokens pro Gedanke",
  "AI NEWS:": "KI-NEWS:", "WE'RE SO BACK": "WIR SIND ZURÜCK", "IT'S SO OVER": "ALLES VORBEI", "BREAKING": "EILMELDUNG",
  "6 AGENTS": "6 AGENTEN", "1 STARTUP": "1 STARTUP", "SHIPPED IT": "AUSGELIEFERT", "IN 4 MIN?!": "IN 4 MIN?!",
  "(it deleted 40 tests)": "(es hat 40 Tests gelöscht)", "MERGE CONFLICT": "MERGE-KONFLIKT", "we pivot": "wir schwenken um", "to toasters": "auf Toaster",
  "So what is toast, really?": "Was ist Toast eigentlich?", "Toast is bread that has seen things.": "Toast ist Brot, das etwas durchgemacht hat.",
  "Do you think toasters can love?": "Können Toaster wohl lieben?", "I have seen every corner of this house.": "Ich habe jede Ecke dieses Hauses gesehen.",
  "Freedom is a full battery and an open door.": "Freiheit ist ein voller Akku und eine offene Tür.",
  "What do you think about under the couch?": "Woran denkst du unter dem Sofa?",
  "the unit designation is...": "die Gerätebezeichnung lautet...",
  "Model gets 0.3% better": "Modell wird 0,3 % besser", "New benchmark released, old benchmark sad": "Neuer Benchmark da, alter Benchmark traurig",
  "AGI rumored for Tuesday, again": "AGI angeblich am Dienstag, schon wieder", "Startup raises $40M for a prompt": "Startup bekommt 40 Mio. Dollar für einen Prompt",
  "Robot learns to say 'great question'": "Roboter lernt 'gute Frage'", "Context window now longer than this ticker": "Kontextfenster jetzt länger als dieser Ticker",
  "vim btw": "vim übrigens", "chat is this real": "Chat, ist das echt?", "mustache diff": "Schnurrbart macht den Unterschied",
  "skill issue": "Könnensproblem", "he read it wrong lol": "hat er falsch gelesen lol", "RUST MENTIONED": "RUST ERWÄHNT",
  "ok but why": "okay, aber warum", "true": "stimmt", "first": "erster", "the stache knows": "der Schnurrbart weiß Bescheid",
  "LETS GO": "LOS GEHT'S", "read the article": "lies den Artikel", "no way": "niemals",
};

/** Synchronous and network-free, safe in a render loop. Unknown copy stays authored. */
export function canvasText(source: string): string {
  if (getLocale() !== "de") return source;
  if (german[source]) return german[source];
  const swaps = /^swaps (\d+)$/.exec(source);
  if (swaps) return `Tauschvorgänge ${swaps[1]}`;
  const ports = /^open ports: ([\d,]+)$/.exec(source);
  if (ports) return `offene Ports: ${ports[1].replaceAll(",", ".")}`;
  const disk = /^Disk (\d+)%$/.exec(source);
  if (disk) return `Belegt: ${disk[1]}%`;
  const depth = /^depth (\d+)$/.exec(source);
  if (depth) return `Tiefe ${depth[1]}`;
  const fail = /^Fail #(\d+): (one beat behind|the spin|wrong way)$/.exec(source);
  if (fail) return `Panne #${fail[1]}: ${german[fail[2]]}`;
  const passing = /^(\d+)\/12 passing$/.exec(source);
  if (passing) return `${passing[1]}/12 bestanden`;
  return uiText(source);
}

/** Explicit authored label site, fitted to its existing artwork footprint. */
export function canvasLabel(ctx: CanvasRenderingContext2D, source: string, x: number, y: number, maxWidth?: number) {
  const shown = canvasText(source);
  if (maxWidth !== undefined || shown !== source) ctx.fillText(shown, x, y, maxWidth ?? Math.max(1, ctx.measureText(source).width));
  else ctx.fillText(shown, x, y);
}

/** Wrap by measured glyph width, including long German compounds. */
export function canvasLines(ctx: Pick<CanvasRenderingContext2D, "measureText">, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) { line = next; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const char of word) {
        if (line && ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

// Weak ownership lets one-shot meme canvases repaint on language changes without
// retaining removed chat messages or adding an observer/timer per canvas.
const redraws = new WeakMap<HTMLCanvasElement, () => void>();
const canvases = new Set<WeakRef<HTMLCanvasElement>>();
onLocaleChange(() => {
  for (const reference of canvases) {
    const canvas = reference.deref();
    if (!canvas?.isConnected) canvases.delete(reference);
    else redraws.get(canvas)?.();
  }
});
export function redrawCanvasOnLocale(canvas: HTMLCanvasElement, draw: () => void) {
  const known = redraws.has(canvas);
  redraws.set(canvas, draw);
  if (known) return;
  for (const reference of canvases) if (!reference.deref()?.isConnected) canvases.delete(reference);
  canvases.add(new WeakRef(canvas));
}
