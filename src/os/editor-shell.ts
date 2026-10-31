import type { Editor } from "../office/roster";
import { baseName } from "./classify";
import { esc } from "./typing";
import { EDITORS } from "./work-apps";
import "./work-apps.css";

const tools = `<span title="Files"><svg viewBox="0 0 20 20"><path d="M5 3h9v13H5zM3 6v12h9"/></svg></span><span title="Search"><svg viewBox="0 0 20 20"><circle cx="8" cy="8" r="5"/><path d="m12 12 5 5"/></svg></span><span title="Source control"><svg viewBox="0 0 20 20"><circle cx="6" cy="4" r="2"/><circle cx="14" cy="5" r="2"/><circle cx="6" cy="16" r="2"/><path d="M6 6v8M14 7c0 5-8 2-8 7"/></svg></span>`;

export function editorShell(editor: Editor) {
  const kind = EDITORS[editor].shell;
  const ide = ["vscode", "visualstudio", "idea"].includes(kind);
  const menus = kind === "visualstudio" ? "File　Edit　View　Project　Build　Debug　Tools" : kind === "notepadpp" ? "File　Edit　Search　View　Encoding　Language" : kind === "idea" ? "File　Edit　View　Navigate　Code　Refactor　Run" : kind === "pad" ? "File　Edit　View" : "File　Edit　Selection　View　Go　Run　Terminal";
  return `<div class="editor ed-${kind}" data-editor="${kind}">
    ${kind !== "vim" ? `<div class="ide-menu"><span>${menus}</span>${ide ? '<span class="ide-project"></span>' : ""}</div>` : ""}
    <div class="ide-workspace">${ide ? `<aside class="ide-rail" aria-hidden="true">${tools}</aside><aside class="ide-tree"><h4>${kind === "visualstudio" ? "Solution Explorer" : kind === "idea" ? "Project" : "Explorer"}</h4><div class="ide-files"></div></aside>` : ""}
      <section class="ide-document"><div class="tabs" role="tablist"></div><div class="ide-path"></div><div class="code-wrap"><div class="code"></div></div></section>
    </div>${kind === "vim" ? '<div class="vim-bar"><b>NORMAL</b><span></span></div>' : '<footer class="ide-status"><span class="ide-language"></span><span>UTF-8</span></footer>'}
  </div>`;
}

/** Only files that have actually been opened appear in the project pane. */
export function editorFiles(root: HTMLElement, paths: string[], active: string) {
  const current = active.replace(/\\/g, "/");
  const parts = current.split("/");
  root.querySelectorAll<HTMLElement>(".ide-project").forEach((e) => e.textContent = parts.at(-2) || baseName(active));
  const path = root.querySelector<HTMLElement>(".ide-path");
  if (path) { path.textContent = current; path.title = current; }
  const language = root.querySelector<HTMLElement>(".ide-language");
  if (language) language.textContent = root.dataset.editor === "pad" ? "Plain text" : active.split(".").at(-1)?.toUpperCase() || "Text";
  const files = root.querySelector<HTMLElement>(".ide-files");
  if (files) files.innerHTML = paths.map((p) => `<div class="ide-file${p === active ? " on" : ""}" title="${esc(p)}"><span class="ide-file-mark" aria-hidden="true"></span><span>${esc(baseName(p))}<small>${esc(p.replace(/\\/g, "/").split("/").slice(0, -1).join("/"))}</small></span></div>`).join("");
}
