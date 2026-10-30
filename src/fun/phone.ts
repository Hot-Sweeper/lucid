import gsap from "gsap";
import type { FunHost, FunOpts, Outcome } from "./host";
import { VIDEOS, type VideoDef } from "./videos";
import { Scope, fitCanvas, measure, html, hash } from "./util";

const ICON = {
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2c-.4 0-.8-.1-1.1-.4C6.1 16.9 2.5 13.6 2.5 9.3 2.5 6.2 4.9 3.8 7.9 3.8c1.7 0 3.2.8 4.1 2.1.9-1.3 2.4-2.1 4.1-2.1 3 0 5.4 2.4 5.4 5.5 0 4.3-3.6 7.6-8.4 11.5-.3.3-.7.4-1.1.4z"/></svg>`,
  talk: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2c5.1 0 9.3 3.5 9.3 7.9s-4.2 7.9-9.3 7.9c-1 0-2-.1-2.9-.4l-3.9 2.1c-.6.3-1.3-.2-1.2-.9l.5-3.3c-1.8-1.4-2.8-3.3-2.8-5.4 0-4.4 4.2-7.9 9.3-7.9z"/><circle cx="8" cy="11.2" r="1.3" fill="#141a33"/><circle cx="12" cy="11.2" r="1.3" fill="#141a33"/><circle cx="16" cy="11.2" r="1.3" fill="#141a33"/></svg>`,
  share: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 3.6c0-.8.9-1.2 1.5-.7l7.2 6.6c.4.4.4 1 0 1.4l-7.2 6.6c-.6.5-1.5.1-1.5-.7v-3.4c-4.7 0-7.9 1.5-10.3 4.8-.4.5-1.2.2-1.1-.4.9-5.7 4.4-9.5 11.4-10.2V3.6z"/></svg>`,
  burst: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="fun-hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9fb4"/><stop offset="1" stop-color="#ff6f91"/></linearGradient></defs><path fill="url(#fun-hg)" d="M12 21.2c-.4 0-.8-.1-1.1-.4C6.1 16.9 2.5 13.6 2.5 9.3 2.5 6.2 4.9 3.8 7.9 3.8c1.7 0 3.2.8 4.1 2.1.9-1.3 2.4-2.1 4.1-2.1 3 0 5.4 2.4 5.4 5.5 0 4.3-3.6 7.6-8.4 11.5-.3.3-.7.4-1.1.4z"/></svg>`,
};

const POSTS: Record<string, { user: string; caption: string; funny?: boolean }> = {
  "dance-battle": { user: "servo.moves", caption: "He did NOT see that arm wave coming", funny: true },
  "roomba-drift": { user: "dustkings", caption: "Corner speed 0.3 m/s. Personal best", funny: true },
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

type Slide = { el: HTMLElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; v: VideoDef; t0: number; likes: number; liked: boolean; bar: HTMLElement };

export async function watchPhoneFeed(screen: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope();
  const start = performance.now();
  try {
    screen.innerHTML = "";
    const root = html(`
      <div class="fun-phone">
        <div class="fun-ph-track"></div>
        <div class="fun-ph-top"><span class="fun-ph-mark" aria-hidden="true"></span><span class="fun-ph-brand">Spool</span></div>
        <div class="fun-ph-fx"></div>
      </div>`);
    screen.appendChild(root);
    const { w, h } = measure(root, 150, 300);
    const track = root.querySelector(".fun-ph-track") as HTMLElement;
    const fx = root.querySelector(".fun-ph-fx") as HTMLElement;
    const order = [...VIDEOS].sort(() => Math.random() - 0.5);
    let idx = 0;

    const makeSlide = (v: VideoDef): Slide => {
      const p = POSTS[v.id] ?? { user: v.channel.toLowerCase().replace(/\s+/g, "."), caption: v.title };
      const seed = v.id.length * 31 + v.id.charCodeAt(0);
      const likes = Math.round(2000 + hash(seed) * 480000);
      const el = html(`
        <div class="fun-ph-slide">
          <canvas></canvas>
          <div class="fun-ph-shade"></div>
          <div class="fun-ph-side">
            <span class="fun-ph-av" aria-hidden="true"><i></i><i></i></span>
            <span class="fun-ph-act fun-ph-like">${ICON.heart}<b class="fun-ph-likes"></b></span>
            <span class="fun-ph-act">${ICON.talk}<b>${fmt(Math.round(likes * (0.01 + hash(seed + 1) * 0.03)))}</b></span>
            <span class="fun-ph-act">${ICON.share}<b>${fmt(Math.round(likes * (0.004 + hash(seed + 2) * 0.02)))}</b></span>
          </div>
          <div class="fun-ph-info"><b class="fun-ph-user"></b><p class="fun-ph-cap"></p></div>
          <div class="fun-ph-prog"><i></i></div>
        </div>`);
      el.querySelector(".fun-ph-user")!.textContent = `@${p.user}`;
      el.querySelector(".fun-ph-cap")!.textContent = p.caption;
      el.querySelector(".fun-ph-likes")!.textContent = fmt(likes);
      const avHue = ["#ff9f5a", "#4fb6ff", "#4ff0a0", "#b07cff", "#ff6f91"][seed % 5];
      (el.querySelector(".fun-ph-av") as HTMLElement).style.background = avHue;
      track.appendChild(el);
      const canvas = el.querySelector("canvas") as HTMLCanvasElement;
      const ctx = fitCanvas(canvas, w, h);
      return { el, canvas, ctx, v, t0: performance.now(), likes, liked: false, bar: el.querySelector(".fun-ph-prog i") as HTMLElement };
    };

    let cur = makeSlide(order[idx]);
    let next: Slide | null = null;
    const paint = (sl: Slide, nowMs: number) => {
      const t = (nowMs - sl.t0) / 1000;
      sl.ctx.save();
      sl.v.draw(sl.ctx, w, h, t);
      sl.ctx.restore();
      sl.bar.style.transform = `scaleX(${((t % sl.v.loop) / sl.v.loop).toFixed(4)})`;
    };
    scope.raf((now) => {
      const ms = now * 1000;
      paint(cur, ms);
      if (next) paint(next, ms);
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
      host.thumb?.("doubleTap");
      touch(x, y, true);
      await host.sleep(240);
      const heart = html(`<span class="fun-ph-burst">${ICON.burst}</span>`);
      heart.style.left = `${x}px`;
      heart.style.top = `${y}px`;
      fx.appendChild(heart);
      const rot = (Math.random() - 0.5) * 40;
      scope.tw(
        gsap.timeline({ onComplete: () => heart.remove() })
          .fromTo(heart, { scale: 0, rotation: rot, opacity: 1 }, { scale: 1.15, duration: 0.32, ease: "back.out(2.5)" })
          .to(heart, { scale: 1, duration: 0.12, ease: "sine.out" })
          .to(heart, { y: -h * 0.18, opacity: 0, scale: 1.3, duration: 0.5, ease: "power2.in" }, "+=0.25"),
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
        scope.fromTo(btn.querySelector("svg"), { scale: 0.6 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
      }
    };

    const swipe = async () => {
      idx = (idx + 1) % order.length;
      next = makeSlide(order[idx]);
      gsap.set(next.el, { yPercent: 100 });
      host.thumb?.("swipe");
      const trail = html(`<span class="fun-ph-swipe"></span>`);
      fx.appendChild(trail);
      scope.fromTo(trail, { x: w * 0.55, y: h * 0.75, opacity: 0.6, scaleY: 0.4 }, { y: h * 0.25, opacity: 0, scaleY: 1, duration: 0.45, ease: "power2.out", onComplete: () => trail.remove() });
      const n = next;
      await Promise.all([
        scope.play(cur.el, { yPercent: -100, duration: 0.62, ease: "expo.inOut" }),
        scope.play(n.el, { yPercent: 0, duration: 0.62, ease: "expo.inOut" }),
      ]);
      cur.el.remove();
      cur = n;
      next = null;
    };

    const funny = () => !!POSTS[cur.v.id]?.funny;
    for (;;) {
      if (host.stopped || performance.now() - start > opts.maxMs) return { result: "done" };
      const watch = 2600 + Math.random() * 3800;
      const likeAt = Math.random() < 0.38 ? watch * (0.3 + Math.random() * 0.5) : -1;
      const laughAt = funny() && Math.random() < 0.55 ? watch * (0.25 + Math.random() * 0.5) : -1;
      const t0 = performance.now();
      let liked = false, laughed = false;
      while (performance.now() - t0 < watch) {
        const el = performance.now() - t0;
        if (!liked && likeAt >= 0 && el >= likeAt) { liked = true; await like(); }
        if (!laughed && laughAt >= 0 && el >= laughAt) { laughed = true; host.react("laugh"); }
        if (host.stopped || performance.now() - start > opts.maxMs) return { result: "done" };
        await host.sleep(120);
      }
      await swipe();
      if (Math.random() < 0.2) host.react("relax");
    }
  } finally {
    scope.dispose();
  }
}
