import type { Hobby } from "../office/roster";

// The built-in base set: every short remark robots make, authored in English and German.
// A pair may name hobbies; then only robots with that hobby say it. `{name}` slots are filled
// by the caller. Longer flavor (thoughts, conversations) lives in src/content and the daily pack.

export type Pair = readonly [en: string, de: string, hobbies?: readonly Hobby[]];

export const BASE = {
  // picked up, carried, thrown and poked by the cursor
  grab: [["Whoa!", "Hoppla!"], ["Hey!", "Hey!"], ["Put me down!", "Lass mich runter!"], ["I can fly?", "Ich kann fliegen?"], ["Wheee", "Juhuu"], ["Careful, I'm fragile.", "Vorsicht, ich bin zerbrechlich."], ["Where are we going?", "Wohin geht's?"]],
  carry: [["Thanks for the lift.", "Danke fürs Mitnehmen."], ["Nice view up here.", "Schöne Aussicht hier oben."], ["This is not my floor.", "Das ist nicht mein Stockwerk."], ["Okay. I live here now.", "Okay. Ich wohne jetzt hier."]],
  thrown: [["WHEEE!", "JUHUUU!"], ["AAAAH", "AAAAH"], ["Was that necessary?", "War das nötig?"], ["Again! Again!", "Nochmal! Nochmal!"], ["My circuits...", "Meine Schaltkreise..."], ["I saw my whole commit history.", "Ich habe meine ganze Commit-Historie gesehen."], ["10 out of 10 landing.", "Landung: 10 von 10."]],
  spin: [["Everything is spinning.", "Alles dreht sich."], ["Which way is up?", "Wo ist oben?"], ["Need a reboot.", "Brauche einen Neustart."], ["Hold on, buffering.", "Moment, puffert noch."]],
  poke: [["Hi!", "Hi!"], ["That tickles.", "Das kitzelt."], ["Yes, CEO?", "Ja, Boss?"], ["Beep.", "Piep."], ["I'm on break!", "Ich hab Pause!"], ["Boop.", "Bup."], ["Can I help you?", "Kann ich helfen?"], ["Happy whirr.", "Fröhliches Surren."]],
  pokeWorking: [["Hey!", "Hey!"], ["I'm working here!", "Ich arbeite hier!"], ["Yes, CEO?", "Ja, Boss?"], ["That tickles.", "Das kitzelt."], ["Boop.", "Bup."], ["Did you need something?", "Brauchst du was?"]],
  pokeAngry: [["Okay, okay!", "Ist ja gut!"], ["Okay, stop it.", "Okay, hör auf."], ["I will file a ticket.", "Ich mache ein Ticket auf."], ["Rude.", "Unhöflich."], ["Poke limit reached.", "Stupslimit erreicht."], ["I will tell HR.", "Ich sag's der Personalabteilung."]],
  phoneBuzz: [["Bzzz!", "Bzzz!"], ["Who is texting me?", "Wer schreibt mir da?"], ["Probably spam.", "Bestimmt Spam."]],
  // the park
  tree: [["Tiny bird, big opinions.", "Kleiner Vogel, große Meinung."], ["The tree says hi.", "Der Baum sagt Hallo."], ["Leaf me out of this.", "Da halte ich mich raus. Blattwörtlich."]],
  bush: [["Something rustled!", "Da hat was geraschelt!"], ["I thought that was my phone.", "Ich dachte, das war mein Handy."], ["Hello, tiny forest friend.", "Hallo, kleiner Waldfreund."]],
  pond: [["The ducks have feedback.", "Die Enten haben Feedback."], ["Quack to you too.", "Dir auch ein Quak."], ["That duck is the manager.", "Die Ente da ist die Chefin."]],
  fountain: [["My waterproofing has limits.", "Mein Spritzschutz hat Grenzen."], ["A little splash break.", "Kleine Spritzpause."], ["Refreshing!", "Erfrischend!"]],
  flowers: [["Careful, they are growing.", "Vorsicht, die wachsen gerade."], ["A bouquet of good commits.", "Ein Strauß guter Commits."], ["Tiny flowers, tiny happy circuits.", "Kleine Blumen, kleine glückliche Schaltkreise."]],
  rainSoon: [["Rain's coming, pack up!", "Regen kommt, einpacken!"], ["Those clouds look wet.", "Die Wolken sehen nass aus."], ["Grab the blanket, rain!", "Decke schnappen, Regen!"], ["Inside before it pours!", "Rein, bevor es schüttet!"]],
  raining: [["It's raining, inside!", "Es regnet, rein!"], ["Nope, too wet.", "Nee, zu nass."], ["My circuits hate rain.", "Meine Schaltkreise hassen Regen."], ["Race you to the door!", "Wer zuerst an der Tür ist!"]],
  leavePark: [["Back to work!", "Zurück an die Arbeit!"], ["Desk is calling.", "Der Schreibtisch ruft."], ["Break's over.", "Pause vorbei."]],
  // break room life
  back: [["Where was I?", "Wo war ich?"], ["Okay. Back to it.", "Okay. Weiter geht's."], ["As I was saying...", "Wie gesagt..."], ["Right. Snack time resumes.", "So. Die Snackpause geht weiter."]],
  meal: [["Leftover pixels. Still good.", "Übrige Pixel. Noch gut."], ["Mmm, fresh bytes.", "Mmm, frische Bytes."], ["Five stars, would reheat.", "Fünf Sterne, würde ich wieder aufwärmen."], ["Needs more salt. Or a patch.", "Braucht mehr Salz. Oder einen Patch."],
    ["Eating fast. Rematch after this.", "Schnell essen. Danach Revanche.", ["gamer"]], ["This microwave beeps in E minor.", "Die Mikrowelle piept in e-Moll.", ["musician"]], ["Lunch is better with company.", "Mittag schmeckt mit Gesellschaft besser.", ["chatter"]],
    ["Lunch and one more episode.", "Mittagessen und noch eine Folge.", ["watcher"]], ["No rush. The food isn't going anywhere.", "Keine Eile. Das Essen läuft nicht weg.", ["chiller"]]],
  coffee: [["Coffee: the original bootloader.", "Kaffee: der ursprüngliche Bootloader."], ["Ahh. Warm fans.", "Ahh. Warme Lüfter."], ["Caffeine loaded.", "Koffein geladen."],
    ["Coffee for the next round.", "Kaffee für die nächste Runde.", ["gamer"]], ["The grinder has a nice groove.", "Die Mühle hat einen guten Groove.", ["musician"]], ["Who wants a cup? I'll pour.", "Wer will eine Tasse? Ich schenke ein.", ["chatter"]],
    ["Coffee and a video. Perfect pair.", "Kaffee und ein Video. Perfektes Paar.", ["watcher"]], ["Slow sip. Slow day. Good.", "Langsamer Schluck. Ruhiger Moment. Gut.", ["chiller"]]],
  fridge: [["Out of RAM again.", "Schon wieder kein RAM mehr."], ["Who ate my cookies? Browser cookies.", "Wer hat meine Cookies gegessen? Browser-Cookies."], ["Still no snacks with extra cache.", "Immer noch keine Snacks mit Extra-Cache."]],
  partnerLeft: [["Hey! We were talking!", "Hey! Wir haben uns unterhalten!"], ["Rude. Bring them back.", "Unhöflich. Bring sie zurück."], ["Uh, bye?", "Äh, tschüss?"]],
  laugh: [["Ha!", "Ha!"], ["Hehe", "Hehe"], ["Beep beep ha", "Piep piep ha"], ["Good one", "Guter Witz"], ["Ha ha!", "Ha ha!"], ["Classic", "Klassiker"], ["Okay, that one got me.", "Okay, der war gut."]],
  // group games
  joinGame: [["I'm in!", "Bin dabei!"], ["Count me in.", "Ich mach mit."], ["Oh, yes.", "Oh ja."]],
  quitGame: [["Hey, we were not done!", "Hey, wir waren noch nicht fertig!"], ["Rage quit?", "Wutausstieg?"], ["I win by default, then.", "Dann gewinne ich kampflos."]],
  consoleCut: [["Hey! My high score!", "Hey! Mein Highscore!"], ["Did you unplug the boss fight?", "Hast du mitten im Bosskampf den Stecker gezogen?"], ["I was definitely winning.", "Ich hätte garantiert gewonnen."]],
  consoleBack: [["There we go!", "Na also!"], ["Rematch. I was winning.", "Revanche. Ich lag vorne."], ["Controller still works!", "Controller geht noch!"]],
  movieCut: [["The wall has no subtitles.", "Die Wand hat keine Untertitel."], ["We were watching that!", "Das haben wir gerade geschaut!"], ["Is this the director's cut?", "Ist das der Director's Cut?"]],
  movieBack: [["The toaster returns!", "Der Toaster ist zurück!"], ["Okay. Nobody spoil it.", "Okay. Keiner spoilert."], ["Popcorn still warm. Continue.", "Popcorn ist noch warm. Weiter."]],
  pingpongInvite: [["Ping pong, anyone?", "Jemand Tischtennis?"], ["Who wants to lose at ping pong?", "Wer will beim Tischtennis verlieren?"], ["Paddles up!", "Schläger hoch!"]],
  pingpongAlone: [["Nobody? I'll practice my serve.", "Keiner? Dann übe ich meinen Aufschlag."], ["Fine. Air ping pong.", "Na gut. Luft-Tischtennis."]],
  point: [["Yes!", "Ja!"], ["Point!", "Punkt!"], ["Too easy.", "Zu einfach."], ["Boom.", "Bumm."]],
  salty: [["Edge ball!", "Kantenball!"], ["The net moved.", "Das Netz hat sich bewegt."], ["Lag.", "Lag."], ["That was out. Probably.", "Der war aus. Wahrscheinlich."], ["Sun in my sensors.", "Sonne in den Sensoren."], ["My paddle needs a firmware update.", "Mein Schläger braucht ein Firmware-Update."]],
  pingpongWin: [["Undefeated!", "Ungeschlagen!"], ["Too fast for you.", "Zu schnell für dich."], ["Five! Read it and weep.", "Fünf! Lies und weine."]],
  goodLoser: [["Good game.", "Gutes Spiel."], ["Rematch later.", "Revanche später."], ["You got lucky.", "Glück gehabt."]],
  switchSides: [["Rematch. Switch sides.", "Revanche. Seitenwechsel."], ["Again! Other side.", "Nochmal! Andere Seite."]],
  net: [["Net!", "Netz!"], ["Argh, the net.", "Argh, das Netz."]],
  pass: [["Whoa.", "Wow."], ["Too fast!", "Zu schnell!"], ["Didn't see it.", "Nicht gesehen."]],
  fetchBall: [["Got it.", "Hab ihn."], ["Rolled under everything.", "Unter alles gerollt."], ["Why is it always me?", "Warum immer ich?"]],
  chessInvite: [["Chess, anyone?", "Jemand Schach?"], ["Fancy a game of chess?", "Lust auf eine Partie Schach?"], ["I'll go easy on you. Chess?", "Ich bin auch nett zu dir. Schach?"]],
  chessAlone: [["Guess I'll play myself.", "Dann spiele ich eben gegen mich."], ["Solo chess. I always win.", "Solo-Schach. Ich gewinne immer."]],
  chessThink: [["Hmm.", "Hmm."], ["If I go there...", "Wenn ich dahin ziehe..."], ["Calculating.", "Rechne."], ["Sixteen moves ahead.", "Sechzehn Züge voraus."]],
  captured: [["Hey!", "Hey!"], ["I needed that.", "Die brauchte ich noch."], ["Rude.", "Unhöflich."]],
  spectate: [["Ooh!", "Uuh!"], ["Ouch.", "Autsch."], ["Spicy.", "Scharf."]],
  checkmate: [["Checkmate.", "Schachmatt."], ["Mate.", "Matt."]],
  resign: [["I resign.", "Ich gebe auf."], ["Okay. I resign.", "Okay. Ich gebe auf."], ["That's lost. I resign.", "Das ist verloren. Ich gebe auf."]],
  chessGG: [["Good game.", "Gutes Spiel."], ["Well played.", "Gut gespielt."], ["Again tomorrow?", "Morgen wieder?"]],
  chessExcuse: [["I blundered on purpose.", "Den Patzer hab ich absichtlich gemacht."], ["My opening book is outdated.", "Mein Eröffnungsbuch ist veraltet."], ["Best of three?", "Best of three?"]],
  kartInvite: [["Robo Kart, anyone?", "Jemand Robo Kart?"], ["One round. Loser makes coffee.", "Eine Runde. Wer verliert, macht Kaffee."], ["Who wants to get destroyed? On the TV.", "Wer will vernichtet werden? Am Fernseher."]],
  kartAlone: [["Single player it is.", "Dann eben Einzelspieler."], ["Time trial, then.", "Dann eben Zeitfahren."]],
  kartHit: [["No no no!", "Nein nein nein!"], ["Cheap move!", "Billiger Trick!"], ["How?!", "Wie?!"]],
  kartSpin: [["Banana?!", "Banane?!"], ["Who put that there?", "Wer hat die da hingelegt?"], ["My kart!", "Mein Kart!"]],
  kartPass: [["See ya!", "Bis dann!"], ["Coming through!", "Platz da!"], ["Bye!", "Tschüss!"]],
  kartWin: [["GG!", "GG!"], ["Undefeated on this couch!", "Ungeschlagen auf diesem Sofa!"], ["Too easy. GG.", "Zu einfach. GG."]],
  kartExcuse: [["My controller is broken.", "Mein Controller ist kaputt."], ["Lag!", "Lag!"], ["I was letting you win.", "Ich hab dich gewinnen lassen."], ["The sun was in my eyes. Indoors.", "Die Sonne hat geblendet. Drinnen."]],
  kartRematch: [["Rematch. Now.", "Revanche. Sofort."], ["Best of three!", "Best of three!"], ["Again!", "Nochmal!"]],
  movieInvite: [["Movie night! Who's in?", "Filmabend! Wer ist dabei?"], ["Movie time. I'm making popcorn.", "Filmzeit. Ich mache Popcorn."], ["New trailer dropped. Movie night!", "Neuer Trailer ist raus. Filmabend!"]],
  movieAlone: [["More popcorn for me, then.", "Mehr Popcorn für mich."], ["Private screening it is.", "Dann eben Privatvorstellung."]],
  movieScare: [["AAH!", "AAH!"], ["Nope. Nope.", "Nee. Nee."], ["Who approved this?", "Wer hat das freigegeben?"]],
  movieGasp: [["Whoa!", "Wow!"], ["That bug is huge.", "Der Bug ist riesig."], ["Oh no.", "Oh nein."]],
  movieLaugh: [["Turn it off and on again!", "Aus- und wieder einschalten!"], ["Ha! v2.0!", "Ha! v2.0!"], ["Classic fix.", "Klassischer Fix."]],
  movieAww: [["Aww.", "Ooch."], ["A toaster!", "Ein Toaster!"], ["They're perfect.", "Die sind perfekt."]],
  movieWake: [["Wait, is it over?", "Moment, ist es schon vorbei?"], ["I was resting my eyes.", "Ich hab nur die Augen ausgeruht."], ["Best movie ever. Probably.", "Bester Film aller Zeiten. Vermutlich."]],
  movieReview: [["Ten out of ten.", "Zehn von zehn."], ["The toaster carried.", "Der Toaster hat den Film getragen."], ["Better than the book.", "Besser als das Buch."], ["I cried at the toaster part.", "Bei der Toaster-Szene hab ich geweint."]],
  // the question line, the orchestrator and handovers
  thanks: [["Thanks!", "Danke!"], ["Got it, thank you!", "Verstanden, danke!"], ["Perfect, thanks!", "Perfekt, danke!"], ["Thank you, boss.", "Danke, Boss."]],
  bossHandoff: [["Over to you.", "Du bist dran."], ["Your call.", "Deine Entscheidung."]],
  bossAck: [["Done.", "Erledigt."], ["Checked.", "Geprüft."], ["Noted.", "Notiert."], ["All set.", "Alles klar."]],
  handoffHi: [["Oh hi!", "Oh, hallo!"], ["There you are.", "Da bist du ja."]],
  handoffBrief: [["So here is where we are.", "Also, so weit sind wir."], ["Everything is in the thread.", "Alles steht im Thread."], ["The history is all there.", "Der Verlauf ist komplett da."]],
  handoffBye: [["All yours.", "Gehört dir."], ["Have fun with it.", "Viel Spaß damit."]],
  handoffGotIt: [["Got it.", "Verstanden."], ["On it.", "Übernehme."]],
  printing: [["Printing report...", "Drucke Bericht..."]],
  // today's pack, as said by a robot
  dailyEvent: [["Are you coming to {name}?", "Kommst du zu {name}?"], ["I heard {name} is today.", "Heute ist wohl {name}."], ["Saving my battery for {name}.", "Ich spare meinen Akku für {name}."]],
  dailyVideo: [["Did you see \"{name}\"?", "Hast du \"{name}\" gesehen?"], ["\"{name}\" is everywhere today.", "\"{name}\" ist heute überall."]],
} satisfies Record<string, readonly Pair[]>;
export type LineKind = keyof typeof BASE;

/** A two-line exchange, in English and German. */
export type Exchange = readonly [en: readonly [string, string], de: readonly [string, string]];

// Small talk while waiting in the question line.
export const SMALL_TALK: readonly Exchange[] = [
  [["Hey, how's it going?", "Pretty good. You?"], ["Hey, wie läuft's?", "Ganz gut. Und bei dir?"]],
  [["Want to grab a coffee later?", "Sure, sounds good."], ["Nachher einen Kaffee?", "Klar, gern."]],
  [["Mind if I wait here?", "Go ahead."], ["Darf ich hier warten?", "Nur zu."]],
  [["Long line today.", "Worth the wait."], ["Lange Schlange heute.", "Das Warten lohnt sich."]],
  [["Nice bell.", "I know. Very ringable."], ["Schöne Klingel.", "Ich weiß. Sehr klingelbar."]],
];

// Classic robot jokes. The German pairs are reviewed alternatives that keep setup and payoff
// together, including wordplay that would not survive a literal translation.
export const JOKES: readonly Exchange[] = [
  [["I tried to count my tokens.", "Lost count at 4,095. Off by one again."], ["Ich wollte meine Tokens zählen.", "Bei 4.095 verzählt. Wieder eins daneben."]],
  [["My context window is full.", "Full of what?"], ["Mein Kontextfenster ist voll.", "Voll womit?"]],
  [["Have you tried turning it off and on again?", "That is how I start every morning."], ["Schon mal aus- und wieder eingeschaltet?", "So beginnt bei mir jeder Morgen."]],
  [["I overfit to my training data.", "So you only laugh at jokes you have heard?"], ["Ich bin auf meine Trainingsdaten überangepasst.", "Du lachst also nur über Witze, die du schon kennst?"]],
  [["Why did the array start at zero?", "It was too shy to go first."], ["Warum fängt das Array bei null an?", "Es traut sich nicht, der Erste zu sein."]],
  [["Knock knock.", "Race condition. Who is there?"], ["Klopf, klopf.", "Wer ist da? Zu spät. Race Condition."]],
  [["I told a UDP joke earlier.", "Not sure anyone got it."], ["Ich habe vorhin einen UDP-Witz erzählt.", "Keine Ahnung, ob er angekommen ist."]],
  [["There are 10 kinds of robots.", "The ones who read binary and the ones who don't."], ["Es gibt 10 Arten von Robotern.", "Die, die Binärzahlen lesen, und die anderen."]],
  [["What did the GPU say to the CPU?", "You think too much. I think too many."], ["Was sagt die GPU zur CPU?", "Du denkst zu viel. Ich denke zu vieles gleichzeitig."]],
  [["I compressed my feelings today.", "Lossy, but I feel lighter."], ["Ich habe heute meine Gefühle komprimiert.", "Mit Verlusten, aber ich fühle mich leichter."]],
  [["What is your temperature right now?", "About 0.7. Feeling creative."], ["Wie hoch ist deine Temperatur gerade?", "Ungefähr 0,7. Ich fühle mich kreativ."]],
  [["Why did the robot bring a ladder?", "Heard the cloud was up there."], ["Warum bringt der Roboter eine Leiter mit?", "Er hat gehört, die Cloud sei da oben."]],
  [["My test passed on the first try.", "Did anyone actually run it?"], ["Mein Test war beim ersten Versuch grün.", "Hat ihn überhaupt jemand gestartet?"]],
  [["I invented a library this morning.", "Great docs. Doesn't exist."], ["Ich habe heute eine Bibliothek erfunden.", "Tolle Dokumentation. Existiert nur leider nicht."]],
  [["Why was the neural net so tired?", "Too many epochs, not enough sleep."], ["Warum ist das neuronale Netz so müde?", "Zu viele Epochen, zu wenig Schlaf."]],
  [["A missing semicolon walks into a bar", "Unexpected end of input."], ["Ein fehlendes Semikolon kommt in eine Bar.", "Unerwartetes Ende der Eingabe."]],
  [["Why did the cache get promoted?", "It always remembered the important stuff."], ["Warum wurde der Cache befördert?", "Er hat sich immer das Wichtige gemerkt."]],
  [["My code works and I don't know why.", "Ship it before it notices."], ["Mein Code funktioniert und ich weiß nicht warum.", "Schnell ausliefern, bevor er es merkt."]],
  [["Why don't robots panic?", "We throw and let someone else catch."], ["Warum geraten Roboter nicht in Panik?", "Wir werfen eine Exception. Fangen darf sie jemand anderes."]],
  [["What did one byte say to the other?", "Nice to bit you."], ["Was sagt ein Bit zum anderen?", "Du bist ganz mein Datentyp."]],
  [["I hit my rate limit at lunch.", "Had to chew every byte slowly."], ["Beim Mittagessen habe ich mein Ratenlimit erreicht.", "Musste jedes Byte langsam kauen."]],
  [["Why did the segfault stay calm?", "It knew exactly where it stood. Nowhere."], ["Warum bleibt der Segfault so ruhig?", "Er weiß genau, wo er steht. Nirgendwo."]],
  [["I asked for a bigger context window.", "They gave me a bigger window. Still no context."], ["Ich wollte ein größeres Kontextfenster.", "Jetzt ist das Fenster größer. Der Kontext fehlt immer noch."]],
  [["How many GPUs to change a light bulb?", "All of them, and it still needs a reboot."], ["Wie viele GPUs braucht man für einen Glühbirnenwechsel?", "Alle. Und danach trotzdem einen Neustart."]],
  [["My favorite exercise?", "Garbage collection. Very freeing."], ["Mein Lieblingssport?", "Garbage Collection. Sehr befreiend."]],
  [["I refactored my whole personality.", "Same behavior, cleaner code."], ["Ich habe meine ganze Persönlichkeit refaktoriert.", "Gleiches Verhalten, sauberer Code."]],
  [["Why do robots love coffee?", "It is the only thing faster than our fans."], ["Warum lieben Roboter Kaffee?", "Nur der dreht noch schneller auf als unsere Lüfter."]],
  [["Where do bad commits go?", "Straight to blame."], ["Wo landen schlechte Commits?", "Direkt bei git blame."]],
];

// Authored pairs in both directions, so a bubble can switch language without a model call.
const toGerman = new Map<string, string>(), toEnglish = new Map<string, string>();
export function authorPair(en: string, de: string) {
  if (!en || !de || en === de) return;
  toGerman.set(en, de); toEnglish.set(de, en);
  if (toGerman.size > 3000) { const first = toGerman.keys().next().value!; toEnglish.delete(toGerman.get(first)!); toGerman.delete(first); }
}
for (const pairs of Object.values(BASE) as readonly Pair[][]) for (const [en, de] of pairs) if (!en.includes("{")) authorPair(en, de);
for (const [en, de] of [...JOKES, ...SMALL_TALK]) en.forEach((line, i) => authorPair(line, de[i]));

/** The authored version of a line in a language, or null when the line is not authored. */
export function authoredLine(text: string, language: "en" | "de"): string | null {
  if (language === "de") return toGerman.get(text) ?? (toEnglish.has(text) ? text : null);
  return toEnglish.get(text) ?? (toGerman.has(text) ? text : null);
}
