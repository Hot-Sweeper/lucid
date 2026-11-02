import { renderFps, renderLoop } from "../perf/render";
import { scheduleLayout } from "../harness/layout";

/** Follow a changing prompt only at its visible presentation cadence. */
export function followPromptScroll(owner: HTMLElement, valid: () => boolean) {
  let dead = false, finished = false, dirty = true, queued = false;
  let measured: string | null = null;
  let stop: (() => void) | undefined;
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { dirty = true; });
  const cancel = () => { if (dead) return; dead = true; observer?.disconnect(); stop?.(); };
  const alive = () => !dead && valid() && owner.isConnected;
  const frame = () => {
    if (!alive()) { cancel(); return; }
    const text = owner.textContent;
    if (queued) return;
    if (!dirty && text === measured) { if (finished) cancel(); return; }
    queued = true;
    scheduleLayout(owner, () => {
      queued = false;
      if (!alive()) { cancel(); return null; }
      if (!renderFps(owner)) return null;
      const text = owner.textContent;
      const target = Math.max(0, owner.scrollHeight - owner.clientHeight);
      const current = owner.scrollTop;
      measured = text; dirty = false;
      if (Math.abs(current - target) < .5) { if (finished) cancel(); return null; }
      return () => {
        if (!alive()) { cancel(); return; }
        if (!renderFps(owner) || owner.textContent !== text) { dirty = true; return; }
        owner.scrollTop = target;
        if (finished) cancel();
      };
    });
  };
  observer?.observe(owner);
  stop = renderLoop(owner, frame);
  return {
    // Leave the final changed prompt pending while covered. The visible scheduler
    // presents its final scroll on resume, unless sending/cancellation disposes it.
    finish() { finished = true; if (!alive()) cancel(); },
    cancel,
  };
}
