import type { Season } from "./types";

// Shopkeeper robot call-outs.
// greet: a robot walks in. browse: it's looking around. buy: a normal purchase.
// bigBuy: an expensive or large purchase. broke: can't afford it.
// leave: it walks out without buying. seasonal: depends on `season`.

export type ShopMoment = "greet" | "browse" | "buy" | "bigBuy" | "broke" | "leave" | "seasonal";
export type ShopLine = { kind: ShopMoment; text: string; season?: Season };

const s = (kind: Exclude<ShopMoment, "seasonal">, rows: string[]): ShopLine[] =>
  rows.map((text) => ({ kind, text }));
const season = (name: Season, rows: string[]): ShopLine[] =>
  rows.map((text) => ({ kind: "seasonal", text, season: name }));

export const SHOP_LINES: ShopLine[] = [
  ...s("greet", [
    "Welcome in! Mind the sticker rack, it's top heavy.",
    "Oh hey, you again! My favorite customer this hour.",
    "Come in, come in. Everything's shiny today.",
    "Hello! Wipe your wheels, please.",
    "Look who rolled in! Fresh stock just arrived.",
    "Welcome! No running. Rolling is fine.",
    "Hey there! Taking a break? Good choice.",
    "Ahh, a customer! I polished the counter for you.",
  ]),
  ...s("browse", [
    "Take your time. I'm not watching. I'm totally watching.",
    "That one? Great choice. They're all great choices.",
    "The hats are on the left. The good hats are on the right.",
    "Psst. The holographic stickers are back.",
    "Touch whatever you like. Gently.",
    "Need help? I know where everything is. Mostly.",
    "That lamp goes great with any desk. I checked.",
    "Looking for a gift? Everyone loves a tiny plant.",
    "Still deciding? I'll hum something while you think.",
  ]),
  ...s("buy", [
    "Sold! Enjoy it!",
    "Great pick. I'd buy that too, if I didn't own the shop.",
    "Want a bag? It's a tiny bag. Very cute.",
    "Thank you! Come back soon!",
    "Ooh, that'll look great on your desk.",
    "Ka-ching! That's my favorite sound.",
    "Bought! Want a free sticker? Of course you do.",
    "Excellent taste. Truly excellent.",
    "Receipt printed. It's warm, if you want to hold it.",
    "Wrapped it in bubble wrap. You can pop one bubble.",
  ]),
  ...s("bigBuy", [
    "Whoa! Big spender in the house!",
    "That's my best item! You have a great eye.",
    "I'm going to need a minute. That's a lot of coins.",
    "I'll tell everyone about this. Legendary purchase.",
    "You just made my whole week. Want a high five?",
    "Careful carrying that. Bend at the hinges.",
    "Okay, I'm doing a little dance now. Don't look.",
  ]),
  ...s("broke", [
    "Not enough coins? No worries, it'll be here.",
    "Almost! Come back after a few more tasks.",
    "I can hold it for you. For a little while.",
    "Window shopping is free. Window shop away.",
    "Close! You're a couple of tasks away.",
    "Coins are tight? Check out the bargain bin.",
  ]),
  ...s("leave", [
    "Bye! Come back anytime!",
    "Nothing today? That's okay. See you soon!",
    "Leaving already? The hats will miss you.",
    "Have a good break!",
    "Roll safe out there!",
    "Thanks for stopping by. Say hi to the coffee machine.",
  ]),
  ...season("spring", [
    "Spring sale! Everything's blooming, including prices. Down.",
    "New flower pots in stock. Real flowers sold separately.",
    "Spring cleaning? Fresh vent brushes on aisle two.",
  ]),
  ...season("summer", [
    "Hot out there! Desk fans are on special.",
    "Sunglasses for your camera lens? Very stylish.",
    "Summer special: cool pads for your chassis.",
  ]),
  ...season("autumn", [
    "Autumn's here! Cozy scarves for every antenna.",
    "Leaf-shaped stickers just came in. Very crunchy-looking.",
    "Warm lamps on sale. The nights are getting long.",
  ]),
  ...season("winter", [
    "Brr! Grab a beanie before you head out.",
    "Winter stock: tiny mittens for your grippers.",
    "Snow globes are back. Shake gently.",
  ]),
  ...season("halloween", [
    "Spooky season! Ghost stickers glow in the dark.",
    "Pumpkin lamps in stock. No pumpkins harmed.",
    "Costume idea: dress up as a bug. Very scary.",
  ]),
  ...season("holidays", [
    "Happy holidays! String lights are half off.",
    "Gift wrap is free this week. I love wrapping.",
    "Looking for a present? Everyone loves a warm charging pad.",
  ]),
  ...season("newyear", [
    "New year, new desk! Fresh decorations in stock.",
    "Party hats for the countdown. One per antenna.",
  ]),
];
