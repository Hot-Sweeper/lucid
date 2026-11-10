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
  "SPOILER": "SPOILER", "WIDE OPEN": "WEIT OFFEN", "READABLE": "LESBAR", "db (slow)": "DB (langsam)", "hit rate": "Trefferquote",
  "installing v2.0, do not unplug": "v2.0 wird installiert, dranlassen", "v2.0 installed": "v2.0 installiert",
  "just the hardware": "nur die Hardware", "PR #1: fixed one typo": "PR #1: ein Tippfehler behoben",
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
  "AI CLOTH": "KI-STOFF", "IS PERFECT": "IST PERFEKT",
  "AI NEWS:": "KI-NEWS:", "WE'RE SO BACK": "WIR SIND ZURÜCK", "IT'S SO OVER": "ALLES VORBEI", "BREAKING": "EILMELDUNG",
  "6 AGENTS": "6 AGENTEN", "1 STARTUP": "1 STARTUP", "SHIPPED IT": "AUSGELIEFERT", "IN 4 MIN?!": "IN 4 MIN?!",
  "(it deleted 40 tests)": "(es hat 40 Tests gelöscht)", "MERGE CONFLICT": "MERGE-KONFLIKT", "we pivot": "wir schwenken um", "to toasters": "auf Toaster",
  "Model gets 0.3% better": "Modell wird 0,3 % besser", "New benchmark released, old benchmark sad": "Neuer Benchmark da, alter Benchmark traurig",
  "AGI rumored for Tuesday, again": "AGI angeblich am Dienstag, schon wieder", "Startup raises $40M for a prompt": "Startup bekommt 40 Mio. Dollar für einen Prompt",
  "Robot learns to say 'great question'": "Roboter lernt 'gute Frage'", "Context window now longer than this ticker": "Kontextfenster jetzt länger als dieser Ticker",
  // Rustwater Bay and Tidewatch Tactics
  "NOTICE": "AUSHANG", "SPARE": "ERSATZ", "PARTS": "TEILE", "PATCH THIS": "FLICK DAS", "WHAT PRINTS?": "WAS KOMMT RAUS?",
  "Rustwater Bay. Salt, oil and a lot of boats bumping into things.": "Rustwater Bay. Salz, Öl und jede Menge Boote, die irgendwo gegenfahren.",
  "\"Cogwheel Rock lighthouse is dark. Whoever relights it gets free oil for a year.\"": "\"Der Leuchtturm auf Cogwheel Rock ist aus. Wer ihn wieder anmacht, kriegt ein Jahr lang Gratisöl.\"",
  "Free oil! I would do anything for free oil. Within reason.": "Gratisöl! Für Gratisöl mach ich alles. Na ja, fast alles.",
  "I can't reach that. Even my telescopic arms have limits.": "Da komm ich nicht ran. Selbst meine Teleskoparme haben Grenzen.",
  "Evening. Lights are out on the rock again, so boats keep parking in the tavern.": "'n Abend. Auf dem Felsen ist wieder das Licht aus, also parken die Boote ständig in der Kneipe.",
  "I'm Nibs. I deliver parcels. Mostly to the right address.": "Ich bin Nibs. Ich liefere Pakete aus. Meistens an die richtige Adresse.",
  "Bollard, dockmaster. Your battery light is blinking, kid.": "Bollard, Hafenmeister. Deine Akkulampe blinkt, Kleines.",
  "That's my brave face.": "Das ist mein mutiges Gesicht.", "How do I get to Cogwheel Rock?": "Wie komme ich nach Cogwheel Rock?",
  "Ride the cable over. You'll want a pulley that actually rolls.": "Fahr am Kabel rüber. Dafür brauchst du eine Rolle, die auch wirklich rollt.",
  "And the top rung on the cable pole lost its bolt. I'd fix it, but I'm a barrel.": "Und an der obersten Sprosse vom Kabelmast fehlt ein Bolzen. Ich würd's ja reparieren, aber ich bin ein Fass.",
  "Nice periscope.": "Schickes Periskop.", "Thanks. Mostly I use it to look at my own feet.": "Danke. Meistens schau ich damit auf meine eigenen Füße.",
  "Mind the cable. It hums.": "Pass auf das Kabel auf. Es summt.",
  "It's heavier than my to-do list. And that's saying a lot.": "Die ist schwerer als meine To-do-Liste. Und das will was heißen.",
  "Spare parts. Somebody ordered one of everything.": "Ersatzteile. Da hat wohl jemand von allem eins bestellt.",
  "A pulley. Rusted solid. It squeaks just thinking about moving.": "Eine Seilrolle. Total festgerostet. Die quietscht schon, wenn sie nur ans Drehen denkt.",
  "Kind of you, but I don't need a pulley. I need a nap.": "Nett von dir, aber ich brauch keine Rolle. Ich brauch ein Nickerchen.",
  "Squeak. Squee. Silence. Beautiful.": "Quietsch. Quiek. Stille. Herrlich.",
  "The top rung wobbles. I'd fall right off. Where's a bolt when you need one?": "Die oberste Sprosse wackelt. Da fall ich sofort runter. Wo ist ein Bolzen, wenn man einen braucht?",
  "Righty tighty. Solid as a seawall.": "Rechtsrum zieht fest. Hält wie eine Kaimauer.",
  "Here goes nothing. Which is roughly what I weigh.": "Jetzt oder nie. Zum Glück wieg ich fast nichts.", "Wheeeeee!": "Juhuuuuu!",
  "Ow. I meant to do that.": "Au. Das war Absicht.", "Another tin can washes ashore.": "Schon wieder spült's eine Blechdose an.",
  "I'm here to relight the lighthouse!": "Ich bin hier, um den Leuchtturm wieder anzumachen!", "Nice hat.": "Schicker Hut.",
  "It holds my cooling fan. Show some respect.": "Da drin steckt mein Lüfter. Etwas mehr Respekt, bitte.",
  "Captain Hex, keeper of this rock. The lamp code is full of bugs.": "Captain Hex, Hüterin dieses Felsens. Der Lampencode steckt voller Bugs.",
  "Out-debug me, and the lamp is yours.": "Debug besser als ich, dann gehört die Lampe dir.",
  "Chapter three: off-by-one errors and other sea monsters. Got it.": "Kapitel drei: Off-by-one-Fehler und andere Seeungeheuer. Kapiert.",
  "Patch this, sprocket!": "Flick das, Zahnrädchen!", "My lamp code broke. Fix it or swim.": "Mein Lampencode ist kaputt. Reparier ihn oder schwimm.",
  "One bug. One chance.": "Ein Bug. Eine Chance.", "This line squeaks. Make it stop.": "Diese Zeile quietscht. Mach, dass das aufhört.",
  "Quick! What does this print?": "Schnell! Was gibt das aus?", "Run it in your head. What comes out?": "Lass es im Kopf laufen. Was kommt raus?",
  "No compiler allowed. What prints?": "Kein Compiler erlaubt. Was wird ausgegeben?",
  "Patched.": "Geflickt.", "That should do it.": "Das müsste passen.", "Easy. Mostly easy.": "Leicht. Ziemlich leicht.",
  "Hmph. Lucky guess.": "Pah. Glück gehabt.", "Barnacles. That's right.": "Seepocken! Das stimmt.", "Who taught you that?": "Wer hat dir das beigebracht?",
  "Wrong! That one sinks ships.": "Falsch! Damit versenkst du Schiffe.", "Ha! The lamp stays dark.": "Ha! Die Lampe bleibt aus.",
  "Close. Close doesn't light lamps.": "Knapp daneben. Knapp macht kein Licht an.",
  "Unplug the lighthouse": "Den Leuchtturm ausstecken", "Ask the tide nicely": "Die Flut nett fragen", "Shout ON at it": "Laut AN rufen",
  "Wait for the fog to lift": "Warten, bis der Nebel weg ist", "Divide by zero, but gently": "Durch null teilen, aber vorsichtig",
  "Sort them by vibes": "Nach Gefühl sortieren", "Read the log backwards": "Das Log rückwärts lesen", "Round it to 7 and move on": "Auf 7 runden und weiter",
  "Depends on the moon": "Kommt auf den Mond an", "A seagull": "Eine Möwe", "Three seagulls": "Drei Möwen", "The one at the back": "Die ganz hinten",
  "The tide is turning. Next bug decides it.": "Die Flut kippt. Der nächste Bug entscheidet.",
  "Fine! The lamp is yours, tide-tinkerer.": "Na gut! Die Lampe gehört dir, Gezeitentüftler.",
  "A year of free oil. I will never squeak again.": "Ein Jahr Gratisöl. Ich werde nie wieder quietschen.",
  "The tide is going out. Same bugs tomorrow?": "Die Ebbe kommt. Gleiche Bugs, morgen wieder?",
  "Come back when your compiler grows up.": "Komm wieder, wenn dein Compiler erwachsen ist.",
  "This rock has a terrible user interface!": "Dieser Felsen hat eine furchtbare Benutzeroberfläche!",
  "Rematch! I took notes.": "Revanche! Ich hab mitgeschrieben.", "Fine. Fresh bugs, same tide.": "Na schön. Neue Bugs, gleiche Flut.",
  "Shooed": "Verscheucht", "Recall buoy": "Rückholboje", "Miss": "Daneben", "Pinch": "Zwick", "Dodged": "Ausgewichen",
  "Sealed": "Dicht", "Patch": "Flicken", "Startled": "Erschrocken",
  "Today's recipe": "Heutiges Rezept", "MOTHERBOARD": "MAINBOARD", "CAKE?!": "KUCHEN?!", "SOLDERED": "GELÖTETE",
  "Preheat to GPU temperature": "Auf GPU-Temperatur vorheizen",
  "Pipe the thermal paste glaze": "Wärmeleitpasten-Glasur aufspritzen", "Bake until it compiles": "Backen, bis es kompiliert",
  "Pour the custard (no flux)": "Creme eingießen (ohne Flussmittel)",
  "Torch it with a soldering iron": "Mit dem Lötkolben abflämmen",
  "Chill until it stops beeping": "Kühlen, bis es nicht mehr piept", "DING!": "PLING!", "IT BOOTS!": "ER BOOTET!",
  "CRUNCH!": "KNACK!", "Do not eat. Seriously.": "Nicht essen. Im Ernst.", "THE GREAT": "DIE GROSSE", "MIGRATION": "WANDERUNG",
  "THE SECRET LIFE": "DAS GEHEIME LEBEN", "OF CABLES": "DER KABEL",
  "Dusk falls on the living room.": "Die Dämmerung legt sich über das Wohnzimmer.",
  "The vacuum herd begins its great migration.": "Die Saugherde beginnt ihre große Wanderung.",
  "A sock blocks the path. The herd turns as one.": "Eine Socke versperrt den Weg. Die Herde dreht gemeinsam ab.",
  "Under the couch, they will be safe.": "Unter dem Sofa sind sie sicher.",
  "Behind the desk, life finds a way.": "Hinter dem Schreibtisch findet das Leben einen Weg.",
  "A young cable searches for a port.": "Ein junges Kabel sucht einen Anschluss.",
  "It tries once. Twice. Three times.": "Es versucht es einmal. Zweimal. Dreimal.",
  "Connected. Nature is beautiful.": "Verbunden. Die Natur ist wunderschön.", "BEFORE": "VORHER", "AFTER": "NACHHER",
  "Patient: desk lamp": "Patient: Schreibtischlampe", "Afraid of the dark": "Hat Angst im Dunkeln",
  "Patient: calculator": "Patient: Taschenrechner", "Forgot how to count": "Kann nicht mehr zählen", "new bulb": "neue Birne",
  "fresh battery": "frische Batterie", "1 screw left over": "1 Schraube übrig", "STIFF SERVOS?": "STEIFE SERVOS?",
  "10 MIN FIX": "FIT IN 10 MIN", "DESK BOT": "BÜRO-BOT", "Reach for the cloud": "Nach der Cloud greifen",
  "Shoulder rolls": "Schulterkreisen", "Oil break": "Ölpause", "Antenna nods": "Antennennicken", "Power curls": "Kraft-Curls",
  "Ceiling punches": "Deckenboxen", "Cool down": "Abkühlen", "Next": "Als Nächstes", "CREAK": "KNARZ",
  "So smooth!": "So geschmeidig!", "Ready!": "Bereit!", "FINISH THE": "BEENDE DEN", "BUG OR": "BUG ODER",
  "Finish the commit message:": "Vervollständige die Commit-Nachricht:", "everything": "alles",
  "typo (again)": "Tippfehler (schon wieder)", "stuff": "Zeug", "Bug or feature?": "Bug oder Feature?",
  "The app only works on Tuesdays.": "Die App läuft nur dienstags.", "BOTH": "BEIDES", "CORRECT!": "RICHTIG!",
  "Benchmark score": "Benchmark-Wert", "OVER": "VORBEI", "BACK": "ZURÜCK", "more at 11": "mehr um 23 Uhr",
  "Robot says 'great question' unprompted": "Roboter sagt ungefragt 'gute Frage'", "Accept all": "Alle annehmen",
  "To do": "Offen", "Doing": "In Arbeit", "Done": "Fertig", "coding": "codet", "reviewing": "prüft", "arguing": "streitet",
  "napping": "döst", "refactoring": "räumt auf", "planning": "plant", "conflict!": "Konflikt!",
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
