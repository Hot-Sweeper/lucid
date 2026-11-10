import gsap from "gsap";
import { logoFor } from "../robot";
import type { ThreadRef } from "./thread-ref";
import type { ChatPanel } from "./chat-panel";
import { esc } from "../util/html";

// Dragging a thread from the sidebar into the side chat references it in your message.
// Pointer events, not HTML drag and drop: a copy of the row follows the cursor, the chat's
// message box lights up as the drop target, and a preview chip shows where it will land.
// Escape puts it back. A short press is still a normal click on the row.

const ROW = ".th-row[data-id], .rail-th[data-id]";

export function wireThreadDrag(containers: HTMLElement[], chat: ChatPanel, refFor: (id: string) => ThreadRef | null,
  office?: { hold?(active: boolean): void; zone(x: number, y: number): string | null; preview(room: string | null, id?: string): void; place(id: string, room: string): boolean },
  reorder?: { target(id: string, x: number, y: number): { row: HTMLElement; after: boolean } | null; move(id: string, targetId: string, after: boolean): void }) {
  for (const box of containers) {
    box.addEventListener("pointerdown", (e) => start(e, box));
    // Logos and selected text otherwise start Chromium's native drag, which cancels
    // pointer capture while our row copy is moving to the chat.
    box.addEventListener("dragstart", (e) => {
      if ((e.target as HTMLElement).closest(ROW)) e.preventDefault();
    }, true);
  }

  function start(e: PointerEvent, _box: HTMLElement) {
    if (e.button !== 0 || e.pointerType === "touch") return;   // touch scrolls the list; the menu or R key references instead
    const row = (e.target as HTMLElement).closest(ROW) as HTMLElement | null;
    if (!row) return;
    const ref = refFor(row.dataset.id!);
    if (!ref) return;
    const x0 = e.clientX, y0 = e.clientY;
    let ghost: HTMLElement | null = null;
    let zone: "box" | "tab" | null = null;
    let officeZone: string | null = null;
    let orderTarget: { row: HTMLElement; after: boolean } | null = null;
    const clearOrder = () => { orderTarget?.row.classList.remove("th-drop-before", "th-drop-after"); };

    let finished = false;
    // captured from the start, so a quick flick off the row still counts as a drag
    try { row.setPointerCapture(e.pointerId); } catch {}

    const begin = () => {
      office?.hold?.(true);
      document.body.classList.add("th-dragging");
      window.getSelection()?.removeAllRanges();
      row.classList.add("th-dragsrc");
      ghost = document.createElement("div");
      ghost.className = "th-ghost";
      ghost.setAttribute("aria-hidden", "true");
      const logo = logoFor(ref.provider);
      ghost.innerHTML = `${logo ? `<img src="${logo}" alt="">` : ""}<span><b>${esc(ref.title)}</b><i>${esc(ref.project)}</i></span><em></em>`;
      document.body.appendChild(ghost);
      gsap.fromTo(ghost, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.14, ease: "power2.out" });
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("blur", onCancel);
      chat.dragOver(ref, null);
      track(x0, y0);
    };

    // what happens if you let go here, said on the ghost when the chat cannot take it
    const track = (x: number, y: number) => {
      // above the pointer, so it never covers the chips and the label in the box it is dropped on
      const gw = ghost!.offsetWidth, gh = ghost!.offsetHeight;
      const gx = x + 12 + gw > innerWidth - 8 ? x - gw - 12 : x + 12;   // flips left near the right edge
      gsap.set(ghost!, { x: Math.max(8, gx), y: Math.max(8, y - gh - 10) });
      zone = chat.dropZone(x, y);
      clearOrder();
      orderTarget = zone ? null : reorder?.target(ref.id, x, y) ?? null;
      orderTarget?.row.classList.add(orderTarget.after ? "th-drop-after" : "th-drop-before");
      officeZone = zone || orderTarget ? null : office?.zone(x, y) ?? null;
      office?.preview(officeZone, ref.id);
      chat.dragOver(ref, zone);
      const note = ghost!.querySelector("em") as HTMLElement;
      const say = orderTarget ? "Move thread here" : officeZone ? "Move thread to this office" : zone ? "" : "Drop in the list to reorder, in an office to move, or in chat to reference";
      if (note.textContent !== say) note.textContent = say;
      ghost!.classList.toggle("over", !!zone || !!officeZone || !!orderTarget);
    };

    const onMove = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        begin();
      }
      ev.preventDefault();
      track(ev.clientX, ev.clientY);
    };

    const cleanup = () => {
      clearOrder();
      finished = true;
      row.removeEventListener("pointermove", onMove);
      row.removeEventListener("pointerup", onUp);
      row.removeEventListener("pointercancel", onCancel);
      row.removeEventListener("lostpointercapture", onCancel);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onCancel);
      document.body.classList.remove("th-dragging");
      row.classList.remove("th-dragsrc");
      chat.dragOver(null, null);
      office?.preview(null);
      if (ghost) office?.hold?.(false);
    };

    // nothing happens: the copy glides back to the row it came from
    const goBack = (g: HTMLElement) => {
      const r = row.getBoundingClientRect();
      gsap.to(g, { x: r.left + 8, y: r.top + 4, opacity: 0, scale: 0.92, duration: 0.24, ease: "power2.in", onComplete: () => g.remove() });
    };

    // the click that ends a drag must not also open the row
    const eatClick = () => {
      const stop = (ev: Event) => { ev.preventDefault(); ev.stopImmediatePropagation(); };
      window.addEventListener("click", stop, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", stop, true), 0);
    };

    const onUp = () => {
      if (finished) return;
      const g = ghost;
      const at = zone;
      const room = officeZone;
      cleanup();
      if (!g) return;   // a plain click
      eatClick();
      if (orderTarget) {
        reorder?.move(ref.id, orderTarget.row.dataset.id!, orderTarget.after);
        g.remove();
        return;
      }
      if (room && office?.place(ref.id, room)) {
        gsap.to(g, { opacity: 0, scale: 0.8, duration: 0.2, onComplete: () => g.remove() });
        return;
      }
      if (!at) { goBack(g); return; }
      const chip = chat.addReference(ref);
      if (!chip) { goBack(g); return; }
      // the copy shrinks into the chip it became
      const r = chip.getBoundingClientRect();
      gsap.to(g, { x: r.left, y: r.top, width: r.width, opacity: 0, scale: 0.96, duration: 0.24, ease: "power2.out", onComplete: () => g.remove() });
      gsap.fromTo(chip, { opacity: 0.2 }, { opacity: 1, duration: 0.26, delay: 0.08 });
    };
    const onCancel = (ev?: Event) => {
      if (finished) return;
      const g = ghost;
      cleanup();
      if (!g) return;
      goBack(g);
      // cancelled with Escape while the button is still down: the click comes when it is released
      if (ev instanceof KeyboardEvent) window.addEventListener("pointerup", eatClick, { capture: true, once: true });
      else eatClick();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      onCancel(ev);
      try { row.releasePointerCapture(e.pointerId); } catch {}
    };
    row.addEventListener("pointermove", onMove);
    row.addEventListener("pointerup", onUp);
    row.addEventListener("pointercancel", onCancel);
    row.addEventListener("lostpointercapture", onCancel);
  }
}
