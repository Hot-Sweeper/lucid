// Social and pastime apps for idle robots: messaging, feeds, phone apps and desktop hobbies.
import type { SoHost, SoOpts } from "./kit";
import { chatOnBotsApp } from "./botsapp";
import { browseTelegrid } from "./telegrid";
import { scrollChirp } from "./chirp";
import { scrollInstabot } from "./instabot";
import { snapOnSnapbot } from "./snapbot";
import { usePhone, type PhoneApp } from "./phonetime";
import { watchPhoneFeed } from "../fun/phone";
import "./shorts.css";
import { doodleInSketchpad } from "./doodle";
import { solveCrossword } from "./crossword";
import { playSolitaire } from "./solitaire";
import { watchStocks } from "./stocks";
import { checkMail } from "./mail";
import { learnWithLingobot } from "./lingo";

export type { SoHost, SoOpts } from "./kit";
export { chatOnBotsApp, browseTelegrid, scrollChirp, scrollInstabot, snapOnSnapbot, usePhone, doodleInSketchpad, solveCrossword, playSolitaire, watchStocks, checkMail, learnWithLingobot };
export { PHONE_APP_DOING, PHONE_APP_LABEL, type PhoneApp } from "./phonetime";
export { SO_ICONS } from "./icons";

type Run = (body: HTMLElement, host: SoHost, opts: SoOpts) => Promise<unknown>;
/** Everything, for the standalone demo page. Sizes are window frames (title bar included). */
export const DEMO_APPS: { id: string; title: string; w: number; h: number; phone?: boolean; run: Run }[] = [
  { id: "botsapp", title: "BotsApp", w: 620, h: 380, run: chatOnBotsApp },
  { id: "botsapp-ph", title: "BotsApp", w: 134, h: 284, phone: true, run: chatOnBotsApp },
  { id: "telegrid", title: "Telegrid", w: 640, h: 384, run: browseTelegrid },
  { id: "telegrid-ph", title: "Telegrid", w: 134, h: 284, phone: true, run: browseTelegrid },
  { id: "chirp", title: "Chirp", w: 620, h: 392, run: scrollChirp },
  { id: "chirp-ph", title: "Chirp", w: 134, h: 284, phone: true, run: scrollChirp },
  { id: "instabot", title: "Instabot", w: 134, h: 284, phone: true, run: scrollInstabot },
  { id: "snapbot", title: "Snapbot", w: 134, h: 284, phone: true, run: snapOnSnapbot },
  { id: "shorts", title: "Shorts", w: 134, h: 284, phone: true, run: (b, host, o) => watchPhoneFeed(b, host, { maxMs: o.maxMs, variant: "shorts" }) },
  { id: "phone", title: "Phone", w: 134, h: 284, phone: true, run: (b, host, o) => usePhone(b, host, { ...o, apps: (new URLSearchParams(location.search).get("apps")?.split(",") ?? ["instabot", "botsapp", "snapbot"]) as PhoneApp[] }) },
  { id: "doodle", title: "Sketchpad", w: 600, h: 380, run: doodleInSketchpad },
  { id: "crossword", title: "Crossbot", w: 500, h: 360, run: solveCrossword },
  { id: "solitaire", title: "Solitaire", w: 600, h: 392, run: playSolitaire },
  { id: "stocks", title: "Ticker", w: 600, h: 370, run: watchStocks },
  { id: "mail", title: "Botmail", w: 660, h: 384, run: checkMail },
  { id: "lingo", title: "Lingobot", w: 420, h: 384, run: learnWithLingobot },
];
