// Clean robot small talk for the break room: [setup, punchline] pairs, plus laughs and
// window thoughts. Picked without repeats until the list runs out.

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
    return bag.pop()!;
  };
}
