import { LIBRARY_APPS, type LibraryCategory, type LibraryApp } from "./app-library-catalog";
import { ICONS } from "../os/icons";
import { gameSound } from "./sound";
import { mountSongLibrary } from "./song-library";
import { getLocale, onLocaleChange } from "../localization";
let current: { close: () => void } | null = null;
export function openAppLibrary(trigger: HTMLElement) {
  if (current) { current.close(); return; }
  const scene = document.getElementById("scene");
  const host = scene?.parentElement;
  if (!scene || !host) return;
  window.dispatchEvent(new Event("lucid:center-view"));
  const wasInert = scene.inert;
  const dialog = document.createElement("section");
  let releasePreview: (() => void) | null = null;
  let stopLocale: (() => void) | null = null;
  const clearPreview = () => { releasePreview?.(); releasePreview = null; preview.replaceChildren(); };
  const close = () => {
    window.removeEventListener("lucid:center-view", close);
    clearPreview(); stopLocale?.(); dialog.remove(); current = null;
    scene.inert = wasInert; host.classList.remove("app-library-open");
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus({ preventScroll: true });
  };
  window.addEventListener("lucid:center-view", close);
  current = { close };
  dialog.id = "app-library"; dialog.className = "app-library"; dialog.setAttribute("aria-labelledby", "app-library-title");
  dialog.innerHTML = `<header class="al-header"><div><h2 id="app-library-title">App library</h2><p>Apps, games and your office soundtrack.</p></div><button type="button" class="ghost al-close" aria-label="Back to office">Back to office</button></header><div class="al-toolbar"><label class="al-search">Search apps<input type="search" placeholder="Games, Botcord, YouTube…" autofocus></label><nav class="al-categories" aria-label="App categories"></nav></div><div class="al-content"><section class="al-browse" aria-label="Apps"><p class="al-count" role="status"></p><div class="al-grid"></div></section><section class="al-detail" aria-label="App details"><div class="al-selected"></div><div class="al-preview"></div></section></div><footer class="al-footer">These are Lucid’s built-in apps. Previews use demo content and do not control a working robot.</footer>`;
  const search = dialog.querySelector<HTMLInputElement>("input")!;
  const grid = dialog.querySelector<HTMLElement>(".al-grid")!;
  const preview = dialog.querySelector<HTMLElement>(".al-preview")!;
  const detailPane = dialog.querySelector<HTMLElement>(".al-detail")!;
  const backApps = document.createElement("button"); backApps.type = "button";
  backApps.className = "ghost al-back-apps"; detailPane.prepend(backApps);
  backApps.addEventListener("click", () => {
    dialog.classList.remove("al-live"); dialog.classList.add("al-browsing");
    grid.querySelector<HTMLButtonElement>('button[data-id="soundtrack"]')?.focus({preventScroll: true});
  });
  const name = (a: LibraryApp) => a.live && getLocale() === "de" ? "Song-Mediathek" : a.name;
  const description = (a: LibraryApp) => a.live && getLocale() === "de" ? "Lucids eigenen Büro-Soundtrack durchsuchen und abspielen." : a.description;
  let category: LibraryCategory = "All", selected: LibraryApp = LIBRARY_APPS[0];
  const icon = (a: LibraryApp) => a.live === "soundtrack"
    ? '<svg class="ico" viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="10" fill="var(--accent)"/><path d="M17 27V13l13-3v14M17 17l13-3" fill="none" stroke="var(--night)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="13.8" cy="27.5" rx="4.3" ry="3.2" fill="var(--night)"/><ellipse cx="26.8" cy="24.5" rx="4.3" ry="3.2" fill="var(--night)"/></svg>'
    : ICONS[a.icon] ?? ICONS.tool;
  const show = (a: LibraryApp) => {
    if (a.live && a.id === selected.id && releasePreview) {
      dialog.classList.add("al-live"); dialog.classList.remove("al-browsing");
      preview.querySelector<HTMLInputElement>("input")?.focus({preventScroll: true});
      return;
    }
    selected = a; clearPreview();
    dialog.classList.toggle("al-live", !!a.live); dialog.classList.remove("al-browsing");
    detailPane.classList.toggle("al-detail-live", !!a.live);
    const detail = dialog.querySelector<HTMLElement>(".al-selected")!;
    detail.innerHTML = `<span class="al-icon" aria-hidden="true">${icon(a)}</span><div><h3></h3><p></p></div>`;
    detail.querySelector("h3")!.textContent = name(a); detail.querySelector("p")!.textContent = description(a);
    for (const b of grid.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset.id === a.id));
    updateCopy();
    if (a.live === "soundtrack") {
      releasePreview = mountSongLibrary(preview);
      if (dialog.clientWidth <= 700) preview.querySelector<HTMLInputElement>("input")?.focus({preventScroll: true});
      return;
    }
    const note = document.createElement("p"); note.className = "al-preview-note";
    note.textContent = a.demo ? "Watch a demo of this app." : "This app displays real work or opened files on a robot’s computer. No standalone demo yet.";
    preview.append(note);
    if (a.demo) {
      const launch = document.createElement("button"); launch.type = "button"; launch.className = "primary"; launch.textContent = "Preview app";
      launch.addEventListener("click", () => {
        gameSound.play("open");
        const frame = document.createElement("iframe"); frame.title = `${a.name} demo`; frame.className = "al-frame";
        // No Electron bridge or parent scripts. Removing the frame releases every
        // app timer, canvas, observer and animation when switching or closing.
        frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
        const url = new URL("src/office/app-library-preview.html", location.href); url.search = ""; url.searchParams.set("app", a.id);
        frame.addEventListener("load", () => {
          frame.contentDocument?.addEventListener("keydown", e => {
            if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
          }, true);
        });
        frame.src = url.href; preview.replaceChildren(frame);
        const replay = document.createElement("button"); replay.type = "button"; replay.className = "ghost"; replay.textContent = "Restart demo";
        replay.addEventListener("click", () => { frame.src = url.href; }); preview.append(replay);
      });
      preview.append(launch);
    }
    for (const b of grid.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset.id === a.id));
  };
  const paint = () => {
    const q = search.value.trim().toLocaleLowerCase();
    const aliases: Record<string,string> = { social: "discord", tube: "youtube", music: "spotify", soundtrack: "songs music library soundtrack radio lofi synthwave ambient breakcore phonk mediathek musik", steam: "steam", botflix: "netflix" };
    const apps = LIBRARY_APPS.filter(a => (category === "All" || a.category === category) && `${a.name} ${a.description} ${aliases[a.id] ?? ""}`.toLocaleLowerCase().includes(q));
    dialog.querySelector(".al-count")!.textContent = `${apps.length} ${apps.length === 1 ? "app" : "apps"}`;
    grid.replaceChildren();
    for (const a of apps) {
      const b = document.createElement("button"); b.type = "button"; b.className = "al-app"; b.dataset.id = a.id; b.setAttribute("aria-pressed", String(selected.id === a.id));
      b.innerHTML = `<span class="al-icon" aria-hidden="true">${icon(a)}</span><span></span>`;
      b.lastElementChild!.textContent = name(a); b.addEventListener("click", () => { gameSound.play("switch"); show(a); }); grid.append(b);
    }
    if (!apps.length) { const p = document.createElement("p"); p.className = "al-empty"; p.textContent = "No apps found. Try another search or category."; grid.append(p); }
  };
  for (const c of ["All", "Work", "Social", "Media", "Games", "Phone"] as LibraryCategory[]) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = c; b.setAttribute("aria-pressed", String(c === category));
    b.addEventListener("click", () => { category = c; for (const other of b.parentElement!.children) other.setAttribute("aria-pressed", String(other === b)); paint(); }); dialog.querySelector("nav")!.append(b);
  }
  search.addEventListener("input", paint);
  dialog.querySelector(".al-close")!.addEventListener("click", close);
  dialog.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  });
  function updateCopy() {
    const de = getLocale() === "de";
    backApps.textContent = de ? "Alle Apps" : "All apps";
    dialog.querySelector(".al-header p")!.textContent = de ? "Apps, Spiele und dein Büro-Soundtrack." : "Apps, games and your office soundtrack.";
    dialog.querySelector(".al-footer")!.textContent = selected.live
      ? (de ? "Die Musik läuft weiter, wenn du ins Büro zurückkehrst." : "Music keeps playing when you return to the office.")
      : (de ? "App-Vorschauen verwenden Demo-Inhalte und steuern keinen arbeitenden Roboter." : "App previews use demo content and do not control a working robot.");
  }
  stopLocale = onLocaleChange(() => {
    updateCopy();
    if (selected.live) {
      dialog.querySelector(".al-selected h3")!.textContent = name(selected);
      dialog.querySelector(".al-selected p")!.textContent = description(selected);
    }
    const tile = grid.querySelector<HTMLElement>('button[data-id="soundtrack"] > span:last-child');
    if (tile) tile.textContent = getLocale() === "de" ? "Song-Mediathek" : "Song library";
  });
  host.append(dialog); scene.inert = true; host.classList.add("app-library-open");
  trigger.setAttribute("aria-expanded", "true");
  paint(); show(selected); (selected.live ? preview.querySelector<HTMLInputElement>("input") : search)?.focus({ preventScroll: true }); gameSound.play("open");
}
