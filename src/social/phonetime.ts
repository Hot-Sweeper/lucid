// Phone time: the robot unlocks its phone, the home screen shows its own apps, and it opens
// one or two of them (the ones it actually uses), then swipes home again.
import { watchPhoneFeed } from "../fun/phone";
import { Kit, runApp, rnd, chance, h, calm, type SoHost, type SoOpts } from "./kit";
import { SO_ICONS } from "./icons";
import { chatOnBotsApp } from "./botsapp";
import { browseTelegrid } from "./telegrid";
import { scrollChirp } from "./chirp";
import { scrollInstabot } from "./instabot";
import { snapOnSnapbot } from "./snapbot";
import { swipeSparkplug } from "./sparkplug";
import "../fun/fun.css";
import "./shorts.css";
import "./phonetime.css";

export type PhoneApp = "botsapp" | "telegrid" | "chirp" | "instabot" | "snapbot" | "shorts" | "spool" | "sparkplug";
export const PHONE_APP_LABEL: Record<PhoneApp, string> = { botsapp: "BotsApp", telegrid: "Telegrid", chirp: "Chirp", instabot: "Instabot", snapbot: "Snapbot", shorts: "BotTube Shorts", spool: "Spool", sparkplug: "Sparkplug" };
/** What the robot is up to, for the activity line. */
export const PHONE_APP_DOING: Record<PhoneApp, string> = {
  botsapp: "Texting the family on BotsApp",
  telegrid: "Reading Telegrid channels",
  chirp: "Scrolling Chirp on its phone",
  instabot: "Scrolling Instabot",
  snapbot: "Sending snaps on Snapbot",
  shorts: "Watching BotTube Shorts",
  spool: "Scrolling clips on its phone",
  sparkplug: "Swiping on Sparkplug",
};

type RunFn = (body: HTMLElement, host: SoHost, opts: SoOpts) => Promise<unknown>;
const RUN: Record<PhoneApp, RunFn> = {
  botsapp: chatOnBotsApp,
  telegrid: browseTelegrid,
  chirp: scrollChirp,
  instabot: scrollInstabot,
  snapbot: snapOnSnapbot,
  shorts: (b, host, o) => watchPhoneFeed(b, host, { maxMs: o.maxMs, variant: "shorts" }),
  spool: (b, host, o) => watchPhoneFeed(b, host, { maxMs: o.maxMs }),
  sparkplug: swipeSparkplug,
};
const LABEL_SHORT: Record<PhoneApp, string> = { ...PHONE_APP_LABEL, shorts: "Shorts" };
const FILLER = [
  `<svg class="ico" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="6" fill="#f6ecdc"/><circle cx="12" cy="12" r="6.5" fill="#fff"/><path d="M11.3 8h1.4v4.3l2.8 1.6-.7 1.2-3.5-2Z" fill="#141a33"/></svg>`,
  `<svg class="ico" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="6" fill="#4fb6ff"/><circle cx="10" cy="10" r="3.6" fill="#ffd27a"/><path d="M8.5 17.5a3.5 3.5 0 0 1 .6-6.9 4.6 4.6 0 0 1 8.7 1.5 2.7 2.7 0 0 1-.3 5.4Z" fill="#fff"/></svg>`,
  `<svg class="ico" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="6" fill="#8a91c4"/><path d="M12 6.5 13 8l1.8-.3.4 1.8 1.6.9-.8 1.6.8 1.6-1.6.9-.4 1.8-1.8-.3-1 1.5-1-1.5-1.8.3-.4-1.8-1.6-.9.8-1.6-.8-1.6 1.6-.9.4-1.8L11 8Z" fill="#fff"/><circle cx="12" cy="12" r="2" fill="#8a91c4"/></svg>`,
];

/** One phone session: 30 to 90 seconds over the robot's favourite phone apps. */
export async function usePhone(screen: HTMLElement, host: SoHost, opts: SoOpts & { apps: PhoneApp[]; onApp?: (app: PhoneApp) => void }) {
  return runApp(screen, host, opts, async (k) => {
    const apps = opts.apps.length ? opts.apps : (["spool"] as PhoneApp[]);
    screen.innerHTML = "";
    const home = h("div", "so-home so-ph");
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const icons = [...apps.map((a) => ({ id: a as string, svg: SO_ICONS[a], label: LABEL_SHORT[a] })), ...FILLER.map((svg, i) => ({ id: `f${i}`, svg, label: ["Clock", "Weather", "Settings"][i] }))].slice(0, 12);
    home.innerHTML = `<header><span>${now}</span><i></i></header><div class="so-home-grid">${icons.map((ic) => `<span class="so-home-app" data-app="${ic.id}">${ic.svg}<small>${ic.label}</small></span>`).join("")}</div><div class="so-home-bar"></div><div class="so-home-win"></div>`;
    screen.appendChild(home);
    const win = home.querySelector(".so-home-win") as HTMLElement;
    if (!calm()) k.from(home.querySelectorAll(".so-home-app"), { scale: 0.6, opacity: 0, duration: 0.35, stagger: 0.03, ease: "back.out(2)" });
    await k.sleep(rnd(900, 1500));
    // the favourite comes first; there is time for a second app now and then
    const order = [apps[Math.floor(Math.random() * apps.length)]];
    const second = apps.filter((a) => a !== order[0]);
    if (second.length && chance(0.55)) order.push(second[Math.floor(Math.random() * second.length)]);
    for (let i = 0; i < order.length; i++) {
      const app = order[i];
      const left = k.left;
      if (left < 12000) break;
      const icon = home.querySelector(`[data-app="${app}"]`) as HTMLElement;
      await openFrom(k, home, win, icon);
      opts.onApp?.(app);
      const slice = i < order.length - 1 ? left * rnd(0.5, 0.65) : left - 2500;
      try { await RUN[app](win, host, { ...opts, maxMs: slice, phone: true }); }
      finally { (host as SoHost).thumb?.("swipe"); }
      k.check();
      await closeApp(k, win);
      await k.sleep(rnd(600, 1100));
    }
  });
}

async function openFrom(k: Kit, home: HTMLElement, win: HTMLElement, icon: HTMLElement) {
  (k.host as SoHost).thumb?.("tap");
  icon.classList.add("down");
  await k.sleep(160);
  icon.classList.remove("down");
  win.innerHTML = "";
  win.classList.add("on");
  if (!calm()) {
    const r = icon.getBoundingClientRect(), b = home.getBoundingClientRect(), s = b.width / (home.offsetWidth || 1) || 1;
    const ox = ((r.left - b.left + r.width / 2) / s / (home.offsetWidth || 1)) * 100, oy = ((r.top - b.top + r.height / 2) / s / (home.offsetHeight || 1)) * 100;
    await new Promise<void>((res) => k.fromTo(win, { scale: 0.12, opacity: 0, borderRadius: 30, transformOrigin: `${ox}% ${oy}%` }, { scale: 1, opacity: 1, borderRadius: 0, duration: 0.35, ease: "power3.out", onComplete: () => res() }));
  }
}

async function closeApp(k: Kit, win: HTMLElement) {
  if (!calm()) await new Promise<void>((res) => k.to(win, { scale: 0.12, opacity: 0, duration: 0.3, ease: "power2.in", onComplete: () => res() }));
  win.classList.remove("on");
  win.innerHTML = "";
  k.set(win, { scale: 1, opacity: 1 });
}
