import gsap from "gsap";

// Folding parts of the left sidebar: each section folds up into its header, and the whole
// sidebar folds into a slim rail on the left edge that still lists the threads and coins.

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const FOLD_ICON = `<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** The labeled Hide/Show button in a section header. */
export const foldButton = (key: string, name: string, open = true) =>
  `<button type="button" class="sec-fold" data-fold="${key}" data-name="${name}" aria-expanded="${open}" aria-controls="fold-${key}" aria-label="${open ? "Hide" : "Show"} ${name}" title="${open ? "Hide" : "Show"} ${name}"><span>${open ? "Hide" : "Show"}</span>${FOLD_ICON}</button>`;

/** Shows or hides one section's body; it folds up into its header. */
export function foldSection(key: string, open: boolean, animate = true) {
  const body = document.getElementById(`fold-${key}`);
  const btn = document.querySelector(`[data-fold="${key}"]`) as HTMLElement | null;
  if (!body || !btn) return;
  const name = btn.dataset.name || key;
  btn.setAttribute("aria-expanded", String(open));
  btn.setAttribute("aria-label", `${open ? "Hide" : "Show"} ${name}`);
  btn.title = `${open ? "Hide" : "Show"} ${name}`;
  (btn.querySelector("span") as HTMLElement).textContent = open ? "Hide" : "Show";
  body.closest("section")?.classList.toggle("folded", !open);
  gsap.killTweensOf(body);
  if (!animate || still()) { body.hidden = !open; gsap.set(body, { clearProps: "height,opacity,y,overflow" }); return; }
  if (open) {
    body.hidden = false;
    gsap.fromTo(body, { height: 0, opacity: 0, y: -6, overflow: "hidden" }, { height: "auto", opacity: 1, y: 0, duration: 0.3, ease: "power2.out", clearProps: "height,opacity,y,overflow" });
  } else {
    gsap.fromTo(body, { height: body.offsetHeight, overflow: "hidden" }, { height: 0, opacity: 0, y: -6, duration: 0.24, ease: "power2.in",
      onComplete: () => { body.hidden = true; gsap.set(body, { clearProps: "height,opacity,y,overflow" }); } });
  }
}

const RAIL = 64;

/**
 * Folds the sidebar into the rail or opens it again. `onWidth` gets the change in sidebar
 * width every frame, so the office view can hold still while the space beside it grows.
 */
export function setRail(on: boolean, o: { app: HTMLElement; panel: HTMLElement; rail: HTMLElement; animate?: boolean; wide?: () => number; onWidth?: (delta: number) => void; done?: () => void }) {
  const { app, panel, rail } = o;
  const WIDE = o.wide?.() ?? 300;
  const parts = [...panel.children] as HTMLElement[];
  const items = () => [...rail.querySelectorAll(".rail-show, .rail-coins, .rail-th")] as HTMLElement[];
  gsap.killTweensOf([app, panel, rail, ...parts, ...items()]);
  let w = parseFloat(getComputedStyle(app).getPropertyValue("--side")) || (on ? WIDE : RAIL);
  const step = () => {
    const nw = parseFloat(getComputedStyle(app).getPropertyValue("--side")) || w;
    if (nw !== w) { o.onWidth?.(w - nw); w = nw; }
  };
  const finish = () => { o.done?.(); };
  if (on) {
    panel.dataset.scroll = String(panel.scrollTop);
    if (o.animate === false || still()) {
      app.style.setProperty("--side", `${RAIL}px`); step();
      panel.hidden = true; rail.hidden = false; app.classList.add("railed");
      finish(); return;
    }
    // the sections slide away to the left while the sidebar narrows into the rail
    panel.classList.add("folding");
    gsap.timeline({ onComplete: finish })
      .to(parts, { x: -36, opacity: 0, duration: 0.2, ease: "power2.in", stagger: 0.015 }, 0)
      .to(app, { "--side": `${RAIL}px`, duration: 0.38, ease: "power3.inOut", onUpdate: step }, 0.04)
      .add(() => {
        panel.hidden = true; panel.classList.remove("folding"); gsap.set(parts, { clearProps: "x,opacity" });
        rail.hidden = false; app.classList.add("railed");
      })
      .fromTo(items(), { x: -10, opacity: 0 }, { x: 0, opacity: 1, duration: 0.22, ease: "power2.out", stagger: 0.012 });
  } else {
    const restore = () => { panel.scrollTop = Number(panel.dataset.scroll || 0); };
    if (o.animate === false || still()) {
      app.style.setProperty("--side", `${WIDE}px`); step();
      rail.hidden = true; panel.hidden = false; app.classList.remove("railed"); restore();
      finish(); return;
    }
    // the rail steps aside and the sections slide back out of the left edge
    gsap.timeline({ onComplete: () => { panel.classList.remove("folding"); finish(); } })
      .to(items(), { x: -10, opacity: 0, duration: 0.12, ease: "power2.in" }, 0)
      .add(() => {
        rail.hidden = true; gsap.set(items(), { clearProps: "x,opacity" });
        panel.hidden = false; panel.classList.add("folding"); app.classList.remove("railed"); restore();
        gsap.set(parts, { x: -36, opacity: 0 });
      })
      .to(app, { "--side": `${WIDE}px`, duration: 0.38, ease: "power3.inOut", onUpdate: step })
      .to(parts, { x: 0, opacity: 1, duration: 0.26, ease: "power2.out", stagger: 0.02, clearProps: "x,opacity" }, "-=0.24");
  }
}
