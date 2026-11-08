export type ThreadReference = { environmentId: string; threadId: string };
export function parseThreadReference(value: string): ThreadReference | null {
  const m = /^t3-thread:\/\/v2\/([a-z0-9-]+)\/([^\s<>?#]+)$/i.exec(value.trim());
  if (!m) return null;
  try { const threadId = decodeURIComponent(m[2]); return threadId && !/[\u0000-\u001f/\\]/.test(threadId) ? { environmentId: m[1], threadId } : null; } catch { return null; }
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function threadCardMarkup(href: string) {
  return `<button type="button" class="cp-thread-card" data-thread-ref="${esc(href)}"><span>Loading thread…</span></button>`;
}
export type ThreadCardInfo = { title: string; provider: string; model?: string | null; portrait: string; name?: string };
export function hydrateThreadCards(root: HTMLElement, resolve?: (ref: ThreadReference) => ThreadCardInfo | null) {
  for (const card of root.querySelectorAll<HTMLButtonElement>('[data-thread-ref]')) {
    const ref = parseThreadReference(card.dataset.threadRef || '');
    const info = ref && resolve?.(ref);
    const signature = JSON.stringify(info);
    if (card.dataset.cardSignature === signature) continue;
    card.dataset.cardSignature = signature; card.disabled = !info;
    card.innerHTML = info ? `${info.portrait}<span><strong>${esc(info.title)}</strong><small>${esc([info.name, info.provider, info.model].filter(Boolean).join(' · '))}</small></span>` : '<span>Thread unavailable in this office</span>';
  }
}
