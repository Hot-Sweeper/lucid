/** Open the conversation before robot toys or screen controls stop bubbling.
 * Keep the original event intact so computer buttons still perform their action. */
export function wireDeskChatTargets(el: HTMLElement, thread: () => string | null,
  dragged: () => boolean, open: (id: string) => void) {
  const opened = new WeakSet<Event>();
  el.addEventListener("click", event => {
    if (event.button !== 0 || dragged()) return;
    const id = thread();
    const target = event.target instanceof Element ? event.target : null;
    if (id && target?.closest(".poke-head, .robot-host, .monitor")) { opened.add(event); open(id); }
  }, true);
  return opened;
}
