// The robot system's public API. Code outside src/robot imports robots from here.
//
//   identity   brand.ts (harness -> species, palette, logo), look.ts (outfit options and colours),
//              roster.ts (persistent workers), persona.ts (their written persona), voice.ts
//   art        art/head.ts, art/outfit.ts, art/portrait.ts, art/model-sticker.ts
//   motion     ik.ts (two-bone limbs), seated/ (the desk robot), walker/ (the walking robot)
//   rendering  render/canvas.ts (far robots on a canvas), render/deferred.ts (desk robots made on
//              assignment), render/power.ts (Ultra and Fast mode effects)
// See docs/architecture.md for how the pieces fit together.

export { GEOM, UNIT, PHONE_SCALE, type Pt, type DeskRig, type SeatedRobot, type Pose, type Expression, type Reaction, type PhoneReaction } from "./rig";
export { brandFor, logoFor, harnessName, PALETTES, type BrandKind, type Palette } from "./brand";
export {
  ACCENTS, ACCESSORIES, ANTENNA_TIPS, BUILDS, COLOR_NAMES, EYES, GLOWS, HATS, HEAD_SIZES, STICKERS, TINTS,
  randomLook, resolveLook, seeded, tintPalette, type RobotLook, type View,
} from "./look";
export { stickerSvg } from "./art/outfit";
export { portraitSvg } from "./art/portrait";
export { Roster, HOBBY_LABEL, WALLPAPERS, interestsFrom, type RobotProfile, type Prefs, type Hobby, type OfficeTaste, type WorkerSwap } from "./roster";
export { personaLines, personaMarkdown } from "./persona";
export { robotSay } from "./voice";
export { TopDownRobot, emptyChairSvg } from "./seated/robot";
export { Walker, SIT_HEAD, type Facing, type Activity } from "./walker/walker";
export { highFive } from "./walker/handoff";
export { wait } from "./util";
export { DeferredRobot } from "./render/deferred";
export { RobotPower, setRobotModes } from "./render/power";
export { canvasRobotsWanted, syncRobotCanvases } from "./render/canvas";
