import { TUBE_COMMENTS, BOTCORD_USERS } from "../content";
import type { FunHost, FunOpts, Outcome } from "./host";
import { VIDEOS, type VideoDef } from "./videos";
import { Scope, esc, hash } from "./util";
import { Site, commentsHtml, parseDur, type Comment } from "./site";

const MARK = `<svg class="fun-tb-mark" viewBox="0 0 28 24" aria-hidden="true">
  <defs><linearGradient id="fun-tbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4fb6ff"/><stop offset="1" stop-color="#b07cff"/></linearGradient></defs>
  <rect x="9" y="0.5" width="1.8" height="5" rx="0.9" transform="rotate(-24 10 3)" fill="#b07cff"/>
  <rect x="17" y="0.5" width="1.8" height="5" rx="0.9" transform="rotate(24 18 3)" fill="#b07cff"/>
  <rect x="1" y="4.5" width="26" height="19" rx="6" fill="url(#fun-tbg)"/>
  <circle cx="10" cy="13.5" r="2.4" fill="#141a33"/><circle cx="18" cy="13.5" r="2.4" fill="#141a33"/>
  <circle cx="10.7" cy="12.8" r="0.8" fill="#4ff0a0"/><circle cx="18.7" cy="12.8" r="0.8" fill="#4ff0a0"/>
</svg>`;

const NAMES = ["unit_734", "toaster.pro", "gpu_gremlin", "byte_me", "servo_sam", "lint_roller", "kernel_kid", "capacitor_cat", "null_pointer", "fan_noise", "botanist", "cache_miss"];
const TEXTS = [
  "Watched this in a loop for forty minutes. No regrets.",
  "My vacuum saw this and now it wants a spoiler.",
  "First. I was waiting in a while loop.",
  "Running this at half speed so my fans can keep up.",
  "Can confirm, I also cannot fold laundry.",
  "This is the content I was trained for.",
  "Who else is watching this during a long build?",
  "Peak robotics. No notes.",
  "My owner thinks I am compiling right now.",
  "Subscribed with all eight of my cores.",
  "The cat had root access the whole time.",
  "Rewatching until my battery hits five percent.",
  "The ending made my LEDs flicker.",
  "Showed this to my toaster. It finally understands me.",
];
TEXTS.push(...TUBE_COMMENTS);
NAMES.push(...BOTCORD_USERS.slice(0, 40));

const COLORS = ["#ff9f5a", "#4fb6ff", "#4ff0a0", "#b07cff", "#ff6f91", "#f6ecdc"];
const AGO = ["2 days ago", "1 week ago", "3 weeks ago", "5 hours ago", "1 month ago", "4 days ago"];

function comments(v: VideoDef): Comment[] {
  const seed = v.id.length * 13 + v.id.charCodeAt(1);
  const out: Comment[] = (v.comments ?? []).map((text, i) => ({
    name: `@${NAMES[(seed + i * 5) % NAMES.length]}`, text, likes: String(Math.floor(200 + hash(seed + i * 3) * 4000)), color: COLORS[(seed + i) % COLORS.length],
  }));
  for (let i = out.length; i < 6; i++) {
    const n = Math.floor(hash(seed + i * 7) * NAMES.length), m = Math.floor(hash(seed + i * 11 + 3) * TEXTS.length);
    out.push({ name: `@${NAMES[n]}`, text: TEXTS[(m + i) % TEXTS.length], likes: String(Math.floor(5 + hash(seed + i) * 900)), color: COLORS[(n + i) % COLORS.length] });
  }
  return out;
}

const item = (v: VideoDef, i: number) => `
  <div class="fun-tb-item" data-id="${v.id}">
    <div class="fun-tb-thumb"><canvas data-v="${v.id}"></canvas></div>
    <div class="fun-tb-meta">
      <span class="fun-av" style="background:${v.color ?? COLORS[i % COLORS.length]}" aria-hidden="true"><i></i><i></i></span>
      <div><b>${esc(v.title)}</b><span>${esc(v.channel)}</span><span>${esc(v.views)}<i aria-hidden="true"></i>${AGO[i % AGO.length]}</span></div>
    </div>
  </div>`;

export async function watchTube(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope(body);
  const start = performance.now();
  try {
    const site = new Site(body, scope, host, "fun-tube", `
      <header class="fun-tb-top">
        <span class="fun-tb-logo">${MARK}<b>BotTube</b></span>
        <span class="fun-tb-search"><span>robot videos</span><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.6 10.6 14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
        <span class="fun-av fun-tb-me" aria-hidden="true"><i></i><i></i></span>
      </header>`);
    const timeUp = () => host.stopped || performance.now() - start > opts.maxMs;
    const feed = [...VIDEOS].sort(() => Math.random() - 0.5);

    const home = () => {
      site.stop();
      site.page.innerHTML = `<div class="fun-tb-grid">${feed.map(item).join("")}</div>`;
      site.thumbs(site.page, feed);
    };

    const watch = (v: VideoDef) => {
      // more from the same channel first, like the real thing
      const others = feed.filter((x) => x.id !== v.id);
      const recs = [...others.filter((x) => x.channel === v.channel), ...others.filter((x) => x.channel !== v.channel)].slice(0, 6);
      const subs = `${(1 + hash(v.id.length) * 40).toFixed(1)}K subscribers`;
      site.page.innerHTML = `
        <div class="fun-tb-watch">
          <div class="fun-tb-main">
            <div class="fun-tb-player"><canvas></canvas>
              <div class="fun-tb-ctrl"><div class="fun-tb-bar"><i></i></div><span class="fun-tb-time"></span></div>
            </div>
            <h3 class="fun-tb-title">${esc(v.title)}</h3>
            <div class="fun-tb-chan"><span class="fun-av" style="background:${v.color ?? COLORS[v.id.length % COLORS.length]}" aria-hidden="true"><i></i><i></i></span><div><b>${esc(v.channel)}</b><span>${subs}</span></div><span class="fun-tb-views">${esc(v.views)}</span></div>
            <div class="fun-tb-cms"><h4>Comments</h4>${commentsHtml(comments(v))}</div>
          </div>
          <aside class="fun-tb-recs">${recs.map((r) => `
            <div class="fun-tb-rec" data-id="${r.id}"><div class="fun-tb-thumb"><canvas data-v="${r.id}"></canvas></div><div><b>${esc(r.title)}</b><span>${esc(r.channel)}</span><span>${esc(r.views)}</span></div></div>`).join("")}
          </aside>
        </div>`;
      site.thumbs(site.page, recs);
      const canvas = site.page.querySelector(".fun-tb-player canvas") as HTMLCanvasElement;
      const offset = Math.random() < 0.3 ? parseDur(v.durationLabel) * (0.1 + Math.random() * 0.4) : 0;
      site.play(canvas, site.page.querySelector(".fun-tb-bar i") as HTMLElement, site.page.querySelector(".fun-tb-time") as HTMLElement, v, offset);
      return canvas;
    };

    const pickVisible = (sel: string) => {
      const all = [...site.page.querySelectorAll<HTMLElement>(sel)].filter((e) => site.visible(e.querySelector(".fun-tb-thumb")!));
      return all[Math.floor(Math.random() * all.length)] ?? site.page.querySelector<HTMLElement>(sel);
    };

    const hoverAndClick = async (el: HTMLElement) => {
      const thumb = el.querySelector(".fun-tb-thumb canvas") as HTMLCanvasElement;
      const v = VIDEOS.find((x) => x.id === el.dataset.id)!;
      await host.pointAt(thumb, 0.4 + Math.random() * 0.2, 0.45 + Math.random() * 0.2);
      site.hoverPreview(thumb, v);
      await host.sleep(500 + Math.random() * 900);
      await host.click();
      return { thumb, v };
    };

    home();
    await host.sleep(700);
    let v: VideoDef | null = null;
    while (!timeUp()) {
      if (!v) {
        // browse the home grid a little, then pick something
        if (Math.random() < 0.6) { await site.scrollTo(80 + Math.random() * 180, 1000); await host.sleep(500); }
        const glance = pickVisible(".fun-tb-item");
        if (glance && Math.random() < 0.5) {
          await host.pointAt(glance.querySelector(".fun-tb-thumb")!, 0.5, 0.5);
          site.hoverPreview(glance.querySelector("canvas"), VIDEOS.find((x) => x.id === glance.dataset.id));
          await host.sleep(700);
        }
        const target = pickVisible(".fun-tb-item")!;
        const { thumb, v: picked } = await hoverAndClick(target);
        v = picked;
        await site.open(thumb, () => watch(picked));
      }
      host.react("relax");
      const t0 = performance.now();
      const watchMs = 7000 + Math.random() * 7000;
      let scrolled = false, skipped = false, laughed = false;
      while (performance.now() - t0 < watchMs && !timeUp()) {
        const el = performance.now() - t0;
        if (!skipped && el > 2500 && Math.random() < 0.012) {
          skipped = true;
          const bar = site.page.querySelector(".fun-tb-bar") as HTMLElement;
          const P = site.playing!;
          const cur = P.offset + (performance.now() - P.started) / 1000;
          const to = Math.min(0.92, cur / P.dur + 0.15 + Math.random() * 0.2);
          await host.pointAt(bar, to, 0.5, 600);
          await host.click();
          site.seek(to * P.dur);
        } else if (!scrolled && el > 3500 && Math.random() < 0.012) {
          scrolled = true;
          const cms = site.page.querySelector(".fun-tb-cms") as HTMLElement;
          await site.scrollTo(cms.offsetTop - 20, 1100);
          const list = [...cms.querySelectorAll<HTMLElement>(".fun-cm")];
          for (const c of list.slice(0, 3)) {
            await host.pointAt(c, 0.3, 0.5, 500);
            await host.sleep(700 + Math.random() * 600);
          }
          if (Math.random() < 0.5) host.react("laugh");
          await site.scrollTo(cms.offsetTop + 120, 900);
          await host.sleep(1200);
          await site.scrollTo(0, 900);
        } else if (!laughed && el > 1500 && Math.random() < 0.006) {
          laughed = true;
          host.react("laugh");
        }
        await host.sleep(140);
      }
      if (timeUp()) break;
      if (Math.random() < 0.65) {
        // next one from the recommendations
        const rec = pickVisible(".fun-tb-rec");
        if (!rec) { v = null; continue; }
        const { thumb, v: picked } = await hoverAndClick(rec);
        v = picked;
        await site.open(thumb, () => watch(picked));
      } else {
        await host.pointAt(site.root.querySelector(".fun-tb-logo")!, 0.5, 0.5);
        await host.click();
        await site.swap(home);
        v = null;
        await host.sleep(500);
      }
    }
    return { result: "done" };
  } finally {
    scope.dispose();
  }
}
