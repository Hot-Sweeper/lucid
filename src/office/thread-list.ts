type OrderThread = { settled?: boolean; runStatus: string | null; lastStatus?: string | null; updatedAt: string; question?: string | null; job?: {state: string} | null };
const completed = (t: OrderThread) => !t.settled && !t.question && !t.job && (t.runStatus === 'completed' || !t.runStatus && t.lastStatus === 'completed');
/** New replies lead the view; retain the server's order for all other threads. */
export function completionFirst<T extends OrderThread>(threads: T[]): T[] {
  return [...threads].sort((a,b) => Number(completed(b))-Number(completed(a)) || (completed(a) && completed(b) ? (Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0) : 0));
}
/** T3's pinned threads stay on top; each group keeps its own order. */
export function pinnedFirst<T extends { pinned?: boolean }>(threads: T[]): T[] {
  return [...threads.filter(t => t.pinned), ...threads.filter(t => !t.pinned)];
}

const key = (node: Node): string | null => {
  if (!(node instanceof Element)) return null;
  return node.id || node.getAttribute('data-id') || (node.tagName === 'LI' ? node.firstElementChild?.getAttribute('data-id') : null) || null;
};
function patch(parent: Element, fresh: Element) {
  const keyed = new Map([...parent.childNodes].map(n => [key(n),n]).filter(([k]) => k) as [string,Node][]);
  let cursor = parent.firstChild;
  for (const next of [...fresh.childNodes]) {
    const id = key(next);
    let current = id ? keyed.get(id) : cursor && !key(cursor) && cursor.nodeName === next.nodeName ? cursor : null;
    if (!current || current.nodeName !== next.nodeName) current = next.cloneNode(true);
    if (current !== cursor) {
      // Chromium's state-preserving move retains focus and running CSS animation timelines.
      const move = (parent as Element & {moveBefore?: (node: Node, before: Node | null) => void}).moveBefore;
      if (move && current.isConnected && parent.isConnected) move.call(parent, current, cursor);
      else parent.insertBefore(current, cursor);
    }
    if (current instanceof Element && next instanceof Element) {
      for (const attr of [...current.attributes]) if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
      for (const attr of [...next.attributes]) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name,attr.value);
      patch(current,next);
    } else if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    cursor = current.nextSibling;
  }
  while (cursor) { const next = cursor.nextSibling; parent.removeChild(cursor); cursor = next; }
}
/** Patch changed text/attributes while retaining row, icon and scroll identities. */
export function reconcileThreadList(host: Element, html: string) {
  const template = document.createElement('template'); template.innerHTML = html;
  const fresh = document.createElement('div'); fresh.append(template.content);
  patch(host,fresh);
}
