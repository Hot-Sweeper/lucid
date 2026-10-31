import type { Editor, NoteApp } from "../office/roster";
import { ICONS } from "./icons";
import vscode from "./assets/vscode.svg";
import visualstudio from "./assets/visualstudio.svg";
import idea from "./assets/idea.svg";
import vim from "./assets/vim.svg";
import notepadpp from "./assets/notepadpp.png";
import apple from "./assets/apple-notes.svg";
import notepad from "./assets/notepad.png";

const icon = (url: string) => `<img class="ico" src="${url}" alt="">`;
export const EDITORS: Record<Editor, { name: string; icon: string; shell: string }> = {
  studio: { name: "Visual Studio Code", icon: icon(vscode), shell: "vscode" },
  vscode: { name: "Visual Studio Code", icon: icon(vscode), shell: "vscode" },
  visualstudio: { name: "Visual Studio", icon: icon(visualstudio), shell: "visualstudio" },
  idea: { name: "IntelliJ IDEA", icon: icon(idea), shell: "idea" },
  notepadpp: { name: "Notepad++", icon: icon(notepadpp), shell: "notepadpp" },
  pad: { name: "Notepad", icon: icon(notepad), shell: "pad" },
  vim: { name: "Vim", icon: icon(vim), shell: "vim" },
};
export const NOTE_APPS: Record<NoteApp, { name: string; icon: string }> = {
  notes: { name: "Notes", icon: ICONS.notes },
  apple: { name: "Apple Notes", icon: icon(apple) },
  pad: { name: "Notepad", icon: EDITORS.pad.icon },
  notepadpp: { name: "Notepad++", icon: icon(notepadpp) },
};
