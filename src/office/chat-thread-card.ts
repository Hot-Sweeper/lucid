import { esc } from "../util/html";
export type ThreadReference = { environmentId: string; threadId: string };
export function parseThreadReference(value: string): ThreadReference | null {
  const m = /^t3-thread:\/\/v2\/([a-z0-9-]+)\/([^\s<>?#]+)$/i.exec(value.trim());
  if (!m) return null;
  try { const threadId = decodeURIComponent(m[2]); return threadId && !/[\u0000-\u001f/\\]/.test(threadId) ? { environmentId: m[1], threadId } : null; } catch { return null; }
}
export function threadCardMarkup(href: string) {
  return `<button type="button" class="cp-thread-card" data-thread-ref="${esc(href)}"><span>Loading thread…</span></button>`;
}
export type ThreadCardInfo = { title: string; provider: string; model?: string | null; portrait: string; name?: string };
export function hydrateThreadCards(root: HTMLElement, resolve?: (ref: ThreadReference) => ThreadCardInfo | null) {
  for (const card of root.querySelectorAll<HTMLButtonElement>('[data-thread-ref]')) {
    // A reference within prose should sit on the text line, not stretch it into
    // a two-line robot card. Keep the full card when the reference stands alone.
    const paragraph = card.closest('p, li, td, th');
    const context = paragraph?.cloneNode(true) as HTMLElement | undefined;
    context?.querySelectorAll('[data-thread-ref]').forEach(reference => reference.remove());
    card.classList.toggle('cp-thread-card-inline', !!context?.textContent?.trim());
    const ref = parseThreadReference(card.dataset.threadRef || '');
    const info = ref && resolve?.(ref);
    const signature = JSON.stringify(info);
    if (card.dataset.cardSignature === signature) continue;
    card.dataset.cardSignature = signature; card.disabled = !info;
    if (info) card.title = [info.title, info.name, info.provider, info.model].filter(Boolean).join(' · ');
    else card.removeAttribute('title');
    card.innerHTML = info ? `${info.portrait}<span><strong>${esc(info.title)}</strong><small>${esc([info.name, info.provider, info.model].filter(Boolean).join(' · '))}</small></span>` : '<span>Thread unavailable in this office</span>';
  }
}
