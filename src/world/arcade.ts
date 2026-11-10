import gsap from "gsap";
import { PALETTES, uid, type BrandKind } from "../robot/art/walker-head";
import { reducedMotion, type Pt, type RoomStage } from "./room";
import { MediaAnimations, RoomMediaControl } from './room-controls';
import { gameSound, type GameCue } from '../office/sound';

// The game corner: a TV on a low cabinet against the north wall, a console next to it and a
// small couch facing the TV (seen from behind, so the players' backs are toward us). The TV
// runs two tiny games that really play out: a fighting game and a split-screen kart race.
// They report hits, overtakes and the winner so the robots on the couch can react.

export type GameEvent = { type: "hit" | "big" | "overtake" | "spin" | "boost"; by: 0 | 1 };

const SW = 152, SH = 86;   // screen
const NS = "http://www.w3.org/2000/svg";

export class Arcade {
  readonly el: HTMLElement;
  onPowerChange: (powered: boolean) => void = () => {};
  readonly seats: [Pt, Pt];
  readonly watch: Pt;
  private screen: SVGGElement;
  private glow: SVGElement;
  private led: SVGElement;
  private anims = new MediaAnimations();
  private powerControl: RoomMediaControl;
  private powerTransition: gsap.core.Timeline | null = null;
  private power = true;
  private playing = false;
  private id = uid("ar");

  constructor(stage: RoomStage, readonly cx: number, wallY: number) {
    const x0 = cx - 100;
    this.seats = [{ x: cx - 40, y: wallY + 242 }, { x: cx + 40, y: wallY + 242 }];
    this.watch = { x: cx + 148, y: wallY + 236 };
    const tv = stage.prop(x0, wallY - 80, 200, 164, wallY + 74, /* svg */ `
      <defs><clipPath id="${this.id}-c"><rect x="24" y="10" width="${SW}" height="${SH}" rx="3"/></clipPath></defs>
      <ellipse data-a="glow" cx="100" cy="54" rx="112" ry="60" fill="#7cc8ff" opacity="0"/>
      <ellipse cx="100" cy="160" rx="100" ry="6" fill="#2b1d10" opacity="0.18"/>
      <rect x="6" y="150" width="8" height="10" rx="2" fill="#4a3627"/><rect x="186" y="150" width="8" height="10" rx="2" fill="#4a3627"/>
      <rect x="0" y="118" width="200" height="36" rx="6" fill="#6b4f3a"/>
      <rect x="6" y="124" width="92" height="24" rx="4" fill="#7d5d45"/><rect x="102" y="124" width="92" height="24" rx="4" fill="#7d5d45"/>
      <rect x="44" y="134" width="14" height="3" rx="1.5" fill="#4a3627"/><rect x="142" y="134" width="14" height="3" rx="1.5" fill="#4a3627"/>
      <rect x="0" y="106" width="200" height="16" rx="5" fill="#8f6a4a"/>
      <rect x="4" y="108" width="192" height="3" rx="1.5" fill="#fff" opacity="0.15"/>
      <rect x="72" y="100" width="56" height="8" rx="3" fill="#262a36"/><rect x="92" y="94" width="16" height="10" fill="#262a36"/>
      <rect x="18" y="4" width="164" height="98" rx="7" fill="#1b1f2e"/>
      <rect x="22" y="8" width="156" height="90" rx="5" fill="#10142c"/>
      <g clip-path="url(#${this.id}-c)"><g data-a="screen"></g></g>
      <rect x="28" y="12" width="60" height="3" rx="1.5" fill="#fff" opacity="0.08"/>
      <rect x="140" y="98" width="46" height="12" rx="4" fill="#e9edf3"/><rect x="140" y="98" width="46" height="4" rx="2" fill="#ffffff"/>
      <circle data-a="led" cx="178" cy="105" r="2" fill="#ff6f91"/>
      <rect x="146" y="104" width="18" height="2" rx="1" fill="#c9d0dc"/>`);
    this.screen = tv.querySelector('[data-a="screen"]') as SVGGElement;
    this.el = tv.parentElement as unknown as HTMLElement;
    this.el.dataset.roomMedia = 'tv';
    this.glow = tv.querySelector('[data-a="glow"]') as SVGElement;
    this.led = tv.querySelector('[data-a="led"]') as SVGElement;
    this.powerControl = new RoomMediaControl(stage.layer, 'tv-power', { x: x0 + 18, y: wallY - 76, w: 164, h: 98 }, () => this.setPowered(!this.power, true));
    // the couch: seat and armrests behind the players, the backrest in front of them
    const cw = 214, cy0 = this.seats[0].y - 44;
    stage.prop(cx - cw / 2, cy0, cw, 50, this.seats[0].y - 12, /* svg */ `
      <rect x="22" y="6" width="${cw - 44}" height="40" rx="10" fill="#2f746c"/>
      <rect x="28" y="10" width="${(cw - 62) / 2}" height="28" rx="8" fill="#3c8f86"/><rect x="${34 + (cw - 62) / 2}" y="10" width="${(cw - 62) / 2}" height="28" rx="8" fill="#3c8f86"/>`);
    stage.prop(cx - cw / 2, cy0, cw, 82, this.seats[0].y + 20, /* svg */ `
      <ellipse cx="${cw / 2}" cy="76" rx="${cw / 2 - 4}" ry="6" fill="#2b1d10" opacity="0.18"/>
      <rect x="0" y="4" width="32" height="70" rx="13" fill="#2f746c"/><rect x="${cw - 32}" y="4" width="32" height="70" rx="13" fill="#2f746c"/>
      <rect x="4" y="6" width="22" height="9" rx="4.5" fill="#46a69b"/><rect x="${cw - 26}" y="6" width="22" height="9" rx="4.5" fill="#46a69b"/>
      <rect x="10" y="38" width="${cw - 20}" height="36" rx="14" fill="#3c8f86"/>
      <rect x="18" y="41" width="${cw - 36}" height="7" rx="3.5" fill="#55b3a7"/>
      <rect x="${cw / 2 - 1}" y="44" width="2" height="26" rx="1" fill="#2f746c" opacity="0.6"/>`);
    this.standby();
  }

  get powered() { return this.power; }
  get isPlaying() { return this.playing; }
  /** Which game the TV is showing, for its soundtrack. */
  get game() { return this.playing ? this.mode : null; }
  private mode: 'boot' | 'fight' | 'race' = 'boot';
  /** Game events sound from the TV itself, whoever is playing. */
  private sounding(ev: (e: GameEvent) => void) {
    const cues: Record<GameEvent['type'], GameCue> = { hit: 'fight-hit', big: 'fight-big', boost: 'kart-boost', spin: 'kart-spin', overtake: 'kart-pass' };
    return (e: GameEvent) => { if (this.power) gameSound.at(cues[e.type], this.el, e.type === 'big' ? 1 : .8); ev(e); };
  }
  private syncPower() {
    this.el.dataset.powered = String(this.power);
    this.el.dataset.playing = String(this.playing && this.power);
    this.powerControl.state(this.power ? 'Turn TV off' : 'Turn TV on', this.power);
    this.glow.style.visibility = this.power ? '' : 'hidden';
    this.led.setAttribute('fill', !this.power || !this.playing ? '#ff6f91' : '#4ff0a0');
  }
  setPowered(powered: boolean, byUser = false) {
    if (powered === this.power) return;
    this.power = powered;
    this.anims.setPaused(!powered);
    this.syncPower();
    this.powerTransition?.kill();
    const duration = reducedMotion() || document.hidden ? 0 : .18;
    this.powerTransition = gsap.timeline().to(this.screen, { opacity: powered ? 1 : 0, scaleY: powered ? 1 : .015, transformOrigin: '50% 50%', duration, ease: powered ? 'power2.out' : 'power2.in', overwrite: 'auto' });
    if (byUser) { gameSound.at('switch', this.el); this.onPowerChange(powered); }
  }

  private node(tag: string, attrs: Record<string, string | number>, parent: Element = this.screen) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    parent.appendChild(e);
    return e as SVGElement;
  }

  /** Screen off: dark glass, the console's light on standby. */
  standby() {
    this.playing = false;
    this.anims.kill();
    this.screen.innerHTML = "";
    this.node("rect", { x: 24, y: 10, width: SW, height: SH, fill: "#10142c" });
    gsap.set(this.glow, { opacity: 0 });
    this.led.setAttribute("fill", "#ff6f91");
    this.syncPower();
  }

  /** Keep the TV's fixed inset outside the transforms used by game effects. */
  private scene() {
    const viewport = this.node("g", { transform: "translate(24 10)" });
    return this.node("g", {}, viewport);
  }

  /** Console boots: a start-up logo sweeps in. */
  async boot() {
    this.playing = true; this.mode = 'boot';
    this.syncPower();
    this.screen.innerHTML = "";
    const g = this.scene();
    this.node("rect", { width: SW, height: SH, fill: "#f6f2ea" }, g);
    const logo = this.node("g", { transform: `translate(${SW / 2} ${SH / 2})` }, g);
    this.node("rect", { x: -18, y: -12, width: 36, height: 24, rx: 9, fill: "#3a3f4f" }, logo);
    this.node("circle", { cx: -8, cy: 0, r: 4, fill: "#ff6f91" }, logo);
    this.node("circle", { cx: 8, cy: 0, r: 4, fill: "#4fb6ff" }, logo);
    gsap.set(this.glow, { opacity: 0.14, fill: "#ffffff" });
    await this.anims.run(gsap.timeline().from(logo, { scale: 0.2, opacity: 0, rotation: -40, duration: 0.6, ease: "back.out(2)" }).to(logo, { opacity: 0, duration: 0.3 }, "+=0.7"));
  }

  private label(text: string, x: number, y: number, size: number, fill: string, parent: Element) {
    const t = this.node("text", { x, y, "text-anchor": "middle", "font-family": "var(--mono)", "font-size": size, "font-weight": 700, fill }, parent);
    t.textContent = text;
    return t;
  }

  private sleep(sec: number) { return this.anims.run(gsap.to({}, { duration: sec })); }

  // ---- fighting game ---------------------------------------------------------------------------
  private fighter(parent: Element, brand: BrandKind, x: number, dir: 1 | -1) {
    const p = PALETTES[brand];
    const g = this.node("g", {}, parent);
    gsap.set(g, { x, y: 74 });
    const flip = this.node("g", { transform: `scale(${dir} 1)` }, g);
    const body = this.node("g", {}, flip);
    body.innerHTML = `
      <ellipse cx="0" cy="0.5" rx="9" ry="2" fill="#000" opacity="0.25"/>
      <rect x="-5" y="-9" width="4" height="9" rx="2" fill="${p.deep}"/><rect x="1.5" y="-9" width="4" height="9" rx="2" fill="${p.deep}"/>
      <rect x="-7" y="-21" width="14" height="13" rx="4" fill="${p.shell}"/><rect x="-7" y="-14" width="14" height="6" rx="3" fill="${p.shade}"/>
      <rect x="-1" y="-38" width="2" height="5" fill="${p.deep}"/><circle cx="0" cy="-38.5" r="2" fill="${p.glow}"/>
      <rect x="-8" y="-34" width="16" height="13" rx="5" fill="${p.shell}"/>
      <rect x="-4" y="-31" width="11" height="7" rx="3" fill="${p.visor}"/><rect x="2" y="-29.5" width="2.4" height="4" rx="1" fill="${p.glow}"/>`;
    const arm = this.node("g", {}, body);
    arm.innerHTML = `<rect x="-2" y="-19" width="11" height="4" rx="2" fill="${p.deep}"/><circle cx="9" cy="-17" r="3.2" fill="${p.shade}"/>`;
    const flash = this.node("rect", { x: -9, y: -40, width: 18, height: 40, rx: 5, fill: "#fff", opacity: 0 }, flip);
    const bob = this.anims.add(gsap.to(body, { y: -1.2, duration: 0.28, yoyo: true, repeat: -1, ease: "sine.inOut" }));
    return { g, body, arm, flash, x, dir, glow: p.glow, bob };
  }

  /** A fighting game round. Resolves with the winning player (0 left, 1 right). */
  async fight(brands: [BrandKind, BrandKind], ev: (e: GameEvent) => void): Promise<0 | 1> {
    this.mode = 'fight'; ev = this.sounding(ev);
    this.screen.innerHTML = "";
    gsap.set(this.glow, { opacity: 0.16, fill: "#ff9f5a" });
    const g = this.scene();
    g.innerHTML = `
      <defs><linearGradient id="${this.id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9f5a"/><stop offset="1" stop-color="#ff6f91"/></linearGradient></defs>
      <rect width="${SW}" height="${SH}" fill="url(#${this.id}-sky)"/>
      <circle cx="${SW / 2}" cy="52" r="20" fill="#ffd27a" opacity="0.8"/>
      <path d="M0 64 L18 46 L34 58 L56 38 L80 60 L100 44 L124 58 L140 48 L152 56 L152 74 L0 74 Z" fill="#c4577a"/>
      <rect y="72" width="${SW}" height="14" fill="#3a3f4f"/><rect y="72" width="${SW}" height="2" fill="#5a6177"/>`;
    const hud = this.node("g", {}, g);
    const bars = [0, 1].map((i) => {
      this.node("rect", { x: i ? 84 : 8, y: 6, width: 60, height: 6, rx: 2, fill: "#10142c" }, hud);
      return this.node("rect", { x: i ? 85 : 9, y: 7, width: 58, height: 4, rx: 1.5, fill: PALETTES[brands[i]].glow }, hud);
    });
    const clock = this.label("60", SW / 2, 12, 7, "#ffffff", hud);
    const f = [this.fighter(g, brands[0], 46, 1), this.fighter(g, brands[1], 106, -1)];
    const fx = this.node("g", {}, g);
    const hp = [1, 1];
    let time = 60;
    this.anims.add(gsap.to({}, { duration: 0.4, repeat: -1, onRepeat: () => { time = Math.max(0, time - 1); clock.textContent = String(time); } }));
    const bias = 0.35 + Math.random() * 0.3;
    const spark = (x: number, y: number, color: string, big: boolean) => {
      const s = this.node("path", { d: "M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z", fill: color, transform: `translate(${x} ${y})` }, fx);
      this.anims.add(gsap.fromTo(s, { scale: 0.3, transformOrigin: "50% 50%" }, { scale: big ? 2.4 : 1.5, opacity: 0, rotation: 45, duration: 0.35, ease: "power2.out", onComplete: () => s.remove() }));
    };
    const setX = (k: 0 | 1, x: number, d: number) => { f[k].x = x; return gsap.to(f[k].g, { x, duration: d, ease: "power2.inOut" }); };
    await this.sleep(0.5);
    while (hp[0] > 0 && hp[1] > 0) {
      const a: 0 | 1 = Math.random() < bias ? 0 : 1, d: 0 | 1 = a ? 0 : 1;
      const A = f[a], Dd = f[d];
      const roll = Math.random();
      const special = roll < 0.16, block = !special && Math.random() < 0.22;
      if (special) {
        // charge up, then an energy ball across the screen
        const ball = this.node("circle", { cx: A.x + A.dir * 10, cy: 57, r: 2, fill: A.glow }, fx);
        await this.anims.run(gsap.timeline().to(A.body, { y: 2, duration: 0.25 }).to(ball, { attr: { r: 5 }, duration: 0.35 }, 0).to(A.body, { y: 0, duration: 0.1 }));
        await this.anims.run(gsap.to(ball, { attr: { cx: Dd.x }, duration: 0.35, ease: "power1.in" }));
        ball.remove();
        hp[d] = Math.max(0, hp[d] - (0.26 + Math.random() * 0.12));
        spark(Dd.x, 55, "#ffffff", true);
        this.anims.add(gsap.fromTo(Dd.flash, { opacity: 0.9 }, { opacity: 0, duration: 0.3 }));
        this.anims.add(gsap.fromTo(g, { x: -2 }, { x: 0, duration: 0.3, ease: "elastic.out(3, 0.3)" }));
        ev({ type: "big", by: a });
      } else {
        const gap = 22;
        await this.anims.run(setX(a, Dd.x - A.dir * gap, 0.22));
        const hits = roll < 0.45 ? 3 : 1;
        for (let i = 0; i < hits && hp[d] > 0; i++) {
          await this.anims.run(gsap.timeline().to(A.arm, { x: 6, duration: 0.06, ease: "power3.out" }).to(A.arm, { x: 0, duration: 0.1 }));
          if (block) { spark(Dd.x - Dd.dir * -6, 56, "#9fe8ff", false); this.anims.add(gsap.fromTo(Dd.g, { x: Dd.x }, { x: Dd.x + A.dir * 2, duration: 0.1, yoyo: true, repeat: 1 })); continue; }
          hp[d] = Math.max(0, hp[d] - (0.06 + Math.random() * 0.06));
          spark(Dd.x - A.dir * 4, 55, "#ffd23f", false);
          this.anims.add(gsap.fromTo(Dd.flash, { opacity: 0.8 }, { opacity: 0, duration: 0.18 }));
          await this.anims.run(setX(d, Math.max(14, Math.min(SW - 14, Dd.x + A.dir * 4)), 0.08));
          ev({ type: "hit", by: a });
        }
        await this.anims.run(setX(a, a ? Math.min(SW - 14, Dd.x + 46) : Math.max(14, Dd.x - 46), 0.3));
      }
      bars.forEach((b, i) => {
        const w = 58 * hp[i];
        this.anims.add(gsap.to(b, { attr: { width: w, x: i ? 85 + 58 - w : 9 }, duration: 0.3 }));
      });
      await this.sleep(0.25 + Math.random() * 0.4);
    }
    const winner: 0 | 1 = hp[0] > 0 ? 0 : 1, loser = winner ? 0 : 1;
    // K.O.: the loser falls over, the winner jumps
    f[loser].bob.kill();
    await this.anims.run(gsap.to(f[loser].body, { rotation: -90, svgOrigin: "0 0", y: 0, duration: 0.45, ease: "bounce.out" }));
    const ko = this.label("K.O.", SW / 2, 44, 16, "#ffffff", g);
    this.anims.add(gsap.from(ko, { scale: 3, opacity: 0, transformOrigin: "50% 50%", duration: 0.35, ease: "back.out(2)" }));
    this.anims.add(gsap.to(f[winner].body, { y: -10, duration: 0.2, yoyo: true, repeat: 5, ease: "power2.out" }));
    await this.sleep(1.4);
    return winner;
  }

  // ---- kart race ---------------------------------------------------------------------------------
  /** A split-screen kart race. Resolves with the winning player (0 top, 1 bottom). */
  async race(brands: [BrandKind, BrandKind], ev: (e: GameEvent) => void): Promise<0 | 1> {
    this.mode = 'race'; ev = this.sounding(ev);
    this.screen.innerHTML = "";
    gsap.set(this.glow, { opacity: 0.16, fill: "#7cc8ff" });
    const g = this.scene();
    const H = 42;
    const halves = [0, 1].map((i) => {
      const h = this.node("g", { transform: `translate(0 ${i * (H + 2)})` }, g);
      const pal = PALETTES[brands[i]];
      h.innerHTML = `
        <rect width="${SW}" height="14" fill="${i ? "#ffb98a" : "#7cc8ff"}"/>
        <ellipse cx="40" cy="15" rx="44" ry="7" fill="#53b884"/><ellipse cx="118" cy="15" rx="40" ry="6" fill="#46a877"/>
        <rect y="14" width="${SW}" height="${H - 14}" fill="#3f9b6e"/>
        <path d="M66 14 L86 14 L146 ${H} L6 ${H} Z" fill="#5a6177"/>
        <path d="M66 14 L68 14 L12 ${H} L6 ${H} Z M84 14 L86 14 L146 ${H} L140 ${H} Z" fill="#f6f2ea" opacity="0.8"/>`;
      const dash = this.node("path", { d: `M76 14 L76 ${H}`, stroke: "#ffffff", "stroke-width": 1.6, "stroke-dasharray": "3 4", opacity: 0.85 }, h);
      const trees = [0, 1, 2, 3].map((k) => this.node("circle", { cx: k % 2 ? 90 : 62, cy: 15, r: 0.8, fill: k % 2 ? "#2f7a55" : "#3a8f63" }, h));
      const kart = this.node("g", { transform: `translate(76 ${H - 6})` }, h);
      kart.innerHTML = `
        <rect x="-11" y="-2" width="5" height="6" rx="2" fill="#1b1f2e"/><rect x="6" y="-2" width="5" height="6" rx="2" fill="#1b1f2e"/>
        <rect x="-9" y="-6" width="18" height="8" rx="3" fill="${pal.glow}"/><rect x="-6" y="-12" width="12" height="9" rx="4" fill="${pal.shell}"/>
        <rect x="-1" y="-15" width="2" height="4" fill="${pal.deep}"/>`;
      const flag = this.node("g", { opacity: 0 }, h);
      for (let k = 0; k < 10; k++) this.node("rect", { x: 6 + k * 14, y: H - 8, width: 7, height: 4, fill: k % 2 ? "#ffffff" : "#1b1f2e" }, flag);
      const place = this.label("1", SW - 10, 10, 7, "#2d3142", h);
      return { h, dash, trees, kart, flag, place };
    });
    // the minimap between the halves
    this.node("rect", { y: H, width: SW, height: 2, fill: "#10142c" }, g);
    const dots = [0, 1].map((i) => this.node("circle", { cx: 6, cy: H + 1, r: 1.6, fill: PALETTES[brands[i]].glow }, g));
    const reduced = reducedMotion();
    // scenery streams by; it follows each kart's speed
    const speed = [1, 1], prog = [0, 0];
    const flows = halves.map((hv) => [
      gsap.fromTo(hv.dash, { attr: { "stroke-dashoffset": 0 } }, { attr: { "stroke-dashoffset": -14 }, duration: 0.25, ease: "none", repeat: -1 }),
      ...hv.trees.map((t, k) => {
        const left = k % 2 === 0;
        return gsap.fromTo(t, { attr: { cx: left ? 62 : 90, cy: 15, r: 0.8 } }, { attr: { cx: left ? -8 : SW + 8, cy: H + 4, r: 5 }, duration: 1, ease: "power2.in", repeat: -1, delay: k * 0.25 });
      }),
    ].map((t) => this.anims.add(t)));
    const pace = (i: number, v: number) => { for (const t of flows[i]) t.timeScale(v * (reduced ? 0.4 : 1)); };
    const skill = [0.8 + Math.random() * 0.4, 0.8 + Math.random() * 0.4];
    let leader = -1;
    const spin = [0, 0], rot = [{ r: 0 }, { r: 0 }];
    await new Promise<void>((done) => {
      const t0 = { t: 0 };
      let last = 0;
      const tick: gsap.core.Tween = this.anims.add(gsap.to(t0, {
        t: 90, duration: 90, ease: "none",
        onUpdate: () => {
          const dt = t0.t - last; last = t0.t;
          for (const i of [0, 1]) {
            if (spin[i] > 0) { spin[i] -= dt; speed[i] = 0.25; }
            else speed[i] += ((skill[i] * (0.9 + Math.random() * 0.25)) - speed[i]) * Math.min(1, dt * 2);
            prog[i] = Math.min(1, prog[i] + speed[i] * dt / 15);
            pace(i, Math.max(0.15, speed[i]));
            dots[i].setAttribute("cx", (6 + prog[i] * (SW - 12)).toFixed(1));
            // random race events
            if (spin[i] <= 0 && Math.random() < dt * 0.09) {
              spin[i] = 1.1;
              this.anims.add(gsap.fromTo(rot[i], { r: 0 }, { r: 360, duration: 0.9, ease: "power2.out" }));
              ev({ type: "spin", by: i as 0 | 1 });
            } else if (spin[i] <= 0 && Math.random() < dt * 0.07) {
              skill[i] += 0.12;
              ev({ type: "boost", by: i as 0 | 1 });
            }
          }
          const lead = prog[0] >= prog[1] ? 0 : 1;
          if (lead !== leader) {
            if (leader !== -1) ev({ type: "overtake", by: lead as 0 | 1 });
            leader = lead;
            halves[0].place.textContent = lead === 0 ? "1" : "2";
            halves[1].place.textContent = lead === 1 ? "1" : "2";
          }
          for (const i of [0, 1]) {
            const sway = Math.sin(t0.t * (1.3 + i * 0.4)) * 8;
            halves[i].kart.setAttribute("transform", `translate(${(76 + sway).toFixed(1)} ${H - 6}) rotate(${rot[i].r.toFixed(1)} 0 -4)`);
          }
          if (prog[0] >= 1 || prog[1] >= 1) { tick.kill(); done(); }
        },
      }));
    });
    const winner: 0 | 1 = prog[0] >= prog[1] ? 0 : 1;
    pace(0, 0.2); pace(1, 0.2);
    halves[winner].flag.setAttribute("opacity", "1");
    this.anims.add(gsap.from(halves[winner].flag, { y: -24, duration: 0.5, ease: "power2.out" }));
    const win = this.label("WIN", SW / 2, winner * (H + 2) + 28, 12, "#ffffff", g);
    this.anims.add(gsap.from(win, { scale: 2.5, opacity: 0, transformOrigin: "50% 50%", duration: 0.35, ease: "back.out(2)" }));
    await this.sleep(1.6);
    return winner;
  }

  destroy() { this.powerTransition?.kill(); this.anims.destroy(); this.powerControl.destroy(); }
}
