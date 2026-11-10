// Flat front or back portraits of a robot (head, hat and eyes; a bust adds shoulders and the
// accessory) for cards, option tiles and printed reports.
import { accCloth, bodyColors, BUILD_SHAPE, hatInfo, resolveLook, tintPalette, type RobotLook, type View } from "../look";
import { accessorySvg, blushSvg, hatSvg, stickerSvg, styledEyes } from "./outfit";

export type PortraitPalette = { shell: string; shade: string; deep: string; glow: string; visor: string; logo: string; src: string | null; mode: "mask" | "image" | "chip" };
let pseq = 0;

/** A flat front portrait (head, hat, eyes; with `bust` also shoulders and accessory) for cards and option tiles. */
export function portraitSvg(look: RobotLook, base: PortraitPalette, o: { size?: number; bust?: boolean; view?: View; cls?: string; label?: string } = {}) {
  const L = resolveLook(look), view = o.view ?? "front", id = `lkp${++pseq}`;
  const p = tintPalette(base, L.tint), glow = L.glow || base.glow, acc = L.accent || "#ff9f5a";
  const hat = hatInfo(L.hat), b = BUILD_SHAPE[L.build];
  const hs = L.head;
  const tipY = 566 - (hat.antenna === "lift" ? hat.lift ?? 0 : 0);
  const antenna = hat.antenna === "hide" ? "" : `<rect x="557" y="${tipY + 4}" width="6" height="${610 - tipY - 4}" rx="3" fill="var(--deep)"/><circle cx="560" cy="${tipY}" r="9" fill="var(--glow)"/><circle cx="557" cy="${tipY - 3}" r="3.2" fill="#fff" opacity="0.8"/>`;
  const logo = view === "front"
    ? (base.src ? (base.mode === "mask"
        ? `<mask id="${id}m" maskContentUnits="userSpaceOnUse"><image href="${base.src}" x="551" y="606" width="18" height="18"/></mask><rect x="551" y="606" width="18" height="18" fill="var(--logo)" mask="url(#${id}m)" opacity="0.8"/>`
        : `<image href="${base.src}" x="551" y="606" width="18" height="18" opacity="0.75"/>`)
      : `<rect x="553" y="608" width="14" height="14" rx="4" fill="var(--logo)" opacity="0.8"/>`)
    : (base.src ? (base.mode === "mask"
        ? `<mask id="${id}m" maskContentUnits="userSpaceOnUse"><image href="${base.src}" x="536" y="630" width="48" height="49"/></mask><rect x="536" y="630" width="48" height="49" fill="var(--logo)" mask="url(#${id}m)"/>`
        : `<image href="${base.src}" x="538" y="632" width="44" height="44" opacity="0.9"/>`)
      : `<rect x="542" y="637" width="36" height="36" rx="10" fill="var(--logo)"/>`);
  const face = view === "front"
    ? `<rect x="506" y="626" width="108" height="62" rx="28" fill="var(--visor)"/>
       <g>${styledEyes(L.eyes, "neutral") ?? `<rect x="532" y="644" width="16" height="26" rx="8" fill="var(--glow)"/><rect x="572" y="644" width="16" height="26" rx="8" fill="var(--glow)"/>`}</g>
       ${L.blush ? blushSvg() : ""}${logo}`
    : `${logo}${L.sticker !== "none" ? `<g transform="translate(606 692) rotate(-14)">${stickerSvg(L.sticker)}</g>` : ""}`;
  const head = `<g transform="translate(560 715) scale(${hs}) translate(-560 -715)">
    ${hat.antenna === "through" ? "" : antenna}
    <circle cx="486" cy="656" r="17" fill="${acc}"/><circle cx="${view === "front" ? 486 : 484}" cy="654" r="10" fill="var(--shade)"/>
    <circle cx="634" cy="656" r="17" fill="${acc}"/><circle cx="636" cy="654" r="10" fill="var(--shade)"/>
    <rect x="490" y="600" width="140" height="118" rx="44" fill="var(--shade)"/><rect x="490" y="600" width="140" height="106" rx="44" fill="var(--shell)"/>
    <path d="M512 618 C530 606 560 604 586 608" stroke="#fff" stroke-opacity="0.5" stroke-width="7" stroke-linecap="round" fill="none"/>
    ${face}${hatSvg(L.hat, view)}${hat.antenna === "through" ? antenna : ""}</g>`;
  let body = "";
  if (o.bust) {
    const acc2 = accessorySvg(L.accessory, view);
    const sx = `translate(560 0) scale(${b.kx} 1) translate(-560 0)`;
    const shoulder = (x: number) => `<circle cx="${x}" cy="747" r="18" fill="${acc}"/><circle cx="${x}" cy="749" r="15.5" fill="var(--shade)"/><circle cx="${x - 3}" cy="744.5" r="11" fill="var(--shell)"/>`;
    body = `<rect x="547" y="700" width="26" height="42" rx="9" fill="var(--deep)"/>
      <g transform="${sx}">${acc2.under}
        <path d="M503 752 C503 735 517 727 534 727 L586 727 C603 727 617 735 617 752 C617 786 607 812 601 838 L519 838 C513 812 503 786 503 752 Z" fill="var(--shade)"/>
        <path d="M509 754 C509 740 520 733 535 733 L583 733 C596 733 606 740 606 754 C606 783 597 807 592 830 L527 830 C522 807 509 783 509 754 Z" fill="var(--shell)"/>
        ${view === "front" ? `<rect x="539" y="756" width="42" height="30" rx="10" fill="var(--shade)"/><circle cx="560" cy="771" r="5" fill="var(--glow)"/>` : acc2.pack}</g>
      ${shoulder(560 - b.shoulder)}${shoulder(560 + b.shoulder)}
      <g transform="${sx}">${view === "front" ? acc2.pack : ""}${acc2.over}</g>`;
  }
  const vb = o.bust ? "448 478 224 372" : "452 486 216 240";
  const size = o.size ?? 56;
  const [w, h] = o.bust ? [size * 224 / 372, size] : [size * 216 / 240, size];
  const bodyVars = bodyColors(p, p.deep);
  const style = `${Object.entries(bodyVars).map(([k, v]) => `${k}:${v}`).join(";")};--glow:${glow};--visor:${base.visor};--logo:${base.logo};--acc:${acc};--acc-cloth:${accCloth(acc)}`;
  return `<svg class="${o.cls ?? "av"}" viewBox="${vb}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" style="${style}" ${o.label ? `role="img" aria-label="${o.label}"` : `aria-hidden="true"`}>${body}${head}</svg>`;
}
