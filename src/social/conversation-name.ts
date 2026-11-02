/** Mirror the selected row's localized label, without translating an identity twice. */
export function followConversationName(header: HTMLElement, label: HTMLElement): () => void {
  let active = true;
  const update = () => {
    if (active && header.textContent !== label.textContent) header.textContent = label.textContent;
  };
  const observer = new MutationObserver(update);
  observer.observe(label, { childList: true, characterData: true, subtree: true });
  update();
  return () => { active = false; observer.disconnect(); };
}
