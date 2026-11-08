/** Desktop links use a checked, acknowledged native opener rather than a denied popup. */
export function wireChatLinks(root: HTMLElement, open: (url: string) => Promise<{ ok: boolean; error?: string }>) {
  const activate = (event: MouseEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
    if (!link || link.closest('[data-review-thread],[data-review-open]')) return;
    const url = link.getAttribute('href') || '';
    if (!/^(https?:|mailto:)/i.test(url)) return;
    event.preventDefault(); event.stopPropagation();
    root.querySelectorAll('.cp-link-error').forEach(el => el.remove());
    void open(url).then(result => { if (!result.ok) failed(result.error); }, () => failed());
    function failed(message?: string) {
      if (!link?.isConnected) return;
      const note = document.createElement('span'); note.className = 'cp-link-error'; note.setAttribute('role', 'alert');
      note.append(document.createTextNode(message || 'Your browser could not be opened.'));
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'ghost'; copy.textContent = 'Copy link';
      copy.addEventListener('click', () => { void navigator.clipboard.writeText(url).then(() => { copy.textContent = 'Copied'; }, () => { note.append(document.createTextNode(` ${url}`)); }); });
      note.append(copy); link.after(note);
    }
  };
  root.addEventListener('click', activate, true);
  root.addEventListener('auxclick', activate, true);
}
