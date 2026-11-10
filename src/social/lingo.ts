// Lingobot: a language lesson with a chatty speech-bubble robot mascot. The robot taps word tiles to
// translate a sentence, checks, gets a green "Nice!" (or a gentle red correction), and
// keeps its streak alive.
import { LESSONS, LINGO_NAGS, type Lesson } from "../content/social";
import { Kit, runApp, rnd, chance, pick, shuffle, h, calm, ICON, type SoHost, type SoOpts } from "./kit";
import "./lingo.css";

const MASCOT = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="30.8" y="3" width="2.4" height="10" rx="1.2" fill="#3a6fd6"/><circle cx="32" cy="4.5" r="3.4" fill="#ffd27a"/><path d="M20 12h24a12 12 0 0 1 12 12v12a12 12 0 0 1-12 12H27l-10 8 2.2-8.4A12 12 0 0 1 8 36V24a12 12 0 0 1 12-12Z" fill="#4c8dff"/><rect x="15" y="19" width="34" height="20" rx="8" fill="#141a33"/><rect x="21" y="24" width="6" height="8" rx="3" fill="#7fd3ff"/><rect x="37" y="24" width="6" height="8" rx="3" fill="#7fd3ff"/><circle cx="25.4" cy="26" r="1.2" fill="#fff"/><circle cx="41.4" cy="26" r="1.2" fill="#fff"/><path d="M28.5 34.5h7a3.5 3.5 0 0 1-7 0Z" fill="#7fd3ff"/><circle cx="17.5" cy="43" r="2.4" fill="#ff9fb4"/><circle cx="46.5" cy="43" r="2.4" fill="#ff9fb4"/></svg>`;
const HEART = ICON.heart;

export async function learnWithLingobot(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new Lingobot(k, body).session(); });
}

class Lingobot {
  root: HTMLElement;
  streak = 180 + Math.floor(Math.random() * 300);
  hearts = 5;

  constructor(private k: Kit, body: HTMLElement) {
    body.innerHTML = "";
    this.root = h("div", "so-lg");
    body.appendChild(this.root);
  }

  frame(progress: number) {
    this.root.innerHTML = `
      <header class="so-lg-top"><span class="so-lg-x"></span><div class="so-lg-prog"><i style="width:${progress * 100}%"></i></div><span class="so-lg-hp">${HEART}<b>${this.hearts}</b></span></header>
      <main class="so-lg-main"></main>
      <footer class="so-lg-foot"><span class="so-lg-check">Check</span></footer>`;
    return this.root.querySelector(".so-lg-main") as HTMLElement;
  }

  setProgress(p: number) {
    const bar = this.root.querySelector(".so-lg-prog i") as HTMLElement;
    if (calm()) bar.style.width = `${p * 100}%`; else this.k.to(bar, { width: `${p * 100}%`, duration: 0.5, ease: "power2.out" });
  }

  async exercise(l: Lesson, progress: number) {
    const main = this.frame(progress);
    const words = l.answer.split(" ");
    main.innerHTML = `<h4>Write this in English</h4>
      <div class="so-lg-ask"><span class="so-lg-mascot">${MASCOT}</span><div class="so-lg-bub"><span class="so-lg-flag"><i style="background:${l.flag[0]}"></i><i style="background:${l.flag[1]}"></i><i style="background:${l.flag[2]}"></i></span><span></span></div></div>
      <div class="so-lg-line"></div>
      <div class="so-lg-bank"></div>`;
    main.querySelector(".so-lg-bub > span:last-child")!.textContent = l.src;
    const line = main.querySelector(".so-lg-line") as HTMLElement;
    const bank = main.querySelector(".so-lg-bank") as HTMLElement;
    const tiles = shuffle([...words, ...l.extra]).map((w) => { const t = h("span", "so-lg-tile"); t.textContent = w; bank.appendChild(t); return t; });
    if (!calm()) this.k.from(main.children, { opacity: 0, y: 10, duration: 0.3, stagger: 0.06 });
    await this.k.sleep(1200 + l.src.length * rnd(40, 60));
    // sometimes it mixes up one word
    const slip = chance(0.18) ? Math.floor(Math.random() * words.length) : -1;
    const used = new Set<HTMLElement>();
    for (let i = 0; i < words.length; i++) {
      const want = i === slip ? l.extra.find((e) => !words.includes(e))! : words[i];
      const tile = tiles.find((t) => !used.has(t) && t.textContent === want) ?? tiles.find((t) => !used.has(t) && t.textContent === words[i])!;
      used.add(tile);
      await this.k.click(tile, 0.5, 0.5, 360);
      const put = h("span", "so-lg-tile", tile.textContent!);
      line.appendChild(put);
      tile.classList.add("gone");
      if (!calm()) {
        const a = tile.getBoundingClientRect(), b = put.getBoundingClientRect(), s = this.root.getBoundingClientRect().width / (this.root.offsetWidth || 1) || 1;
        this.k.from(put, { x: (a.left - b.left) / s, y: (a.top - b.top) / s, duration: 0.3, ease: "power2.out" });
      }
      await this.k.sleep(rnd(200, 500));
    }
    const check = this.root.querySelector(".so-lg-check") as HTMLElement;
    check.classList.add("ready");
    await this.k.sleep(rnd(300, 700));
    await this.k.click(check);
    const ok = slip < 0;
    const foot = this.root.querySelector(".so-lg-foot") as HTMLElement;
    foot.classList.add(ok ? "good" : "bad");
    foot.innerHTML = `<div><b>${ok ? pick(["Nice!", "Amazing!", "Correct!", "Great job!"]) : "Correct solution:"}</b>${ok ? "" : "<span></span>"}</div><span class="so-lg-check ready">Continue</span>`;
    if (!ok) foot.querySelector("div span")!.textContent = l.answer;
    if (!calm()) this.k.from(foot.children, { y: 20, opacity: 0, duration: 0.3, stagger: 0.05 });
    if (!ok) {
      this.hearts--;
      this.root.querySelector(".so-lg-hp b")!.textContent = String(this.hearts);
      this.k.host.react("shy");
    } else if (chance(0.4)) this.k.host.react("cheer");
    await this.k.sleep(rnd(1400, 2200));
    await this.k.click(foot.querySelector(".so-lg-check")!);
    return ok;
  }

  async finish(xp: number) {
    const main = this.frame(1);
    this.root.querySelector(".so-lg-foot")!.innerHTML = `<span class="so-lg-check ready">Continue</span>`;
    main.innerHTML = `<div class="so-lg-done"><span class="so-lg-mascot big">${MASCOT}</span><h3>Lesson complete!</h3><div class="so-lg-stats"><div><small>Total XP</small><b>${xp}</b></div><div class="fire"><small>Streak</small><b>${ICON.fire}<i>${this.streak}</i></b></div></div><p></p></div>`;
    main.querySelector("p")!.textContent = pick(LINGO_NAGS);
    const mascot = main.querySelector(".so-lg-mascot") as HTMLElement;
    if (!calm()) this.k.fromTo(mascot, { y: 0 }, { y: -10, duration: 0.35, yoyo: true, repeat: 3, ease: "power2.out" });
    await this.k.sleep(1200);
    this.streak++;
    const n = main.querySelector(".fire i") as HTMLElement;
    n.textContent = String(this.streak);
    if (!calm()) this.k.fromTo(main.querySelector(".fire b"), { scale: 1.5 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
    this.k.host.react("cheer");
    await this.k.sleep(2600);
    await this.k.click(this.root.querySelector(".so-lg-foot .so-lg-check")!);
  }

  async session() {
    while (this.k.left > 20000) {
      const lang = pick([...new Set(LESSONS.map((l) => l.lang))]);
      const set = shuffle(LESSONS.filter((l) => l.lang === lang));
      const all = shuffle([...set, ...LESSONS.filter((l) => l.lang !== lang)]).slice(0, 3);
      let xp = 0;
      for (let i = 0; i < all.length && this.k.left > 8000; i++) { if (await this.exercise(all[i], i / all.length)) xp += 5; this.setProgress((i + 1) / all.length); }
      await this.finish(xp + 5);
    }
    if (this.k.left > 2000) await this.k.sleep(Math.min(2500, this.k.left - 500));
  }
}
