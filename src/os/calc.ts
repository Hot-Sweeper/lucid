import gsap from "gsap";
import type { WM } from "./wm";

// A desktop calculator. The robot clicks the keys one by one, the display follows, and the
// result pops in after "=". Used for quick sums while working and silly maths when bored.

const KEYS = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "⌫", "="];
const OP: Record<string, string> = { "*": "×", "/": "÷", "-": "−", "+": "+" };

export class CalcApp {
  constructor(private wm: WM) {}

  private async ensure() {
    const w = await this.wm.open("calc");
    if (!w.body.querySelector(".calc")) {
      w.body.innerHTML = `<div class="calc">
        <div class="calc-screen"><div class="calc-tape"></div><div class="calc-out">0</div></div>
        <div class="calc-keys">${KEYS.map((k) => `<button type="button" tabindex="-1" class="ck ${/[÷×−+=]/.test(k) ? "op" : ""} ${k === "=" ? "eq" : ""} ${/[C⌫()]/.test(k) ? "fn" : ""}" data-k="${k}">${k}</button>`).join("")}</div>
      </div>`;
    }
    return w.body.querySelector(".calc") as HTMLElement;
  }

  // Type an expression like "48.6 / 3" and press equals. Returns the result.
  async compute(expr: string, label?: string) {
    const wm = this.wm, e = wm.epoch;
    const c = await this.ensure();
    const out = c.querySelector(".calc-out") as HTMLElement, tape = c.querySelector(".calc-tape") as HTMLElement;
    tape.textContent = label ?? "";
    out.textContent = "0";
    const press = async (k: string) => {
      const key = c.querySelector(`[data-k="${CSS.escape(k)}"]`) as HTMLElement | null;
      if (!key) return;
      await wm.pointAt(key, 0.5, 0.5, 150 + Math.random() * 120);
      await wm.click();
      key.classList.add("down");
      window.setTimeout(() => key.classList.remove("down"), 120);
      wm.check(e);
    };
    await press("C");
    let shown = "";
    for (const ch of expr.replace(/\s+/g, "")) {
      const k = OP[ch] ?? ch;
      await press(k);
      shown += /[÷×−+]/.test(k) ? ` ${k} ` : k;
      out.textContent = shown;
      out.scrollLeft = out.scrollWidth;
    }
    await press("=");
    const value = evaluate(expr);
    const text = Number.isFinite(value) ? fmt(value) : "Error";
    tape.textContent = `${label ? `${label}: ` : ""}${shown} =`;
    out.textContent = text;
    gsap.fromTo(out, { scale: 1.15, color: "#ffd27a" }, { scale: 1, color: "#ffffff", duration: 0.45, ease: "back.out(2.6)" });
    await wm.sleep(900, e);
    return value;
  }
}

function fmt(v: number) {
  if (Math.abs(v) >= 1e12 || (Math.abs(v) < 1e-4 && v !== 0)) return v.toExponential(4);
  return Number(v.toFixed(6)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

// A small, safe arithmetic evaluator: + - * / and parentheses, with the usual precedence.
export function evaluate(src: string): number {
  const s = src.replace(/\s+/g, "");
  let i = 0;
  const num = (): number => {
    if (s[i] === "(") { i++; const v = sum(); i++; return v; }
    if (s[i] === "-") { i++; return -num(); }
    const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i));
    if (!m) return NaN;
    i += m[0].length;
    return Number(m[0]);
  };
  const prod = (): number => {
    let v = num();
    while (s[i] === "*" || s[i] === "/") { const op = s[i++]; const r = num(); v = op === "*" ? v * r : v / r; }
    return v;
  };
  const sum = (): number => {
    let v = prod();
    while (s[i] === "+" || s[i] === "-") { const op = s[i++]; const r = prod(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  const v = sum();
  return i === s.length ? v : NaN;
}

// Things a bored robot works out, and quick checks while working.
export const IDLE_SUMS: [string, string][] = [
  ["Splitting the pizza bill", "48.6 / 3"],
  ["Pixels in a 4K screen", "3840 * 2160"],
  ["Coffees this week", "3 + 4 + 2 + 5 + 3"],
  ["Tokens in a long chat", "128000 * 0.7"],
  ["What a million tokens cost", "1000000 * 0.000003"],
  ["Hours until Friday", "(5 - 3) * 24 - 9"],
  ["Battery after a nap", "62 + 38"],
  ["Lines of code per coffee", "1240 / 6"],
];
export const WORK_SUMS: [string, string][] = [
  ["Checking the token budget", "200000 - 143250"],
  ["Estimating the run cost", "2.5 * 15 + 0.4 * 75"],
  ["Checking a percentage", "37 / 120 * 100"],
  ["Converting a size", "1536 / 1024"],
  ["Adding up the test counts", "48 + 112 + 9"],
];
