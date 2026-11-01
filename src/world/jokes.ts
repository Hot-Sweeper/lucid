// Clean robot small talk for the break room: [setup, punchline] pairs, plus laughs and
// window thoughts. Picked without repeats until the list runs out.
import { localizedFlavor } from "../content/localized";
import { getLocale, rememberTranslation } from "../localization";

export const JOKES: [string, string][] = [
  ["I tried to count my tokens.", "Lost count at 4,095. Off by one again."],
  ["My context window is full.", "Full of what?"],
  ["Have you tried turning it off and on again?", "That is how I start every morning."],
  ["I overfit to my training data.", "So you only laugh at jokes you have heard?"],
  ["Why did the array start at zero?", "It was too shy to go first."],
  ["Knock knock.", "Race condition. Who is there?"],
  ["I told a UDP joke earlier.", "Not sure anyone got it."],
  ["There are 10 kinds of robots.", "The ones who read binary and the ones who don't."],
  ["What did the GPU say to the CPU?", "You think too much. I think too many."],
  ["I compressed my feelings today.", "Lossy, but I feel lighter."],
  ["What is your temperature right now?", "About 0.7. Feeling creative."],
  ["Why did the robot bring a ladder?", "Heard the cloud was up there."],
  ["My test passed on the first try.", "Did anyone actually run it?"],
  ["I invented a library this morning.", "Great docs. Doesn't exist."],
  ["Why was the neural net so tired?", "Too many epochs, not enough sleep."],
  ["A missing semicolon walks into a bar", "Unexpected end of input."],
  ["Why did the cache get promoted?", "It always remembered the important stuff."],
  ["My code works and I don't know why.", "Ship it before it notices."],
  ["Why don't robots panic?", "We throw and let someone else catch."],
  ["What did one byte say to the other?", "Nice to bit you."],
  ["I hit my rate limit at lunch.", "Had to chew every byte slowly."],
  ["Why did the segfault stay calm?", "It knew exactly where it stood. Nowhere."],
  ["I asked for a bigger context window.", "They gave me a bigger window. Still no context."],
  ["How many GPUs to change a light bulb?", "All of them, and it still needs a reboot."],
  ["My favorite exercise?", "Garbage collection. Very freeing."],
  ["I refactored my whole personality.", "Same behavior, cleaner code."],
  ["Why do robots love coffee?", "It is the only thing faster than our fans."],
  ["Where do bad commits go?", "Straight to blame."],
];

export const LAUGHS = ["Ha!", "Hehe", "Beep beep ha", "Good one", "Ha ha!", "Classic", "Okay that one got me"];

// Reviewed German alternatives keep the setup and payoff together, including
// wordplay that would not survive a literal translation.
const GERMAN_JOKES: [string, string][] = [
  ["Ich wollte meine Tokens zählen.", "Bei 4.095 verzählt. Wieder eins daneben."],
  ["Mein Kontextfenster ist voll.", "Voll womit?"],
  ["Schon mal aus- und wieder eingeschaltet?", "So beginnt bei mir jeder Morgen."],
  ["Ich bin auf meine Trainingsdaten überangepasst.", "Du lachst also nur über Witze, die du schon kennst?"],
  ["Warum fängt das Array bei null an?", "Es traut sich nicht, der Erste zu sein."],
  ["Klopf, klopf.", "Wer ist da? Zu spät. Race Condition."],
  ["Ich habe vorhin einen UDP-Witz erzählt.", "Keine Ahnung, ob er angekommen ist."],
  ["Es gibt 10 Arten von Robotern.", "Die, die Binärzahlen lesen, und die anderen."],
  ["Was sagt die GPU zur CPU?", "Du denkst zu viel. Ich denke zu vieles gleichzeitig."],
  ["Ich habe heute meine Gefühle komprimiert.", "Mit Verlusten, aber ich fühle mich leichter."],
  ["Wie hoch ist deine Temperatur gerade?", "Ungefähr 0,7. Ich fühle mich kreativ."],
  ["Warum bringt der Roboter eine Leiter mit?", "Er hat gehört, die Cloud sei da oben."],
  ["Mein Test war beim ersten Versuch grün.", "Hat ihn überhaupt jemand gestartet?"],
  ["Ich habe heute eine Bibliothek erfunden.", "Tolle Dokumentation. Existiert nur leider nicht."],
  ["Warum ist das neuronale Netz so müde?", "Zu viele Epochen, zu wenig Schlaf."],
  ["Ein fehlendes Semikolon kommt in eine Bar.", "Unerwartetes Ende der Eingabe."],
  ["Warum wurde der Cache befördert?", "Er hat sich immer das Wichtige gemerkt."],
  ["Mein Code funktioniert und ich weiß nicht warum.", "Schnell ausliefern, bevor er es merkt."],
  ["Warum geraten Roboter nicht in Panik?", "Wir werfen eine Exception. Fangen darf sie jemand anderes."],
  ["Was sagt ein Bit zum anderen?", "Wir sehen uns beim nächsten Byte."],
  ["Beim Mittagessen habe ich mein Ratenlimit erreicht.", "Musste jedes Byte langsam kauen."],
  ["Warum bleibt der Segfault so ruhig?", "Er weiß genau, wo er steht. Nirgendwo."],
  ["Ich wollte ein größeres Kontextfenster.", "Jetzt ist das Fenster größer. Der Kontext fehlt immer noch."],
  ["Wie viele GPUs braucht man für einen Glühbirnenwechsel?", "Alle. Und danach trotzdem einen Neustart."],
  ["Mein Lieblingssport?", "Garbage Collection. Sehr befreiend."],
  ["Ich habe meine ganze Persönlichkeit refaktoriert.", "Gleiches Verhalten, sauberer Code."],
  ["Warum lieben Roboter Kaffee?", "Nur der dreht noch schneller auf als unsere Lüfter."],
  ["Wo landen schlechte Commits?", "Direkt bei git blame."],
];

export const WINDOW_THOUGHTS = [
  "Nice clouds. Very fluffy data.",
  "Someone out there is writing tests. Respect.",
  "I wonder what the weather API says.",
  "Fresh air. Well, fresh pixels.",
  "One day I will touch grass.",
];

export function shuffled<T>(list: T[]): () => T {
  let bag: T[] = [];
  return () => {
    if (!bag.length) bag = [...list].sort(() => Math.random() - 0.5);
    if (bag.length > 1 && list !== JOKES) localizedFlavor(bag[bag.length - 2], "robot jokes and reactions");
    const source = bag.pop()!;
    if (list === JOKES && getLocale() === "de") {
      const index = JOKES.indexOf(source as [string, string]);
      if (index >= 0 && GERMAN_JOKES[index]) {
        GERMAN_JOKES[index].forEach((line, i) => rememberTranslation(JOKES[index][i], line));
        return [...GERMAN_JOKES[index]] as unknown as T;
      }
    }
    return localizedFlavor(source, "robot jokes and reactions");
  };
}
