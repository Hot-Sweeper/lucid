// Two tiny DOM helpers shared by the usage, limits and coin ledger panels.

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Set text only when it changed, so live refreshes do not touch unchanged nodes. */
export function setText(e: HTMLElement, text: string) {
  if (e.textContent !== text) e.textContent = text;
}
