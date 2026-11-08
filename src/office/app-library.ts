import { LIBRARY_APPS, type LibraryCategory, type LibraryApp } from "./app-library-catalog";
import { ICONS } from "../os/icons";
import { gameSound } from "./sound";
let current: { close: () => void } | null = null;
export function openAppLibrary(trigger: HTMLElement) {
  if (current) { current.close(); return; }
  const scene = document.getElementById("scene");
  const host = scene?.parentElement;
  if (!scene || !host) return;
  window.dispatchEvent(new Event("lucid:center-view"));
  const wasInert = scene.inert;
  const dialog = document.createElement("section");
  const close = () => {
    window.removeEventListener("lucid:center-view", close);
    preview.replaceChildren(); dialog.remove(); current = null;
    scene.inert = wasInert; host.classList.remove("app-library-open");
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus({ preventScroll: true });
  };
  window.addEventListener("lucid:center-view", close);
  current = { close };
  dialog.id = "app-library"; dialog.className = "app-library"; dialog.setAttribute("aria-labelledby", "app-library-title");
  dialog.innerHTML = `<header class="al-header"><div><h2 id="app-library-title">App library</h2><p>Explore the apps on Lucid’s robot computers.</p></div><button type="button" class="ghost al-close" aria-label="Back to office">Back to office</button></header><div class="al-toolbar"><label class="al-search">Search apps<input type="search" placeholder="Games, Botcord, YouTube…" autofocus></label><nav class="al-categories" aria-label="App categories"></nav></div><div class="al-content"><section class="al-browse" aria-label="Apps"><p class="al-count" role="status"></p><div class="al-grid"></div></section><section class="al-detail" aria-label="App details"><div class="al-selected"></div><div class="al-preview"></div></section></div><footer class="al-footer">These are Lucid’s built-in apps. Previews use demo content and do not control a working robot.</footer>`;
  const search = dialog.querySelector<HTMLInputElement>("input")!;
  const grid = dialog.querySelector<HTMLElement>(".al-grid")!;
  const preview = dialog.querySelector<HTMLElement>(".al-preview")!;
  let category: LibraryCategory = "All", selected: LibraryApp = LIBRARY_APPS[0];
  const icon = (a: LibraryApp) => ICONS[a.icon] ?? ICONS.tool;
  const show = (a: LibraryApp) => {
    selected = a; preview.replaceChildren();
    const detail = dialog.querySelector<HTMLElement>(".al-selected")!;
    detail.innerHTML = `<span class="al-icon" aria-hidden="true">${icon(a)}</span><div><h3></h3><p></p></div>`;
    detail.querySelector("h3")!.textContent = a.name; detail.querySelector("p")!.textContent = a.description;
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
    const aliases: Record<string,string> = { social: "discord", tube: "youtube", music: "spotify", steam: "steam", botflix: "netflix" };
    const apps = LIBRARY_APPS.filter(a => (category === "All" || a.category === category) && `${a.name} ${a.description} ${aliases[a.id] ?? ""}`.toLocaleLowerCase().includes(q));
    dialog.querySelector(".al-count")!.textContent = `${apps.length} ${apps.length === 1 ? "app" : "apps"}`;
    grid.replaceChildren();
    for (const a of apps) {
      const b = document.createElement("button"); b.type = "button"; b.className = "al-app"; b.dataset.id = a.id; b.setAttribute("aria-pressed", String(selected.id === a.id));
      b.innerHTML = `<span class="al-icon" aria-hidden="true">${icon(a)}</span><span></span>`;
      b.lastElementChild!.textContent = a.name; b.addEventListener("click", () => { gameSound.play("switch"); show(a); }); grid.append(b);
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
  host.append(dialog); scene.inert = true; host.classList.add("app-library-open");
  trigger.setAttribute("aria-expanded", "true");
  paint(); show(selected); search.focus({ preventScroll: true }); gameSound.play("open");
}
