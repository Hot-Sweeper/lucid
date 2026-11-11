import gsap from "gsap";
import { gameSound } from "./sound";
import "./new-project.css";
import { icon } from "../ui/icons";

// New project: make a fresh folder in T3 Projects, or add a folder that already exists.
// The office for it appears as soon as T3 registers it. Opened from the sidebar.

export type NewProjectApi = {
  create(o: { name: string }): Promise<{ path: string }>;
  addExisting(o: { path: string; title: string }): Promise<unknown>;
  pickFolder(): Promise<string | null>;
  baseFolder(): Promise<string>;
};

export function openNewProject(api: NewProjectApi, opts: { onDone: (title: string) => void }) {
  if (document.querySelector(".new-project")) return;
  const previousFocus = document.activeElement as HTMLElement | null;
  const wrap = document.createElement("div");
  wrap.className = "dialog-wrap";
  wrap.innerHTML = `<form class="dialog new-project" role="dialog" aria-modal="true" aria-labelledby="np-title">
    <header class="np-head"><h2 id="np-title">New project</h2><button type="button" class="ghost np-close" aria-label="Close">${icon("close")}</button></header>
    <label class="np-field"><span>Name</span><input type="text" class="np-name" maxlength="60" autocomplete="off" placeholder="My new project" required></label>
    <fieldset class="np-where"><legend>Folder</legend>
      <label class="np-choice"><input type="radio" name="np-where" value="new" checked><span>Create a new folder</span></label>
      <p class="np-path" data-new></p>
      <label class="np-choice"><input type="radio" name="np-where" value="existing"><span>Use a folder I already have</span></label>
      <div class="np-existing" hidden><button type="button" class="ghost np-pick">Choose folder</button><span class="np-picked"></span></div>
    </fieldset>
    <p class="np-msg" role="status"></p>
    <div class="dialog-actions"><button type="button" class="ghost np-cancel">Cancel</button><button type="submit" class="primary np-go">Create project</button></div>
  </form>`;
  document.body.appendChild(wrap);
  const form = wrap.querySelector("form")!;
  const q = <T extends HTMLElement = HTMLElement>(s: string) => form.querySelector<T>(s)!;
  const name = q<HTMLInputElement>(".np-name"), msg = q(".np-msg"), go = q<HTMLButtonElement>(".np-go");
  let base = "", picked = "", busy = false;
  const mode = () => (form.querySelector<HTMLInputElement>('input[name="np-where"]:checked')?.value ?? "new") as "new" | "existing";
  const safe = (s: string) => s.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/[. ]+$/, "");
  const paint = () => {
    const n = safe(name.value);
    // The folder preview uses the separator the base path already uses (backslash only on Windows).
    const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
    q("[data-new]").textContent = base ? `${base}${base.endsWith(sep) ? "" : sep}${n || "Name"}` : "";
    q(".np-existing").hidden = mode() !== "existing";
    q("[data-new]").hidden = mode() !== "new";
    q(".np-picked").textContent = picked || "No folder chosen";
    go.textContent = mode() === "new" ? "Create project" : "Add project";
    go.disabled = busy || !n || (mode() === "existing" && !picked);
  };
  void api.baseFolder().then(b => { base = b; paint(); }).catch(() => {});
  form.addEventListener("input", paint);
  form.addEventListener("change", paint);
  q(".np-pick").addEventListener("click", async () => {
    try { const p = await api.pickFolder(); if (p) { picked = p; if (!name.value.trim()) name.value = p.split(/[\\/]/).filter(Boolean).pop() || ""; } }
    catch (e: any) { msg.textContent = `Could not open the folder picker: ${e?.message || e}`; }
    paint();
  });
  const close = () => {
    if (busy) return;
    window.removeEventListener("keydown", onKey, true); wrap.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  const onKey = (e: KeyboardEvent) => {
    if ([...document.querySelectorAll(".dialog-wrap")].pop() !== wrap) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  };
  window.addEventListener("keydown", onKey, true);
  wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
  q(".np-close").addEventListener("click", close);
  q(".np-cancel").addEventListener("click", close);
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const title = safe(name.value);
    if (!title || busy) return;
    busy = true; msg.textContent = mode() === "new" ? "Creating the folder and project..." : "Adding the project..."; paint();
    try {
      if (mode() === "new") await api.create({ name: title });
      else await api.addExisting({ path: picked, title });
      gameSound.play("ready");
      busy = false; close();
      opts.onDone(title);
    } catch (error: any) {
      busy = false;
      msg.textContent = `Could not create the project: ${error?.message || error}. Your entries are still here.`;
      paint();
    }
  });
  paint();
  gameSound.play("open");
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(form, { opacity: 0, scale: .98 }, { opacity: 1, scale: 1, duration: .18, ease: "power2.out" });
  name.focus();
}
