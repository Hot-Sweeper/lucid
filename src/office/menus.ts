import gsap from "gsap";

// A small themed popover menu and a confirm dialog, positioned inside the viewport.
export type MenuItem = { label: string; danger?: boolean; run: () => void | Promise<void> } | { input: string; placeholder: string; value?: string; submit: string; run: (v: string) => void | Promise<void> };

let open: HTMLElement | null = null;
export function closeMenu() {
  if (!open) return;
  const m = open;
  open = null;
  gsap.to(m, { opacity: 0, y: -4, duration: 0.12, onComplete: () => m.remove() });
}

export function showMenu(x: number, y: number, title: string, items: MenuItem[], options: { wrapTitle?: boolean } = {}) {
  closeMenu();
  const m = document.createElement("div");
  m.className = options.wrapTitle ? "pop-menu pop-menu-message" : "pop-menu";
  m.setAttribute("role", "menu");
  m.innerHTML = `<p class="pm-title"></p>`;
  m.querySelector(".pm-title")!.textContent = title;
  for (const it of items) {
    if ("input" in it) {
      const f = document.createElement("form");
      f.className = "pm-form";
      f.innerHTML = `<label><span></span><input type="text"></label><button type="submit" class="primary"></button><p class="pm-msg" role="status"></p>`;
      f.querySelector("span")!.textContent = it.input;
      const inp = f.querySelector("input") as HTMLInputElement;
      inp.placeholder = it.placeholder;
      inp.value = it.value ?? "";
      f.querySelector("button")!.textContent = it.submit;
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = inp.value.trim();
        if (!v) return;
        const msg = f.querySelector(".pm-msg") as HTMLElement;
        msg.textContent = "Working on it…";
        try { await it.run(v); closeMenu(); } catch (err: any) { msg.textContent = String(err?.message || err); }
      });
      m.appendChild(f);
    } else {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.className = it.danger ? "danger" : "";
      b.textContent = it.label;
      b.addEventListener("click", async () => { closeMenu(); await it.run(); });
      m.appendChild(b);
    }
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.min(x, innerWidth - r.width - 10)}px`;
  m.style.top = `${Math.min(y, innerHeight - r.height - 10)}px`;
  gsap.fromTo(m, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.15 });
  open = m;
  (m.querySelector("input, button") as HTMLElement | null)?.focus();
}

export function confirmDialog(title: string, body: string, action: string): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "dialog-wrap";
    wrap.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true"><h2></h2><p></p><div class="dialog-actions"><button type="button" class="ghost" data-a="no">Cancel</button><button type="button" class="primary danger" data-a="yes"></button></div></div>`;
    wrap.querySelector("h2")!.textContent = title;
    wrap.querySelector("p")!.textContent = body;
    (wrap.querySelector('[data-a="yes"]') as HTMLElement).textContent = action;
    document.body.appendChild(wrap);
    const done = (v: boolean) => { window.removeEventListener("keydown", onKey, true); gsap.to(wrap, { opacity: 0, duration: 0.15, onComplete: () => wrap.remove() }); resolve(v); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); done(false); } };
    window.addEventListener("keydown", onKey, true);
    wrap.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest("[data-a]") as HTMLElement | null;
      if (a) done(a.dataset.a === "yes");
      else if (e.target === wrap) done(false);
    });
    gsap.fromTo(wrap.querySelector(".dialog"), { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.2 });
    (wrap.querySelector('[data-a="no"]') as HTMLElement).focus();
  });
}

document.addEventListener("pointerdown", (e) => { if (open && !open.contains(e.target as Node)) closeMenu(); }, true);
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) { e.stopImmediatePropagation(); closeMenu(); } }, true);
