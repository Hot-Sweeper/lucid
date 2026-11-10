import gsap from "gsap";
import { uid } from "../robot/art/walker-head";
import { Anims, reducedMotion, type Pt, type RoomStage } from "./room";
import { RoomMediaControl } from './room-controls';
import { gameSound } from '../office/sound';

// Movie night: a projector screen that rolls down from the north wall, four beanbags facing it
// (seen from behind), a projector on a little cart and a popcorn machine. While a film runs the
// lights around the corner dim (a dark gradient over that part of the room, with a hole where
// the screen is) and the screen spills its colors onto the floor.
// The film is a short parody trailer, "404: Hero Not Found". It calls out beats (gasp, laugh,
// aww, scare, credits) so the audience can react at the right moments.

export type Beat = "gasp" | "laugh" | "aww" | "scare" | "credits";

const FW = 342, FH = 168;   // film frame

export class MovieCorner {
  readonly el: HTMLElement;
  onScreenChange: (raised: boolean) => void = () => {};
  readonly seats: Pt[];
  readonly popcornSpot: Pt;
  private id = uid("mv");
  private cloth: SVGGElement;
  private film: SVGGElement;
  private spill: SVGElement;
  private dim: HTMLElement;
  private dust: SVGElement[];
  private lens: SVGElement;
  private kernels: SVGElement[];
  private warm: SVGElement;
  private anims = new Anims();
  private idle: gsap.core.Animation | null = null;
  private reel: gsap.core.Timeline | null = null;
  private screenControl: RoomMediaControl;
  private popcornControl: RoomMediaControl;
  private screenTransition: gsap.core.Tween | null = null;
  private raised = true;
  private userRaised = false;
  private active = false;
  private dead = false;
  private popping = false;
  private popcornTask: Promise<void> | null = null;

  constructor(stage: RoomStage, readonly cx: number, popX: number) {
    const sy = 410;
    this.seats = [-123, -41, 41, 123].map((dx) => ({ x: cx + dx, y: sy }));
    this.popcornSpot = { x: popX, y: 444 };
    // floor: a dark carpet under the beanbags and the light spilling from the screen
    const floor = stage.prop(cx - 240, 196, 480, 300, 2, /* svg */ `
      <rect x="30" y="152" width="420" height="104" rx="18" fill="#6b4a8a" opacity="0.45"/>
      <rect x="42" y="162" width="396" height="84" rx="12" fill="#8a64ad" opacity="0.3"/>
      <ellipse data-m="spill" cx="240" cy="40" rx="210" ry="58" fill="#ffffff" opacity="0"/>`);
    this.spill = floor.querySelector('[data-m="spill"]') as SVGElement;
    // the screen on its roller
    const scr = stage.prop(cx - 188, 18, 376, 200, 216, /* svg */ `
      <defs><clipPath id="${this.id}-f"><rect width="${FW}" height="${FH}" rx="2"/></clipPath></defs>
      <g data-m="cloth">
        <rect x="8" y="6" width="360" height="184" fill="#23263a"/>
        <rect x="13" y="10" width="${FW + 8}" height="${FH + 8}" fill="#f4f1ea"/>
        <g transform="translate(17 14)" clip-path="url(#${this.id}-f)"><g data-m="film"></g></g>
        <rect x="2" y="188" width="372" height="8" rx="4" fill="#3a3f4f"/>
        <rect x="178" y="194" width="20" height="5" rx="2.5" fill="#4a5063"/>
      </g>
      <rect x="0" y="0" width="376" height="12" rx="6" fill="#3a3f4f"/>
      <rect x="4" y="2" width="368" height="3" rx="1.5" fill="#5a6177"/>
      <rect x="-4" y="-2" width="10" height="16" rx="3" fill="#2a2e3b"/><rect x="370" y="-2" width="10" height="16" rx="3" fill="#2a2e3b"/>`);
    this.cloth = scr.querySelector('[data-m="cloth"]') as SVGGElement;
    this.el = scr.parentElement as unknown as HTMLElement;
    this.el.dataset.roomMedia = 'movie';
    this.film = scr.querySelector('[data-m="film"]') as SVGGElement;
    gsap.set(this.cloth, { scaleY: 0.04, transformOrigin: "50% 0%" });
    this.screenControl = new RoomMediaControl(stage.layer, 'movie-screen', { x: cx - 188, y: 16, w: 376, h: 38 }, () => this.setScreenRaised(!this.raised, true));
    // beanbags, seen from behind: they hide the sitters' lower half
    const bag = ["#ff9f5a", "#4fb6ff", "#ff6f91", "#b07cff"], hi = ["#ffc08a", "#8fd0ff", "#ff9fb5", "#cfaaff"];
    this.seats.forEach((s, i) => stage.prop(s.x - 38, s.y - 30, 76, 46, s.y + 12, /* svg */ `
      <ellipse cx="38" cy="40" rx="34" ry="5" fill="#2b1d10" opacity="0.2"/>
      <path d="M6 30 C2 14 18 4 38 6 C58 4 74 14 70 30 C68 42 8 44 6 30 Z" fill="${bag[i]}"/>
      <path d="M16 22 C20 14 30 11 40 12" stroke="${hi[i]}" stroke-width="5" fill="none" stroke-linecap="round"/>`));
    // projector on a cart behind the audience
    const pj = stage.prop(cx - 24, sy + 40, 48, 64, sy + 102, /* svg */ `
      <ellipse cx="24" cy="60" rx="20" ry="4" fill="#2b1d10" opacity="0.18"/>
      <rect x="8" y="30" width="5" height="28" rx="2" fill="#3a3f4f"/><rect x="35" y="30" width="5" height="28" rx="2" fill="#3a3f4f"/>
      <rect x="4" y="26" width="40" height="8" rx="3" fill="#4a5063"/>
      <rect x="6" y="6" width="36" height="22" rx="6" fill="#e9edf3"/><rect x="6" y="6" width="36" height="6" rx="3" fill="#ffffff"/>
      <rect x="12" y="16" width="16" height="2" rx="1" fill="#9aa3b5"/><rect x="12" y="20" width="16" height="2" rx="1" fill="#9aa3b5"/>
      <circle cx="34" cy="18" r="2" fill="#4ff0a0"/>
      <circle data-m="lens" cx="24" cy="4" r="5" fill="#fffbe6" opacity="0"/>`);
    this.lens = pj.querySelector('[data-m="lens"]') as SVGElement;
    // popcorn machine
    const pc = stage.prop(popX - 32, this.popcornSpot.y - 128, 64, 108, this.popcornSpot.y - 22, /* svg */ `
      <ellipse cx="32" cy="104" rx="28" ry="4" fill="#2b1d10" opacity="0.2"/>
      <circle cx="14" cy="98" r="6" fill="#3a3f4f"/><circle cx="50" cy="98" r="6" fill="#3a3f4f"/>
      <rect x="6" y="58" width="52" height="38" rx="5" fill="#e2483d"/>
      <rect x="14" y="58" width="8" height="38" fill="#ff6f5f"/><rect x="30" y="58" width="8" height="38" fill="#ff6f5f"/><rect x="46" y="58" width="6" height="38" fill="#ff6f5f"/>
      <rect x="8" y="20" width="48" height="40" rx="4" fill="#c9e8ff" opacity="0.55"/>
      <ellipse data-m="warm" cx="32" cy="44" rx="22" ry="15" fill="#ffd27a" opacity="0.15"/>
      <path d="M11 58 C12 46 20 44 26 48 C30 40 40 42 42 48 C48 44 54 50 53 58 Z" fill="#fff3c4"/>
      <circle cx="20" cy="52" r="3" fill="#ffe9a0"/><circle cx="34" cy="49" r="3" fill="#fff8de"/><circle cx="45" cy="53" r="3" fill="#ffe9a0"/>
      <g data-m="kernels">${[0, 1, 2, 3, 4, 5].map((k) => `<circle cx="${16 + k * 6.5}" cy="54" r="2.4" fill="#fffaf0" opacity="0"/>`).join("")}</g>
      <rect x="10" y="22" width="4" height="34" rx="2" fill="#ffffff" opacity="0.35"/>
      <path d="M2 22 L8 6 L56 6 L62 22 Z" fill="#e2483d"/>
      <path d="M14 6 L12 22 L20 22 L22 6 Z M32 6 L31 22 L39 22 L40 6 Z M50 6 L50 22 L58 22 L56 6 Z" fill="#fff6e8"/>
      <circle cx="32" cy="4" r="3" fill="#ffd23f"/>`);
    this.kernels = [...pc.querySelectorAll('[data-m="kernels"] circle')] as SVGElement[];
    this.warm = pc.querySelector('[data-m="warm"]') as SVGElement;
    this.popcornControl = new RoomMediaControl(stage.layer, 'popcorn', { x: popX - 32, y: this.popcornSpot.y - 122, w: 64, h: 100 }, () => {
      if (this.popping || this.dead) return;
      gameSound.at('boop', pc);
      void this.popcorn();
    });
    this.popcornControl.state('Pop some popcorn', false);
    // the dark falls over the audience but not over the screen; the beam crosses above their heads
    const ow = 760, oh = 620, ox = cx - ow / 2, oy = 16;
    const hole = { x0: cx - 180 - ox, x1: cx + 180 - ox, y0: 24 - oy, y1: 210 - oy };
    const ec = { x: ow / 2, y: 330 - oy, rx: ow / 2 - 10, ry: 300 };
    const lensAt = { x: cx - ox, y: sy + 44 - oy };
    this.dim = document.createElement("div");
    this.dim.className = "world-prop world-dim";
    this.dim.style.cssText = `left:${ox}px;top:${oy}px;width:${ow}px;height:${oh}px;z-index:99990`;
    this.dim.innerHTML = `<svg viewBox="0 0 ${ow} ${oh}" width="${ow}" height="${oh}" aria-hidden="true">
      <defs>
        <radialGradient id="${this.id}-d"><stop offset="0" stop-color="#0b0e24" stop-opacity="0.42"/><stop offset="0.62" stop-color="#0b0e24" stop-opacity="0.3"/><stop offset="1" stop-color="#0b0e24" stop-opacity="0"/></radialGradient>
        <linearGradient id="${this.id}-b" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fffbe6" stop-opacity="0.22"/><stop offset="1" stop-color="#fffbe6" stop-opacity="0.05"/></linearGradient>
      </defs>
      <path fill-rule="evenodd" fill="url(#${this.id}-d)" d="M${ec.x - ec.rx} ${ec.y} a${ec.rx} ${ec.ry} 0 1 0 ${ec.rx * 2} 0 a${ec.rx} ${ec.ry} 0 1 0 ${-ec.rx * 2} 0 Z M${hole.x0} ${hole.y0} H${hole.x1} V${hole.y1} H${hole.x0} Z"/>
      <path d="M${lensAt.x - 5} ${lensAt.y} L${lensAt.x + 5} ${lensAt.y} L${hole.x1 - 4} ${hole.y1 - 4} L${hole.x0 + 4} ${hole.y1 - 4} Z" fill="url(#${this.id}-b)"/>
      <g data-m="dust">${[0, 1, 2, 3, 4, 5].map((k) => `<circle cx="${lensAt.x + (k - 2.5) * 22}" cy="${lensAt.y - 60 - k * 30}" r="1.3" fill="#fffbe6" opacity="0.5"/>`).join("")}</g>
    </svg>`;
    stage.layer.appendChild(this.dim);
    this.dust = [...this.dim.querySelectorAll('[data-m="dust"] circle')] as SVGElement[];
    gsap.set(this.dim, { autoAlpha: 0 });
    this.syncScreen();
    document.addEventListener('visibilitychange', this.visibility);
  }

  get screenRaised() { return this.raised; }
  get isPlaying() { return this.active && !this.raised; }
  private visibility = () => {
    this.reel?.paused(this.raised || document.hidden);
    this.idle?.paused(this.raised || document.hidden);
    if (document.hidden) this.screenTransition?.progress(1);
  };
  private syncScreen() {
    this.el.dataset.screen = this.raised ? 'up' : 'down';
    this.el.dataset.playing = String(this.active && !this.raised);
    this.el.dataset.powered = String(this.active && !this.raised);
    this.screenControl.state(this.raised ? 'Lower projector screen' : 'Raise projector screen', this.raised);
    for (const el of [this.dim, this.spill, this.lens]) el.classList.toggle('room-media-hidden', this.raised);
    this.visibility();
  }
  private rollScreen() {
    this.screenTransition?.kill();
    // This motor is independent of start/stop promises. Rapid player toggles
    // cannot strand the audience while a cancelled transition waits to finish.
    this.screenTransition = gsap.to(this.cloth, { scaleY: this.raised ? .04 : 1, duration: reducedMotion() || document.hidden ? 0 : 1.05, ease: 'power2.inOut', overwrite: 'auto' });
    this.syncScreen();
  }
  setScreenRaised(raised: boolean, byUser = false) {
    if (this.dead || raised === this.raised) return;
    this.userRaised = raised; this.raised = raised; this.rollScreen();
    if (byUser) { gameSound.at('projector', this.el); this.onScreenChange(raised); }
  }

  /** The machine pops a fresh bucket. */
  popcorn() {
    if (this.dead) return Promise.resolve();
    if (this.popcornTask) return this.popcornTask;
    this.popping = true;
    const tl = gsap.timeline();
    tl.to(this.warm, { opacity: 0.7, duration: 0.3 });
    this.kernels.forEach((k, i) => tl.fromTo(k, { opacity: 1, attr: { cy: 54 } }, { attr: { cy: 26 + Math.random() * 10 }, duration: 0.22, yoyo: true, repeat: 7, ease: "power2.out", delay: i * 0.07 }, 0.1));
    tl.to(this.kernels, { opacity: 0, duration: 0.2 }, ">-0.1").to(this.warm, { opacity: 0.15, duration: 0.5 }, "<");
    // kernels burst in an uneven patter while the kettle is hot
    for (let n = 0; n < 16; n++) tl.call(() => gameSound.at('pop', this.warm, .45 + Math.random() * .55), [], .25 + Math.pow(Math.random(), .8) * 1.65);
    this.popcornTask = this.anims.run(tl).then(() => { this.popping = false; this.popcornTask = null; });
    return this.popcornTask;
  }

  /** Lights down, screen rolls down, projector on. */
  start() {
    this.active = true; this.raised = this.userRaised; this.rollScreen();
    const tl = gsap.timeline()
      .to({}, { duration: reducedMotion() || document.hidden ? 0 : 1.6 })
      .to(this.dim, { autoAlpha: 1, duration: 1.4, ease: "sine.inOut" }, 0.4)
      .to(this.lens, { opacity: 0.9, duration: 0.4 }, 1.2);
    if (!reducedMotion()) {
      this.idle = gsap.to(this.dust, { y: -26, x: "random(-8, 8)", opacity: 0.1, duration: 3, stagger: 0.4, yoyo: true, repeat: -1, ease: "sine.inOut" });
      this.anims.add(this.idle);
      this.visibility();
    }
    return this.anims.run(tl);
  }

  /** Lights up, screen rolls back up. */
  stop() {
    this.active = false; this.raised = true; this.rollScreen();
    this.idle?.kill();
    this.idle = null;
    this.reel?.kill();
    this.reel = null;
    this.film.innerHTML = "";
    return this.anims.run(gsap.timeline()
      .to([this.spill, this.lens], { opacity: 0, duration: 0.5 })
      .to(this.dim, { autoAlpha: 0, duration: 1.2, ease: "sine.inOut" }, 0));
  }

  /** Play the trailer. Resolves when the credits are over. */
  play(beat: (b: Beat) => void) {
    const f = this.film, id = this.id;
    const hero = (x: number, y: number, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
        <path data-cape d="M-6 -20 Q-20 -12 -18 2 L-4 -4 Z" fill="#e2483d"/>
        <rect x="-5" y="-8" width="4" height="9" rx="2" fill="#98a0c2"/><rect x="1.5" y="-8" width="4" height="9" rx="2" fill="#98a0c2"/>
        <rect x="-7" y="-21" width="14" height="14" rx="4" fill="#eef0f8"/>
        <rect x="-1" y="-39" width="2" height="5" fill="#98a0c2"/><circle cx="0" cy="-39.5" r="2.2" fill="#7cf2ff"/>
        <rect x="-8" y="-35" width="16" height="14" rx="5" fill="#eef0f8"/>
        <rect x="-5" y="-32" width="11" height="7" rx="3" fill="#10142c"/><rect x="1" y="-30.5" width="2.4" height="4" rx="1" fill="#7cf2ff"/>
      </g>`;
    const skyline = (dx: number, fill: string, win: boolean) => Array.from({ length: 9 }, (_, i) => {
      const w = 34 + ((i * 17) % 20), h = 46 + ((i * 37) % 60), x = dx + i * 44;
      const wins = win ? Array.from({ length: 6 }, (_, k) => `<rect x="${x + 6 + (k % 3) * 9}" y="${FH - h + 8 + Math.floor(k / 3) * 12}" width="4" height="5" fill="#ffd27a" opacity="${(i + k) % 3 ? 0.8 : 0.25}"/>`).join("") : "";
      return `<rect x="${x}" y="${FH - h}" width="${w}" height="${h}" fill="${fill}"/>${wins}`;
    }).join("");
    const bugBody = (eyes: string) => `
      <path d="M-70 40 L-110 90 M-50 46 L-80 110 M70 40 L110 90 M50 46 L80 110" stroke="#5e1f2d" stroke-width="10" stroke-linecap="round"/>
      <path d="M-24 -40 Q-40 -80 -60 -86 M24 -40 Q40 -80 60 -86" stroke="#5e1f2d" stroke-width="6" fill="none" stroke-linecap="round"/>
      <ellipse rx="80" ry="56" fill="#8e2a3a"/><ellipse cy="-8" rx="66" ry="40" fill="#a83347"/>
      <ellipse cx="-26" cy="-12" rx="15" ry="18" fill="${eyes}" data-eye/><ellipse cx="26" cy="-12" rx="15" ry="18" fill="${eyes}" data-eye/>
      <circle cx="-22" cy="-16" r="5" fill="#2b0d14"/><circle cx="22" cy="-16" r="5" fill="#2b0d14"/>
      <path d="M-30 22 Q0 36 30 22" stroke="#2b0d14" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    const label = (t: string, y: number, size: number, fill: string, font = "var(--font)") => `<text x="${FW / 2}" y="${y}" text-anchor="middle" font-family="${font}" font-size="${size}" font-weight="700" letter-spacing="0.5" fill="${fill}">${t}</text>`;
    f.innerHTML = /* svg */ `
      <defs>
        <linearGradient id="${id}-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f4a"/><stop offset="1" stop-color="#6b3a7a"/></linearGradient>
        <linearGradient id="${id}-pink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc2d1"/><stop offset="1" stop-color="#ff7fa0"/></linearGradient>
      </defs>
      <g data-s="0"><rect width="${FW}" height="${FH}" fill="#8d93a3"/>
        <circle cx="${FW / 2}" cy="${FH / 2}" r="62" fill="#a3a8b6"/><circle cx="${FW / 2}" cy="${FH / 2}" r="54" fill="#8d93a3"/>
        <g data-sweep transform="translate(${FW / 2} ${FH / 2})"><path d="M0 0 L0 -54 A54 54 0 0 1 46.8 -27 Z" fill="#b6bbc8"/></g>
        <rect x="0" y="${FH / 2 - 0.75}" width="${FW}" height="1.5" fill="#6d7385"/><rect x="${FW / 2 - 0.75}" y="0" width="1.5" height="${FH}" fill="#6d7385"/>
        <text data-count x="${FW / 2}" y="${FH / 2 + 14}" text-anchor="middle" font-family="var(--mono)" font-size="40" font-weight="700" fill="#2d3142">3</text></g>
      <g data-s="1" opacity="0"><rect width="${FW}" height="${FH}" fill="#10142c"/>
        <path data-beam d="M${FW / 2 - 6} ${FH} L${FW / 2 - 70} 0 L${FW / 2 - 30} 0 Z" fill="#fff" opacity="0.08"/><path data-beam d="M${FW / 2 + 6} ${FH} L${FW / 2 + 70} 0 L${FW / 2 + 30} 0 Z" fill="#fff" opacity="0.08"/>
        <g data-gear transform="translate(${FW / 2} 70)">${Array.from({ length: 8 }, (_, k) => `<rect x="-5" y="-30" width="10" height="12" rx="2" fill="#ffd27a" transform="rotate(${k * 45})"/>`).join("")}<circle r="22" fill="#ffd27a"/><circle r="9" fill="#10142c"/></g>
        ${label("LUCID PICTURES", 128, 12, "#ffd27a")}</g>
      <g data-s="2" opacity="0"><rect width="${FW}" height="${FH}" fill="url(#${id}-night)"/>
        ${Array.from({ length: 14 }, (_, k) => `<circle cx="${(k * 53) % FW}" cy="${8 + ((k * 29) % 60)}" r="${k % 3 ? 0.9 : 1.5}" fill="#fff"/>`).join("")}
        <circle cx="272" cy="40" r="20" fill="#fff6d8"/><circle cx="264" cy="34" r="5" fill="#f0e6c0"/>
        <g data-bug transform="translate(${FW / 2 + 40} ${FH + 140})">${bugBody("#ffd23f")}</g>
        <g data-city>${skyline(-10, "#2c2350", true)}</g>
        <rect x="98" y="${FH - 76}" width="46" height="76" fill="#221a40"/><rect x="94" y="${FH - 80}" width="54" height="6" rx="2" fill="#2f2558"/>
        <g data-hero>${hero(120, FH - 80, 1.2)}</g>
        <text data-cap1 x="${FW / 2}" y="${FH - 10}" text-anchor="middle" font-family="var(--font)" font-size="11" font-weight="700" letter-spacing="1" fill="#ffffff">IN A WORLD...</text>
        <text data-cap2 x="${FW / 2}" y="${FH - 10}" text-anchor="middle" font-family="var(--font)" font-size="11" font-weight="700" letter-spacing="1" fill="#ffd23f" opacity="0">WITHOUT SEMICOLONS</text></g>
      <g data-s="3" opacity="0"><rect width="${FW}" height="${FH}" fill="url(#${id}-night)"/>
        <g data-far>${skyline(0, "#3a2d63", false)}${skyline(396, "#3a2d63", false)}</g>
        <g data-near>${skyline(-20, "#221a40", true)}${skyline(376, "#221a40", true)}</g>
        <rect y="${FH - 8}" width="${FW}" height="8" fill="#15102a"/>
        <g data-boom transform="translate(250 90)" opacity="0"><circle r="26" fill="#ff9f5a"/><circle r="16" fill="#ffd23f"/></g>
        <g data-chaser transform="translate(40 ${FH - 52}) scale(0.55)">${bugBody("#ffd23f")}</g>
        <g data-runner>${hero(200, FH - 8, 1)}</g></g>
      <g data-s="4" opacity="0"><rect width="${FW}" height="${FH}" fill="url(#${id}-night)"/>
        <rect y="${FH - 10}" width="${FW}" height="10" fill="#15102a"/>
        <g transform="translate(236 ${FH - 70}) scale(0.8)"><g data-bug2>${bugBody("#ffd23f")}<g data-power transform="translate(0 6)" opacity="0"><circle r="16" fill="#3a3f4f"/><circle r="12" fill="#4ff0a0"/><path d="M0 -8 L0 0 M-6 -4 A8 8 0 1 0 6 -4" stroke="#10142c" stroke-width="3" fill="none" stroke-linecap="round"/></g></g></g>
        <g data-hero2>${hero(60, FH - 10, 1.1)}</g>
        <text data-ver x="236" y="34" text-anchor="middle" font-family="var(--mono)" font-size="10" font-weight="700" fill="#4ff0a0" opacity="0">v2.0</text></g>
      <g data-s="5" opacity="0"><rect width="${FW}" height="${FH}" fill="url(#${id}-pink)"/>
        <rect y="${FH - 14}" width="${FW}" height="14" fill="#e86a8c"/>
        <g data-hero3>${hero(110, FH - 14, 1.3)}</g>
        <g data-toaster transform="translate(232 ${FH - 14})">
          <rect x="-4" y="-34" width="10" height="16" rx="2" fill="#c98a4a" data-toast/><rect x="10" y="-34" width="10" height="16" rx="2" fill="#c98a4a" data-toast/>
          <rect x="-14" y="-30" width="44" height="28" rx="9" fill="#cfd6e2"/><rect x="-14" y="-30" width="44" height="7" rx="3.5" fill="#eef0f8"/>
          <rect x="-4" y="-18" width="24" height="10" rx="4" fill="#10142c"/><circle cx="3" cy="-13" r="2" fill="#ffd23f"/><circle cx="13" cy="-13" r="2" fill="#ffd23f"/>
          <rect x="-8" y="-3" width="4" height="4" fill="#98a0c2"/><rect x="20" y="-3" width="4" height="4" fill="#98a0c2"/></g>
        <g data-hearts>${[0, 1, 2].map((k) => `<path d="M0 6 C-10 0 -7 -8 0 -3 C7 -8 10 0 0 6 Z" fill="#ff3b6b" transform="translate(${160 + k * 14} ${FH - 60})" opacity="0"/>`).join("")}</g></g>
      <g data-s="6" opacity="0"><rect width="${FW}" height="${FH}" fill="#000"/>
        <g data-face transform="translate(${FW / 2} ${FH / 2 + 20}) scale(1.6)">${bugBody("#ff3b3b")}</g></g>
      <g data-s="7" opacity="0"><rect width="${FW}" height="${FH}" fill="#10142c"/>
        ${label("404", 84, 52, "#ffd23f", "var(--mono)")}
        ${label("HERO NOT FOUND", 110, 13, "#ffffff")}
        ${label("COMING SOON", 140, 8, "#8a91c4")}</g>
      <g data-s="8" opacity="0"><rect width="${FW}" height="${FH}" fill="#000"/>
        <g data-roll>${[["DIRECTED BY", "A VERY TIRED GPU"], ["STARRING", "THE HERO"], ["", "THE BUG"], ["", "THE TOASTER AS ITSELF"], ["MUSIC", "BEEP BOOP ORCHESTRA"], ["", "NO SEMICOLONS WERE HARMED"], ["", "THE END"]]
          .map(([a, b], k) => `${a ? `<text x="${FW / 2}" y="${k * 34}" text-anchor="middle" font-family="var(--font)" font-size="7" letter-spacing="1" fill="#8a91c4">${a}</text>` : ""}<text x="${FW / 2}" y="${k * 34 + 12}" text-anchor="middle" font-family="var(--font)" font-size="${k === 6 ? 14 : 9}" font-weight="700" letter-spacing="1" fill="#ffffff">${b}</text>`).join("")}</g></g>`;
    const $ = (sel: string) => f.querySelector(sel) as SVGElement;
    const $$ = (sel: string) => [...f.querySelectorAll(sel)] as SVGElement[];
    const scene = (n: number) => $(`[data-s="${n}"]`);
    const tl = (this.reel = gsap.timeline());
    const cut = (n: number, at: number, spill: string) => {
      tl.set(f.querySelectorAll("[data-s]"), { opacity: 0 }, at).set(scene(n), { opacity: 1 }, at)
        .to(this.spill, { attr: { fill: spill }, opacity: 0.16, duration: 0.3 }, at);
    };
    // 0: countdown leader
    cut(0, 0, "#c9cbd4");
    tl.to($("[data-sweep] path"), { rotation: 360, svgOrigin: "0 0", duration: 1, repeat: 2, ease: "none" }, 0);
    ["2", "1"].forEach((n, i) => tl.call(() => { $("[data-count]").textContent = n; }, [], i + 1));
    // 1: studio logo
    cut(1, 3, "#ffd27a");
    tl.to($("[data-gear]"), { rotation: 90, svgOrigin: `${FW / 2} 70`, duration: 3, ease: "power1.inOut" }, 3)
      .fromTo($$("[data-beam]"), { opacity: 0 }, { opacity: 0.1, duration: 1, yoyo: true, repeat: 1 }, 3);
    // 2: in a world... a bug rises behind the city
    cut(2, 6, "#8a6bd6");
    tl.to($("[data-s='2'] [data-cape]"), { scaleX: 0.7, transformOrigin: "100% 50%", duration: 0.3, yoyo: true, repeat: 15, ease: "sine.inOut" }, 6)
      .to($("[data-cap1]"), { opacity: 0, duration: 0.3 }, 9.6)
      .to($("[data-bug]"), { y: FH - 30, duration: 2.2, ease: "power2.out" }, 9.4)
      .to($("[data-cap2]"), { opacity: 1, duration: 0.3 }, 10)
      .call(() => beat("gasp"), [], 10.4)
      .to(scene(2), { x: 3, duration: 0.05, yoyo: true, repeat: 9 }, 10.6);
    // 3: the chase
    cut(3, 13, "#ff9f5a");
    tl.to($("[data-far]"), { x: -396, duration: 6, ease: "none" }, 13)
      .to($("[data-near]"), { x: -396, duration: 3.4, ease: "none", repeat: 1 }, 13)
      .to($("[data-runner]"), { y: -4, duration: 0.14, yoyo: true, repeat: 41, ease: "sine.inOut" }, 13)
      .to($("[data-chaser]"), { x: 30, duration: 0.5, yoyo: true, repeat: 11, ease: "sine.inOut" }, 13)
      .fromTo($("[data-boom]"), { opacity: 1, scale: 0.2, transformOrigin: "50% 50%" }, { scale: 1.8, opacity: 0, duration: 0.6, ease: "power2.out" }, 15)
      .fromTo($("[data-boom]"), { opacity: 1, scale: 0.2, x: -80 }, { scale: 1.6, opacity: 0, duration: 0.6, ease: "power2.out" }, 17);
    // 4: have you tried turning it off and on again?
    cut(4, 19, "#4ff0a0");
    tl.to($("[data-hero2]"), { x: 110, duration: 1.2, ease: "power2.inOut" }, 19.3)
      .to($("[data-power]"), { opacity: 1, duration: 0.2 }, 20.4)
      .to($("[data-power]"), { scale: 0.85, transformOrigin: "50% 50%", duration: 0.1, yoyo: true, repeat: 1 }, 21)
      .to($$("[data-s='4'] [data-eye]"), { attr: { fill: "#3a3f4f" }, duration: 0.15 }, 21.2)
      .to($("[data-bug2]"), { y: 8, duration: 0.6, ease: "power2.out" }, 21.2)
      .to($("[data-hero2]"), { x: 80, duration: 0.6, ease: "power2.out" }, 22)
      .to($$("[data-s='4'] [data-eye]"), { attr: { fill: "#ffd23f" }, duration: 0.1, repeat: 3, yoyo: true }, 23.2)
      .to($("[data-bug2]"), { scale: 1.4, y: 0, svgOrigin: "0 60", duration: 0.5, ease: "back.out(3)" }, 23.6)
      .to($("[data-ver]"), { opacity: 1, duration: 0.2 }, 23.8)
      .call(() => beat("laugh"), [], 24)
      .to($("[data-hero2]"), { x: -160, duration: 0.5, ease: "power3.in" }, 24.6);
    // 5: romance with a toaster
    cut(5, 26, "#ff8fb0");
    tl.to($$("[data-toast]"), { y: -14, duration: 0.25, ease: "power2.out", yoyo: true, repeat: 1, stagger: 0.08 }, 27)
      .fromTo($$("[data-hearts] path"), { opacity: 1, y: 0 }, { y: -50, opacity: 0, duration: 1.8, stagger: 0.35, ease: "sine.out" }, 27.6)
      .to($("[data-hero3]"), { x: 18, duration: 1.2, ease: "power1.inOut" }, 27.4)
      .call(() => beat("aww"), [], 28);
    // 6: jump scare
    cut(6, 31, "#000000");
    tl.fromTo($("[data-face]"), { scale: 0.4, svgOrigin: `${FW / 2} ${FH / 2 + 20}` }, { scale: 1.7, duration: 0.18, ease: "power4.out" }, 31.5)
      .call(() => beat("scare"), [], 31.55)
      .to(scene(6), { x: 4, duration: 0.04, yoyo: true, repeat: 13 }, 31.6)
      .to(this.spill, { attr: { fill: "#ff3b3b" }, opacity: 0.3, duration: 0.1 }, 31.5);
    // 7: title card
    cut(7, 33.5, "#ffd23f");
    tl.from($$("[data-s='7'] text"), { opacity: 0, y: 8, duration: 0.5, stagger: 0.5, ease: "power2.out" }, 33.6);
    // 8: credits
    cut(8, 38, "#ffffff");
    tl.call(() => beat("credits"), [], 38.2)
      .fromTo($("[data-roll]"), { y: FH + 10 }, { y: -110, duration: 8, ease: "none" }, 38)
      .to(f, { opacity: 0, duration: 0.6 }, 46.4)
      .set(f, { opacity: 1 });
    const finished = this.anims.run(tl);
    this.visibility();
    return finished;
  }

  destroy() {
    this.dead = true;
    document.removeEventListener('visibilitychange', this.visibility);
    this.screenTransition?.kill();
    this.screenControl.destroy(); this.popcornControl.destroy();
    this.anims.kill();
    gsap.killTweensOf([this.cloth, this.dim, this.spill, this.lens, this.warm, ...this.kernels, ...this.dust]);
    this.dim.remove();
  }
}
