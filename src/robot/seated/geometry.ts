// Seated robot geometry: everything is derived from the desk contract (rig.ts GEOM), so the robot
// follows the desk. Shared by the drawing (art.ts), the per-frame body (body.ts) and the poses.
import { GEOM, PHONE_SCALE, type Pose } from "../rig";

const SH = GEOM.shoulders;
// v0 art scale: the same as every walking robot (hallway, break room, park), so a robot looks
// the same size sitting at its desk as it does walking in. The rig scales around the shoulder
// point; the hands still reach the desk props, which keep their desk coordinates.
export const SEATED_SCALE = 0.42;
export const S = SEATED_SCALE;
export const K = S / 0.5;                                        // relative to the size the desk props were tuned at
export const U = S / 0.58;                                       // relative to the size the details were tuned at
export const ORIGIN = { x: (SH.left.x + SH.right.x) / 2, y: (SH.left.y + SH.right.y) / 2 }; // v0 (560, 748)
export const HEAD_DROP = (GEOM.head.y - 2 - (ORIGIN.y - 89 * S)) / S; // tucks the head toward GEOM.head (the steep view hides the neck)
export const MAP = `translate(${ORIGIN.x} ${ORIGIN.y}) scale(${S}) translate(-560 -748)`;
export const SHOULDER = 50;                                      // v0 half shoulder width of the regular build: slimmer than the original 60
// Back view: the upper arm hangs down toward the floor, so from up here it reads short and the
// elbow stays tucked at the side; the forearm reaches forward over the desk. Facing the camera the
// forearm is the foreshortened one.
export const UPPER = 42 * S, FORE = 160 * S;
export const HX = GEOM.head.x, HY = GEOM.head.y;
export const TABLE_FRONT = GEOM.table.y + GEOM.table.h;
export const BACK_TOP = ORIGIN.y + 56 * S;     // backrest top: below the jersey plate, over the lower back
export const P = (x: number, y: number) => ({ x: HX + x * U, y: HY + y * U });  // offsets around the head

// Resting: forearms lie folded along the desk edge, elbows out, hands tucked behind the head.
export const REST_L = { x: HX - 20 * U, y: TABLE_FRONT - 5 }, REST_R = { x: HX + 20 * U, y: TABLE_FRONT - 5 };
export const IDLE_L = { x: HX - 32 * U, y: TABLE_FRONT - 10 }, IDLE_R = { x: HX + 32 * U, y: TABLE_FRONT - 10 };
export const FOLD_BONE = 53 * U;
export const LAP_L = { x: ORIGIN.x - 15 * U, y: ORIGIN.y + 42 * U }, LAP_R = { x: ORIGIN.x + 15 * U, y: ORIGIN.y + 42 * U };
export const PHONE_W = 150 * PHONE_SCALE, PHONE_H = 300 * PHONE_SCALE;   // the held phone: a 150x300 element (rig.ts PHONE_SCALE)
// Over the left shoulder: the phone's right edge tucks just behind the head, top at eye level.
export const PHONE_HOLD = { x: HX - 80 * K, y: HY - 52 * K };   // beside the head, only its edge tucked behind it, above the desk plate
export const PHONE_TILT = 7;
export const TAU = Math.PI * 2;
/** How much idle weight shifting each pose allows (1 is relaxed). */
export const CALM: Partial<Record<Pose, number>> = { rest: 1, idle: 1, read: 0.8, think: 0.7, ask: 0.6, notice: 0.5, type: 0.35, mouse: 0.5, phone: 0.5 };

// Office chair seen from behind: backrest over the lower back, gas lift, five-star base.
export const CX = GEOM.chair.x;
export const BW = 100 * U, BH = 40 * U;
export const BASE_Y = BACK_TOP + BH + 20 * U;
