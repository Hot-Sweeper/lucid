import './office-width.css';

export const MAX_OFFICE_COLUMNS = 6;
export const officeColumns = (value?: number) => Number.isFinite(value) ? Math.min(MAX_OFFICE_COLUMNS, Math.max(1, Math.round(value!))) : 1;
export function officeDimensions(slots: number, columns: number, slotW: number, slotH: number, lounge = 0) {
  const cols = officeColumns(columns);
  return { w: 120 + cols * slotW, h: 180 + Math.ceil(Math.max(1, slots) / cols) * slotH + lounge, cols };
}

const disposers = new WeakMap<HTMLElement, () => void>();
export function releaseOfficeWidth(room: HTMLElement) { disposers.get(room)?.(); disposers.delete(room); }

/** Preview the chosen wall position; commit through the world's safe floor-plan handoff. */
export function mountOfficeWidth(room: HTMLElement, title: string, columns: number, slotW: number, hold: (held: boolean) => void, change: (columns: number) => void) {
  const controls = document.createElement('div'); controls.className = 'office-width-controls';
  const less = document.createElement('button'), more = document.createElement('button');
  for (const [button, label, step] of [[less, 'Narrow', -1], [more, 'Widen', 1]] as const) {
    button.type = 'button'; button.textContent = label;
    button.setAttribute('aria-label', `${label} ${title} office`);
    button.disabled = step < 0 ? columns === 1 : columns === MAX_OFFICE_COLUMNS;
    button.addEventListener('click', e => { e.stopPropagation(); change(columns + step); });
    button.addEventListener('pointerdown', e => { if (e.button === 0) e.stopPropagation(); });
    controls.append(button);
  }
  const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'office-width-handle';
  handle.textContent = '↔'; handle.title = 'Drag to stretch office horizontally. Arrow keys adjust width.';
  handle.setAttribute('aria-label', `Width of ${title} office: ${columns} columns. Use Left and Right arrow keys to resize.`);
  handle.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); change(columns + (e.key === 'ArrowRight' ? 1 : -1)); }
  });
  let drag: { id: number; x: number; scale: number; target: number } | null = null;
  let preview: HTMLElement | null = null;
  const finish = (commit = false) => {
    if (!drag) return;
    const { id, target } = drag; drag = null;
    preview?.remove(); preview = null;
    window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('keydown', escape, true);
    try { if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id); } catch { /* already released */ }
    hold(false);
    if (commit) change(target);
  };
  const cancel = () => finish();
  const hidden = () => { if (document.hidden) finish(); };
  const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); } };
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag) return;
    e.preventDefault(); e.stopPropagation();
    try { handle.setPointerCapture(e.pointerId); } catch { return; }
    drag = { id: e.pointerId, x: e.clientX, scale: room.getBoundingClientRect().width / room.offsetWidth, target: columns };
    preview = document.createElement('div'); preview.className = 'office-width-preview'; preview.style.width = `${room.offsetWidth}px`; room.append(preview);
    hold(true); window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden); window.addEventListener('keydown', escape, true);
  });
  handle.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    e.stopPropagation();
    drag.target = officeColumns(columns + (e.clientX - drag.x) / (drag.scale * slotW));
    preview!.style.width = `${120 + drag.target * slotW}px`;
    preview!.textContent = `${drag.target} ${drag.target === 1 ? 'column' : 'columns'}`;
  });
  handle.addEventListener('pointerup', e => { if (drag?.id === e.pointerId) { e.stopPropagation(); finish(true); } });
  handle.addEventListener('pointercancel', cancel); handle.addEventListener('lostpointercapture', cancel);
  handle.addEventListener('click', e => e.stopPropagation());
  room.append(controls, handle); disposers.set(room, cancel);
}
