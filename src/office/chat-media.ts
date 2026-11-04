const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
  if (threadId?.includes("::") && !(typeof window !== "undefined" && (window as any).lucidRemote)) return `lucid-file://remote/${encodeURIComponent(threadId)}/${encodeURIComponent(file)}`;
  return typeof window !== "undefined" && (window as any).lucidRemote
    ? `/__lucid/media/${encodeURIComponent(file)}`
    : `lucid-file://local/${encodeURIComponent(file)}`;
}

export function chatMediaSource(value: string): string | null {
  if (REMOTE.test(value.trim())) return value.trim();
  const file = localMediaPath(value);
  if (file) return chatFileUrl(file);
  if (/^https?:\/\//i.test(value)) {
    try { const url = new URL(value); return url.username || url.password ? null : url.href; } catch { return null; }
  }
  if (/^data:image\/(?:png|jpeg|gif|webp|avif|bmp|svg\+xml)[;,]/i.test(value)) return value;
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
  return `<button type="button" class="cp-inline-media${kind === "image" ? "" : " cp-file"}" data-media-src="${esc(src)}" data-media-kind="${kind}" data-media-name="${esc(name)}" aria-label="Preview ${esc(name)}"${title ? ` title="${esc(title)}"` : ""}>${kind === "image" ? `<img src="${esc(src)}" alt="${esc(name)}" loading="lazy" decoding="async">` : `<span>${esc(name)}</span><i>Open ${kind}</i>`}</button>`;
}

/** Raw HTML images follow the same path and cannot bypass the media resolver.
 * The template is inert; DOMPurify still sanitizes all resulting markup. */
export function prepareChatImages(html: string): string {
  if (!/<img\b/i.test(html)) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const img of template.content.querySelectorAll("img")) {
    if (img.closest("[data-media-src]")) continue;
    const replacement = document.createElement("template");
    replacement.innerHTML = inlineChatImage(img.getAttribute("src") ?? "", img.getAttribute("alt") ?? "", img.getAttribute("title"));
    img.replaceWith(replacement.content);
  }
  return template.innerHTML;
}

export function chatImageFailed(event: Event): void {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.closest(".cp-text,.cp-atts")) return;
  const message = document.createElement("span");
  message.className = "cp-media-unavailable";
  message.textContent = `Image unavailable: ${img.alt || "Image"}. Check that the file is still available.`;
  img.replaceWith(message);
}
