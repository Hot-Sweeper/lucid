import type { RobotLook } from "../look";
import type { V3 } from "../ik";
import { lerp } from "../../util/math";

// The walking robot's skeleton and poses, in v0 units: joint positions, bone lengths, walking
// speeds and the hand targets activities reach for (body space, relative to the shoulder).
export type Facing = "up" | "down" | "left" | "right";
export type Activity =
  | "idle" | "talk" | "laugh" | "eat" | "drink" | "charge" | "nap" | "wave" | "wait"
  | "hold-card" | "sit" | "explain" | "listen"
  // group games: ping pong stance, gamepad, chin scratch, cheering, sulking, watching a film
  | "ready" | "play" | "think" | "cheer" | "sulk" | "watch"
  // seated behind a desk, facing the room, hands on the keyboard
  | "type";

export interface WalkerOptions { id: string; provider: string; name?: string; model?: string; scale?: number; look?: RobotLook; speed?: number; flavorSpeech?: boolean }
export type Prop = "none" | "mug" | "bowl" | "spoon" | "card" | "report" | "wrist" | "paddle" | "pad" | "popcorn" | "ball" | "stamp";

// ---- skeleton (v0 units) ------------------------------------------------------------------------
export const FEET = { x: 560, y: 935 };              // floor point between the feet
export const VB = { x: 392, y: 440, w: 336, h: 542 };
export const ANKLE = FEET.y - 9;
export const SH = { dx: 50, y: 750 };                // shoulders: half width, height
export const HIP = { dx: 15, y: 852 };               // hip joints
export const NECK = { x: 560, y: 730 };
export const UPPER = 43, FORE = 41;                  // arm bones
export const THIGH = 38, SHIN = 37;                  // leg bones
export const K = 0.38;                               // depth (toward the camera) to screen y
export const SIT_DROP = 36, CROUCH_DROP = 15;
/** From the feet up to the middle of the head of a walker sitting on a chair, in v0 units (times the scale for px). */
export const SIT_HEAD = FEET.y - 659 - SIT_DROP + 21;   // the head rides on the neck a little above the art's middle
export const SPRINT = 430;                           // a new job: straight to the desk
export const SPEED = 105;                            // px per second (in the parent's coordinates)
export const STEP = 25;                              // half a step, v0 units
export const TAU = Math.PI * 2;
// which activities can be done sitting down (they keep the current seat)
export const SEATABLE = new Set<Activity>(["sit", "nap", "eat", "drink", "talk", "listen", "laugh", "think", "play", "watch", "explain", "type"]);

export type P2 = { x: number; y: number };
/** A hand target in body space, relative to its shoulder: x outward, y down, z forward. `r` turns what it holds. */
export type Hand = { x: number; y: number; z: number; r?: number };
export const H = (x: number, y: number, z: number, r = 0): Hand => ({ x, y, z, r });

// poses
export const HANG = H(8, 80, -1), LAP = H(-14, 86, 34);
export const BOWL = H(-30, 24, 28), SCOOP = H(-44, 14, 27, -112), MOUTH = H(-35, -37, 24, -28);
export const MUG = H(-16, 42, 24), SIP = H(-27, -40, 24, -34);
export const HIP_HAND = H(2, 60, 6);
export const CHIN = H(-44, -36, 26), CROSS_L = H(-44, 36, 22), CROSS_R = H(-46, 30, 27);
export const READY_R = H(10, 30, 32, -24), READY_L = H(4, 40, 24);
export const PAD = H(-30, 50, 28), PAD_SIT = H(-30, 60, 30);
export const POP_STAND = H(-38, 46, 24), POP_SIT = H(-40, 64, 30), INTO_POP = H(-60, 34, 32);
// at a desk, facing the camera: hands on the keyboard, the rubber stamp over the paper beside it
export const KEYS = H(-16, 40, 60), STAMP_UP = H(40, 14, 50, 0), STAMP_DOWN = H(44, 62, 70, 0);

/** A body-space point seen from the robot's current facing (side views are drawn facing right). */
export function project(facing: Facing, v: V3): P2 {
  switch (facing) {
    case "down": return { x: v.x, y: v.y + v.z * K };
    case "up": return { x: v.x, y: v.y - v.z * K };
    default: return { x: 560 + v.z + (v.x - 560) * 0.12, y: v.y + (v.x - 560) * 0.08 };
  }
}

/** Where a hand rests when no pose drives it: hanging, on the lap, or carrying its prop. */
export function restHand(prop: Prop, sit: number): Hand {
  const mix = (a: Hand, b: Hand) => ({ x: lerp(a.x, b.x, sit), y: lerp(a.y, b.y, sit), z: lerp(a.z, b.z, sit), r: lerp(a.r ?? 0, b.r ?? 0, sit) });
  switch (prop) {
    case "bowl": return { ...BOWL };
    case "spoon": return { ...SCOOP };
    case "mug": return { ...MUG };
    case "report": return H(20, 52, 30, -6);
    case "popcorn": return mix(POP_STAND, POP_SIT);
    case "pad": return mix(PAD, PAD_SIT);
    case "paddle": return { ...READY_R, y: 50, z: 18, r: -10 };
    case "ball": return mix(H(6, 58, 14), LAP);
    default: return mix(HANG, LAP);
  }
}
