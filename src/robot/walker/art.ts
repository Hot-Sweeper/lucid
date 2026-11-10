// The walking robot's drawing: limbs (two stroked bones, a highlight and a joint disc), mitten
// hands with what they hold, feet, the front/back and side bodies, and the heads from art/head.ts.
// The element's origin is the point between its feet.
import type { RobotLook } from "../look";
import { defsSvg, walkerHeadSvg, walkerSideHeadSvg } from "../art/head";
import { stickerSvg } from "../art/outfit";
import { FEET, VB, type Prop } from "./skeleton";

export const PROPS: Record<Prop, string> = {
  none: "",
  // origin = the hand; held things sit in or above the mitten
  mug: `<g transform="scale(1.3)"><path d="M-12 -14 q-10 0 -10 10 q0 10 10 10" stroke="#e8673c" stroke-width="5" fill="none"/>
    <rect x="-44" y="-20" width="26" height="30" rx="7" fill="#ff8a65"/><rect x="-40" y="-14" width="5" height="18" rx="2.5" fill="#ffb59a"/>
    <ellipse cx="-31" cy="-19" rx="11" ry="4" fill="#5a2b1e"/></g>`,
  bowl: `<g transform="scale(1.2)"><path d="M-27 -22 Q-25 2 0 3 Q25 2 27 -22 Z" fill="#4fb6ff"/><path d="M-20 -8 Q-8 -1 6 -2" stroke="#8fd0ff" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="0" cy="-22" rx="27" ry="7.5" fill="#3a8fd6"/><ellipse cx="0" cy="-22" rx="23" ry="5.5" fill="#ffd27a"/>
    <path d="M-14 -24 q5 -5 10 0 q5 -5 10 0 q4 -4 8 0" stroke="#f0b04a" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>`,
  spoon: `<rect x="-2.5" y="-30" width="5" height="40" rx="2.5" fill="#cfd5e2"/><ellipse cx="0" cy="-33" rx="6.5" ry="8" fill="#e6eaf2"/>
    <ellipse data-r="bite" cx="0" cy="-34" rx="4.2" ry="5" fill="#ffd27a" opacity="0"/>`,
  card: "",
  report: `<g class="world-report-sheet" aria-hidden="true"><path d="M-8 -66 H33 L47 -52 V7 H-8 Z" fill="#fff9ec" stroke="#c7b28e" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M33 -66 V-52 H47" fill="#eadcc3" stroke="#c7b28e" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="0" y="-56" width="24" height="5" rx="1" fill="#d3935c"/>
    <path d="M0 -42 H35 M0 -34 H35 M0 -26 H29 M0 -18 H34 M0 -10 H19" stroke="#afa28d" stroke-width="2" stroke-linecap="round"/>
    <path d="M29 -2 H35" stroke="#d3935c" stroke-width="2" stroke-linecap="round"/></g>`,
  wrist: "",
  paddle: `<g transform="scale(1.2)"><rect x="-4" y="-10" width="8" height="22" rx="4" fill="#a8774f"/><circle cx="0" cy="-29" r="20" fill="#2b2f3d"/><circle cx="0" cy="-30" r="17.5" fill="#e2483d"/>
    <ellipse cx="-6" cy="-36" rx="6.5" ry="4" fill="#ff8a7a" opacity="0.6"/></g>`,
  // held in the right hand, reaching across to the left hand
  pad: `<rect x="-60" y="-11" width="70" height="24" rx="11" fill="#3a3f4f"/><rect x="-57" y="-10" width="64" height="8" rx="4" fill="#4a5063"/>
    <circle cx="-46" cy="2" r="5" fill="#262a36"/><circle cx="-6" cy="-1" r="3.6" fill="#ff6f91"/><circle cx="-13" cy="5" r="3.6" fill="#4fb6ff"/><circle cx="-26" cy="0" r="2.4" fill="var(--glow)"/>`,
  popcorn: `<path d="M-20 -40 L20 -40 L15 0 Q0 5 -15 0 Z" fill="#fff6e8"/>
    <path d="M-13 -40 L-10 1 L-3 2 L-6 -40 Z M6 -40 L3 2 L10 1 L13 -40 Z" fill="#e2483d"/>
    <circle cx="-13" cy="-43" r="7" fill="#fff3c4"/><circle cx="-2" cy="-47" r="8" fill="#ffe9a0"/><circle cx="10" cy="-44" r="7" fill="#fff3c4"/><circle cx="16" cy="-39" r="5.5" fill="#ffd27a"/><circle cx="3" cy="-40" r="6.5" fill="#fff8de"/>`,
  ball: `<circle cx="3" cy="-11" r="7.5" fill="#fffdf6"/><circle cx="1" cy="-13.5" r="2.6" fill="#fff" opacity="0.9"/>`,
  // a rubber stamp gripped by its knob, the pad pointing down
  stamp: `<g><rect x="-5" y="-6" width="10" height="20" rx="3" fill="#a8774f"/><circle cx="0" cy="-6" r="8" fill="#c08a5c"/>
    <rect x="-13" y="13" width="26" height="8" rx="2.5" fill="#3a3f4f"/><rect x="-12" y="20" width="24" height="3.5" rx="1.5" fill="#e2483d"/></g>`,
};
// props drawn over the mitten (held from below); the rest are gripped, so the mitten covers them
export const OVER = new Set<Prop>(["bowl", "popcorn", "ball"]);

// The walker has only ever shown the first four sticker designs; the later ones stay desk-only.
const WALKER_STICKERS = new Set(["bolt", "star", "heart", "smile"]);
export const walkerSticker = (kind: RobotLook["sticker"]) => (kind && WALKER_STICKERS.has(kind) ? stickerSvg(kind) : "");

// A limb: two stroked bones in the shade color, a lit highlight along them and a joint disc.
const limb = (kind: "arm" | "leg", k: string) => {
  const [up, lo, hi, joint] = kind === "arm" ? [17, 14, 6, 8.5] : [19, 16, 6.5, 8.5];
  const j = kind === "arm" ? "elbow" : "knee";
  return /* svg */ `
    <path data-r="${kind}${k}Up" fill="none" stroke="var(--shade)" stroke-width="${up}" stroke-linecap="round"/>
    <path data-r="${kind}${k}Lo" fill="none" stroke="var(--shade)" stroke-width="${lo}" stroke-linecap="round"/>
    <path data-r="${kind}${k}Hi" fill="none" stroke="var(--shell)" stroke-width="${hi}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
    <g data-r="${j}${k}"><circle r="${joint}" fill="var(--deep)"/><circle cx="-1.4" cy="-1.8" r="${joint * 0.52}" fill="var(--shade)"/></g>`;
};
// A slim mitten with a wrist cuff; x points along the forearm.
const MITTEN = /* svg */ `
  <ellipse cx="-11" cy="0" rx="5" ry="7.5" fill="var(--deep)"/>
  <ellipse cx="-2" cy="8.5" rx="5.6" ry="4.4" fill="var(--shade)"/>
  <ellipse cx="2" cy="0" rx="12.5" ry="10.5" fill="var(--shade)"/>
  <ellipse cx="3.5" cy="-2" rx="8" ry="5.8" fill="var(--shell)"/>`;
const armSvg = (k: "l" | "r") => /* svg */ `
  <g data-r="arm${k.toUpperCase()}">
    ${limb("arm", k)}
    <g data-r="prop${k.toUpperCase()}Under"></g>
    <g data-r="hand${k}">${MITTEN}${k === "l" ? `<g data-r="watch" style="display:none"><rect x="-17" y="-8" width="9" height="16" rx="3" fill="var(--visor)"/><rect class="world-wrist" x="-15.5" y="-5.5" width="6" height="11" rx="2" fill="var(--glow)"/></g>` : ""}</g>
    <g data-r="prop${k.toUpperCase()}Over"></g>
  </g>`;
const footSvg = (k: string) => /* svg */ `
  <g data-r="foot${k}"><ellipse cx="3" cy="1" rx="14" ry="8" fill="var(--deep)"/><ellipse cx="1" cy="-1.5" rx="8" ry="4" fill="var(--shade)" opacity="0.8"/></g>`;
const cap = (x: number) => /* svg */ `
  <circle cx="${x}" cy="747" r="18" fill="var(--cap, var(--shade))"/><circle cx="${x}" cy="749" r="15.5" fill="var(--shade)"/><circle cx="${x - 3}" cy="744.5" r="11" fill="var(--shell)"/>`;

export const WALKER_SVG = (id: string, s: number) => /* svg */ `
<svg class="world-walker-svg" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" width="${(VB.w * s).toFixed(1)}" height="${(VB.h * s).toFixed(1)}"
  style="left:${(-(FEET.x - VB.x) * s).toFixed(1)}px;top:${(-(FEET.y - VB.y) * s).toFixed(1)}px" aria-hidden="true">
  <defs>${defsSvg(id)}</defs>
  <ellipse data-r="shadow" cx="${FEET.x}" cy="${FEET.y + 1}" rx="54" ry="12" fill="#2b1d10" opacity="0.22"/>
  <g data-r="flip"><g data-r="rig">
    <g data-r="lower"><g data-r="legsBack"><g data-r="legs">${limb("leg", "l")}${footSvg("l")}${limb("leg", "r")}${footSvg("r")}</g></g>
    <g data-r="body">
      <g data-r="armsBack"></g><g data-r="accessoryUnder"></g>
      <rect x="547" y="700" width="26" height="42" rx="9" fill="var(--deep)"/>
      <g data-r="fbBody">
        <rect x="524" y="826" width="72" height="40" rx="17" fill="var(--deep)"/>
        <path d="M503 752 C503 735 517 727 534 727 L586 727 C603 727 617 735 617 752 C617 786 609 814 603 840 L517 840 C511 814 503 786 503 752 Z" fill="var(--shade)"/>
        <path d="M509 754 C509 740 520 733 535 733 L583 733 C596 733 606 740 606 754 C606 783 599 808 594 832 L526 832 C521 808 509 783 509 754 Z" fill="var(--shell)"/>
        <path d="M598 750 C600 778 595 802 589 824" fill="none" stroke="var(--shade)" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
        <g data-r="backPlate">
          <rect x="541" y="750" width="38" height="5" rx="2.5" fill="var(--shade)"/>
          <rect x="544" y="760" width="32" height="5" rx="2.5" fill="var(--shade)"/>
          <g data-r="nameplate">
            <rect data-r="plate" x="518" y="776" width="84" height="16" rx="6" fill="var(--shade)"/>
            <text data-r="model" x="560" y="788" text-anchor="middle" font-family="var(--mono)" font-size="10" font-weight="650" fill="var(--deep)"></text>
          </g>
        </g>
        <g data-r="chest">
          <rect x="539" y="758" width="42" height="32" rx="11" fill="var(--shade)"/>
          <circle data-r="chestGlow" cx="560" cy="774" r="8" fill="var(--glow)" opacity="0.35"/>
          <circle cx="560" cy="774" r="5" fill="var(--glow)"/>
          <circle cx="546" cy="766" r="2.2" fill="var(--deep)"/><circle cx="574" cy="766" r="2.2" fill="var(--deep)"/>
        </g>
        ${cap(510)}${cap(610)}
      </g>
      <g data-r="sideBody">
        <rect x="534" y="826" width="54" height="40" rx="17" fill="var(--deep)"/>
        <path d="M528 752 C528 735 539 727 552 727 L570 727 C588 727 598 738 598 756 C598 790 592 816 586 840 L536 840 C532 816 528 790 528 752 Z" fill="var(--shade)"/>
        <path d="M534 754 C534 740 543 733 554 733 L568 733 C583 733 590 742 590 758 C590 788 585 810 580 832 L541 832 C538 810 534 786 534 754 Z" fill="var(--shell)"/>
        <rect x="521" y="752" width="11" height="46" rx="5.5" fill="var(--shade)"/>
        <circle cx="586" cy="774" r="5" fill="var(--glow)" opacity="0.85"/>
        ${cap(566)}
      </g>
      <g data-r="accessoryOver"></g>
    </g></g>
    <g data-r="head">
      <g data-r="fbHead">${walkerHeadSvg(id)}<g data-r="fbBlush"></g></g>
      <g data-r="fbHat"></g>
      ${walkerSideHeadSvg(id)}
      <g data-r="sideHat"></g>
    </g>
    <g data-r="legsFront"></g>
    <g data-r="armsFront">${armSvg("l")}${armSvg("r")}</g>
  </g></g>
</svg>`;

