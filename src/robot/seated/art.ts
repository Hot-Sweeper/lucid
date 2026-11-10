// The seated robot's drawing in desk-unit coordinates: chair (backrest, gas lift, five-star base),
// the slim tapered torso shell, arms with mitten hands, the legs shown when it turns round, and
// the v0 head (art/head.ts) on top. The live parts carry data-r names that body.ts animates.
import { UNIT } from "../rig";
import { defsSvg, seatedHeadSvg } from "../art/head";
import { sharedVector } from "../../perf/shared-vector";
import { BACK_TOP, BASE_Y, BH, BW, CX, ORIGIN, S, SHOULDER, TAU, U } from "./geometry";

export const f = (n: number) => n.toFixed(1);
// A slim mitten with a wrist cuff; x points along the forearm.
const hand = (thumbSide: number,id:string) => /* svg */ `<g transform="scale(${(U * 0.86).toFixed(3)})">${sharedVector(`
  <ellipse cx="-12" cy="0" rx="4" ry="6.2" fill="var(--deep)"/>
  <ellipse cx="-3.5" cy="${7 * thumbSide}" rx="4.2" ry="3.3" fill="var(--shade)"/>
  <ellipse cx="-1" cy="0" rx="10" ry="8.4" fill="var(--shade)"/>
  <ellipse cx="0.5" cy="${-1.5 * thumbSide}" rx="6.6" ry="4.8" fill="var(--shell)"/>`,id)}</g>`;

const arm = (k: "L" | "R",id:string) => /* svg */ `
  <g data-r="arm${k}">
    <path data-r="arm${k}Up" fill="none" stroke="var(--shade)" stroke-width="${f(19 * S)}" stroke-linecap="round"/>
    <path data-r="arm${k}Fo" fill="none" stroke="var(--shade)" stroke-width="${f(15 * S)}" stroke-linecap="round"/>
    <path data-r="arm${k}Hi" fill="none" stroke="var(--shell)" stroke-width="${f(7 * S)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
    <g data-r="arm${k}El">${sharedVector(`<circle r="${f(9.5 * S)}" fill="var(--deep)"/><circle cx="${f(-1.2 * S)}" cy="${f(-1.6 * S)}" r="${f(5 * S)}" fill="var(--shade)"/>`,id)}</g>
    <g data-r="hand${k}">${hand(k === "L" ? 1 : -1,id)}</g>
  </g>`;

// Office chair seen from behind: backrest over the lower back, gas lift, five-star base.
const chairBase = () => {
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    out.push(`<path data-spoke="${i}" stroke="var(--wd-chair-frame, #3a3f4f)" stroke-width="${f(6 * U)}" stroke-linecap="round"/>`);
    out.push(`<ellipse data-spoke="w${i}" rx="${f(4.6 * U)}" ry="${f(3.8 * U)}" fill="var(--wd-chair-wheel, #2a2e3b)"/>`);
  }
  return `<ellipse cx="${CX}" cy="${f(BASE_Y + 10 * U)}" rx="${f(66 * U)}" ry="${f(12 * U)}" fill="#2b1d10" opacity="0.2"/>
    <rect x="${f(CX - 4.5 * U)}" y="${f(BACK_TOP + BH - 8)}" width="${f(9 * U)}" height="${f(BASE_Y - BACK_TOP - BH + 8)}" rx="3" fill="var(--wd-chair-frame, #3a3f4f)"/>
    ${out.join("")}<ellipse cx="${CX}" cy="${f(BASE_Y)}" rx="${f(7.5 * U)}" ry="${f(3.4 * U)}" fill="var(--wd-chair, #4a5063)"/>`;
};
const SEAT_BACK = `<rect x="${f(CX - BW / 2 - 2)}" y="${f(BACK_TOP - 16 * U)}" width="${f(BW + 4)}" height="${f(24 * U)}" rx="${f(12 * U)}" fill="var(--wd-chair-frame, #3a3f4f)"/>`;
const BACKREST = `<rect x="${f(CX - 7 * U)}" y="${f(BACK_TOP + BH - 6)}" width="${f(14 * U)}" height="${f(10 * U)}" rx="3" fill="var(--wd-chair-frame, #3a3f4f)"/>
      <rect x="${f(CX - BW / 2)}" y="${f(BACK_TOP)}" width="${f(BW)}" height="${f(BH)}" rx="${f(16 * U)}" fill="var(--wd-chair, #4a5063)"/>
      <rect x="${f(CX - BW / 2 + 7 * U)}" y="${f(BACK_TOP + 4 * U)}" width="${f(BW - 14 * U)}" height="${f(BH - 11 * U)}" rx="${f(11 * U)}" fill="var(--wd-chair-pad, #565d73)"/>
      <rect x="${f(CX - BW / 2 + 16 * U)}" y="${f(BACK_TOP + 7 * U)}" width="${f(BW * 0.55)}" height="${f(3.5 * U)}" rx="${f(1.75 * U)}" fill="#ffffff" opacity="0.13"/>`;
/** The chair alone, for a desk with nobody at it (desk coordinates; drawn once, nothing moves). */
export function emptyChairSvg() {
  const spokes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + Math.PI / 2, x = CX + Math.cos(a) * 46 * U, y = BASE_Y + Math.sin(a) * 10 * U;
    spokes.push(`<path d="M${CX} ${f(BASE_Y)} L${f(x)} ${f(y)}" stroke="var(--wd-chair-frame, #3a3f4f)" stroke-width="${f(6 * U)}" stroke-linecap="round"/><ellipse cx="${f(x)}" cy="${f(y + 4 * U)}" rx="${f(4.6 * U)}" ry="${f(3.8 * U)}" fill="var(--wd-chair-wheel, #2a2e3b)"/>`);
  }
  return `<g class="empty-chair">${chairBase().replace(/<(path|ellipse) data-spoke[^>]*\/>/g, "")}${spokes.join("")}${SEAT_BACK}${BACKREST}</g>`;
}
const HIP_Y = ORIGIN.y + 36 * U, FOOT_Y = BASE_Y + 2 * U;
const leg = (side: number) => {
  const hx = CX + side * 12 * U, kx = CX + side * 14 * U;
  const d = `M${f(hx)} ${f(HIP_Y)} L${f(kx)} ${f(HIP_Y + 14 * U)} L${f(kx)} ${f(FOOT_Y - 8 * U)}`;
  return `<path d="${d}" fill="none" stroke="var(--shade)" stroke-width="${f(22 * S)}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="var(--shell)" stroke-width="${f(9 * S)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" transform="translate(-1 -1.4)"/>
    <ellipse cx="${f(kx)}" cy="${f(HIP_Y + 14 * U)}" rx="${f(6 * S)}" ry="${f(6 * S)}" fill="var(--deep)"/>
    <ellipse cx="${f(kx + side * 1.5)}" cy="${f(FOOT_Y)}" rx="${f(10 * U)}" ry="${f(6 * U)}" fill="var(--deep)"/>`;
};

// Slim tapered shell: narrow at the shoulders, narrower at the waist; lit from the upper left.
const shoulder = (x: number) => /* svg */ `
  <circle cx="${x}" cy="747" r="18" fill="var(--cap, var(--shade))"/>
  <circle cx="${x}" cy="749" r="15.5" fill="var(--shade)"/>
  <circle cx="${x - 3}" cy="744.5" r="11" fill="var(--shell)"/>`;

/** The whole seated robot; `id` scopes its gradients, clips and shared vectors. */
export const seatedRobotSvg = (id: string) => /* svg */ `
<svg id="${id}" class="world-seated robot" viewBox="0 0 ${UNIT.w} ${UNIT.h}" style="width:${UNIT.w}px;height:${UNIT.h}px;--hp:var(--ear, var(--glow))" aria-hidden="true">
  <defs>${defsSvg(id, true)}</defs>
  <g class="world-chair-base">${chairBase()}</g>
  <ellipse data-r="shadowL" rx="${f(8.5 * U)}" ry="${f(4.2 * U)}" fill="#2b1d10" opacity="0"/>
  <ellipse data-r="shadowR" rx="${f(8.5 * U)}" ry="${f(4.2 * U)}" fill="#2b1d10" opacity="0"/>
  <g data-r="body">
    <g data-r="seatBack">${sharedVector(SEAT_BACK,id)}</g>
    <g data-r="armsBack">${arm("L",id)}${arm("R",id)}</g>
    <g data-r="torso">
      <ellipse cx="560" cy="742" rx="92" ry="22" fill="url(#${id}-sh)"/>
      <rect x="547" y="700" width="26" height="42" rx="9" fill="var(--deep)"/>
      <g data-r="shellG"><g data-r="accUnder"></g>
      <path d="M503 752 C503 735 517 727 534 727 L586 727 C603 727 617 735 617 752 C617 786 607 812 601 838 L519 838 C513 812 503 786 503 752 Z" fill="var(--shade)"/>
      <path d="M509 754 C509 740 520 733 535 733 L583 733 C596 733 606 740 606 754 C606 783 597 807 592 830 L527 830 C522 807 509 783 509 754 Z" fill="var(--shell)"/>
      <path d="M598 748 C600 776 594 800 588 822" fill="none" stroke="var(--shade)" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
      <g data-r="accPack"></g></g>
      <g data-r="backPlate">
        <g data-r="vents"><rect x="541" y="750" width="38" height="5" rx="2.5" fill="var(--shade)"/>
        <rect x="544" y="760" width="32" height="5" rx="2.5" fill="var(--shade)"/></g>
        <g data-r="nameplate" style="display:none">
          <title data-r="nameTitle"></title>
          <rect data-r="plate" x="518" y="774" width="84" height="16" rx="6" fill="var(--shade)"/>
          <text data-r="model" x="560" y="786" text-anchor="middle" font-family="var(--mono)" font-size="10.5" font-weight="650" fill="var(--deep)"></text>
        </g>
      </g>
      <g data-r="chest" style="display:none">
        <rect x="539" y="756" width="42" height="30" rx="10" fill="var(--shade)"/>
        <circle cx="560" cy="771" r="8.5" fill="var(--glow)" opacity="0.35"/>
        <circle cx="560" cy="771" r="5" fill="var(--glow)"/>
        <circle cx="546" cy="764" r="2.2" fill="var(--deep)"/><circle cx="574" cy="764" r="2.2" fill="var(--deep)"/>
      </g>
      <g data-r="shL">${shoulder(560 - SHOULDER)}</g><g data-r="shR">${shoulder(560 + SHOULDER)}</g>
      <g data-r="accOverG"><g data-r="accOver"></g></g>
    </g>
    <g data-r="seatFront" style="display:none">
      <rect x="${f(CX - BW / 2 - 2)}" y="${f(HIP_Y - 10 * U)}" width="${f(BW + 4)}" height="${f(26 * U)}" rx="${f(13 * U)}" fill="#4a5063"/>
      <rect x="${f(CX - BW / 2 + 6)}" y="${f(HIP_Y - 7 * U)}" width="${f(BW - 12)}" height="${f(14 * U)}" rx="${f(7 * U)}" fill="#565d73"/>
    </g>
    <g data-r="legs" style="display:none">${leg(-1)}${leg(1)}</g>
    <g data-r="headRoot"><g data-r="head">${seatedHeadSvg(id)}</g></g>
    <g data-r="backrest">
      ${sharedVector(BACKREST,id)}
    </g>
    <g data-r="armsFront"></g>
  </g>
</svg>`;

