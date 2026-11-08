type Camera = { x: number; y: number; s: number };
type Point = { x: number; y: number };
type Options = {
  camera(): Camera;
  viewport(): { left: number; top: number };
  zoomBounds?(): { min: number; max: number };
  constrain?(): void;
  start(kind: 'pan' | 'pinch'): void;
  input?(kind: 'pan' | 'pinch'): void;
  change(): void;
  end(): void;
};

/** Touch belongs to the camera until release. A stationary touch retains its native click. */
export function mountTouchCamera(scene: HTMLElement, options: Options) {
  const points = new Map<number, Point>();
  let previous: { centre: Point; distance: number } | null = null;
  let active = false, suppressUntil = 0, disposed = false;
  const group = () => {
    const [a, b] = [...points.values()];
    if (!a) return null;
    return { centre: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a,
      distance: b ? Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) : 0 };
  };
  const claim = () => {
    if (active) return;
    active = true;
    scene.classList.add('panning');
    options.start(points.size > 1 ? 'pinch' : 'pan');
    for (const id of points.keys()) { try { scene.setPointerCapture(id); } catch { /* pointer already cancelled */ } }
  };
  const release = (id: number) => { try { if (scene.hasPointerCapture(id)) scene.releasePointerCapture(id); } catch { /* capture already lost */ } };
  const finish = () => {
    const ids = [...points.keys()];
    points.clear(); previous = null;
    if (active) { active = false; suppressUntil = performance.now() + 800; scene.classList.remove('panning'); options.end(); }
    for (const id of ids) release(id);
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    if ((event.target as Element)?.closest('.office-width-handle')) return;
    if (!points.size) { suppressUntil = 0; previous = null; }
    // Prevent workstation, room and toy drag handlers from claiming a phone swipe.
    // Do not cancel a single down: native click, focus and button activation must survive a tap.
    event.stopImmediatePropagation();
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previous = group();
    if (points.size > 1) { event.preventDefault(); claim(); }
  };
  const move = (event: PointerEvent) => {
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = group();
    if (!next || !previous) return;
    const dx = next.centre.x - previous.centre.x, dy = next.centre.y - previous.centre.y;
    if (!active && Math.hypot(dx, dy) < 6) return;
    claim(); options.input?.(points.size > 1 ? 'pinch' : 'pan'); event.preventDefault(); event.stopImmediatePropagation();
    const camera = options.camera(), box = options.viewport();
    const bounds = options.zoomBounds?.() ?? { min: .08, max: 5 };
    const scale = previous.distance && next.distance ? Math.min(bounds.max, Math.max(bounds.min, camera.s * next.distance / previous.distance)) : camera.s;
    const ratio = scale / camera.s;
    const x = next.centre.x - box.left - (previous.centre.x - box.left - camera.x) * ratio;
    const y = next.centre.y - box.top - (previous.centre.y - box.top - camera.y) * ratio;
    if (x !== camera.x || y !== camera.y || scale !== camera.s) {
      Object.assign(camera, { x, y, s: scale });
      // Keep the input model valid before the next pointer event. Deferring
      // constraints to paint makes pinch reversals depend on RAF batching.
      options.constrain?.();
      options.change();
    }
    previous = next;
  };
  const up = (event: PointerEvent) => {
    if (!points.has(event.pointerId)) return;
    if (event.type === 'pointercancel' || event.type === 'lostpointercapture') { finish(); return; }
    points.delete(event.pointerId);
    previous = group();
    if (active) { event.preventDefault(); event.stopImmediatePropagation(); }
    if (!points.size) {
      if (active) { active = false; suppressUntil = performance.now() + 800; scene.classList.remove('panning'); options.end(); }
      previous = null;
    }
    release(event.pointerId);
  };
  const click = (event: MouseEvent) => {
    // A browser can synthesize its click after release, including after a cancelled pinch.
    // Keyboard activation is unaffected, and a fresh touch immediately restores tapping.
    if (event.detail !== 0 && (active || performance.now() < suppressUntil)) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const hidden = () => { if (document.hidden) finish(); };
  const pagehide = (event: PageTransitionEvent) => { if (event.persisted) finish(); else destroy(); };
  const destroy = () => {
    if (disposed) return;
    disposed = true; finish();
    scene.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    scene.removeEventListener('lostpointercapture', up);
    scene.removeEventListener('click', click, true);
    window.removeEventListener('blur', finish);
    window.removeEventListener('pagehide', pagehide);
    document.removeEventListener('visibilitychange', hidden);
  };
  scene.addEventListener('pointerdown', down, { capture: true, passive: false });
  window.addEventListener('pointermove', move, { capture: true, passive: false });
  window.addEventListener('pointerup', up, { capture: true, passive: false });
  window.addEventListener('pointercancel', up, true);
  scene.addEventListener('lostpointercapture', up);
  scene.addEventListener('click', click, true);
  window.addEventListener('blur', finish);
  window.addEventListener('pagehide', pagehide);
  document.addEventListener('visibilitychange', hidden);
  return destroy;
}
