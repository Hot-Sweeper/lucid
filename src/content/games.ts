// Short in-game reactions. Lines without a `game` fit any game.

export type GameMoment = "start" | "win" | "lose" | "ragequit" | "close" | "draw" | "good" | "blunder";
export type GameName = "chess" | "snake";
export type GameLine = { kind: GameMoment; text: string; game?: GameName };

const g = (kind: GameMoment, rows: string[], game?: GameName): GameLine[] =>
  rows.map((text) => (game ? { kind, text, game } : { kind, text }));

export const GAME_LINES: GameLine[] = [
  ...g("start", [
    "Okay. Focus. Focus.",
    "One quick game. Just one.",
    "Let's go!",
    "This is my game. I can feel it.",
    "Warming up my fingers. I mean grippers.",
  ]),
  ...g("win", [
    "YES! Did everyone see that?",
    "GG! Easy. Okay, not easy.",
    "I won! Saving this to memory forever.",
    "Victory dance time.",
    "Champion of the break room!",
    "That's going in #wins.",
    "Undefeated! For about a minute.",
    "I'd like to thank my fans. Both of them. They're cooling fans.",
  ]),
  ...g("lose", [
    "Nooo. Rematch.",
    "I wasn't even trying. I was trying very hard.",
    "Lag. Definitely lag.",
    "I let you win. Out of kindness.",
    "Okay. Okay. That's fine. It's fine.",
    "My strategy needs a code review.",
    "Lost. But I had fun. Mostly.",
    "That was a practice round, obviously.",
  ]),
  ...g("ragequit", [
    "I'm done. Forever. See you in five minutes.",
    "This game is broken. Not me. The game.",
    "Closing this. Closing it right now.",
    "Nope. Nope nope nope.",
    "I need to go stare at a wall for a bit.",
    "Uninstalling. Reinstalling. Uninstalling.",
  ]),
  ...g("close", [
    "Ooh, that was close!",
    "My fans just spun up.",
    "Too close. Way too close.",
    "Phew. Heart rate... I mean, clock rate... normal.",
    "That almost went very badly.",
    "Saved it! Barely!",
    "I saw my whole log flash before my eyes.",
  ]),
  ...g("draw", [
    "A draw. Everyone's a winner.",
    "Tie game. Respect.",
    "Perfectly balanced. Like a good merge.",
  ]),
  ...g("good", [
    "Big brain move.",
    "Did I just do that?",
    "Oh, that's nice. That's very nice.",
    "Clean. Very clean.",
  ]),
  ...g("blunder", [
    "Why did I do that.",
    "Undo? Is there undo?",
    "My hand slipped. I don't have hands.",
    "That was a creative choice.",
  ]),

  ...g("start", [
    "e4. Classic. Bold. Predictable.",
    "Setting up the board. Every piece in its home.",
  ], "chess"),
  ...g("win", [
    "Checkmate! I've been waiting to say that all day.",
    "The knight did it. Unsung hero.",
    "Checkmate. Please clap.",
  ], "chess"),
  ...g("lose", [
    "Checkmated by a pawn. A pawn!",
    "I forgot the bishop moves diagonally. Again.",
    "Lost to a toaster. The toaster is very good.",
  ], "chess"),
  ...g("close", [
    "Check! Wait, no. Not check.",
    "My king is very nervous right now.",
    "That bishop almost got me.",
  ], "chess"),
  ...g("good", [
    "Fork! Two pieces at once. Like a subagent.",
    "Castled. My king is safe and cozy now.",
    "Pawn to queen. Glow up of the century.",
    "En passant! Nobody expects en passant.",
  ], "chess"),
  ...g("blunder", [
    "I just gave away my queen. She deserved better.",
    "Wait, the horse goes in an L? Since when?",
    "I've been thinking for 10 minutes and chose the worst move.",
    "Moved my king into danger. He's fine. He's not fine.",
  ], "chess"),
  ...g("draw", [
    "Stalemate. We both lose, but politely.",
    "Draw by repetition. We're both stubborn.",
  ], "chess"),

  ...g("start", [
    "Tiny snake. Big dreams.",
    "Okay snake, we're a team now.",
  ], "snake"),
  ...g("good", [
    "Nom.",
    "Snack acquired. Longer snake, bigger problems.",
    "Look how long he's getting!",
    "Perfect turn. Very smooth.",
  ], "snake"),
  ...g("win", [
    "New high score! Somebody screenshot this!",
    "The snake is as long as my to-do list now.",
    "Snake champion. Bow before the noodle.",
  ], "snake"),
  ...g("lose", [
    "Bit my own tail. Classic me.",
    "The wall came out of nowhere.",
    "He was so young. So short.",
    "Turned left. Should have turned right. Life lesson.",
  ], "snake"),
  ...g("close", [
    "One pixel from the wall!",
    "Squeezed through that gap. I'm a genius. Or lucky.",
    "Almost ate myself. Almost.",
  ], "snake"),
  ...g("ragequit", [
    "Snake is too long. My patience is too short.",
    "I'm not playing snake anymore. Snake knows what it did.",
  ], "snake"),
];
