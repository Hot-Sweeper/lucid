// Uptime Till Dawn: the robot is the night operator of a tiny server room. Racks heat up,
// Nibblers (cable-chewing bugs) pop out of the floor grate, and Mop, the sleepwalking
// cleaning bot, keeps unplugging racks to charge itself. Only two fans fit the power
// budget. Keep the error budget above zero until 6 AM.
import "./games.css";
import {
  Scope, Session, Halt, mountFrame, addCanvas, nap, waitUntil, think, chance, pick, clamp, lerp, reducedMotion, hash,
  P, fillRR, circle, ellipse, poly, line, lin, rad, glow, withAlpha, mix,
  type Ctx, type FunHost, type FunOpts, type Outcome,
} from "./kit";

type Issue = "" | "bug" | "leak" | "crash" | "plug" | "cut";
type Job = "reboot" | "splice" | "patch";
interface Rack {
  name: string; i: number; temp: number; load: number; target: number; retarget: number;
  fan: boolean; blade: number; issue: Issue; chew: number; job: Job | ""; jobLeft: number;
}
interface Flee { x: number; y: number; vx: number; vy: number; a: number }

const NAMES = ["Web", "Mail", "DB", "Cats"];
const HOURS = ["12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM"];
const FIX_LABEL: Record<Issue, string> = { "": "OK", bug: "Shoo", leak: "Patch", crash: "Reboot", plug: "Plug in", cut: "Splice" };
const JOB_MS: Record<Job, number> = { reboot: 1600, splice: 1000, patch: 800 };
const MAX_FANS = 2;
const down = (r: Rack) => r.issue === "crash" || r.issue === "plug" || r.issue === "cut" || r.job === "reboot" || r.job === "splice";

// ---- characters ----------------------------------------------------------------------

/** A Nibbler: a round little cable-chewing bug. */
function drawNibbler(ctx: Ctx, x: number, y: number, t: number, munch: boolean, s = 1) {
  const jaw = munch ? Math.max(0, Math.sin(t * 18)) * 1.6 : 0;
  for (const k of [-1, 1]) for (let l = 0; l < 3; l++) {
    const step = munch ? Math.sin(t * 14 + l * 2 + k) * 0.8 : 0;
    line(ctx, [[x + (l - 1) * 3.4 * s, y + 3 * s], [x + (l - 1) * 4.4 * s + k * step, y + 6.5 * s]], 1.4 * s, "#3c7a4c");
  }
  ellipse(ctx, x, y, 8 * s, 6 * s, lin(ctx, 0, y - 6 * s, 0, y + 6 * s, [[0, "#a6f07a"], [1, "#5fbf5a"]]));
  ellipse(ctx, x, y + 2.4 * s, 5.4 * s, 3 * s, "#d8f7b8");
  for (const k of [-1, 1]) {
    line(ctx, [[x + k * 2.5 * s, y - 5 * s], [x + k * 5.5 * s, y - 10.5 * s]], 1.2 * s, "#3c7a4c");
    circle(ctx, x + k * 5.5 * s, y - 10.5 * s, 1.6 * s, P.pink);
    circle(ctx, x + k * 3 * s, y - 1.5 * s, 2.3 * s, "#ffffff");
    circle(ctx, x + k * 3 * s + 0.4 * s, y - 1 * s, 1.1 * s, P.night);
  }
  fillRR(ctx, x - 2.2 * s, y + 2 * s + jaw * 0.3, 4.4 * s, 1.6 * s + jaw, 0.8 * s, "#2c4a34");
}

/** Mop, the sleepy cleaning bot, with a nightcap and a swishy mop skirt. */
function drawMop(ctx: Ctx, x: number, foot: number, t: number, dir: number, o: { awake: number; moving: boolean; charging: boolean; calm: boolean }) {
  const swish = o.moving && !o.calm ? Math.sin(t * 16) * 2 : 0;
  ellipse(ctx, x, foot + 1, 22, 4, "rgba(0,0,0,0.25)");
  for (let i = -5; i <= 5; i++) line(ctx, [[x + i * 3.6, foot - 12], [x + i * 4.2 + swish * (i % 2 ? 1 : -1), foot - 1]], 3, i % 2 ? "#e7dfcb" : "#cfc6b0");
  fillRR(ctx, x - 20, foot - 38, 40, 28, 14, lin(ctx, 0, foot - 38, 0, foot - 10, [[0, "#f3ead6"], [1, "#d6c9ad"]]));
  fillRR(ctx, x - 20, foot - 18, 40, 6, 3, P.sky);
  fillRR(ctx, x - 14 + dir * 2, foot - 33, 28, 13, 6.5, "#1b2a40");
  ctx.save();
  ctx.lineCap = "round"; ctx.lineWidth = 2; ctx.strokeStyle = P.mint;
  for (const k of [-1, 1]) {
    const ex = x + dir * 2 + k * 6, ey = foot - 26.5;
    if (o.awake > 0) circle(ctx, ex, ey, 2.6 + o.awake, P.mint);
    else { ctx.beginPath(); ctx.arc(ex, ey - 1.5, 3, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
  }
  ctx.restore();
  // the nightcap droops toward where Mop is heading
  poly(ctx, [[x - 15, foot - 34], [x + 13, foot - 37], [x + dir * 22, foot - 48]], P.lilac);
  fillRR(ctx, x - 16, foot - 38, 31, 5, 2.5, "#c9a8ff");
  circle(ctx, x + dir * 22, foot - 48, 3.6, P.cream);
  if (o.charging) glow(ctx, x, foot - 22, 34, P.mint, 0.18 + (o.calm ? 0 : 0.08 * Math.sin(t * 4)));
  if (o.awake <= 0) {
    // snoring, drawn as little zigzags so no text has to be painted
    for (let i = 0; i < 3; i++) {
      const k = o.calm ? i / 3 : (t * 0.45 + i / 3) % 1;
      const zx = x - dir * (14 + k * 10) + Math.sin(k * 6 + i) * 3, zy = foot - 46 - k * 26, zs = 2.5 + k * 2.5;
      line(ctx, [[zx - zs, zy - zs], [zx + zs, zy - zs], [zx - zs, zy + zs], [zx + zs, zy + zs]], 1.4, withAlpha(P.soft, 0.7 * (1 - k)));
    }
  } else {
    // just woke up: a little surprise mark
    fillRR(ctx, x - 1.5, foot - 66, 3, 10, 1.5, withAlpha(P.orange, o.awake));
    circle(ctx, x, foot - 52, 1.8, withAlpha(P.orange, o.awake));
  }
}

export async function playUptimeTillDawn(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope(body);
  const calm = reducedMotion();
  try {
    const f = mountFrame(body, scope, "Uptime Till Dawn", "ns");
    const S = new Session(host, opts, { base: 0.45, step: 0.15, calm: 0.1 });
    const skill = S.skill;
    const W = f.w, H = f.h;
    const { ctx } = addCanvas(f.stage, W, H, "gm-ns-room");
    scope.liveCanvas(ctx.canvas);
    const night = 1 + Math.floor(Math.random() * 4);
    const hourMs = clamp((opts.maxMs * 0.82 - 4000) / 6, 6500, 11000);
    const colW = W / 4, rackW = Math.min(70, colW - 30), top = 66, floorY = H - 112, stripY = floorY + 30, mopY = H - 52;
    const cx = (i: number) => colW * (i + 0.5);

    f.stage.insertAdjacentHTML("beforeend", `
      <div class="gm-ns-hud"><span>Error budget</span><i class="gm-ns-bar"><i></i></i><b>100%</b></div>
      <div class="gm-ns-pow"><span>Power</span><span class="gm-ns-use">${"<i></i>".repeat(MAX_FANS + 3)}</span></div>
      <div class="gm-ns-clock"><b>12 AM</b><span>Night ${night}</span></div>
      ${NAMES.map((n, i) => `<span class="gm-ns-tag" style="left:${cx(i) - 30}px;top:${top - 18}px">${n}</span>
      <div class="gm-ns-ctl" style="left:${colW * i}px;width:${colW}px"><span class="gm-ns-btn" data-r="${i}" data-k="fan">Fan</span><span class="gm-ns-btn gm-ns-fix" data-r="${i}" data-k="fix">OK</span></div>`).join("")}
      <div class="gm-ns-intro"><b>Uptime Till Dawn</b><span>Night ${night}   12 AM</span></div>`);
    const q = <T extends Element = HTMLElement>(s: string) => f.stage.querySelector(s) as T;
    const btn = (i: number, k: "fan" | "fix") => q(`.gm-ns-btn[data-r="${i}"][data-k="${k}"]`);
    const clockB = q(".gm-ns-clock b"), budgetB = q(".gm-ns-hud b"), budgetBar = q(".gm-ns-bar i"), powLabel = q(".gm-ns-pow span");
    const pips = [...f.stage.querySelectorAll(".gm-ns-use i")] as HTMLElement[];

    // ---- state ----
    const racks: Rack[] = NAMES.map((name, i) => ({
      name, i, temp: 45 + Math.random() * 15, load: 0.5, target: 0.5, retarget: 0,
      fan: false, blade: Math.random() * 6, issue: "", chew: 0, job: "", jobLeft: 0,
    }));
    const mop = { state: "dock" as "dock" | "roll" | "charge" | "home", x: W + 40, from: W + 40, target: 0, k: 0, dur: 1, next: 7000 + Math.random() * 5000, awake: 0, dir: -1 };
    const fleeing: Flee[] = [], crumbs: Flee[] = [];
    const confetti: { x: number; y: number; vx: number; vy: number; c: string; a: number }[] = [];
    let budget = 100, clock = 0, hour = 0, started = false, ended: "" | "win" | "outage" = "", endT = 0;
    let overload = 0, tripped = 0, flash = 0, nextBug = 4000 + Math.random() * 3000, nextLeak = 9000 + Math.random() * 5000;
    const fans = () => racks.filter((r) => r.fan).length;
    const chewMs = 6400 - night * 400;

    // ---- HUD ----
    const setFixLabel = (r: Rack) => {
      const el = btn(r.i, "fix");
      const label = r.job ? "..." : FIX_LABEL[r.issue];
      if (el.textContent !== label) el.textContent = label;
      el.classList.toggle("gm-on", !!r.issue && !r.job);
      el.classList.toggle("gm-bad", down(r) && !r.job);
    };
    let hudBudget = -1, hudHour = -1, hudUse = -1, hudTrip = false;
    const hud = () => {
      const b = Math.max(0, Math.ceil(budget));
      if (b !== hudBudget) {
        hudBudget = b; budgetB.textContent = `${b}%`;
        budgetBar.style.width = `${b}%`;
        budgetB.classList.toggle("gm-low", b < 30); budgetBar.classList.toggle("gm-low", b < 30);
      }
      const use = 2 + fans();
      if (use !== hudUse) { hudUse = use; pips.forEach((p, i) => { p.classList.toggle("gm-on", i < use); p.classList.toggle("gm-ns-red", i >= MAX_FANS + 2 && i < use); }); }
      const trip = tripped > 0;
      if (trip !== hudTrip) { hudTrip = trip; powLabel.textContent = trip ? "Breaker tripped" : "Power"; f.stage.classList.toggle("gm-ns-trip", trip); }
      if (hour !== hudHour) { hudHour = hour; clockB.textContent = HOURS[hour]; f.setScore(`Night ${night}   ${HOURS[hour]}`); }
      racks.forEach(setFixLabel);
    };
    hud();

    const setFan = (r: Rack, on: boolean) => {
      if (on && tripped > 0) { scope.fromTo(btn(r.i, "fan"), { x: -3 }, { x: 0, duration: 0.3, ease: "elastic.out(1, 0.3)" }); return; }
      r.fan = on;
      btn(r.i, "fan").classList.toggle("gm-on", on);
      hud();
    };
    const startJob = (r: Rack, job: Job) => { r.job = job; r.jobLeft = JOB_MS[job]; };
    const shoo = (r: Rack) => {
      const bx = cx(r.i) + 22, by = floorY + 14;
      fleeing.push({ x: bx, y: by, vx: (chance(0.5) ? 1 : -1) * (70 + Math.random() * 50), vy: -120, a: 1 });
    };
    /** The operator handles whatever the rack needs right now. */
    const fix = (r: Rack) => {
      if (r.job || !r.issue) return;
      const issue = r.issue;
      if (issue === "bug") { shoo(r); r.issue = ""; r.chew = 0; }
      else if (issue === "plug") {
        r.issue = "";
        if (mop.state === "charge" && mop.target === r.i) sendMopHome(0.6);
      } else { startJob(r, issue === "crash" ? "reboot" : issue === "cut" ? "splice" : "patch"); r.issue = ""; }
      hud();
    };
    const sendMopHome = (awake: number) => {
      mop.state = "home"; mop.from = mop.x; mop.k = 0; mop.dir = 1; mop.awake = awake;
      mop.dur = Math.max(0.6, (W + 40 - mop.x) / 160);
    };
    const wakeMop = () => { if (mop.state === "roll") sendMopHome(1); };

    // ---- simulation (runs every frame, independent of the robot's actions) ----
    const sim = (dt: number) => {
      if (ended || !started) return;
      const ms = dt * 1000;
      clock += ms;
      const h = Math.min(6, Math.floor(clock / hourMs));
      if (h !== hour) { hour = h; hud(); scope.fromTo(clockB, { scale: 1.3 }, { scale: 1, duration: 0.5, ease: "back.out(3)" }); }
      if (hour >= 6) { ended = "win"; endT = 0; return; }
      // the 3 AM backup run makes everyone work harder
      const backup = hour === 2 || hour === 3 ? 0.2 : 0;
      for (const r of racks) {
        if (clock > r.retarget) { r.target = 0.35 + Math.random() * 0.55; r.retarget = clock + 2500 + Math.random() * 2500; }
        if (r.issue === "leak") r.target = Math.min(1.5, r.target + dt * 0.05);
        r.load = lerp(r.load, r.target + backup, clamp(dt * 1.5));
        if (r.job) {
          r.jobLeft -= ms;
          if (r.jobLeft <= 0) {
            if (r.job === "reboot") { r.temp = 58; r.target = 0.45; }
            if (r.job === "patch") r.target = Math.min(r.target, 0.6);
            r.job = ""; hud();
          }
        }
        const cooling = r.fan ? 9 : 2.4;
        r.temp += (down(r) ? -4 : r.load * 6 * (1 + hour * 0.1) - cooling) * dt - 0.05 * (r.temp - 40) * dt;
        r.temp = clamp(r.temp, 30, 100);
        if (r.temp >= 100 && !down(r)) {
          if (r.issue === "bug") shoo(r);
          r.issue = "crash"; r.chew = 0; flash = 0.5; hud();
        }
        if (r.issue === "bug") {
          r.chew += ms / chewMs;
          if (r.chew >= 1) { r.issue = "cut"; r.chew = 0; flash = 0.3; hud(); }
          else if (!calm && Math.random() < dt * 6) crumbs.push({ x: cx(r.i) + 22, y: floorY + 16, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 30, a: 1 });
        }
        if (down(r)) budget -= 3.4 * dt;
      }
      if (clock > nextBug) {
        const free = racks.filter((r) => !r.issue && !r.job);
        if (free.length) { pick(free).issue = "bug"; hud(); }
        nextBug = clock + (4500 + Math.random() * 3500) * clamp(1.15 - night * 0.08, 0.7, 1);
      }
      if (clock > nextLeak) {
        const free = racks.filter((r) => !r.issue && !r.job);
        if (free.length) { pick(free).issue = "leak"; hud(); }
        nextLeak = clock + 9000 + Math.random() * 6000 - night * 500;
      }
      // Mop wanders over to a rack and swaps its plug for a charger
      if (mop.state === "dock" && clock > mop.next) {
        const goals = racks.filter((r) => !down(r));
        if (goals.length) {
          mop.target = pick(goals).i; mop.state = "roll"; mop.from = mop.x; mop.k = 0; mop.dir = -1; mop.awake = 0;
          mop.dur = Math.max(3.4, 5 - night * 0.35);
        }
      }
      if (mop.state === "roll" || mop.state === "home") {
        mop.k = Math.min(1, mop.k + dt / mop.dur);
        const goal = mop.state === "roll" ? cx(mop.target) + 30 : W + 40;
        mop.x = lerp(mop.from, goal, mop.state === "roll" ? mop.k : mop.k * mop.k);
        if (mop.k >= 1) {
          if (mop.state === "roll") {
            const r = racks[mop.target];
            // a rack that is already dark has nothing to unplug, so Mop just turns around
            if (down(r)) sendMopHome(0);
            else {
              if (r.issue === "bug") shoo(r);
              r.issue = "plug"; r.chew = 0; mop.state = "charge"; flash = 0.25; hud();
              host.react("surprised");
            }
          } else { mop.state = "dock"; mop.next = clock + 9000 + Math.random() * 5000 - night * 600; }
        }
      }
      if (mop.state === "charge" && racks[mop.target].issue !== "plug") sendMopHome(0.6);
      mop.awake = Math.max(0, mop.awake - dt * (mop.state === "home" ? 0.35 : 1));
      // more than two fans overloads the power budget and trips the breaker
      if (fans() > MAX_FANS && tripped <= 0) {
        overload += dt;
        if (overload > 1) { tripped = 3.5; overload = 0; flash = 0.6; for (const r of racks) setFan(r, false); }
      } else overload = 0;
      if (tripped > 0) { tripped -= dt; if (tripped <= 0) hud(); }
      if (budget <= 0) { budget = 0; ended = "outage"; endT = 0; }
      hud();
    };

    // ---- drawing ----
    const dawn = () => clamp(clock / (hourMs * 6));
    const cablePts = (i: number, r: Rack) => {
      const x = cx(i), plugged = r.issue !== "plug";
      const a: [number, number] = [x + 8, floorY], c: [number, number] = [x + 34, floorY + 6];
      const b: [number, number] = plugged ? [x + 18, stripY] : [x + 40, stripY + 14];
      return { a, b, c, plugged };
    };
    const drawCable = (i: number, r: Rack, t: number) => {
      const { a, b, c, plugged } = cablePts(i, r);
      ctx.save();
      ctx.lineCap = "round"; ctx.lineWidth = 3.4;
      ctx.strokeStyle = mix("#3a4570", P.pink, r.issue === "bug" ? r.chew * 0.7 : 0);
      if (r.issue === "cut") {
        // two frayed ends
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(a[0] + 18, a[1] + 2, a[0] + 16, a[1] + 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.quadraticCurveTo(b[0] + 14, b[1] - 4, b[0] + 20, b[1] - 10); ctx.stroke();
        const sp = calm ? 0.5 : Math.max(0, Math.sin(t * 9 + i));
        glow(ctx, a[0] + 18, a[1] + 14, 10, P.orange, 0.6 * sp);
        for (let k = 0; k < 3; k++) line(ctx, [[a[0] + 17, a[1] + 13], [a[0] + 17 + Math.cos(k * 2.1 + t * 3) * 5 * sp, a[1] + 13 + Math.sin(k * 2.1 + t * 3) * 5 * sp]], 1.2, P.cream);
      } else {
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke();
      }
      ctx.restore();
      // the plug
      fillRR(ctx, b[0] - 4, b[1] - 6, 8, 9, 2, plugged ? "#59648f" : "#7a84b4");
      if (!plugged) for (const k of [-1.5, 1.5]) fillRR(ctx, b[0] + k - 0.6, b[1] + 3, 1.2, 4, 0.6, "#c9cdf5");
    };
    const drawRack = (r: Rack, t: number, dt: number) => {
      const x = cx(r.i), x0 = x - rackW / 2, h = floorY - top, off = down(r);
      const heat = clamp((r.temp - 60) / 40);
      if (heat > 0 && !off) glow(ctx, x, top + 20, rackW, P.pink, 0.22 * heat);
      fillRR(ctx, x0, top, rackW, h, 7, lin(ctx, 0, top, 0, floorY, [[0, "#2b3d5e"], [1, "#1e2c46"]]));
      fillRR(ctx, x0 + 3, top + 3, rackW - 6, 3, 1.5, "rgba(255,255,255,0.06)");
      // a little face on the status screen
      const sx = x0 + 8, sw = rackW - 16, sy = top + 8;
      fillRR(ctx, sx, sy, sw, 24, 5, off ? "#0b111c" : "#10283a");
      if (r.job) {
        const k = 1 - r.jobLeft / JOB_MS[r.job];
        fillRR(ctx, sx + 6, sy + 10, sw - 12, 4, 2, "#1d3c50");
        fillRR(ctx, sx + 6, sy + 10, (sw - 12) * k, 4, 2, r.job === "patch" ? P.sky : P.mint);
      } else if (off) {
        for (const k of [-1, 1]) fillRR(ctx, x + k * 8 - 4, sy + 11, 8, 2, 1, withAlpha(P.dim, 0.5));
      } else {
        const blink = !calm && (t * 0.7 + r.i * 0.37) % 4 < 0.1;
        const look = r.issue === "bug" ? 2.5 : 0;
        const eye = heat > 0.5 ? P.orange : r.issue === "leak" ? P.sky : P.mint;
        for (const k of [-1, 1]) {
          if (blink || heat > 0.5) fillRR(ctx, x + k * 8 - 3.5, sy + 9 + look, 7, 2.4, 1.2, eye);
          else circle(ctx, x + k * 8, sy + 10 + look, 3, eye);
        }
        ctx.save();
        ctx.lineCap = "round"; ctx.lineWidth = 1.6; ctx.strokeStyle = eye; ctx.beginPath();
        if (r.issue === "leak") { ctx.moveTo(x - 5, sy + 18); ctx.bezierCurveTo(x - 2, sy + 15, x + 2, sy + 21, x + 5, sy + 18); }
        else if (r.issue === "bug" || heat > 0.5) ctx.arc(x, sy + 21, 3.5, 1.15 * Math.PI, 1.85 * Math.PI);
        else ctx.arc(x, sy + 15, 3.5, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke(); ctx.restore();
        if (heat > 0.3) {
          const d = calm ? 0.5 : (t * 0.8 + r.i * 0.3) % 1;
          ellipse(ctx, sx + sw - 3, sy + 6 + d * 12, 2, 2.8, withAlpha(P.sky, 0.9 * (1 - d)));
        }
      }
      // fan
      const fx = x, fy = top + 48;
      circle(ctx, fx, fy, 13, "#152234");
      if (!calm) r.blade += (r.fan && !off ? 16 : off ? 0 : 2.5) * dt;
      for (let b = 0; b < 4; b++) {
        ctx.save(); ctx.translate(fx, fy); ctx.rotate(r.blade + (b * Math.PI) / 2);
        ellipse(ctx, 6, 0, 6, 2.6, r.fan ? "#6c9cd0" : "#3d5878"); ctx.restore();
      }
      circle(ctx, fx, fy, 3, r.fan ? P.mint : "#4c6a8e");
      if (r.fan && !off && !calm) for (let p = 0; p < 2; p++) {
        const k = (t * 1.2 + p / 2 + r.i * 0.2) % 1;
        line(ctx, [[fx - 8 + p * 16, fy - 16 - k * 14], [fx - 6 + p * 16, fy - 22 - k * 14]], 1.4, withAlpha("#bfe3ff", 0.5 * (1 - k)));
      }
      // server units with load-paced LEDs
      const rows = Math.max(3, Math.floor((floorY - 12 - (top + 68)) / 13));
      for (let u = 0; u < rows; u++) {
        const uy = top + 68 + u * 13;
        fillRR(ctx, x0 + 6, uy, rackW - 12, 9, 2.5, "#17243a");
        for (let j = 0; j < 3; j++) {
          const on = !off && (calm ? (u + j) % 2 === 0 : Math.sin(t * (2 + r.load * 8 + ((u + j) % 3)) + r.i * 3 + u * 1.7 + j) > 0.1);
          circle(ctx, x0 + 12 + j * 6, uy + 4.5, 1.5, on ? (j === 1 ? P.sky : heat > 0.6 ? P.orange : P.mint) : "rgba(79,240,160,0.1)");
        }
        fillRR(ctx, x0 + rackW - 22, uy + 3.5, 12, 2, 1, "#24344f");
      }
      // thermometer
      const tx = x0 + rackW + 4, ty = top + 8, th = h - 16;
      fillRR(ctx, tx, ty, 5, th, 2.5, "#141d30");
      const fill = th * clamp((r.temp - 30) / 70);
      fillRR(ctx, tx, ty + th - fill, 5, fill, 2.5, heat > 0.6 ? P.pink : heat > 0.2 ? P.orange : P.mint);
      // heat shimmer above a very warm rack
      if (heat > 0.6 && !off && !calm) for (let s = 0; s < 3; s++) {
        const k = (t * 0.9 + s / 3) % 1, wx = x - 14 + s * 14;
        line(ctx, [[wx, top - 4 - k * 14], [wx + 3, top - 8 - k * 14], [wx, top - 12 - k * 14]], 1.4, withAlpha(P.pink, 0.45 * (1 - k)));
      }
    };
    const drawRoom = (t: number) => {
      const d = dawn();
      ctx.fillStyle = lin(ctx, 0, 0, 0, floorY, [[0, mix("#131938", "#2a2850", d)], [1, mix("#1c2550", "#33315a", d)]]);
      ctx.fillRect(0, 0, W, floorY);
      ctx.fillStyle = lin(ctx, 0, floorY, 0, H, [[0, "#1a2142"], [1, "#0f1430"]]);
      ctx.fillRect(0, floorY, W, H - floorY);
      for (let i = 0; i < 12; i++) fillRR(ctx, i * 40 - 10 + (i % 2) * 6, floorY + 46 + (i % 2) * 18, 30, 6, 3, "rgba(255,255,255,0.025)");
      // a high window: the sky slowly turns toward morning
      const wx = W / 2 - 46, wy = 8, ww = 92, wh = 30;
      fillRR(ctx, wx - 4, wy - 4, ww + 8, wh + 8, 6, "#262f5e");
      ctx.save();
      ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, 4); ctx.clip();
      ctx.fillStyle = lin(ctx, 0, wy, 0, wy + wh, [[0, mix("#0d1230", "#5a6fc0", d)], [1, mix("#1a1f4a", "#ffb37a", d * d)]]);
      ctx.fillRect(wx, wy, ww, wh);
      for (let s = 0; s < 9; s++) circle(ctx, wx + 6 + hash(s) * (ww - 12), wy + 4 + hash(s + 9) * (wh - 10), 0.9, withAlpha(P.cream, (1 - d) * (calm ? 0.7 : 0.4 + 0.4 * Math.sin(t * 2 + s))));
      if (d > 0.7) circle(ctx, wx + ww * 0.7, wy + wh + 14 - (d - 0.7) * 60, 9, withAlpha("#ffd59a", 0.9));
      ctx.restore();
      fillRR(ctx, wx + ww / 2 - 1.5, wy, 3, wh, 1.5, "#262f5e");
      // the breaker box
      const bx = wx + ww + 18, by = 10, trip = tripped > 0;
      fillRR(ctx, bx, by, 22, 28, 4, "#2e3870");
      fillRR(ctx, bx + 5, by + 5, 12, 18, 3, "#1b2150");
      fillRR(ctx, bx + 8, trip ? by + 14 : by + 7, 6, 7, 2, trip ? P.pink : P.mint);
      if (trip && !calm) for (let k = 0; k < 3; k++) {
        const a = t * 7 + k * 2.1;
        line(ctx, [[bx + 11, by + 4], [bx + 11 + Math.cos(a) * 7, by + 4 + Math.sin(a) * 5]], 1.2, P.orange);
      }
      // the shared power strip and the floor grate the Nibblers live under
      fillRR(ctx, 8, stripY - 4, W - 16, 8, 4, "#262d5e");
      for (let i = 0; i < 4; i++) {
        fillRR(ctx, cx(i) + 13, stripY - 2, 10, 4, 1.5, "#141a3a");
        circle(ctx, cx(i) + 26, stripY, 1.6, racks[i].issue === "plug" ? "rgba(255,111,145,0.6)" : withAlpha(P.mint, 0.7));
      }
      fillRR(ctx, W / 2 - 28, floorY + 8, 56, 10, 3, "#151a38");
      for (let g = 0; g < 6; g++) fillRR(ctx, W / 2 - 24 + g * 8.6, floorY + 10, 4, 6, 1.5, "#0a0e24");
    };

    const drawScene = (t: number, dt: number) => {
      drawRoom(t);
      racks.forEach((r) => drawRack(r, t, dt));
      racks.forEach((r) => drawCable(r.i, r, t));
      for (const r of racks) {
        if (r.issue !== "bug") continue;
        const bx = cx(r.i) + 22, by = floorY + 14;
        // the ring fills as the cable gets chewed through
        ctx.save();
        ctx.beginPath(); ctx.arc(bx, by, 13, -Math.PI / 2, -Math.PI / 2 + r.chew * Math.PI * 2);
        ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = withAlpha(P.pink, 0.75); ctx.stroke();
        ctx.restore();
        drawNibbler(ctx, bx, by, t, !calm);
      }
      for (let i = crumbs.length - 1; i >= 0; i--) {
        const c = crumbs[i];
        c.vy += 160 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.a -= dt * 2;
        if (c.a <= 0) { crumbs.splice(i, 1); continue; }
        fillRR(ctx, c.x, c.y, 2, 2, 0.6, withAlpha("#7a84b4", c.a));
      }
      for (let i = fleeing.length - 1; i >= 0; i--) {
        const b = fleeing[i];
        b.vy += 300 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.a -= dt * 1.4;
        if (b.a <= 0 || b.y > H) { fleeing.splice(i, 1); continue; }
        ctx.save(); ctx.globalAlpha = clamp(b.a); drawNibbler(ctx, b.x, b.y, t, true, 0.9); ctx.restore();
      }
      if (mop.state !== "dock") {
        if (mop.state === "charge") {
          // Mop's own charging cable into the borrowed socket
          ctx.save();
          ctx.lineCap = "round"; ctx.lineWidth = 2.2; ctx.strokeStyle = "#8a91c4";
          ctx.beginPath(); ctx.moveTo(mop.x - 16, mopY - 16); ctx.quadraticCurveTo(mop.x - 22, stripY + 4, cx(mop.target) + 18, stripY); ctx.stroke();
          ctx.restore();
        }
        drawMop(ctx, mop.x, mopY, t, mop.dir, { awake: mop.awake, moving: mop.state === "roll" || mop.state === "home", charging: mop.state === "charge", calm });
      }
      // room light: dim at night, warmer toward dawn, a flash when something pops
      const d = dawn();
      ctx.fillStyle = `rgba(5,6,20,${0.16 - d * 0.1 + (tripped > 0 ? 0.22 : 0)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = rad(ctx, W / 2, H * 0.4, W * 0.75, [[0.55, "rgba(5,6,20,0)"], [1, "rgba(5,6,20,0.5)"]]);
      ctx.fillRect(0, 0, W, H);
      if (flash > 0) {
        flash = Math.max(0, flash - dt);
        if (!calm) { ctx.fillStyle = withAlpha(P.orange, flash * 0.18); ctx.fillRect(0, 0, W, H); }
      }
    };

    const drawWin = (dt: number) => {
      endT += dt;
      const k = clamp(endT / 1.2);
      ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, withAlpha("#ffb37a", 0.4 * k)], [0.6, withAlpha("#ff6f91", 0.18 * k)], [1, withAlpha("#141a33", 0.1 * k)]]);
      ctx.fillRect(0, 0, W, H);
      glow(ctx, W / 2, 20, W * 0.5 * k + 1, "#ffd59a", 0.45 * k);
      if (endT > 0.6 && confetti.length < 90 && !calm) for (let i = 0; i < 4; i++) confetti.push({ x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 80, c: pick([P.orange, P.mint, P.pink, P.sky, P.lilac, P.cream]), a: Math.random() * 6 });
      for (const c of confetti) {
        c.x += c.vx * dt; c.y += c.vy * dt; c.a += dt * 5;
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); fillRR(ctx, -3, -2, 6, 4, 1.5, c.c); ctx.restore();
      }
    };
    const drawOutage = (dt: number) => {
      endT += dt;
      ctx.fillStyle = `rgba(5,6,20,${0.55 * clamp(endT / 0.8)})`;
      ctx.fillRect(0, 0, W, H);
    };

    scope.raf((t, dt) => {
      sim(dt);
      drawScene(t, dt);
      if (ended && !f.stage.classList.contains("gm-ns-end")) f.stage.classList.add("gm-ns-end");
      if (ended === "win") drawWin(dt);
      if (ended === "outage") drawOutage(dt);
    });

    // ---- intro card ----
    const intro = q(".gm-ns-intro");
    scope.fromTo(intro, { opacity: 0 }, { opacity: 1, duration: 0.5 });
    await nap(host, 1700);
    scope.to(intro, { opacity: 0, duration: 0.5, onComplete: () => intro.remove() });
    started = true;
    host.react("focus");

    // ---- the operator (the robot) ----
    const notice = (base: number) => chance(clamp(base + skill * (1 - base)));
    const click = async (el: HTMLElement, ms = 360) => {
      el.classList.add("gm-hot");
      await host.pointAt(el, 0.5, 0.5, ms);
      await host.click();
      el.classList.remove("gm-hot");
    };
    const pressFan = async (r: Rack, on: boolean) => {
      if (r.fan === on) return;
      await click(btn(r.i, "fan"), 320);
      if (!ended) setFan(r, on);
    };
    const pressFix = async (r: Rack) => {
      await click(btn(r.i, "fix"));
      if (!ended) fix(r);
    };
    const pokeMop = async () => {
      // aim a little ahead of Mop, it keeps rolling while the hand moves
      const lead = mop.state === "roll" ? (cx(mop.target) + 30 - mop.from) / mop.dur * 0.35 : 0;
      const el = f.aim(mop.x + lead, mopY - 22, 44, 40);
      await host.pointAt(el, 0.5, 0.5, 340);
      await host.click();
      if (!ended && mop.state === "roll") { wakeMop(); host.react("laugh"); }
    };
    const coolDown = async (r: Rack) => {
      if (tripped > 0) return;
      if (fans() >= MAX_FANS) {
        const spare = racks.filter((o) => o.fan && o !== r).sort((a, b) => a.temp - b.temp)[0];
        if (spare && spare.temp > r.temp + 6) return;
        // a tired operator sometimes forgets the budget and trips the breaker
        if (spare && notice(0.55)) await pressFan(spare, false);
      }
      await pressFan(r, true);
      if (fans() > MAX_FANS && notice(0.3)) {
        host.react("surprised");
        const spare = racks.filter((o) => o.fan && o !== r).sort((a, b) => a.temp - b.temp)[0];
        if (spare) await pressFan(spare, false);
      }
    };
    const next = (): (() => Promise<void>) | null => {
      const byUrgency = racks.slice().sort((a, b) => b.temp - a.temp);
      const offline = byUrgency.find((r) => down(r) && !r.job && notice(0.7));
      if (offline) return () => pressFix(offline);
      if (mop.state === "roll" && mop.k > 0.3 && notice(0.4)) return pokeMop;
      const bug = racks.filter((r) => r.issue === "bug" && notice(0.35 + r.chew * 0.4)).sort((a, b) => b.chew - a.chew)[0];
      if (bug) return () => pressFix(bug);
      const hot = byUrgency.find((r) => !r.fan && !down(r) && r.temp > 80 - skill * 8 && tripped <= 0 && notice(0.55));
      if (hot) return () => coolDown(hot);
      const leak = racks.find((r) => r.issue === "leak" && notice(0.4));
      if (leak) return () => pressFix(leak);
      const idle = racks.find((r) => r.fan && (r.temp < 52 || down(r)) && notice(0.3));
      if (idle) return () => pressFan(idle, false);
      return null;
    };
    const operator = async () => {
      while (!ended) {
        if (host.stopped) throw new Halt();
        if (chance(0.01 + 0.06 * (1 - skill))) {
          // zones out for a moment
          host.react("relax");
          await nap(host, 900 + Math.random() * 2000 * (1.2 - skill));
          continue;
        }
        const act = next();
        if (act) { await act(); await nap(host, think(skill, 160)); }
        else await nap(host, 280 + Math.random() * 420);
      }
    };

    await operator();
    await waitUntil(host, () => !!ended, hourMs * 7);
    const final = ended as "" | "win" | "outage";
    if (final === "win") {
      host.react("cheer");
      f.showOver("Shift complete", `Night ${night}   Error budget ${Math.ceil(budget)}% left`, "good");
      await nap(host, 4600);
      return { result: "win", score: night };
    }
    if (final === "outage") {
      host.react("surprised");
      await nap(host, 900);
      f.showOver("Outage", `Error budget ran out at ${HOURS[hour]}`, "bad");
      await nap(host, 1200);
      S.rounds = 2;
      const nextStep = S.afterLoss(0.25 + (hour >= 4 ? 0.25 : 0));
      if (nextStep === "ragequit") { host.react("angry"); await nap(host, 600); return { result: "ragequit", score: hour }; }
      host.react(hour >= 4 ? "angry" : "laugh");
      await nap(host, 1500);
      return { result: "lose", score: hour };
    }
    return { result: "done", score: hour };
  } catch (e) {
    if (e instanceof Halt) return { result: "done" };
    throw e;
  } finally {
    scope.dispose();
  }
}
