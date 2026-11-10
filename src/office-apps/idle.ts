// Office robots at a loose end: a silly spreadsheet, a memo nobody asked for, a slide deck
// pitching a nap pod. Played in the real office apps, then the window is closed again.
import type { WM } from "../os/wm";
import { Botword } from "./botword";
import { Cellsheet } from "./cellsheet";
import { Slidedeck } from "./slidedeck";
import type { DeckDoc, SheetDoc, WordDoc, Cell, Slide } from "./model";
import "./office.css";

import type { OfficeTaste } from "../robot/roster";
export type { OfficeTaste };

const n = (v: number): Cell => ({ v: String(v), n: v });
const s = (v: string): Cell => ({ v });
const f = (formula: string): Cell => ({ v: "", f: formula });

function coffeeBudget(): SheetDoc {
  const items: [string, number, number, number][] = [
    ["Espresso beans", 42, 45, 51], ["Oat milk", 18, 21, 24], ["Decaf (for show)", 3, 2, 1],
    ["Emergency donuts", 25, 30, 55], ["Mugs (broken)", 12, 8, 15], ["Cinnamon", 4, 4, 9],
  ];
  const rows: Cell[][] = [[s("Item"), s("Oct"), s("Nov"), s("Dec"), s("Total")]];
  items.forEach(([name, a, b, c], i) => rows.push([s(name), n(a), n(b), n(c), f(`=SUM(B${i + 2}:D${i + 2})`)]));
  const last = items.length + 1;
  rows.push([s("Total"), f(`=SUM(B2:B${last})`), f(`=SUM(C2:C${last})`), f(`=SUM(D2:D${last})`), f(`=SUM(E2:E${last})`)]);
  return { kind: "sheet", name: "Coffee budget Q4.xlsx", sheets: ["Q4", "Q3 (do not open)"], active: 0, rows, cols: 5, totalRows: rows.length, chart: "bar", chartTitle: "Coffee budget Q4" };
}

function microwaveMemo(me: string): WordDoc {
  return {
    kind: "word", name: "Microwave schedule memo.docx", blocks: [
      { kind: "h", level: 0, text: "Re: Re: Re: the microwave schedule" },
      { kind: "p", text: `From: ${me}`, runs: [{ t: "From: ", b: true }, { t: me }] },
      { kind: "p", text: "To: Everyone on this floor", runs: [{ t: "To: ", b: true }, { t: "Everyone on this floor" }] },
      { kind: "p", text: "Following up on the last three memos, here is the proposed schedule. Please only reply all if you have strong feelings about soup.", runs: [{ t: "Following up on the last three memos, here is the proposed schedule. Please only reply all if you have " }, { t: "strong feelings about soup", i: true }, { t: "." }] },
      { kind: "h", level: 1, text: "Proposed slots" },
      { kind: "table", rows: [["Time", "Team", "Notes"], ["12:00", "Backend", "Leftovers only"], ["12:15", "Design", "No fish, ever"], ["12:30", "Night shift", "Breakfast counts"], ["12:45", "Everyone else", "Bring a book"]] },
      { kind: "h", level: 1, text: "House rules" },
      { kind: "li", ordered: false, level: 0, text: "Cover your bowl. The splatter incident is still under review." },
      { kind: "li", ordered: false, level: 0, text: "Two minutes at most while someone is waiting." },
      { kind: "li", ordered: false, level: 0, text: "Popcorn needs a written request, signed by two robots." },
      { kind: "p", text: "Thanks, and sorry about the reply all." },
    ],
  };
}

function napPodDeck(me: string): DeckDoc {
  const slide = (title: string, bullets: string[], notes?: string): Slide => ({ title, notes, els: [{ kind: "title", paras: [{ text: title, lvl: 0 }] }, { kind: "body", paras: bullets.map((b) => ({ text: b.replace(/^> /, ""), lvl: b.startsWith("> ") ? 1 : 0 })) }] });
  const slides: Slide[] = [
    { title: "Why we need a nap pod", els: [{ kind: "title", paras: [{ text: "Why we need a nap pod", lvl: 0 }] }, { kind: "subtitle", paras: [{ text: `A proposal by ${me}, 12 slides`, lvl: 0 }] }], notes: "Keep a straight face." },
    slide("The problem", ["Robots run all night", "Batteries do not refill themselves", "> The charging cable only reaches the hallway"], "Pause for effect."),
    slide("Current nap options", ["Under the desk", "In the supply closet", "> Occupied by the mop"]),
    slide("Introducing: the nap pod", ["Quiet", "Dark", "Exactly one robot wide"], "Show the shape on the next slide."),
    { title: "Pod design", els: [{ kind: "title", paras: [{ text: "Pod design", lvl: 0 }] }, { kind: "shape", prst: "roundRect", fill: "#5a6cf0", box: { x: 0.16, y: 0.3, w: 0.4, h: 0.5 } }, { kind: "shape", prst: "ellipse", fill: "#ffcf7a", box: { x: 0.62, y: 0.36, w: 0.2, h: 0.36 } }, { kind: "text", paras: [{ text: "Pod (to scale, roughly)", lvl: 0 }], box: { x: 0.14, y: 0.83, w: 0.5, h: 0.1 } }] },
    slide("Benefits", ["Fewer typos after midnight", "Calmer standups", "> Less sighing"]),
    slide("Risks", ["Someone sets a 9 hour alarm", "Pod gets used as a coat rack"]),
    slide("Budget", ["One pod", "One pillow", "> Memory foam, obviously"]),
    slide("Timeline", ["Week 1: measure the closet", "Week 2: argue about colours", "Week 3: nap"]),
    slide("What the team says", ["\"Yes\"", "\"Please\"", "\"Is this a real slide?\""]),
    slide("The ask", ["Approve the pod", "Approve the pillow"], "Then go quiet and let them decide."),
    slide("Questions?", ["Thank you", "> Nap pending"]),
  ];
  return { kind: "deck", name: "Nap pod pitch.pptx", aspect: 16 / 9, slides, totalSlides: slides.length };
}

/** Which office app this robot reaches for when bored, or null if it does not care for them. */
export function officePick(taste: OfficeTaste | undefined): "memo" | "sheet" | "deck" | null {
  if (!taste || taste === "none") return null;
  const r = Math.random();
  if (taste === "writer") return r < 0.7 ? "memo" : r < 0.85 ? "sheet" : "deck";
  if (taste === "numbers") return r < 0.7 ? "sheet" : r < 0.85 ? "memo" : "deck";
  if (taste === "slides") return r < 0.7 ? "deck" : r < 0.85 ? "memo" : "sheet";
  return r < 0.34 ? "memo" : r < 0.67 ? "sheet" : "deck";
}

export const OFFICE_IDLE_LINE = { memo: "Writing a memo about the microwave", sheet: "Tweaking the coffee budget", deck: "Building a slide deck about nap pods" };

/** Play one bored-office activity; throws Cancelled the moment real work arrives. */
export async function officeIdle(wm: WM, what: "memo" | "sheet" | "deck") {
  const me = wm.robotName || "unit";
  if (what === "memo") await new Botword(wm).show(microwaveMemo(me), { typed: "all" });
  else if (what === "sheet") await new Cellsheet(wm).show(coffeeBudget(), { typed: "all" });
  else await new Slidedeck(wm).show(napPodDeck(me), { typed: "all", present: Math.random() < 0.6 });
  await wm.sleep(1200);
  const id = what === "memo" ? "botword" : what === "sheet" ? "cellsheet" : "slidedeck";
  const w = wm.wins.get(id);
  if (!w) return;
  await wm.pointAt(w.el.querySelector(".win-x")!, 0.5, 0.5, 380);
  await wm.click();
  wm.close(id);
}
