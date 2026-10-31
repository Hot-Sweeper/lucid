// The robot's web browser: real tabs (up to five) with titles and letter favicons, a search
// page whose results open in new tabs, site layouts for GitHub, Hugging Face and Wikipedia,
// find in page, and GitHub pull requests being opened and merged.
import gsap from "gsap";
import type { WM } from "./wm";
import { el, typeInto } from "./typing";
import { loadPage, favHtml, searchHtml, webSearch, urlKey, shortUrl, hostOf, cleanQuery, loadingHtml, prFromApi, prHtml, compareHtml, setPrMerged, type Result, type PageView, type PrData } from "./sites";
import "./web.css";

type Tab = { key: string; url: string; title: string; kind: "page" | "search"; el: HTMLElement; page: HTMLElement; results: Result[]; view: PageView | null; loading: Promise<void> | null; used: number };
const MAX_TABS = 5;

export type PrInfo = Omit<PrData, "checks" | "comments" | "state"> & { state?: PrData["state"] };

export class BrowserApp {
  private tabs: Tab[] = [];
  private active: Tab | null = null;
  constructor(private wm: WM, private peek: (url: string) => Promise<any>) {}

  private async ensure() {
    const w = await this.wm.open("browser");
    if (!w.body.querySelector(".browser")) {
      w.body.innerHTML = `
        <div class="browser">
          <div class="b-tabs" role="tablist"><span class="b-new" title="New tab"></span></div>
          <div class="b-bar"><span class="b-nav" aria-hidden="true"><i></i><i></i></span><span class="b-addr"></span></div>
          <div class="b-progress"><i></i></div>
          <div class="b-pages"></div>
        </div>`;
      this.tabs = [];
      this.active = null;
    }
    return w.body.querySelector(".browser") as HTMLElement;
  }

  private q<T extends HTMLElement = HTMLElement>(b: HTMLElement, sel: string) { return b.querySelector(sel) as T; }

  private look(t: Tab, title: string, url: string) {
    t.title = title;
    t.el.title = title;
    t.el.innerHTML = `${favHtml(url, t.kind === "search" ? "search" : undefined)}<span class="tt"></span><span class="b-x" aria-hidden="true"></span>`;
    (t.el.querySelector(".tt") as HTMLElement).textContent = title;
  }

  private addTab(b: HTMLElement, key: string, url: string, title: string, kind: Tab["kind"], instant: boolean) {
    const strip = this.q(b, ".b-tabs");
    const tabEl = el(`<div class="b-tab" role="tab"></div>`);
    strip.insertBefore(tabEl, this.q(b, ".b-new"));
    const page = el(`<div class="b-page"></div>`);
    this.q(b, ".b-pages").appendChild(page);
    const t: Tab = { key, url, title, kind, el: tabEl, page, results: [], view: null, loading: null, used: Date.now() };
    this.look(t, title, url);
    this.tabs.push(t);
    if (!instant) gsap.fromTo(tabEl, { maxWidth: 0, opacity: 0 }, { maxWidth: 170, opacity: 1, duration: 0.35 / this.wm.speed, ease: "power2.out", clearProps: "maxWidth" });
    // keep about five tabs: the one used longest ago closes
    while (this.tabs.length > MAX_TABS) {
      const victim = [...this.tabs].filter((x) => x !== this.active && x !== t).sort((a, z) => a.used - z.used)[0];
      if (!victim) break;
      this.tabs.splice(this.tabs.indexOf(victim), 1);
      victim.page.remove();
      gsap.to(victim.el, { maxWidth: 0, opacity: 0, duration: 0.25, onComplete: () => victim.el.remove() });
    }
    return t;
  }

  private show(b: HTMLElement, t: Tab) {
    this.active = t;
    t.used = Date.now();
    for (const x of this.tabs) { x.el.classList.toggle("on", x === t); x.page.classList.toggle("on", x === t); }
    this.q(b, ".b-addr").textContent = t.kind === "search" ? t.title : shortUrl(t.url);
    this.q(b, ".b-progress").classList.toggle("loading", !!t.loading);
    const strip = t.el.parentElement as HTMLElement;
    if (t.el.offsetLeft + t.el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = t.el.offsetLeft + t.el.offsetWidth - strip.clientWidth;
  }

  private async clickTab(b: HTMLElement, t: Tab, instant: boolean) {
    if (t === this.active) return;
    if (!instant) { await this.wm.pointAt(t.el, 0.45, 0.5, 300); await this.wm.click(); }
    this.show(b, t);
    if (!instant) gsap.fromTo(t.page, { opacity: 0.4 }, { opacity: 1, duration: 0.25 });
  }

  // Press the + button for a fresh tab, like Ctrl+T.
  private async newTab(b: HTMLElement, url: string, title: string, instant: boolean) {
    if (!instant && this.tabs.length) { await this.wm.pointAt(this.q(b, ".b-new"), 0.5, 0.5, 300); await this.wm.click(); }
    const t = this.addTab(b, urlKey(url), url, title, "page", instant);
    this.show(b, t);
    return t;
  }

  private async typeAddress(b: HTMLElement, text: string, instant: boolean) {
    const addr = this.q(b, ".b-addr");
    if (instant) { addr.textContent = text; return; }
    await this.wm.pointAt(addr, 0.4, 0.5);
    await this.wm.click();
    addr.classList.add("editing");
    await typeInto(this.wm, addr, text, { budgetMs: 1000 });
    this.wm.robot.pressKey("Enter");
    addr.classList.remove("editing");
  }

  // Fetch and render a page into its tab (in the background when the tab is not in front).
  private load(b: HTMLElement, t: Tab, url: string, o: { title?: string; text?: string; prState?: PrData["state"]; real?: boolean; html?: string } = {}) {
    const e = this.wm.epoch;
    t.url = url;
    t.key = t.key.startsWith("pv:") ? t.key : urlKey(url);
    t.page.innerHTML = loadingHtml();
    t.el.classList.add("loading");
    if (t === this.active) this.q(b, ".b-progress").classList.add("loading");
    const run = (async () => {
      const v = await loadPage(url, this.peek, o);
      if (e !== this.wm.epoch || !t.page.isConnected) return;
      t.view = v;
      t.url = v.url || url;
      t.page.innerHTML = v.html;
      t.page.dataset.site = v.site;
      t.page.scrollTop = 0;
      this.look(t, v.title || o.title || hostOf(url), t.url);
      t.el.classList.toggle("on", t === this.active);
      if (t === this.active) { this.q(b, ".b-addr").textContent = shortUrl(t.url); gsap.fromTo(t.page, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }); }
    })().catch((err) => console.warn("page load failed", err)).finally(() => {
      t.loading = null;
      t.el.classList.remove("loading");
      if (t === this.active) this.q(b, ".b-progress").classList.remove("loading");
    });
    t.loading = run;
    return run;
  }

  private async read(t: Tab, instant: boolean, ms = 3500) {
    const wm = this.wm, e = wm.epoch;
    wm.robot.setPose("read");
    if (instant) { await wm.sleep(350, e); return; }
    const page = t.page;
    await wm.pointAt(page, 0.6, 0.5, 400);
    const dur = Math.min(ms / 1000, 1 + page.scrollHeight / 450);
    gsap.to(page, { scrollTop: Math.max(0, Math.min(page.scrollHeight - page.clientHeight, page.clientHeight * 2.2)), duration: dur / wm.speed, ease: "power1.inOut", delay: 0.4 / wm.speed });
    await wm.sleep(dur * 1000 + 400, e);
  }

  /** Open a URL: switch to its tab if it is open, click it on a search page, follow a link, or type it. */
  async open(url: string, o: { instant?: boolean; title?: string; text?: string; key?: string; newTab?: boolean; read?: boolean; real?: boolean; html?: string } = {}): Promise<Tab> {
    const wm = this.wm;
    const instant = !!o.instant;
    const b = await this.ensure();
    const key = o.key || urlKey(url);
    let t = this.tabs.find((x) => x.key === key || (x.kind === "page" && urlKey(x.url) === urlKey(url)));
    if (t) {
      await this.clickTab(b, t, instant);
      if (t.loading) await t.loading;
      else if (!t.view || urlKey(t.url) !== urlKey(url) || o.text || o.html != null || (o.real && t.view.site !== "shot")) { await this.typeAddress(b, shortUrl(url), instant); await this.load(b, t, url, o); }
      wm.check(wm.epoch);
      if (o.read !== false) await this.read(t, instant);
      return t;
    }
    const src = this.tabs.find((x) => x.kind === "search" && x.page.querySelector(`.se-r[data-key="${CSS.escape(urlKey(url))}"]`));
    const cur = this.active;
    if (src) {
      // a result on the search page: click it and it opens in a new tab
      await this.clickTab(b, src, instant);
      const card = src.page.querySelector(`.se-r[data-key="${CSS.escape(urlKey(url))}"]`) as HTMLElement;
      if (!instant) {
        src.page.scrollTop = Math.max(0, card.offsetTop - 40);
        await wm.pointAt(card.querySelector("h3")!, 0.25, 0.5, 340);
        card.classList.add("hover");
        wm.robot.pressKey("Control");
        await wm.click();
        card.classList.remove("hover");
        card.classList.add("visited");
      }
      t = this.addTab(b, key, url, card.querySelector("h3")?.textContent || o.title || hostOf(url), "page", instant);
      this.show(b, t);
    } else if (cur && cur.kind === "page" && cur.view && hostOf(cur.url) === hostOf(url) && !o.newTab && !o.key) {
      // same site: follow a link on the page
      t = cur;
      const link = Array.from(cur.page.querySelectorAll(".lnk, .wl, h3, h2")).find((x) => { const r = (x as HTMLElement).offsetTop - cur.page.scrollTop; return r > 20 && r < cur.page.clientHeight - 20; }) as HTMLElement | undefined;
      if (link && !instant) { await wm.pointAt(link, 0.3, 0.5, 340); await wm.click(); }
      else await this.typeAddress(b, shortUrl(url), instant);
    } else {
      t = await this.newTab(b, url, o.title || hostOf(url) || "New Tab", instant);
      if (o.key) t.key = o.key;
      await this.typeAddress(b, shortUrl(url), instant);
    }
    await this.load(b, t, url, o);
    wm.check(wm.epoch);
    if (o.read !== false) await this.read(t, instant);
    return t;
  }

  /**
   * Search the web: the query goes in, the results page shows real results (the agent's own
   * when it reported them), and the pages it went on to read open in new tabs.
   */
  async search(query: string, o: { results?: Result[] | null; instant?: boolean; then?: string[] } = {}) {
    const wm = this.wm, e = wm.epoch;
    const instant = !!o.instant;
    const q = cleanQuery(query);
    const b = await this.ensure();
    let t = this.tabs.find((x) => x.kind === "search");
    if (t) await this.clickTab(b, t, instant);
    else {
      if (!instant && this.tabs.length) { await wm.pointAt(this.q(b, ".b-new"), 0.5, 0.5, 300); await wm.click(); }
      t = this.addTab(b, "search", "", q, "search", instant);
      this.show(b, t);
    }
    // type it into the page's own search box when one is showing, else the address bar
    const box = t.page.querySelector(".se-q") as HTMLElement | null;
    if (box && !instant) {
      await wm.pointAt(box, 0.5, 0.5, 340); await wm.click();
      box.parentElement!.classList.add("editing");
      await typeInto(wm, box, q, { budgetMs: 1100 });
      wm.robot.pressKey("Enter");
      box.parentElement!.classList.remove("editing");
    } else await this.typeAddress(b, q, instant);
    this.look(t, q, "");
    t.el.classList.add("on");
    this.q(b, ".b-addr").textContent = q;
    this.q(b, ".b-progress").classList.add("loading");
    const results = o.results?.length ? o.results : await webSearch(q);
    wm.check(e);
    this.q(b, ".b-progress").classList.remove("loading");
    t.results = results || [];
    t.page.innerHTML = searchHtml(q, results);
    t.page.scrollTop = 0;
    const cards = Array.from(t.page.querySelectorAll(".se-r")) as HTMLElement[];
    if (!instant) gsap.fromTo(cards, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.04, ease: "power2.out" });
    wm.robot.setPose("read");
    // skim the first few results
    for (const c of instant ? [] : cards.slice(0, 3)) { await wm.pointAt(c.querySelector("h3")!, 0.3, 0.5, 260); await wm.sleep(240, e); }
    if (instant) await wm.sleep(300, e);
    // the pages it read next open in background tabs (Ctrl+click), each loading on its own
    for (const url of (o.then || []).slice(0, MAX_TABS - 1)) {
      if (this.tabs.some((x) => x.kind === "page" && urlKey(x.url) === urlKey(url))) continue;
      const card = t.page.querySelector(`.se-r[data-key="${CSS.escape(urlKey(url))}"]`) as HTMLElement | null;
      if (!card) continue;
      if (!instant) {
        t.page.scrollTop = Math.max(0, card.offsetTop - 40);
        await wm.pointAt(card.querySelector("h3")!, 0.25, 0.5, 320);
        wm.robot.pressKey("Control");
        await wm.click();
        card.classList.add("visited");
      }
      const nt = this.addTab(b, urlKey(url), url, card.querySelector("h3")?.textContent || hostOf(url), "page", instant);
      void this.load(b, nt, url);
      await wm.sleep(instant ? 0 : 220, e);
    }
    this.show(b, t);
  }

  /** Find in page (Ctrl+F): the term is highlighted and the page jumps to the first match. */
  async find(term: string, url: string | null, o: { instant?: boolean } = {}) {
    const wm = this.wm, e = wm.epoch;
    const instant = !!o.instant;
    const b = await this.ensure();
    let t = this.active;
    if (url) t = await this.open(url, { instant, read: false });
    if (!t) return;
    let bar = b.querySelector(".b-find") as HTMLElement | null;
    if (!bar) { bar = el(`<div class="b-find"><span class="f-q"></span><span class="f-n"></span></div>`); b.appendChild(bar); }
    if (!instant) gsap.fromTo(bar, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.2 });
    wm.robot.pressKey("Control");
    const fq = bar.querySelector(".f-q") as HTMLElement;
    if (instant) fq.textContent = term; else await typeInto(wm, fq, term, { budgetMs: 700 });
    // mark the matches in the page text
    const needle = term.toLowerCase();
    const walker = document.createTreeWalker(t.page, NodeFilter.SHOW_TEXT);
    const hits: Text[] = [];
    while (walker.nextNode() && hits.length < 200) { const n = walker.currentNode as Text; if (needle && n.data.toLowerCase().includes(needle)) hits.push(n); }
    let count = 0;
    const marks: HTMLElement[] = [];
    for (const n of hits) {
      const parts = n.data.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i"));
      const frag = document.createDocumentFragment();
      for (const p of parts) {
        if (p.toLowerCase() === needle) { const m = document.createElement("mark"); m.className = "b-hit"; m.textContent = p; frag.appendChild(m); marks.push(m); count++; }
        else if (p) frag.appendChild(document.createTextNode(p));
      }
      n.replaceWith(frag);
    }
    (bar.querySelector(".f-n") as HTMLElement).textContent = count ? `1 of ${count}` : "No results";
    if (marks[0]) {
      marks[0].classList.add("cur");
      const top = marks[0].getBoundingClientRect().top - t.page.getBoundingClientRect().top + t.page.scrollTop - 60;
      gsap.to(t.page, { scrollTop: Math.max(0, top), duration: (instant ? 0.01 : 0.5) / wm.speed });
    }
    wm.robot.setPose("read");
    await wm.sleep(instant ? 400 : 1600, e);
    gsap.to(bar, { opacity: 0, duration: 0.2, onComplete: () => bar!.remove() });
  }

  // Show an in-page action (click, script, snapshot) on the robot's browser.
  async act(caption: string, title?: string, url?: string) {
    const wm = this.wm, e = wm.epoch;
    const b = await this.ensure();
    if (url && /^https?:/.test(url) && !this.active) await this.open(url, { title, read: false, instant: true, real: true });
    const page = this.active?.page || this.q(b, ".b-pages");
    const chip = el(`<div class="b-action"></div>`);
    chip.textContent = caption;
    b.appendChild(chip);
    await wm.pointAt(page, 0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4, 360);
    if (/Click/.test(caption)) await wm.click();
    gsap.fromTo(chip, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" });
    await wm.sleep(900, e);
    gsap.to(chip, { opacity: 0, duration: 0.3, onComplete: () => chip.remove() });
  }

  /** Old entry point: a URL opens, anything else is searched. */
  async visit(target: string, o: { instant?: boolean; real?: boolean } = {}) {
    if (/^https?:\/\//i.test(target)) await this.open(target, o);
    else await this.search(target, o);
  }

  /**
   * GitHub pull requests. "compare": the page a push links to. "create": the compare page, the title typed, Create pull request
   * clicked. "merge": the PR page, Merge pull request then Confirm merge, and the badge turns
   * purple. "view": just the page. `done` resolves with the command's real result; `click`
   * is false when the robot did the work in a terminal and only checks the page after.
   */
  async pullRequest(op: "create" | "merge" | "view" | "compare", info: PrInfo, o: { instant?: boolean; done?: Promise<{ ok: boolean; url?: string | null; number?: number | null }>; click?: boolean } = {}) {
    const wm = this.wm, e = wm.epoch;
    const instant = !!o.instant, click = o.click !== false && !instant;
    const b = await this.ensure();
    const base = `https://github.com/${info.repo}`;
    const local = (state: PrData["state"], number = info.number): PrData => ({ ...info, number, state, checks: [], comments: [] } as PrData);
    // the real PR when the repo is public, else what is known locally
    const real = async (n: number | null) => (n && info.repo && !/^local\//.test(info.repo) ? await prFromApi(info.repo, n) : null);
    let t: Tab;
    if (op === "compare") {
      // the link a push prints for a new branch: the compare page, nothing created yet
      const url = `${base}/compare/${info.base}...${info.head}`;
      t = await this.open(url, { instant, read: false, newTab: true });
      t.page.innerHTML = compareHtml(local("open"));
      t.page.dataset.site = "github";
      this.look(t, `Comparing ${info.base}...${info.head} · ${info.repo}`, url);
      t.el.classList.add("on");
      await this.read(t, instant, 2000);
      return;
    }
    if (op === "create") {
      const url = `${base}/compare/${info.base}...${info.head}`;
      t = this.tabs.find((x) => x.kind === "page" && urlKey(x.url) === urlKey(url)) || await this.newTab(b, url, `Comparing ${info.base}...${info.head} · ${info.repo}`, instant);
      this.show(b, t);
      await this.typeAddress(b, shortUrl(url), instant);
      t.url = url; t.view = { title: t.title, html: "", site: "github", url };
      t.page.innerHTML = compareHtml(local("open"));
      t.page.scrollTop = 0;
      this.look(t, `Comparing ${info.base}...${info.head} · ${info.repo}`, url);
      t.el.classList.add("on");
      if (click) {
        const ti = t.page.querySelector(".gh-ptitle") as HTMLElement;
        await wm.pointAt(ti, 0.3, 0.5, 340); await wm.click();
        ti.classList.add("editing");
        await typeInto(wm, ti, info.title, { budgetMs: 1200 });
        ti.classList.remove("editing");
        if (info.body) { const bo = t.page.querySelector(".gh-pbody") as HTMLElement; await wm.pointAt(bo, 0.3, 0.3, 300); await wm.click(); await typeInto(wm, bo, info.body.slice(0, 220), { budgetMs: 1000 }); }
        const btn = t.page.querySelector(".gh-create") as HTMLElement;
        await wm.pointAt(btn, 0.5, 0.5, 340); await wm.click();
        btn.classList.add("pressed");
      } else { (t.page.querySelector(".gh-ptitle") as HTMLElement).textContent = info.title; }
      const res = o.done ? await o.done : { ok: true, number: info.number };
      wm.check(e);
      if (!res.ok) { this.banner(t.page, "The pull request could not be created.", true); await wm.sleep(1400, e); return; }
      const n = res.number ?? info.number ?? null;
      const prUrl = n ? `${base}/pull/${n}` : url;
      const d = (await real(n)) || local("open", n);
      d.state = d.state === "merged" ? "merged" : "open";
      t.url = prUrl; t.key = urlKey(prUrl);
      t.page.innerHTML = prHtml(d);
      this.look(t, `${d.title} · Pull Request${n ? ` #${n}` : ""} · ${info.repo}`, prUrl);
      t.el.classList.add("on");
      this.q(b, ".b-addr").textContent = shortUrl(prUrl);
      gsap.fromTo(t.page, { opacity: 0 }, { opacity: 1, duration: 0.35 });
      await this.read(t, instant, 2200);
      return;
    }
    const n = info.number;
    const url = n ? `${base}/pull/${n}` : `${base}/pulls`;
    t = this.tabs.find((x) => x.kind === "page" && urlKey(x.url) === urlKey(url)) || await this.newTab(b, url, info.title, instant);
    await this.clickTab(b, t, instant);
    this.show(b, t);
    if (urlKey(t.url) !== urlKey(url) || !t.page.querySelector(".gh-pr")) await this.typeAddress(b, shortUrl(url), instant);
    this.q(b, ".b-progress").classList.add("loading");
    const d = (await real(n)) || local("open");
    wm.check(e);
    this.q(b, ".b-progress").classList.remove("loading");
    // a merge is shown from before it happened
    if (op === "merge" && !click && d.state !== "merged") d.state = "open";
    if (op === "merge" && click) d.state = "open";
    t.url = url; t.key = urlKey(url); t.view = { title: d.title, html: "", site: "github", url };
    t.page.innerHTML = prHtml(d);
    t.page.scrollTop = 0;
    this.look(t, `${d.title} · Pull Request${n ? ` #${n}` : ""} · ${info.repo}`, url);
    t.el.classList.add("on");
    gsap.fromTo(t.page, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4 });
    wm.robot.setPose("read");
    if (op === "view") { await this.read(t, instant, 2500); return; }
    // a look at the changes first, then back to the conversation to merge
    const filesTab = t.page.querySelector('.gh-prtabs [data-pane="files"]') as HTMLElement | null;
    if (click && filesTab && d.files.length) {
      await this.prPane(t, "files");
      await this.read(t, false, 1800);
      await this.prPane(t, "conv");
    }
    const box = t.page.querySelector(".gh-mbox") as HTMLElement | null;
    if (box && !instant) gsap.to(t.page, { scrollTop: box.offsetTop - 80, duration: 0.6 / wm.speed, ease: "power2.inOut" });
    await wm.sleep(instant ? 0 : 650, e);
    if (click && box) {
      const mb = box.querySelector(".gh-merge") as HTMLElement | null;
      if (mb) {
        await wm.pointAt(mb, 0.5, 0.5, 360); await wm.click();
        box.classList.add("confirming");
        await wm.sleep(500, e);
        const cb = box.querySelector(".gh-confirm") as HTMLElement;
        await wm.pointAt(cb, 0.5, 0.5, 320); await wm.click();
        cb.classList.add("pressed");
        box.classList.add("merging");
      }
    }
    const res = o.done ? await o.done : { ok: true };
    wm.check(e);
    if (!res.ok) { this.banner(t.page, "Merging was blocked. Details are in the terminal output.", true); await wm.sleep(1500, e); return; }
    // the merge went through: refresh the badge
    if (!click && !instant) { this.q(b, ".b-progress").classList.add("loading"); await wm.sleep(500, e); this.q(b, ".b-progress").classList.remove("loading"); }
    setPrMerged(t.page, d);
    const badge = t.page.querySelector(".gh-state") as HTMLElement | null;
    if (badge && !instant) gsap.fromTo(badge, { scale: 0.8 }, { scale: 1, duration: 0.45, ease: "back.out(2.4)" });
    const nb = t.page.querySelector(".gh-mbox") as HTMLElement | null;
    if (nb && !instant) gsap.fromTo(nb, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.4 });
    if (!instant) gsap.to(t.page, { scrollTop: 0, duration: 0.5 / wm.speed, delay: 0.9 / wm.speed });
    this.robotCheer();
    await wm.sleep(instant ? 300 : 1900, e);
  }

  private async prPane(t: Tab, pane: "conv" | "files") {
    const tab = t.page.querySelector(`.gh-prtabs [data-pane="${pane}"]`) as HTMLElement | null;
    if (!tab) return;
    await this.wm.pointAt(tab, 0.5, 0.5, 320); await this.wm.click();
    t.page.querySelectorAll(".gh-prtabs [data-pane]").forEach((x) => x.classList.toggle("on", x === tab));
    t.page.querySelectorAll(".gh-pane").forEach((x) => x.classList.toggle("on", (x as HTMLElement).dataset.pane === pane));
    t.page.scrollTop = 0;
  }

  private banner(page: HTMLElement, text: string, bad = false) {
    const n = el(`<div class="b-banner${bad ? " bad" : ""}"></div>`);
    n.textContent = text;
    page.prepend(n);
    gsap.fromTo(n, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.3 });
  }

  private robotCheer() { try { this.wm.robot.react("cheer"); } catch {} }
}
