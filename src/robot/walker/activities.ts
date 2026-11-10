// What a walking robot does where it stands or sits: talking, laughing, eating, sipping, charging,
// napping, waving, waiting, holding a card, games and films. Each activity tweens the body's
// state and loops small gestures until the next activity replaces it.
import gsap from "gsap";
import { pick, rnd } from "../../util/random";
import { reducedMotion as reduced } from "../../util/dom";
import { H, HIP_HAND, BOWL, SCOOP, MOUTH, MUG, SIP, CHIN, CROSS_L, CROSS_R, READY_R, READY_L, PAD, PAD_SIT, INTO_POP, KEYS, SEATABLE, type Activity, type Hand, type Prop } from "./skeleton";
import { TL, WalkerBody } from "./body";

export abstract class WalkerActivities extends WalkerBody {
  // ---- activities ---------------------------------------------------------------------------
  calm() {
    this.activity = "idle";
    this.clearAct();
    gsap.to(this.st, {
      lu: 0, ru: 0, lak: 0, rak: 0, nod: 0, tilt: 0, shrug: 0, sit: 0, roll: 0, sway: 0, bx: 0, crouch: 0, bounce: 0, laugh: 0, chew: 0, mash: 0, wave: 0, tap: 0, kick: 0,
      look: 0, lookY: 0, dim: 0, deep: 0, glowPulse: 0, duration: 0.3, ease: "power2.out", overwrite: "auto",
    });
    this.antennaDroop(false);
    if (this.expr === "sleepy" || this.expr === "laugh") this.setExpression("neutral");
  }

  /** Put things in its hands (kept while walking). */
  hold(l: Prop, r: Prop) {
    this.setProps(l, r);
    if (this.activity === "idle") gsap.to(this.st, { lu: 0, ru: 0, duration: 0.3, ease: "power2.out", overwrite: "auto" });
  }

  /** `seated` keeps the robot sitting (laughing on a couch, thinking at a chess table). */
  do(activity: Activity, opts: { card?: string; keep?: boolean; seated?: boolean; quota?: boolean } = {}) {
    this.activity = activity;
    this.clearAct();
    if (!opts.keep) this.setProps("none", "none");
    const st = this.st;
    const seated = !!opts.seated || activity === "watch" || activity === "nap" || activity === "sit" || activity === "type";
    const sit = seated ? 1 : SEATABLE.has(activity) ? st.sit : 0;
    const base = { lu: 0, ru: 0, lak: 0, rak: 0, nod: 0, tilt: 0, shrug: 0, roll: 0, sway: 0, bx: 0, crouch: 0, bounce: 0, laugh: 0, chew: 0, mash: 0, wave: 0, tap: 0, kick: 0, look: 0, lookY: 0, deep: 0, glowPulse: 0 };
    const to = (v: Record<string, number>, d = 0.45, ease = "power2.inOut") => gsap.to(st, { ...v, duration: d, ease, overwrite: "auto" });
    const loop = (fn: () => gsap.core.Animation | void, every: () => number, first = rnd(0.3, 0.9)) => {
      const tick = () => {
        if (this.activity !== activity) return;
        const a = fn();
        if (a) { this.actAnims.add(a); a.eventCallback("onComplete", () => this.actAnims.delete(a)); }
        this.actTimers.push(gsap.delayedCall(every(), tick));
      };
      this.actTimers.push(gsap.delayedCall(first, tick));
    };
    const arm = (k: "l" | "r", p: Hand, u = 1) => ({ [k + "x"]: p.x, [k + "y"]: p.y, [k + "z"]: p.z, [k + "r"]: p.r ?? 0, [k + "u"]: u });
    gsap.killTweensOf(st, "lean");
    // the reset never overrides anything; the activity's own tweens below take over what they animate
    gsap.to(st, { ...base, sit, lean: 0, dim: 0, duration: 0.45, ease: "power2.inOut", overwrite: false });
    this.antennaDroop(false);
    if (activity !== "laugh" && activity !== "nap" && (this.expr === "laugh" || this.expr === "sleepy")) this.setExpression("neutral");
    if (activity !== "sulk" && activity !== "cheer" && (this.expr === "angry" || this.expr === "happy")) this.setExpression("neutral");
    const seatedNow = () => st.sit > 0.5 || sit > 0.5;

    switch (activity) {
      case "idle":
        break;
      case "talk": {
        // a gesture on every phrase: open palm, both hands out, a point, a beat
        const gesture = () => {
          const r = Math.random(), k = Math.random() < 0.6 ? "r" : "l", o = k === "r" ? "l" : "r";
          const low = seatedNow() ? 12 : 0;
          const tl = TL();
          if (r < 0.35) tl.to(st, { ...arm(k, H(22, 10 + low, 40, -20)), nod: 3, tilt: k === "r" ? -4 : 4, duration: 0.32, ease: "back.out(1.7)" })
            .to(st, { [k + "y"]: 22 + low, nod: 0, duration: 0.26, ease: "sine.inOut", yoyo: true, repeat: 1 })
            .to(st, { [k + "u"]: 0, tilt: 0, duration: 0.45, ease: "power2.inOut" }, "+=0.15");
          else if (r < 0.55) tl.to(st, { ...arm("l", H(34, 18 + low, 30)), ...arm("r", H(34, 18 + low, 30)), shrug: 4, tilt: pick([-5, 5]), duration: 0.35, ease: "back.out(1.6)" })
            .to(st, { lu: 0, ru: 0, shrug: 0, tilt: 0, duration: 0.5, ease: "power2.inOut" }, "+=0.5");
          else if (r < 0.75) tl.to(st, { ...arm(k, H(-8, -4 + low, 56)), nod: -2, duration: 0.24, ease: "power3.out" })
            .to(st, { [k + "z"]: 44, duration: 0.12, yoyo: true, repeat: 3, ease: "sine.inOut" })
            .to(st, { [k + "u"]: 0, nod: 0, duration: 0.4, ease: "power2.inOut" });
          else tl.to(st, { ...arm(k, H(10, 20 + low, 40, 10)), [o + "u"]: 0, duration: 0.22, ease: "power2.out" })
            .to(st, { [k + "y"]: 36 + low, nod: 4, duration: 0.1, ease: "power2.in", yoyo: true, repeat: 3 })
            .to(st, { [k + "u"]: 0, nod: 0, duration: 0.4, ease: "power2.inOut" });
          return tl;
        };
        loop(gesture, () => rnd(1.2, 2));
        break;
      }
      case "explain": {
        loop(() => {
          const k = Math.random() < 0.55 ? "r" : "l", o = k === "r" ? "l" : "r";
          return TL()
            .to(st, { ...arm(k, H(rnd(16, 34), rnd(-10, 14), 36, -30)), ...arm(o, H(-20, 40, 24), 0.8), nod: 3, roll: k === "r" ? 2 : -2, duration: 0.36, ease: "back.out(1.6)" })
            .to(st, { [k + "x"]: "-=14", [k + "z"]: "+=10", duration: 0.24, yoyo: true, repeat: 1, ease: "sine.inOut" })
            .to(st, { nod: 0, roll: 0, duration: 0.3 }, "<");
        }, () => rnd(0.9, 1.5));
        break;
      }
      case "listen":
        to({ tilt: 7, ...arm("r", HIP_HAND, seatedNow() ? 0 : 1), rak: 1 }, 0.6);
        loop(() => {
          if (Math.random() < 0.25) return TL().to(st, { look: pick([-0.7, 0.7]), tilt: -3, duration: 0.3 }).to(st, { look: 0, tilt: 7, duration: 0.5 }, "+=0.9");
          return TL().to(st, { nod: 6, duration: 0.16, ease: "sine.inOut", yoyo: true, repeat: 3 });
        }, () => rnd(1.3, 2.4));
        break;
      case "laugh":
        this.setExpression("laugh");
        this.act = TL()
          .to(st, { ...arm("l", H(-34, 60, 24)), ...arm("r", H(-34, 60, 24)), nod: -6, lean: -5, shrug: 3, laugh: 1, duration: 0.25, ease: "power2.out" })
          .to(st, { nod: 4, lean: 6, duration: 0.5, ease: "sine.inOut" }, "+=0.5")
          .to(st, { nod: -3, lean: -2, duration: 0.45, ease: "sine.inOut" })
          .to(st, { laugh: 0, shrug: 0, nod: 0, lean: 0, lu: 0, ru: 0, duration: 0.6, ease: "power2.out" }, "+=0.2");
        break;
      case "eat":
        this.setProps("bowl", "spoon");
        to({ ...arm("l", BOWL, 0), ...arm("r", SCOOP) }, 0.5);
        loop(() => this.bite(), () => rnd(2.3, 3.4), 0.7);
        break;
      case "drink":
        this.setProps("none", "mug");
        loop(() => this.sip(), () => rnd(3.2, 5), 1);
        break;
      case "charge":
        this.battery.classList.toggle("on", !opts.quota);
        to({ ...arm("l", H(12, 66, -12)), ...arm("r", H(12, 66, -12)), nod: 3, lookY: 0.4 }, 0.8);
        if (!opts.quota && this.remainingBattery === null) this.act = gsap.fromTo(this.battery.querySelector("i"), { scaleX: 0.15 }, { scaleX: 1, duration: 14, ease: "none", transformOrigin: "0 50%", repeat: -1, repeatDelay: 1 });
        if (!reduced()) this.actTimers.push(gsap.to(st, { glowPulse: 1, duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: -1 }) as unknown as gsap.core.Tween);
        loop(() => {
          // a little hum of energy now and then; glances up at the battery
          if (Math.random() < 0.5) return TL().to(st, { shrug: 3, duration: 0.08, yoyo: true, repeat: 3, ease: "sine.inOut" });
          return TL().to(st, { lookY: -1, nod: -3, duration: 0.5, ease: "sine.inOut" }).to(st, { lookY: 0.4, nod: 3, duration: 0.6, ease: "sine.inOut" }, "+=0.8");
        }, () => rnd(3, 5.5));
        break;
      case "nap":
        this.setExpression("sleepy");
        to({ sit: 1, ...arm("l", H(-26, 84, 30)), ...arm("r", H(-26, 84, 30)), tilt: 13, roll: 3, lean: -4, dim: 1, deep: 1 }, 1.4);
        this.antennaDroop(true);
        this.act = gsap.to(st, { nod: 6, duration: 2.3, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 1 });
        this.zTimer = window.setInterval(() => this.spawnZ(), 1700);
        this.spawnZ();
        break;
      case "wave":
        if (this.expr === "neutral") { this.setExpression("happy"); this.actTimers.push(gsap.delayedCall(2.2, () => this.expr === "happy" && this.setExpression("neutral"))); }
        this.act = TL()
          .to(st, { crouch: 0.3, ...arm("r", H(20, 10, 16), 0.4), duration: 0.12, ease: "power2.in" })
          .to(st, { crouch: 0, ...arm("r", H(22, -74, 10, 18)), roll: -3, tilt: -5, duration: 0.3, ease: "back.out(1.8)" })
          .to(st, { wave: 1, duration: 0.15 }, "<0.1")
          .to(st, { wave: 0, ru: 0, roll: 0, tilt: 0, duration: 0.45, ease: "power2.inOut" }, "+=1.2");
        break;
      case "wait":
        loop(() => {
          const r = Math.random();
          if (r < 0.28) { // check the wrist display
            this.setProps("wrist", this.propR);
            return TL().to(st, { ...arm("l", H(-36, 16, 30)), nod: 6, lookY: 1, tilt: 4, duration: 0.45, ease: "power2.inOut" })
              .to(st, { lu: 0, nod: 0, lookY: 0, tilt: 0, duration: 0.45, ease: "power2.inOut" }, "+=1.3")
              .add(() => { if (this.propL === "wrist") this.setProps("none", this.propR); });
          }
          if (r < 0.48) return TL().to(st, { ...arm("l", H(-12, 64, -18)), ...arm("r", H(-12, 64, -18)), sway: pick([-0.7, 0.7]), duration: 0.6, ease: "sine.inOut" })
            .to(st, { lu: 0, ru: 0, sway: 0, duration: 0.6, ease: "sine.inOut" }, "+=2.2");
          if (r < 0.72) { // sigh
            this.puff();
            return TL().to(st, { shrug: 7, nod: -3, duration: 0.6, ease: "sine.out" }).to(st, { shrug: -3, nod: 4, tilt: 5, duration: 0.8, ease: "sine.inOut" }).to(st, { shrug: 0, nod: 0, tilt: 0, duration: 0.6 });
          }
          return TL().to(st, { tap: 1, duration: 0.15 }).to(st, { tap: 0, duration: 0.2 }, "+=1.6");
        }, () => rnd(2.2, 4.2));
        break;
      case "hold-card":
        if (opts.card != null) this.setCard(opts.card);
        if (this.carryingReport) {
          to({ ...arm("r", H(20, 52, 30, -6)), ...arm("l", HIP_HAND), lak: 1 }, 0.4);
          break;
        }
        this.card.classList.add("on");
        to({ ...arm("r", H(16, -82, 6)), ...arm("l", HIP_HAND), lak: 1 }, 0.5);
        this.act = gsap.to(this.card, { y: -3, duration: 1.4, yoyo: true, repeat: -1, ease: "sine.inOut" });
        break;
      case "sit":
        to({ sit: 1 }, 0.6);
        loop(() => {
          const r = Math.random();
          if (r < 0.4) return TL().to(st, { look: pick([-1, 1]), tilt: pick([-4, 4]), duration: 0.5, ease: "sine.inOut" }).to(st, { look: 0, tilt: 0, duration: 0.7, ease: "sine.inOut" }, "+=1.4");
          if (r < 0.65) return TL().to(st, { kick: 1, duration: 0.3 }).to(st, { kick: 0, duration: 0.4 }, "+=1.6");
          return TL().to(st, { lean: -4, roll: pick([-2, 2]), duration: 0.9, ease: "sine.inOut" }).to(st, { lean: 0, roll: 0, duration: 0.9, ease: "sine.inOut" }, "+=1.5");
        }, () => rnd(2.5, 4.5));
        break;
      case "ready": // ping pong stance: knees bent, paddle up and forward, bouncing on the toes
        this.setProps("none", "paddle");
        to({ crouch: 0.6, lean: 7, ...arm("r", READY_R), ...arm("l", READY_L), bounce: 1 }, 0.35);
        break;
      case "play": { // gamepad in both hands, thumbs never rest
        this.setProps("none", "pad");
        const p = seatedNow() ? PAD_SIT : PAD;
        to({ ...arm("l", p), ...arm("r", p), lean: 6, nod: 3, mash: 1 }, 0.4);
        loop(() => TL().to(st, { roll: pick([-4, 4, -2, 2]), sway: pick([-0.4, 0.4]), lean: 6 + 3 * this.mashRate, duration: 0.3, ease: "sine.inOut" })
          .to(st, { roll: 0, sway: 0, lean: 6, duration: 0.4, ease: "sine.inOut" }, "+=0.3"), () => rnd(1.2, 2.6));
        break;
      }
      case "think": // scratch the chin
        to({ ...arm("r", CHIN), ...arm("l", CROSS_L), tilt: 7, lookY: -0.8, look: 0.5 }, 0.5);
        this.act = gsap.to(st, { ry: CHIN.y + 4, duration: 0.15, yoyo: true, repeat: -1, repeatDelay: 0.45, ease: "sine.inOut", delay: 0.6 });
        loop(() => TL().to(st, { tilt: pick([-6, 8]), look: pick([-0.6, 0.6]), duration: 0.9, ease: "sine.inOut" }), () => rnd(2, 4));
        break;
      case "cheer": {
        this.setExpression("happy");
        const up = H(28, -76, 6);
        to({ ...arm("l", up), ...arm("r", up), sit: 0, lean: 0 }, 0.22, "back.out(1.6)");
        const tl = TL({ delay: 0.15 });
        for (let i = 0; i < 3; i++) {
          tl.to(st, { sq: 0.7, duration: 0.09, ease: "power2.in" })
            .to(st, { jump: 1, sq: -0.5, ly: -84, ry: -84, duration: 0.18, ease: "power2.out" })
            .to(st, { sq: 0, duration: 0.12 }, "<0.1")
            .to(st, { jump: 0, ly: -70, ry: -70, duration: 0.2, ease: "power2.in" })
            .to(st, { sq: 0.6, duration: 0.06 })
            .to(st, { sq: 0, duration: 0.3, ease: "elastic.out(1, 0.45)" });
        }
        tl.to(st, { lu: 0, ru: 0, duration: 0.5, ease: "power2.inOut" }, "+=0.5");
        this.act = tl;
        break;
      }
      case "sulk":
        this.setExpression("angry");
        to({ ...arm("l", CROSS_L), ...arm("r", CROSS_R), nod: 7, tilt: -8, shrug: 5, look: pick([-1, 1]) }, 0.5);
        loop(() => {
          this.puff();
          return TL().to(st, { shrug: 9, nod: 4, duration: 0.35, ease: "power2.out" }).to(st, { shrug: 4, nod: 7, duration: 0.6 })
            .to(st, { tap: seatedNow() ? 0 : 1, duration: 0.1 }, 0).to(st, { tap: 0, duration: 0.2 }, 0.5);
        }, () => rnd(2.2, 4));
        break;
      case "type": // typing in bursts; `mashRate` sets the pace
        to({ sit: 1, ...arm("l", KEYS), ...arm("r", KEYS), lean: 2, nod: 2, lookY: 0.5 }, 0.5);
        if (reduced()) break;
        loop(() => TL().to(st, { mash: 1, nod: 3, duration: 0.15 })
          .to(st, { mash: 0, nod: 2, duration: 0.25 }, `+=${rnd(0.8, 2.6) * Math.min(1.6, this.mashRate)}`), () => rnd(1.4, 3.6) / this.mashRate, 0.3);
        break;
      case "watch": // sitting, eyes on the screen; munches if holding popcorn
        to({ sit: 1, lean: 3 }, 0.6);
        loop(() => {
          if (this.propL === "popcorn" && Math.random() < 0.75) return this.munch();
          return TL().to(st, { tilt: pick([-5, 5]), lean: pick([0, 6]), duration: 1, ease: "sine.inOut" }).to(st, { tilt: 0, lean: 3, duration: 1, ease: "sine.inOut" }, "+=1.5");
        }, () => rnd(2.4, 4.4));
        break;
    }
  }

  /** One spoonful: scoop, lift to the mouth while the head leans in, chew, back to the bowl. */
  protected bite() {
    const st = this.st;
    const arm = (p: Hand) => ({ rx: p.x, ry: p.y, rz: p.z, rr: p.r ?? 0, ru: 1 });
    const bite = this.$.propRUnder.querySelector<SVGElement>('[data-r="bite"]');
    const tl = TL()
      // dip into the bowl, the bowl tips toward the spoon
      .to(st, { ...arm({ ...SCOOP, y: SCOOP.y + 10, r: -128 }), lr: 12, lu: 1, lx: BOWL.x, ly: BOWL.y, lz: BOWL.z, nod: 3, lookY: 1, duration: 0.3, ease: "power2.inOut" })
      .to(st, { rx: SCOOP.x + 6, rr: -100, duration: 0.18, ease: "power1.inOut" })
      .add(() => bite && gsap.set(bite, { opacity: 1 }))
      // up to the mouth: the head comes down to meet it, the bowl follows a little
      .to(st, { ...arm(MOUTH), lr: 0, ly: BOWL.y - 8, lz: BOWL.z + 4, duration: 0.42, ease: "power2.inOut" })
      .to(st, { nod: 6, tilt: -4, lookY: 0.4, duration: 0.3, ease: "power2.out" }, "<0.12")
      .add(() => bite && gsap.set(bite, { opacity: 0 }))
      .to(st, { nod: 2, duration: 0.1, ease: "power2.out" })
      // chew while the spoon goes back down
      .to(st, { ...arm(SCOOP), ly: BOWL.y, lz: BOWL.z, chew: 1, tilt: 0, lookY: 0, duration: 0.45, ease: "power2.inOut" })
      .to(st, { chew: 0, nod: 0, duration: 0.3 }, "+=0.9");
    if (Math.random() < 0.3) tl.add(() => { if (this.activity === "eat") this.setExpression("happy"); }, 1.4).add(() => { if (this.activity === "eat") this.setExpression("neutral"); }, 2.4);
    return tl;
  }

  /** A sip: tip the mug at the mouth, head back, a satisfied little sigh. */
  protected sip() {
    const st = this.st;
    return TL()
      .to(st, { ry: MUG.y + 5, ru: 0.6, rx: MUG.x, rz: MUG.z, duration: 0.15, ease: "power2.in" })
      .to(st, { rx: SIP.x, ry: SIP.y, rz: SIP.z, rr: SIP.r, ru: 1, nod: -5, tilt: -3, duration: 0.5, ease: "power2.inOut" })
      .to(st, { rr: -48, nod: -7, duration: 0.6, ease: "sine.inOut" })
      .to(st, { ru: 0, rr: 0, nod: 2, tilt: 0, duration: 0.5, ease: "power2.inOut" })
      .add(() => { if (this.activity === "drink" && Math.random() < 0.5) { this.puff(); this.setExpression("happy"); gsap.delayedCall(1.1, () => this.activity === "drink" && this.setExpression("neutral")); } })
      .to(st, { shrug: -4, duration: 0.35, ease: "sine.out" }, "-=0.1")
      .to(st, { shrug: 0, nod: 0, duration: 0.5, ease: "sine.inOut" });
  }

  /** Hand into the popcorn, then to the mouth. */
  munch() {
    const st = this.st;
    return TL()
      .to(st, { rx: INTO_POP.x, ry: INTO_POP.y - 10, rz: INTO_POP.z, rr: 0, ru: 1, lookY: 0.8, duration: 0.28, ease: "power2.inOut" })
      .to(st, { ry: INTO_POP.y, duration: 0.12, ease: "power2.in" })
      .to(st, { rx: MOUTH.x - 4, ry: MOUTH.y + 6, rz: MOUTH.z, lookY: 0, nod: 4, duration: 0.36, ease: "power2.inOut" })
      .to(st, { ru: 0, chew: 1, nod: 0, duration: 0.42, ease: "power2.inOut" })
      .to(st, { chew: 0, duration: 0.3 }, "+=0.8");
  }

  /** Reach sideways into a neighbor's popcorn (`dir` -1 left, 1 right on screen), then eat it. */
}
