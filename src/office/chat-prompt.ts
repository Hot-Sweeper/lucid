/** A compact, read-only view of the latest submitted prompt when its bubble is offscreen. */
export class ChatPromptContext {
  private button = document.createElement('button');
  private text = document.createElement('span');
  private row: HTMLElement | null = null;
  private frame = 0;
  private resize: ResizeObserver;
  constructor(private list: HTMLElement) {
    const wrap = document.createElement('div'); wrap.className = 'cp-transcript';
    list.before(wrap); wrap.append(list);
    this.button.type = 'button'; this.button.className = 'cp-prompt-context'; this.button.hidden = true;
    this.button.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4-4 4 4M8 2v9a3 3 0 0 1-3 3H3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this.button.append(this.text); wrap.append(this.button);
    this.button.addEventListener('click', () => {
      if (!this.row?.isConnected) return;
      this.list.scrollTop += this.row.getBoundingClientRect().top - this.list.getBoundingClientRect().top - 12;
      this.row.tabIndex = -1; this.row.focus({ preventScroll: true }); this.schedule();
    });
    this.resize = new ResizeObserver(this.schedule);
    this.resize.observe(list);
    list.addEventListener('scroll', this.schedule, { passive: true });
  }
  set(row: HTMLElement | null) {
    if (row !== this.row) {
      if (this.row) this.resize.unobserve(this.row);
      this.row = row;
      if (row) this.resize.observe(row);
    }
    const content = row?.querySelector('.cp-text')?.textContent?.trim()
      || [...(row?.querySelectorAll<HTMLImageElement>('.cp-atts img') ?? [])].map(img => img.alt).filter(Boolean).join(', ')
      || row?.querySelector('.cp-atts')?.textContent?.trim() || '';
    if (this.text.textContent !== content) this.text.textContent = content;
    this.button.title = content;
    this.button.setAttribute('aria-label', `Jump to latest prompt: ${content}`);
    this.schedule();
  }
  private schedule = () => {
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.measure(); });
  };
  private measure() {
    const row = this.row;
    if (!row?.isConnected || !this.text.textContent || !this.list.clientHeight) { this.button.hidden = true; return; }
    const view = this.list.getBoundingClientRect();
    const bubble = row.querySelector('.cp-text') ?? row;
    const rect = bubble.getBoundingClientRect();
    this.button.hidden = rect.bottom > view.top + 2 && rect.top < view.bottom - 2;
  }
  clear() { this.set(null); this.button.hidden = true; }
  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.resize.disconnect(); this.list.removeEventListener('scroll', this.schedule); this.button.remove();
  }
}
