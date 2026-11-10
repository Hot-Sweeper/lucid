const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A smaller copy of a local picture for places that show it small (electron/thumbs.cjs serves
 * it). Other addresses come back unchanged, and previews still open the original. */
export function thumbSrc(src: string, width: number) {
  if (!src.startsWith("lucid-file://local/")) return src;
  try { const u = new URL(src); u.searchParams.set("w", String(Math.round(width))); return u.toString(); } catch { return src; }
}

/** Markdown can contain native paths, file URLs or the slash-prefixed paths used
 * by conversation links. Keep literal filenames intact, including # and %. */
export function localMediaPath(input: string): string | null {
  const value = input.trim();
  if (!value || /[\u0000-\u001f]/.test(value)) return null;
  if (/^lucid-file:\/\/local\//i.test(value)) {
    try { return decodeURIComponent(new URL(value).pathname.slice(1)); } catch { return null; }
  }
  if (/^file:/i.test(value)) {
    try {
      const url = new URL(value);
      const name = decodeURIComponent(url.pathname);
      return url.hostname && url.hostname !== "localhost" ? `//${url.hostname}${name}` : name.replace(/^\/([a-z]:\/)/i, "$1");
    } catch { return null; }
  }
  if (/^\/?[a-z]:[\\/]/i.test(value)) return value.replace(/^\/([a-z]:)/i, "$1");
  if (/^\\\\/.test(value) || /^\/(?!\/)/.test(value)) return value;
  return null;
}

// A thread on another computer (its id has "::") keeps its files there. Such paths are
// fetched from that computer by the main process (lucid-file://remote), never read locally.
let mediaThread: string | null = null;
/** The thread whose messages are being rendered right now (chat panel). */
export function setMediaThread(threadId: string | null) { mediaThread = threadId; }
const REMOTE = /^lucid-file:\/\/remote\//i;

export function chatFileUrl(path: string, threadId: string | null = mediaThread): string {
  if (REMOTE.test(path)) return path;
  const file = localMediaPath(path) ?? path;
  if (threadId?.includes("::")) return `lucid-file://remote/${encodeURIComponent(threadId)}/${encodeURIComponent(file)}`;
  return `lucid-file://local/${encodeURIComponent(file)}`;
}

export function chatMediaSource(value: string): string | null {
  if (REMOTE.test(value.trim())) return value.trim();
  const file = localMediaPath(value);
  if (file) return chatFileUrl(file);
  if (/^https?:\/\//i.test(value)) {
    try { const url = new URL(value); return url.username || url.password ? null : url.href; } catch { return null; }
  }
  if (/^data:(?:image\/(?:png|jpeg|gif|webp|avif|bmp|svg\+xml)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+)[;,]/i.test(value)) return value;
  return null;
}

export function chatMediaKind(path: string, mime = "") {
  let name = path;
  if (/^https?:/i.test(path)) { try { name = new URL(path).pathname; } catch { return null; } }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return mime.startsWith("image/") || /^(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/.test(ext) ? "image"
    : mime.startsWith("video/") || /^(mp4|webm|mov|m4v|ogv)$/.test(ext) ? "video"
    : mime.startsWith("audio/") || /^(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(ext) ? "audio" : null;
}

export function inlineChatImage(href: string, label: string, title?: string | null): string {
  const src = chatMediaSource(href), name = label || (localMediaPath(href) ?? href).split(/[\\/]/).pop() || "Image";
  if (!src) return `<span class="cp-media-unavailable">Image unavailable: ${esc(name)}</span>`;
  const kind = chatMediaKind(href) ?? "image";
  if (kind === "video" || kind === "audio") return inlineChatFile(href, name);
  return `<button type="button" class="cp-inline-media${kind === "image" ? "" : " cp-file"}" data-media-src="${esc(src)}" data-media-kind="${kind}" data-media-name="${esc(name)}" aria-label="Preview ${esc(name)}"${title ? ` title="${esc(title)}"` : ""}>${kind === "image" ? `<img src="${esc(thumbSrc(src, 960))}" alt="${esc(name)}" loading="lazy" decoding="async">` : `<span>${esc(name)}</span><i>Open ${kind}</i>`}</button>`;
}

/** Raw HTML images follow the same path and cannot bypass the media resolver.
 * The template is inert; DOMPurify still sanitizes all resulting markup. */
export function prepareChatImages(html: string): string {
  if (!/<(?:img|video|audio)\b/i.test(html)) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const img of template.content.querySelectorAll("img")) {
    if (img.closest("[data-media-src]")) continue;
    const replacement = document.createElement("template");
    replacement.innerHTML = inlineChatImage(img.getAttribute("src") ?? "", img.getAttribute("alt") ?? "", img.getAttribute("title"));
    img.replaceWith(replacement.content);
  }
  for (const media of template.content.querySelectorAll("video,audio")) {
    const value = media.getAttribute("src") || media.querySelector("source")?.getAttribute("src") || "";
    const source = chatMediaSource(value);
    media.removeAttribute("autoplay"); media.removeAttribute("loop");
    if (source) { media.setAttribute("src", source); media.setAttribute("controls", ""); media.setAttribute("preload", "metadata"); }
    else media.removeAttribute("src");
    media.querySelectorAll("source").forEach(el => el.remove());
  }
  return template.innerHTML;
}

export function chatImageFailed(event: Event): void {
  const media = event.target;
  if (!(media instanceof HTMLElement) || !media.closest(".cp-text,.cp-atts")) return;
  if (media instanceof HTMLMediaElement) {
    if (media.closest(".lucid-player")) return;
    if (media.parentElement?.querySelector(".cp-media-unavailable")) return;
    const note = document.createElement("span"); note.className = "cp-media-unavailable";
    note.textContent = "Playback unavailable. Download the original to open it in another app."; media.after(note); return;
  }
  if (!(media instanceof HTMLImageElement)) return;
  const preview = media.closest<HTMLElement>("[data-media-src]");
  const message = document.createElement("span"); message.className = "cp-media-unavailable";
  message.textContent = `Image unavailable: ${media.alt || "Image"}. Check that the file is still available. `;
  const link = document.createElement("a"); link.className = "cp-download";
  link.href = preview?.dataset.mediaSrc || media.src; link.download = media.alt || "Image"; link.textContent = "Download original";
  message.append(link); (preview || media).replaceWith(message);
}

/** Every file keeps an actionable link, including formats the media player cannot decode. */
export function inlineChatFile(href: string, name: string): string {
  const src = chatMediaSource(href);
  if (!src) return `<span class="cp-media-unavailable">${esc(name)} (unsupported address)</span>`;
  const kind = chatMediaKind(href);
  if (kind === "image") return inlineChatImage(href, name) + `<a class="cp-download" href="${esc(src)}" download="${esc(name)}">Download ${esc(name)}</a>`;
  const link = `<a class="cp-download" href="${esc(src)}" download="${esc(name)}">Download ${esc(name)}</a>`;
  if (kind === "audio" || kind === "video") return `<span class="cp-answer-media"><${kind} src="${esc(src)}" controls preload="metadata" aria-label="${esc(name)}"></${kind}>${link}</span>`;
  return link;
}

/** Isolate supplied visuals from the app and its privileged bridge. Scripts and forms are
 * intentionally unavailable; media, SVG, CSS and document layout remain usable. */
export function mountChatArtifact(host: HTMLElement, artifact: { html: string; title: string; height: number }) {
  const section = document.createElement("section"); section.className = "cp-artifact";
  const title = document.createElement("strong"); title.textContent = artifact.title; section.append(title);
  if (!artifact.html) {
    const note = document.createElement("p"); note.textContent = "This visual's source is unavailable in the saved conversation."; section.append(note); host.prepend(section); return;
  }
  const doc = new DOMParser().parseFromString(artifact.html, "text/html");
  const interactive = typeof (window as any).lucid?.answerVisual === "function";
  for (const el of doc.querySelectorAll(interactive ? "iframe,object,embed,base,meta,form" : "script,iframe,object,embed,base,meta,form")) el.remove();
  for (const el of doc.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) if ((!interactive && /^on/i.test(attr.name)) || /^(srcdoc|srcset)$/i.test(attr.name)) el.removeAttribute(attr.name);
    for (const attr of ["src", "poster", "href"]) {
      const value = el.getAttribute(attr); if (!value || value.startsWith("#")) continue;
      const src = chatMediaSource(value);
      if (src) el.setAttribute(attr, src); else el.removeAttribute(attr);
    }
  }
  const style = doc.createElement("style"); style.textContent = ':root{color-scheme:dark;--font-sans:Lexend,system-ui,sans-serif;--foreground:#e9e6f7;--muted-foreground:#b6b3cd;--primary:#a9c9ff;--secondary:#303554;--chart-1:#b9a0ff;--chart-2:#ffa56c}body{background:#181d39;color:var(--foreground);overflow-wrap:anywhere}img,video{max-width:100%;height:auto}audio{max-width:100%}'; doc.head.append(style);
  const frame = document.createElement("iframe"); frame.title = artifact.title;
  frame.setAttribute("sandbox", ""); frame.referrerPolicy = "no-referrer"; frame.loading = "lazy";
  frame.style.height = `${artifact.height}px`;
  if (!interactive) frame.srcdoc = doc.documentElement.outerHTML;
  section.append(frame); host.prepend(section);
  if (interactive) {
    frame.setAttribute("sandbox", "allow-scripts");
    void (window as any).lucid.answerVisual(doc.documentElement.outerHTML).then((url: string) => {
      if (!frame.parentElement || !url.startsWith("lucid-artifact://visual/")) return;
      frame.src = url;
    }).catch(() => { frame.setAttribute("sandbox", ""); frame.srcdoc = doc.documentElement.outerHTML; });
  }
}
