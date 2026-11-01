import appleNotes from "../assets/note-apps/apple-notes.png?inline";
import notepadPlusPlus from "../assets/note-apps/notepad-plus-plus.png?inline";
import notepad from "../assets/note-apps/notepad.png?inline";
import type { NotesApp } from "../office/roster";

const assets: Record<NotesApp, string> = { "apple-notes": appleNotes, "notepad-plus-plus": notepadPlusPlus, notepad };
/** Embed the verified artwork so screen-detail SVG clones remain self-contained. */
export function noteAppIcon(app: NotesApp): string {
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><image href="${assets[app]}" width="24" height="24" preserveAspectRatio="xMidYMid meet"/></svg>`;
}
