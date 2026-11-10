// Real site icons in the robot browser. Letter icons (sites.ts favHtml) render at once; the
// site's own favicon, fetched and cached by the main process (electron/favicons.cjs), replaces
// the letter when it arrives. Nothing waits for it, and a failure keeps the letter.
const known = new Map<string, Promise<string | null>>();

function iconFor(host: string): Promise<string | null> {
  let p = known.get(host);
  if (!p) {
    const api = (window as any).lucid?.favicon as undefined | ((host: string) => Promise<string | null>);
    p = api ? api(host).then((v) => (typeof v === "string" && v.startsWith("data:image/") ? v : null), () => null) : Promise.resolve(null);
    known.set(host, p);
    if (known.size > 300) known.delete(known.keys().next().value!);
  }
  return p;
}

/** Swaps letter icons under `root` for real favicons as they become available. */
export function hydrateFavicons(root: ParentNode) {
  for (const el of root.querySelectorAll<HTMLElement>(".fav[data-fav-host]:not([data-fav-asked])")) {
    el.dataset.favAsked = "1";
    const host = el.dataset.favHost!;
    void iconFor(host).then((src) => {
      if (!src || !el.isConnected || el.dataset.favHost !== host) return;
      const img = new Image();
      img.alt = "";
      img.decoding = "async";
      img.onload = () => { if (el.isConnected && el.dataset.favHost === host) { el.classList.add("fav-img"); el.replaceChildren(img); } };
      img.src = src;
    });
  }
}
