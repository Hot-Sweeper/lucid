import gsap from "gsap";
import type { FunHost, FunOpts, Outcome } from "./host";
import { VIDEOS, type VideoDef } from "./videos";
import { DANCE_VIDEOS, calm } from "./dance";
import { SHORT_CLIPS, type ShortClip } from "./shorts-clips";
import { swipeMotion } from "./feed-gesture";
import { Scope, fitCanvas, measure, html, hash } from "./util";

const ICON = {
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2c-.4 0-.8-.1-1.1-.4C6.1 16.9 2.5 13.6 2.5 9.3 2.5 6.2 4.9 3.8 7.9 3.8c1.7 0 3.2.8 4.1 2.1.9-1.3 2.4-2.1 4.1-2.1 3 0 5.4 2.4 5.4 5.5 0 4.3-3.6 7.6-8.4 11.5-.3.3-.7.4-1.1.4z"/></svg>`,
  talk: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2c5.1 0 9.3 3.5 9.3 7.9s-4.2 7.9-9.3 7.9c-1 0-2-.1-2.9-.4l-3.9 2.1c-.6.3-1.3-.2-1.2-.9l.5-3.3c-1.8-1.4-2.8-3.3-2.8-5.4 0-4.4 4.2-7.9 9.3-7.9z"/><circle cx="8" cy="11.2" r="1.3" fill="#141a33"/><circle cx="12" cy="11.2" r="1.3" fill="#141a33"/><circle cx="16" cy="11.2" r="1.3" fill="#141a33"/></svg>`,
  share: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 3.6c0-.8.9-1.2 1.5-.7l7.2 6.6c.4.4.4 1 0 1.4l-7.2 6.6c-.6.5-1.5.1-1.5-.7v-3.4c-4.7 0-7.9 1.5-10.3 4.8-.4.5-1.2.2-1.1-.4.9-5.7 4.4-9.5 11.4-10.2V3.6z"/></svg>`,
  thumb: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 10.5h3.8V21H2.5Zm5.3 10.5V10.2l4.6-7c.9-1.3 3-.6 2.9 1l-.4 4.3h5.2c1.6 0 2.8 1.6 2.3 3.1l-2.4 7.6A2.6 2.6 0 0 1 17.5 21Z"/></svg>`,
  burst: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="fun-hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9fb4"/><stop offset="1" stop-color="#ff6f91"/></linearGradient></defs><path fill="url(#fun-hg)" d="M12 21.2c-.4 0-.8-.1-1.1-.4C6.1 16.9 2.5 13.6 2.5 9.3 2.5 6.2 4.9 3.8 7.9 3.8c1.7 0 3.2.8 4.1 2.1.9-1.3 2.4-2.1 4.1-2.1 3 0 5.4 2.4 5.4 5.5 0 4.3-3.6 7.6-8.4 11.5-.3.3-.7.4-1.1.4z"/></svg>`,
};

const POSTS: Record<string, { user: string; caption: string; funny?: boolean }> = {
  "dance-battle": { user: "servo.moves", caption: "He did NOT see that arm wave coming", funny: true },
  "vacuum-drift": { user: "dustkings", caption: "Corner speed 0.3 m/s. Personal best", funny: true },
  "gpu-unboxing": { user: "unbox.unit", caption: "It barely fit in the box. Or the case" },
  "attention": { user: "neural.notes", caption: "Every word looks at every other word" },
  "pancakes": { user: "chef.byte", caption: "Third flip went somewhere new", funny: true },
  "drone-race": { user: "propwash", caption: "Gate seven is a menace" },
  "cat-vacuum": { user: "whisker.lab", caption: "She has driven it every day since", funny: true },
  "server-tour": { user: "racklife", caption: "Night shift sounds, fans only" },
  "laundry": { user: "home.unit", caption: "Attempt 41. We are getting closer", funny: true },
  "chatbots": { user: "promptfight", caption: "This went on for 3 hours", funny: true },
  "first-steps": { user: "little.servo", caption: "First steps, first faceplant", funny: true },
  "block-stack": { user: "pickandplace", caption: "So close. So very close", funny: true },
};

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : String(n));

const shuffled = <T,>(a: readonly T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

/** Shuffled feed where dance trends come up often: about every third slide until they run out. */
function feedOrder() {
  const dances = shuffled(VIDEOS.filter((v) => DANCE_VIDEOS.includes(v)));
  const rest = shuffled(VIDEOS.filter((v) => !DANCE_VIDEOS.includes(v)));
  const out: VideoDef[] = [];
  let slot = Math.floor(Math.random() * 3);
  while (dances.length || rest.length) {
    out.push((slot % 3 === 0 && dances.length) || !rest.length ? dances.shift()! : rest.shift()!);
    slot++;
  }
  return out;
}

type Slide = { el: HTMLElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; v: VideoDef; t0: number; likes: number; liked: boolean; bar: HTMLElement; fired: Set<number> };
type Reaction = "laugh" | "flinch" | "show";


/**
 * A vertical clip feed. variant "shorts": BotTube Shorts with its own original robot clips, each
 * with moments the watching robot reacts to on cue. Otherwise the Spool feed of regular videos.
 * The thumb drags each clip away one to one and a spring finishes the change (feed-gesture.ts).
 */
export async function watchPhoneFeed(screen: HTMLElement, host: FunHost, opts: FunOpts & { variant?: "shorts" }): Promise<Outcome> {
  const scope = new Scope(screen);
  const shorts = opts.variant === "shorts";
  const start = performance.now();
  const still = calm();
  try {
    screen.innerHTML = "";
    const root = html(`
      <div class="fun-phone${shorts ? " fun-ph-shorts" : ""}">
        <div class="fun-ph-track"></div>
        <div class="fun-ph-top"><span class="fun-ph-mark" aria-hidden="true"></span><span class="fun-ph-brand">${shorts ? "Shorts" : "Spool"}</span></div>
        <div class="fun-ph-fx"></div>
      </div>`);
    screen.appendChild(root);
    const { w, h } = measure(root, 150, 300);
    const track = root.querySelector(".fun-ph-track") as HTMLElement;
    const fx = root.querySelector(".fun-ph-fx") as HTMLElement;
    let order: VideoDef[] = shorts ? shuffled(SHORT_CLIPS) : feedOrder();
    let idx = 0;
    const nextVideo = () => {
      idx++;
      if (idx >= order.length) { order = shorts ? shuffled(SHORT_CLIPS) : feedOrder(); idx = 0; }
      return order[idx];
    };

    const makeSlide = (v: VideoDef): Slide => {
      const p = POSTS[v.id] ?? v.post ?? { user: v.channel.toLowerCase().replace(/\s+/g, "."), caption: v.title };
      const seed = v.id.length * 31 + v.id.charCodeAt(0);
      const likes = Math.round(2000 + hash(seed) * 480000);
      const el = html(`
        <div class="fun-ph-slide">
          <canvas></canvas>
          <div class="fun-ph-shade"></div>
          <div class="fun-ph-side">
            <span class="fun-ph-av" aria-hidden="true"><i></i><i></i></span>
            <span class="fun-ph-act fun-ph-like">${shorts ? ICON.thumb : ICON.heart}<b class="fun-ph-likes"></b></span>${shorts ? `<span class="fun-ph-act fun-ph-dis">${ICON.thumb}<b>Dislike</b></span>` : ""}
            <span class="fun-ph-act">${ICON.talk}<b>${fmt(Math.round(likes * (0.01 + hash(seed + 1) * 0.03)))}</b></span>
            <span class="fun-ph-act">${ICON.share}<b>${fmt(Math.round(likes * (0.004 + hash(seed + 2) * 0.02)))}</b></span>
          </div>
          <div class="fun-ph-info"><b class="fun-ph-user"></b>${shorts ? `<span class="fun-ph-sub">Subscribe</span>` : ""}<p class="fun-ph-cap"></p></div>
          <div class="fun-ph-prog"><i></i></div>
        </div>`);
      el.querySelector(".fun-ph-user")!.textContent = `@${p.user}`;
      el.querySelector(".fun-ph-cap")!.textContent = p.caption;
      el.querySelector(".fun-ph-likes")!.textContent = fmt(likes);
      const avHue = ["#ff9f5a", "#4fb6ff", "#4ff0a0", "#b07cff", "#ff6f91"][seed % 5];
      (el.querySelector(".fun-ph-av") as HTMLElement).style.background = avHue;
      el.style.transform = `translate3d(0, ${h}px, 0)`;
      track.appendChild(el);
      const canvas = el.querySelector("canvas") as HTMLCanvasElement;
      const ctx = fitCanvas(canvas, w, h);
      return { el, canvas, ctx, v, t0: performance.now(), likes, liked: false, bar: el.querySelector(".fun-ph-prog i") as HTMLElement, fired: new Set() };
    };

    let cur = makeSlide(order[idx]);
    cur.el.style.transform = "translate3d(0, 0, 0)";
    let next: Slide | null = null;
    // 0: the current clip fills the screen, 1: the next one does. While a gesture runs, `motion`
    // turns time into that offset and the frame loop places both clips from it.
    let offset = 0;
    let motion: ((now: number) => number) | null = null;
    const place = () => {
      cur.el.style.transform = `translate3d(0, ${(-offset * h).toFixed(2)}px, 0)`;
      if (next) next.el.style.transform = `translate3d(0, ${((1 - offset) * h).toFixed(2)}px, 0)`;
    };
    const paint = (sl: Slide, nowMs: number) => {
      const t = (nowMs - sl.t0) / 1000;
      sl.ctx.save();
      sl.v.draw(sl.ctx, w, h, t);
      sl.ctx.restore();
      sl.bar.style.transform = `scaleX(${((t % sl.v.loop) / sl.v.loop).toFixed(4)})`;
    };
    scope.raf(() => {
      const ms = performance.now();
      if (motion) { offset = motion(ms); place(); }
      paint(cur, ms);
      // the next clip only needs frames while it is on screen
      if (next && (motion || offset > 0)) paint(next, ms);
    });

    const touch = (x: number, y: number, double: boolean) => {
      for (let i = 0; i < (double ? 2 : 1); i++) {
        const dot = html(`<span class="fun-ph-touch"></span>`);
        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;
        fx.appendChild(dot);
        scope.fromTo(dot, { scale: 0.3, opacity: 0.7 }, { scale: 1.5, opacity: 0, duration: 0.42, delay: i * 0.16, ease: "power2.out", onComplete: () => dot.remove() });
      }
    };

    const like = async () => {
      const x = w * (0.35 + Math.random() * 0.3), y = h * (0.35 + Math.random() * 0.25);
      // the thumb goes to the spot it double taps, then back to rest
      host.thumbAt?.(x / w, y / h);
      await host.sleep(120);
      host.thumb?.("doubleTap");
      touch(x, y, true);
      await host.sleep(240);
      host.thumbAt?.(-1, -1);
      const heart = html(`<span class="fun-ph-burst">${shorts ? ICON.thumb : ICON.burst}</span>`);
      heart.style.left = `${x}px`;
      heart.style.top = `${y}px`;
      fx.appendChild(heart);
      const rot = (Math.random() - 0.5) * 40;
      scope.tw(
        gsap.timeline({ onComplete: () => heart.remove() })
          .fromTo(heart, { scale: 0, rotation: rot, opacity: 1 }, { scale: 1.1, duration: 0.3, ease: "back.out(2.2)" })
          .to(heart, { scale: 1, duration: 0.12, ease: "power2.out" })
          .to(heart, { y: -h * 0.18, opacity: 0, scale: 1.3, duration: 0.45, ease: "power2.in" }, "+=0.25"),
      );
      for (let i = 0; i < 6; i++) {
        const bit = html(`<span class="fun-ph-bit"></span>`);
        bit.style.left = `${x}px`;
        bit.style.top = `${y}px`;
        fx.appendChild(bit);
        const a = (i / 6) * Math.PI * 2;
        scope.fromTo(bit, { x: 0, y: 0, scale: 1, opacity: 1 }, { x: Math.cos(a) * 26, y: Math.sin(a) * 26, scale: 0.2, opacity: 0, duration: 0.55, ease: "expo.out", onComplete: () => bit.remove() });
      }
      if (!cur.liked) {
        cur.liked = true;
        cur.likes++;
        const btn = cur.el.querySelector(".fun-ph-like") as HTMLElement;
        btn.classList.add("fun-on");
        cur.el.querySelector(".fun-ph-likes")!.textContent = fmt(cur.likes);
        scope.fromTo(btn.querySelector("svg"), { scale: 0.6 }, { scale: 1, duration: 0.4, ease: "back.out(2.6)" });
      }
    };

    // One swipe. `commit` false is a peek: the thumb drags a little, thinks better of it and the
    // clip springs back (the peeked clip waits below for the next real swipe).
    const swipe = async (commit: boolean) => {
      next ??= makeSlide(nextVideo());
      const n = next;
      if (still) {
        // Reduced motion: no travel, the next clip fades in over the current one.
        if (!commit) return;
        n.el.style.transform = "translate3d(0, 0, 0)";
        n.t0 = performance.now();
        await scope.play(n.el, { opacity: 1, startAt: { opacity: 0 }, duration: 0.16, ease: "power1.out" });
      } else {
        // the clip starts playing as it enters, not while it waited below
        if (commit && offset === 0) n.t0 = performance.now();
        const travel = commit ? 0.42 + Math.random() * 0.1 : 0.12 + Math.random() * 0.08;
        const dragMs = commit ? 200 + Math.random() * 80 : 380 + Math.random() * 120;
        const run = swipeMotion(travel, dragMs, commit);
        const t0 = performance.now(), from = 0.8, across = 0.52 + Math.random() * 0.12;
        let thumbY = -1;
        host.thumbAt?.(across, from);
        motion = (now) => {
          const ms = now - t0;
          // the thumb stays on the glass during the drag, the content under it one to one
          if (ms < dragMs) {
            const y = from - run.at(ms);
            if (Math.abs(y - thumbY) > 0.005) { thumbY = y; host.thumbAt?.(across, y); }
          }
          return run.at(ms);
        };
        try {
          await host.sleep(dragMs);
          host.thumbAt?.(-1, -1);
          await host.sleep(run.total - dragMs);
        } finally {
          motion = null;
        }
        offset = commit ? 1 : 0;
        place();
        if (!commit) return;
      }
      cur.el.remove();
      cur = n;
      next = null;
      offset = 0;
      place();
    };

    const post = () => POSTS[cur.v.id] ?? cur.v.post;
    const react = (kind: Reaction) => (host.phoneReact ? host.phoneReact(kind) : host.react(kind === "flinch" ? "surprised" : "laugh"));
    for (;;) {
      if (host.stopped || performance.now() - start > opts.maxMs) return { result: "done" };
      const clip = shorts ? (cur.v as ShortClip) : null;
      // Shorts are watched past their big moment; regular clips get a few seconds each.
      const watch = clip ? clip.loop * (1.05 + Math.random() * 0.5) * 1000 : 2600 + Math.random() * 3800;
      const likeAt = Math.random() < (clip?.beats.some((b) => b.react === "show") ? 0.6 : 0.35) ? watch * (0.55 + Math.random() * 0.35) : -1;
      const laughAt = !clip && post()?.funny && Math.random() < 0.55 ? watch * (0.25 + Math.random() * 0.5) : -1;
      const t0 = performance.now();
      let liked = false, laughed = false;
      while (performance.now() - t0 < watch) {
        const el = performance.now() - t0;
        if (!liked && likeAt >= 0 && el >= likeAt) { liked = true; await like(); }
        if (!laughed && laughAt >= 0 && el >= laughAt) { laughed = true; react("laugh"); }
        // reactions land on the clip's own moments, the first time it plays through
        if (clip) {
          const t = (performance.now() - cur.t0) / 1000;
          clip.beats.forEach((b, i) => { if (t >= b.at && t < clip.loop && !cur.fired.has(i)) { cur.fired.add(i); react(b.react); } });
        }
        if (host.stopped || performance.now() - start > opts.maxMs) return { result: "done" };
        await host.sleep(100);
      }
      if (!still && Math.random() < 0.16) { await swipe(false); await host.sleep(500 + Math.random() * 700); }
      await swipe(true);
      if (Math.random() < 0.15) host.react("relax");
    }
  } finally {
    scope.dispose();
  }
}
