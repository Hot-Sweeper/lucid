import { thumbSrc } from './chat-media';
import './monitor-report.css';

/** Full original capture in a native modal, with Escape and focus restoration. */
export function openReportImage(url: string, name: string, returnTo: HTMLElement): () => void {
  const dialog = document.createElement('dialog'); dialog.className = 'mt-image-viewer'; dialog.setAttribute('aria-label', name);
  const header = document.createElement('header'), title = document.createElement('strong'); title.textContent = name;
  const close = document.createElement('button'); close.type = 'button'; close.className = 'ghost'; close.textContent = 'Close image';
  const img = document.createElement('img'); img.src = url; img.alt = name;
  const error = document.createElement('p'); error.hidden = true; error.setAttribute('role', 'status');
  img.onerror = () => { img.hidden = true; error.hidden = false; error.textContent = 'This screenshot could not be loaded. The original file may have moved.'; };
  const download = document.createElement('a'); download.href = url; download.download = name; download.textContent = 'Download original';
  header.append(title, close); dialog.append(header, img, error, download); document.body.append(dialog);
  const cleanup = () => { dialog.remove(); if (returnTo.isConnected) returnTo.focus({ preventScroll: true }); };
  dialog.addEventListener('close', cleanup, { once: true }); close.onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); dialog.close(); } });
  dialog.showModal(); close.focus();
  return () => { if (dialog.open) dialog.close(); else dialog.remove(); };
}

export function fillReportGallery(host: HTMLElement, images: {url: string; name: string}[]) {
  let closePreview: (() => void) | null = null;
  host.replaceChildren(); host.hidden = false;
  if (!images.length) {
    const note = document.createElement('p'); note.className = 'mt-no-evidence'; note.textContent = 'No result screenshots were included in this report.'; host.append(note);
    return () => {};
  }
  const heading = document.createElement('div'); heading.className = 'mt-gallery-heading';
  const label = document.createElement('h3'); label.textContent = 'Result screenshots';
  const count = document.createElement('span'); heading.append(label, count);
  const hero = document.createElement('button'); hero.type = 'button'; hero.className = 'mt-shot mt-shot-main';
  const img = document.createElement('img'); img.decoding = 'async';
  const caption = document.createElement('span'); caption.className = 'mt-shot-caption';
  const error = document.createElement('span'); error.className = 'mt-shot-error'; error.hidden = true;
  hero.append(img, caption, error);
  const rail = document.createElement('div'); rail.className = 'mt-shot-rail'; rail.setAttribute('aria-label', 'Choose a result screenshot');
  let active = 0;
  const select = (index: number) => {
    active = index; const image = images[index]; img.hidden = false; error.hidden = true;
    img.src = thumbSrc(image.url, 1280); img.alt = image.name; caption.textContent = image.name;
    hero.setAttribute('aria-label', `Open full-size screenshot: ${image.name}`); count.textContent = `${index + 1} of ${images.length}`;
    [...rail.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
  };
  img.onerror = () => { img.hidden = true; error.hidden = false; error.textContent = 'Preview unavailable. Open the original to retry.'; };
  hero.onclick = () => { closePreview?.(); closePreview = openReportImage(images[active].url, images[active].name, hero); };
  images.forEach((image, i) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'mt-shot-thumb';
    button.setAttribute('aria-label', `Show screenshot ${i + 1}: ${image.name}`);
    const thumb = document.createElement('img'); thumb.src = thumbSrc(image.url, 240); thumb.alt = ''; thumb.loading = 'lazy'; thumb.decoding = 'async';
    const name = document.createElement('span'); name.textContent = image.name;
    thumb.onerror = () => { thumb.hidden = true; };
    button.append(thumb, name); button.onclick = () => select(i); rail.append(button);
  });
  rail.hidden = images.length < 2; host.append(heading, hero, rail); select(0);
  return () => { closePreview?.(); };
}
