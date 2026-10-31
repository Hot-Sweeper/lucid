/** Activity timestamps change on every tool call. Creation order does not. */
export function orderThreads<T extends { id: string; pinned: boolean; createdAt?: string | null }>(threads: readonly T[]): T[] {
  const time = (value?: string | null) => {
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return [...threads].sort((a, b) => Number(b.pinned) - Number(a.pinned)
    || time(b.createdAt) - time(a.createdAt) || a.id.localeCompare(b.id));
}

type Row = { id: string; html: string };
const rendered = new WeakMap<HTMLElement, string>();

// Keep the button, focused descendants and unchanged spinner nodes alive.
function patch(current: Node, next: Node) {
  if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
    current.parentNode!.replaceChild(next.cloneNode(true), current);
    return;
  }
  if (current.nodeType === Node.TEXT_NODE) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  if (!(current instanceof Element) || !(next instanceof Element)) return;
  for (const attr of [...current.attributes]) if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  for (const attr of [...next.attributes]) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  const oldChildren = [...current.childNodes], newChildren = [...next.childNodes];
  for (let i = 0; i < Math.max(oldChildren.length, newChildren.length); i++) {
    if (!newChildren[i]) oldChildren[i].remove();
    else if (!oldChildren[i]) current.appendChild(newChildren[i].cloneNode(true));
    else patch(oldChildren[i], newChildren[i]);
  }
}

/** Refresh row contents without rebuilding the list or disturbing the reading position. */
export function updateThreadRows(host: HTMLElement, rows: readonly Row[], emptyText = "No threads match.") {
  const scroll = host.scrollTop, rect = host.getBoundingClientRect();
  const existing = new Map([...host.children].filter((node): node is HTMLElement => node instanceof HTMLElement && !!node.dataset.threadId)
    .map((node) => [node.dataset.threadId!, node]));
  const anchor = scroll > 0 ? [...existing.values()].find((node) => node.getBoundingClientRect().bottom > rect.top) : null;
  const anchorTop = anchor?.getBoundingClientRect().top ?? 0;
  const focus = host.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
  const keep = new Set<HTMLElement>();
  let cursor = host.firstElementChild;
  for (const row of rows) {
    let node = existing.get(row.id);
    if (!node || rendered.get(node) !== row.html) {
      const template = document.createElement("template");
      template.innerHTML = row.html;
      const next = template.content.firstElementChild as HTMLElement;
      next.dataset.threadId = row.id;
      if (node) patch(node, next); else node = next;
      rendered.set(node, row.html);
    }
    keep.add(node);
    if (node === cursor) cursor = cursor.nextElementSibling;
    else host.insertBefore(node, cursor);
  }
  for (const node of [...host.children]) if (!keep.has(node as HTMLElement)) node.remove();
  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "th-empty"; empty.textContent = emptyText;
    host.appendChild(empty);
  }
  if (focus?.isConnected && document.activeElement !== focus) focus.focus({ preventScroll: true });
  // New or removed rows above the reader should not move the thread they are looking at.
  if (anchor?.isConnected) {
    const scale = host.offsetHeight ? rect.height / host.offsetHeight : 1;
    const shift = (anchor.getBoundingClientRect().top - anchorTop) / (scale || 1);
    host.scrollTop += shift;
  } else host.scrollTop = scroll;
}
