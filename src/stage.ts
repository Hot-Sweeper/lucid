import gsap from "gsap";

// The scene is authored at 1280x800 and scaled to fit. The robot's screen is a
// real DOM area placed exactly inside the monitor so its apps can use text and layout.
export const STAGE_W = 1280;
export const STAGE_H = 800;
export const SCREEN = { x: 150, y: 40, w: 820, h: 461 };

export class Stage {
  root: HTMLElement;
  stage: HTMLElement;
  screen: HTMLElement;
  notes: HTMLElement;
  bubble: HTMLElement;
  private cam = { x: 0, y: 0, s: 1 };
  private fit = 1;
  zoomed = false;

  constructor(host: HTMLElement) {
    this.root = host;
    host.innerHTML = `
      <div class="stage" id="stage">
        ${ROOM_SVG}
        <div class="screen" id="screen" style="left:${SCREEN.x}px;top:${SCREEN.y}px;width:${SCREEN.w}px;height:${SCREEN.h}px"></div>
        <div class="screen-glare" style="left:${SCREEN.x}px;top:${SCREEN.y}px;width:${SCREEN.w}px;height:${SCREEN.h}px"></div>
        <ol class="wall-notes" id="wall-notes" aria-label="Plan"></ol>
        <div class="bubble" id="bubble" role="status"></div>
      </div>
      <button class="zoom-btn" id="zoom-btn" type="button">Look at the screen</button>`;
    this.stage = host.querySelector("#stage")!;
    this.screen = host.querySelector("#screen")!;
    this.notes = host.querySelector("#wall-notes")!;
    this.bubble = host.querySelector("#bubble")!;
    const btn = host.querySelector("#zoom-btn") as HTMLButtonElement;
    btn.addEventListener("click", () => this.toggleZoom());
    this.screen.addEventListener("dblclick", () => this.toggleZoom());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.zoomed) this.toggleZoom(false);
    });
    new ResizeObserver(() => this.layout(false)).observe(host);
    this.layout(false);
    this.ambient();
  }

  toggleZoom(force?: boolean) {
    this.zoomed = force ?? !this.zoomed;
    (this.root.querySelector("#zoom-btn") as HTMLElement).textContent = this.zoomed ? "Back to the office" : "Look at the screen";
    this.layout(true);
  }

  private layout(animate: boolean) {
    const W = this.root.clientWidth, H = this.root.clientHeight;
    this.fit = Math.min(W / STAGE_W, H / STAGE_H);
    let target: { x: number; y: number; s: number };
    if (this.zoomed) {
      const pad = 28;
      const s = Math.min((W - pad * 2) / SCREEN.w, (H - pad * 2 - 40) / SCREEN.h);
      target = { s, x: W / 2 - (SCREEN.x + SCREEN.w / 2) * s, y: (H - 40) / 2 - (SCREEN.y + SCREEN.h / 2) * s };
    } else {
      const s = this.fit;
      target = { s, x: (W - STAGE_W * s) / 2, y: (H - STAGE_H * s) / 2 };
    }
    const apply = () => (this.stage.style.transform = `translate(${this.cam.x}px, ${this.cam.y}px) scale(${this.cam.s})`);
    if (animate) gsap.to(this.cam, { ...target, duration: 0.9, ease: "power3.inOut", onUpdate: apply });
    else { Object.assign(this.cam, target); apply(); }
  }

  // Small background life: stars twinkle, steam rises, plant sways, lamp breathes.
  private ambient() {
    const q = (s: string) => Array.from(this.stage.querySelectorAll(s));
    for (const star of q(".star")) {
      gsap.to(star, { opacity: 0.25, duration: 1 + Math.random() * 2.5, yoyo: true, repeat: -1, ease: "sine.inOut", delay: Math.random() * 3 });
    }
    q(".steam").forEach((s, i) => {
      gsap.fromTo(s, { y: 10, opacity: 0, scaleY: 0.8 }, { y: -36, opacity: 0.32, scaleY: 1.1, duration: 3.2, ease: "sine.out", repeat: -1, delay: i * 1.05, transformOrigin: "50% 100%", keyframes: { opacity: [0, 0.32, 0] } });
    });
    q(".leaf").forEach((l, i) => {
      gsap.to(l, { rotation: i % 2 ? 3 : -3, duration: 3 + i * 0.4, yoyo: true, repeat: -1, ease: "sine.inOut", transformOrigin: "50% 100%" });
    });
    gsap.to(q(".lamp-light"), { opacity: 0.85, duration: 4, yoyo: true, repeat: -1, ease: "sine.inOut" });
    gsap.to(q(".planet"), { rotation: 360, duration: 240, repeat: -1, ease: "none", transformOrigin: "50% 50%" });
  }

  // Wall glow behind the monitor follows what is on screen.
  setGlow(color: string) {
    gsap.to(this.stage.querySelector("#monitor-glow stop"), { attr: { "stop-color": color }, duration: 1.2, ease: "sine.inOut" });
  }

  // Thought or speech bubble near the robot's head.
  say(text: string | null, kind: "think" | "speak" = "think") {
    const b = this.bubble;
    if (!text) {
      if (b.classList.contains("show")) gsap.to(b, { opacity: 0, y: 8, scale: 0.96, duration: 0.25, ease: "power2.in", onComplete: () => b.classList.remove("show") });
      return;
    }
    const wasShown = b.classList.contains("show");
    b.className = `bubble show ${kind}`;
    b.innerHTML = `<p></p><span class="tail a"></span><span class="tail b"></span>`;
    b.querySelector("p")!.textContent = text;
    if (!wasShown) gsap.fromTo(b, { opacity: 0, y: 14, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.8)" });
    else gsap.fromTo(b.querySelector("p"), { opacity: 0.2 }, { opacity: 1, duration: 0.3 });
  }

  // Little Zs drifting up from the robot while it naps.
  private zTimer = 0;
  sleepy(on: boolean) {
    window.clearInterval(this.zTimer);
    this.zTimer = 0;
    if (!on) {
      gsap.to(this.stage.querySelectorAll(".zz"), { opacity: 0, duration: 0.3, onComplete: () => this.stage.querySelectorAll(".zz").forEach((z) => z.remove()) });
      return;
    }
    const spawn = () => {
      const z = document.createElement("span");
      z.className = "zz";
      z.textContent = "z";
      z.setAttribute("aria-hidden", "true");
      this.stage.appendChild(z);
      gsap.set(z, { x: 600, y: 575, scale: 0.6, opacity: 0, rotation: -10 });
      gsap.timeline({ onComplete: () => z.remove() })
        .to(z, { opacity: 0.85, duration: 0.6, ease: "sine.out" })
        .to(z, { x: 640 + Math.random() * 30, y: 470, scale: 1.4, rotation: 12, duration: 3.2, ease: "sine.inOut" }, 0)
        .to(z, { opacity: 0, duration: 1, ease: "sine.in" }, 2.2);
    };
    spawn();
    this.zTimer = window.setInterval(spawn, 1700);
  }

  // Plan steps as sticky notes on the wall.
  setPlan(steps: { text: string; status: string }[]) {
    const list = this.notes;
    const existing = Array.from(list.children) as HTMLElement[];
    steps.slice(0, 6).forEach((st, i) => {
      let li = existing[i];
      const fresh = !li;
      if (fresh) {
        li = document.createElement("li");
        li.innerHTML = `<span class="check" aria-hidden="true"></span><span class="t"></span>`;
        list.appendChild(li);
        gsap.fromTo(li, { opacity: 0, y: -18, rotation: -8 }, { opacity: 1, y: 0, rotation: i % 2 ? 2 : -2, duration: 0.6, ease: "back.out(2)", delay: i * 0.08 });
      }
      li.querySelector(".t")!.textContent = st.text;
      li.title = st.text;
      const done = st.status === "completed";
      if (done && !li.classList.contains("done")) {
        li.classList.add("done");
        gsap.fromTo(li.querySelector(".check"), { scale: 0 }, { scale: 1, duration: 0.45, ease: "back.out(3)" });
      }
      li.classList.toggle("active", st.status === "running" || st.status === "in_progress");
    });
    existing.slice(steps.length).forEach((li) => gsap.to(li, { opacity: 0, y: 20, duration: 0.3, onComplete: () => li.remove() }));
  }
}

const stars = Array.from({ length: 34 }, () => {
  const x = 1040 + Math.random() * 196, y = 54 + Math.random() * 300, r = Math.random() < 0.2 ? 1.8 : 1.1;
  return `<circle class="star" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="#fff"/>`;
}).join("");

const ROOM_SVG = /* svg */ `
<svg class="layer room" viewBox="0 0 1280 800" aria-hidden="true">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2350"/><stop offset="1" stop-color="#151b3d"/></linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c1030"/><stop offset="1" stop-color="#2a2a6a"/></linearGradient>
    <linearGradient id="desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#363f86"/><stop offset="1" stop-color="#262d63"/></linearGradient>
    <radialGradient id="monitor-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#4fb6ff" stop-opacity="0.32"/><stop offset="1" stop-color="#4fb6ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="lampGlow" cx="0.5" cy="0" r="0.9"><stop offset="0" stop-color="#ffd59a" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd59a" stop-opacity="0"/></radialGradient>
    <radialGradient id="planetG" cx="0.35" cy="0.35" r="0.8"><stop offset="0" stop-color="#ffb488"/><stop offset="1" stop-color="#d0567a"/></radialGradient>
    <filter id="blur18" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <rect x="-3000" y="-3000" width="7280" height="3560" fill="#1c2350"/>
  <rect width="1280" height="560" fill="url(#wall)"/>
  <rect x="0" y="470" width="1280" height="90" fill="#141936" opacity="0.6"/>

  <!-- window with night sky -->
  <rect x="1028" y="42" width="220" height="330" rx="18" fill="#10153a"/>
  <rect x="1036" y="50" width="204" height="314" rx="13" fill="url(#sky)"/>
  ${stars}
  <g class="planet"><circle cx="1180" cy="128" r="30" fill="url(#planetG)"/></g>
  <ellipse cx="1180" cy="128" rx="48" ry="9" fill="none" stroke="#ffd2b0" stroke-opacity="0.45" stroke-width="3" transform="rotate(-18 1180 128)"/>
  <rect x="1134" y="50" width="8" height="314" fill="#10153a"/>
  <rect x="1028" y="364" width="220" height="14" rx="7" fill="#232a5e"/>

  <!-- glow of the monitor on the wall -->
  <ellipse cx="560" cy="280" rx="560" ry="330" fill="url(#monitor-glow)"/>

  <!-- desk -->
  <rect x="-3000" y="556" width="7280" height="3000" fill="#262d63"/>
  <path d="M-3000 556 L4280 556 L4280 800 L-3000 800 Z" fill="url(#desk)"/>
  <rect x="-3000" y="550" width="7280" height="12" fill="#4651a3"/>

  <!-- monitor -->
  <ellipse cx="560" cy="590" rx="120" ry="14" fill="#0b0e24" opacity="0.5" filter="url(#blur6)"/>
  <path d="M532 528 L588 528 L596 584 L524 584 Z" fill="#20264f"/>
  <ellipse cx="560" cy="584" rx="88" ry="12" fill="#2b3266"/>
  <ellipse cx="560" cy="581" rx="80" ry="9" fill="#353d78"/>
  <rect x="136" y="26" width="848" height="508" rx="20" fill="#0d1029"/>
  <rect x="136" y="26" width="848" height="508" rx="20" fill="none"/>
  <rect x="142" y="30" width="836" height="4" rx="2" fill="#ffffff" opacity="0.06"/>

  <!-- keyboard and mouse -->
  <ellipse cx="560" cy="628" rx="190" ry="20" fill="#0b0e24" opacity="0.35" filter="url(#blur6)"/>
  <path d="M410 590 L710 590 L730 632 L390 632 Z" fill="#1e2452"/>
  <path d="M416 594 L704 594 L720 626 L400 626 Z" fill="#2c3470"/>
  ${Array.from({ length: 3 }, (_, r) => Array.from({ length: 14 }, (_, c) => {
    const y = 598 + r * 9, inset = (2 - r) * 4.5, x0 = 410 + inset + 12, w = 300 - inset * 2 - 24 + r * 6;
    return `<rect x="${(x0 - r * 3 + c * (w / 14)).toFixed(1)}" y="${y}" width="${(w / 14 - 3).toFixed(1)}" height="6" rx="1.5" fill="#3b4488"/>`;
  }).join("")).join("")}
  <ellipse cx="712" cy="760" rx="34" ry="16" fill="#0b0e24" opacity="0.35"/>
  <ellipse cx="710" cy="754" rx="24" ry="13" fill="#1e2452"/>
  <ellipse cx="708" cy="749" rx="18" ry="10" fill="#3b4488"/>

  <!-- mug -->
  <g transform="translate(888 560)">
    <path class="steam" d="M10 -6 C2 -18 18 -26 10 -40" stroke="#ffffff" stroke-width="5" stroke-linecap="round" fill="none" opacity="0"/>
    <path class="steam" d="M22 -6 C14 -18 30 -26 22 -40" stroke="#ffffff" stroke-width="5" stroke-linecap="round" fill="none" opacity="0"/>
    <path class="steam" d="M16 -4 C8 -16 24 -24 16 -38" stroke="#ffffff" stroke-width="5" stroke-linecap="round" fill="none" opacity="0"/>
    <ellipse cx="16" cy="44" rx="30" ry="7" fill="#0b0e24" opacity="0.4"/>
    <path d="M38 12 C56 12 56 34 38 34" stroke="#ff8a65" stroke-width="7" fill="none"/>
    <rect x="-4" y="0" width="42" height="46" rx="9" fill="#ff8a65"/>
    <rect x="-4" y="0" width="12" height="46" rx="6" fill="#ffab8f"/>
    <ellipse cx="17" cy="2" rx="21" ry="5" fill="#5a2b1e"/>
  </g>

  <!-- plant -->
  <g transform="translate(70 470)">
    <path class="leaf" d="M30 80 C-10 40 -6 0 18 -30 C26 10 40 40 30 80 Z" fill="#2fb59f"/>
    <path class="leaf" d="M34 80 C30 20 54 -16 86 -24 C76 16 62 50 34 80 Z" fill="#43d1b3"/>
    <path class="leaf" d="M30 82 C0 60 -30 50 -44 20 C-6 22 18 44 30 82 Z" fill="#259b89"/>
    <path class="leaf" d="M36 82 C56 52 88 44 104 26 C96 64 64 78 36 82 Z" fill="#35c2a6"/>
    <path d="M6 80 L66 80 L58 128 L14 128 Z" fill="#e8607e"/>
    <rect x="2" y="74" width="68" height="14" rx="7" fill="#ff7d97"/>
  </g>

  <!-- lamp -->
  <path class="lamp-light" d="M1066 476 L1218 476 L1300 640 L960 640 Z" fill="url(#lampGlow)" opacity="0.65"/>
  <ellipse cx="1190" cy="556" rx="46" ry="9" fill="#0b0e24" opacity="0.4"/>
  <rect x="1158" y="540" width="64" height="14" rx="7" fill="#ffc861"/>
  <path d="M1188 544 L1166 470 L1110 440" stroke="#ffb13b" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="1166" cy="470" r="9" fill="#ffd27a"/>
  <path d="M1060 470 L1094 418 L1146 448 L1130 486 Z" fill="#ffc861"/>
  <path d="M1066 476 L1130 486 L1124 492 L1072 484 Z" fill="#fff1c9"/>
</svg>`;
