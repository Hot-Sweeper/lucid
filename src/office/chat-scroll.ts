type Anchor = { element: HTMLElement; top: number };

// Timeline rows are chronological and do not overlap. Locate the reader without
// measuring every earlier bubble whenever a streaming message changes.
function firstBelow(elements: HTMLElement[], top: number): HTMLElement | null {
  let low = 0, high = elements.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (elements[mid].getBoundingClientRect().bottom > top) high = mid;
    else low = mid + 1;
  }
  return elements[low] ?? null;
}

export function chatReaderAnchor(list: HTMLElement): Anchor | null {
  const top = list.getBoundingClientRect().top;
  const rows = [...list.children].filter(el => el.matches('.cp-group,.cp-msg,.cp-event')) as HTMLElement[];
  const row = firstBelow(rows, top);
  if (!row) return null;
  let element = row;
  if (row.classList.contains('cp-group')) {
    const details = row.querySelector<HTMLDetailsElement>(':scope > .cp-earlier');
    const earlier = details?.open && !details.hidden ? details.querySelector('.cp-earlier-body')?.children : null;
    const latest = row.querySelector(':scope > .cp-latest')?.children;
    const messages = [...(earlier ?? []), ...(latest ?? [])] as HTMLElement[];
    element = firstBelow(messages, top) ?? row;
  }
  return { element, top: element.getBoundingClientRect().top };
}
