// File types as the Explorer shows them: one recognizable flat icon and a plain type name per kind.
// Icons follow the other desktop icons: filled shapes only, no strokes, no outlines.

export type FileKind = "folder" | "image" | "code" | "web" | "style" | "data" | "doc" | "pdf" | "sheet" | "slides" | "archive" | "audio" | "video" | "app" | "generic";

const EXT: Record<string, FileKind> = {};
const add = (kind: FileKind, list: string) => { for (const e of list.split(" ")) EXT[e] = kind; };
add("image", "png jpg jpeg gif webp avif bmp ico svg tif tiff heic");
add("code", "ts tsx js jsx mjs cjs py rs go java kt c h cpp hpp cs rb php swift lua sh bash ps1 bat cmd sql vue svelte dart scala zig");
add("web", "html htm xhtml");
add("style", "css scss sass less");
add("data", "json jsonc yaml yml toml xml ini env lock cfg conf plist ndjson");
add("doc", "md markdown txt log rtf docx doc odt");
add("pdf", "pdf");
add("sheet", "csv tsv xlsx xls ods");
add("slides", "pptx ppt odp key");
add("archive", "zip 7z rar tar gz tgz bz2 xz");
add("audio", "mp3 wav ogg m4a aac flac opus");
add("video", "mp4 webm mov m4v mkv avi ogv");
add("app", "exe msi dll bin appimage dmg");

const LABEL: Record<FileKind, string> = {
  folder: "File folder", image: "Image", code: "Source file", web: "Web page", style: "Stylesheet", data: "Data file", doc: "Document", pdf: "PDF document",
  sheet: "Spreadsheet", slides: "Presentation", archive: "Compressed archive", audio: "Audio file", video: "Video file", app: "Application file", generic: "File",
};

export function extOf(name: string) {
  const base = name.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function kindOf(name: string, dir = false): FileKind {
  if (dir) return "folder";
  return EXT[extOf(name)] ?? "generic";
}

const NOUN: Partial<Record<FileKind, string>> = { image: "image", doc: "document", pdf: "document", sheet: "spreadsheet", slides: "presentation", archive: "archive" };

/** "PNG image", "TypeScript file": the extension is named when there is one, otherwise the kind. */
export function typeLabel(name: string, dir = false) {
  const kind = kindOf(name, dir);
  if (kind === "folder") return LABEL.folder;
  const ext = extOf(name);
  if (!ext) return LABEL[kind];
  const named: Record<string, string> = { ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", py: "Python", rs: "Rust", go: "Go", md: "Markdown", json: "JSON", yml: "YAML", yaml: "YAML", css: "CSS", html: "HTML", csv: "CSV", svg: "SVG", png: "PNG", jpg: "JPEG", jpeg: "JPEG", gif: "GIF", webp: "WebP", pdf: "PDF", txt: "Text", log: "Log", zip: "ZIP", mp3: "MP3", mp4: "MP4", wav: "WAV" };
  return `${named[ext] ?? ext.toUpperCase()} ${NOUN[kind] ?? "file"}`;
}

const PAGE = (body: string, fold: string) => `<path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="${body}"/><path d="M14 2v4a2 2 0 0 0 2 2h4Z" fill="${fold}"/>`;
const svg = (inner: string) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
const LINES = (c: string, widths = [8, 8, 5]) => widths.map((w, i) => `<rect x="8" y="${11 + i * 3.1}" width="${w}" height="1.7" rx=".85" fill="${c}"/>`).join("");

const GLYPH: Record<FileKind, string> = {
  folder: "",
  image: svg(`${PAGE("#ff7a5a", "#d9553a")}<circle cx="14.8" cy="11.4" r="1.5" fill="#ffe08a"/><path d="M6.8 19 10.6 13l2.8 3.9 1.7-2.2L18 19Z" fill="#fff4ec"/>`),
  code: svg(`${PAGE("#5a6cf0", "#3846c4")}<path d="M10.3 11.2 7.5 14l2.8 2.8 1.05-1.05L9.6 14l1.75-1.75Zm3.4 0-1.05 1.05L14.4 14l-1.75 1.75 1.05 1.05L16.5 14Z" fill="#fff"/>`),
  web: svg(`${PAGE("#ff8a3d", "#d1621a")}<path d="M10.3 11.2 7.5 14l2.8 2.8 1.05-1.05L9.6 14l1.75-1.75Zm3.4 0-1.05 1.05L14.4 14l-1.75 1.75 1.05 1.05L16.5 14Z" fill="#fff"/>`),
  style: svg(`${PAGE("#36b0ff", "#1b86d6")}<rect x="8" y="11" width="8" height="2" rx="1" fill="#fff"/><rect x="8" y="14.2" width="5.4" height="2" rx="1" fill="#d6efff"/><rect x="8" y="17.4" width="7" height="1.7" rx=".85" fill="#fff"/>`),
  data: svg(`${PAGE("#ffc94d", "#d9a11d")}<path d="M10.8 11H10a1.2 1.2 0 0 0-1.2 1.2v.9c0 .5-.3.8-.8.9.5.1.8.4.8.9v.9A1.2 1.2 0 0 0 10 16.9h.8v-1H10.4v-1.1c0-.5-.2-.9-.6-1.2.4-.3.6-.7.6-1.2v-.4Zm2.4 0h.8a1.2 1.2 0 0 1 1.2 1.2v.9c0 .5.3.8.8.9-.5.1-.8.4-.8.9v.9a1.2 1.2 0 0 1-1.2 1.2h-.8v-1h.4v-1.1c0-.5.2-.9.6-1.2-.4-.3-.6-.7-.6-1.2V12Z" fill="#4a3507"/>`),
  doc: svg(`${PAGE("#c9d1ff", "#9aa6f0")}${LINES("#5d6499")}`),
  pdf: svg(`${PAGE("#f0605d", "#c23a38")}<path d="M8 17.6c1.7-.6 3-2.3 3.7-4.6.2-.7.3-1.3.1-1.7-.2-.3-.7-.2-.8.3-.3 1.8.9 3.9 3 4.7.8.3 1.9.2 2.1-.4.1-.5-.6-.7-1.6-.6-1.8.2-3.5.9-4.9 2.1-.4.4-1 .7-1.2.4-.2-.4.2-.7.4-.9Z" fill="#fff"/>`),
  sheet: svg(`${PAGE("#1f9a66", "#127147")}<rect x="7.6" y="10.6" width="8.8" height="7.6" rx="1" fill="#fff"/><rect x="7.6" y="12.7" width="8.8" height=".9" fill="#1f9a66"/><rect x="7.6" y="15.3" width="8.8" height=".9" fill="#1f9a66"/><rect x="10.4" y="10.6" width=".9" height="7.6" fill="#1f9a66"/>`),
  slides: svg(`${PAGE("#dc6038", "#b0431f")}<rect x="7.6" y="10.8" width="8.8" height="5.8" rx="1" fill="#fff"/><rect x="11.4" y="16.6" width="1.2" height="1.8" fill="#ffe0d4"/>`),
  archive: svg(`${PAGE("#b58a4a", "#8a6428")}<rect x="11" y="3.2" width="2" height="1.5" fill="#f3e3c4"/><rect x="11" y="5.7" width="2" height="1.5" fill="#f3e3c4"/><rect x="11" y="8.2" width="2" height="1.5" fill="#f3e3c4"/><rect x="9.6" y="11" width="4.8" height="6.4" rx="1.2" fill="#f3e3c4"/><rect x="11" y="13.2" width="2" height="2.2" rx=".6" fill="#8a6428"/>`),
  audio: svg(`${PAGE("#ff6f91", "#d14a6c")}<path d="M13.4 10.4v5.9a1.9 1.9 0 1 1-1.2-1.7v-3.2l4-.9v2.1Z" fill="#fff"/>`),
  video: svg(`${PAGE("#8250df", "#5f33b8")}<path d="M10.2 10.6v7l6-3.5Z" fill="#fff"/>`),
  app: svg(`${PAGE("#7b86b8", "#58628f")}<rect x="8" y="10.6" width="8" height="7" rx="1.4" fill="#e8ebff"/><rect x="8" y="10.6" width="8" height="2" rx="1" fill="#c3c9f0"/>`),
  generic: svg(`${PAGE("#c9d1ff", "#9aa6f0")}`),
};

const FOLDER_CLOSED = svg(`<path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h4.6l2.1 2.2h8.3A2.5 2.5 0 0 1 22 8.7v9.8A2.5 2.5 0 0 1 19.5 21h-15A2.5 2.5 0 0 1 2 18.5Z" fill="#ffb84d"/><path d="M2 10a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8.5a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18.5Z" fill="#ffd27a"/>`);
const FOLDER_OPEN = svg(`<path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h4.6l2.1 2.2h6.3A2.5 2.5 0 0 1 20 8.7V15.5L17 20.4H4.4A2.4 2.4 0 0 1 2 17.8Z" fill="#e59b2c"/><path d="M7.4 10h13.7a.9.9 0 0 1 .86 1.15l-2.36 7.55a2.4 2.4 0 0 1-2.3 1.7H3.3a.9.9 0 0 1-.86-1.15l2.66-7.55A2.4 2.4 0 0 1 7.4 10Z" fill="#ffd27a"/>`);

export function iconFor(kind: FileKind, open = false) {
  if (kind === "folder") return open ? FOLDER_OPEN : FOLDER_CLOSED;
  return GLYPH[kind];
}

