// Shared contract between desks (furniture, computer) and the seated robot (character art).
// View: fake top-down, like Stardew Valley. The floor and furniture are seen from above at a
// steep angle; characters and monitors are upright 2D figures. A robot sits on the SOUTH side
// of its desk, so we see its back and the top of its head, its hands on the keyboard, and the
// monitor screen facing us.

export type Pt = { x: number; y: number };
export type Hand = "left" | "right";

// Desk unit coordinates (one workstation), origin top-left. All values in desk-unit pixels.
export const UNIT = { w: 400, h: 380 };
export const GEOM = {
  monitor: { x: 54, y: 4, w: 292, h: 172 },             // bezel billboard, screen inside it
  screen: { x: 62, y: 12, w: 276, h: 155, scale: 276 / 820 }, // the robot's desktop (820x461 DOM, scaled)
  stand: { x: 200, top: 176, base: 194 },
  table: { x: 34, y: 180, w: 332, h: 76, front: 12 },   // top surface, then a 12px front face
  keyboard: { x: 146, y: 208, w: 108, h: 30 },          // 4 key rows + a space bar row, columns left to right
  mouse: { x: 278, y: 226 },
  mug: { x: 330, y: 204 },
  phoneRest: { x: 76, y: 226 },
  chair: { x: 200, y: 300 },                            // seat center; backrest is south of it (y 300..344)
  head: { x: 200, y: 262 },                             // where the seated robot's head center rests
  shoulders: { left: { x: 170, y: 292 }, right: { x: 230, y: 292 } },
  bubble: { x: 252, y: 150 },                           // speech and thought bubbles anchor (top-left)
};

export interface DeskRig {
  /** Center of a key in desk-unit coordinates and which hand types it. Keys: single characters, " ", "Enter", "Backspace", "ArrowUp/Down/Left/Right". */
  keyPos(key: string): (Pt & { hand: Hand }) | null;
  /** Visually press the key on the keyboard. */
  pressKey(key: string): void;
  homeLeft: Pt;   // resting typing position of the left hand (on F)
  homeRight: Pt;  // resting typing position of the right hand (on J)
  mouse: Pt;      // resting mouse position
  moveMouse(p: Pt): void;
  mug: Pt;
  moveMug(p: Pt | null, tilt?: number): void;          // null puts it back on the desk
  phoneRest: Pt;
  /** Shows the phone (a 150x300 DOM element rendered at about 0.3 scale) with its top-left at `at`, or puts it back on the desk. */
  showPhone(at: Pt | null, tilt?: number): void;
}

export type Expression = "neutral" | "happy" | "angry" | "shy" | "surprised" | "sleepy" | "focus" | "laugh";
export type Pose =
  | "idle" | "type" | "mouse" | "think" | "read" | "ask" | "rest" | "celebrate" | "sleep" | "phone" | "stretch" | "notice";
export type Reaction = "focus" | "relax" | "cheer" | "angry" | "laugh" | "shy" | "surprised";

/** What a seated robot must provide. `constructor(host: HTMLElement, desk: DeskRig)` appends its SVG to host (desk-unit sized, 400x440 viewBox). */
export interface SeatedRobot {
  el: Element;
  readonly brandName: string;
  readonly currentPose: Pose;
  setBrand(provider: string): void;           // "codex", "claudeAgent", "grok", anything else falls back to a generic robot
  setPose(p: Pose): void;                     // ask / notice / celebrate turn the robot around to face the camera
  setTyping(on: boolean): void;
  pressKey(key: string): void;                // the matching hand travels to the real key
  tap(key?: string): void;
  click(): void;
  mouseTo(nx: number, ny: number): void;      // cursor position on its screen (0..1): moves the physical mouse and the hand on it
  nudgeMouse(nx: number, ny: number): void;
  lookAt(nx: number, ny?: number): void;      // head turns slightly toward that point of its screen
  setExpression(e: Expression): void;         // visible when facing the camera
  react(kind: Reaction): void;
  wake(): void;
  drink(): Promise<void>;
  holdPhone(on: boolean): Promise<void>;
  swipe(): void;
  /** Model name printed small on the robot's back plate, like a jersey (null hides it). */
  setModel?(name: string | null): void;
  /** Personality touches picked when the robot is first hired. */
  setLook?(look: RobotLook): void;
  /** Puts headphones on (the hands lift them onto the ears) or takes them off. `look.headphones` sets the starting state. */
  setHeadphones?(on: boolean): void;
  /** Bobs to music at this tempo on top of any pose (head on the beat, shoulder sway, antenna bounce). 0 stops smoothly. */
  setGroove?(bpm: number): void;
  destroy(): void;
}

export interface RobotLook {
  accent?: string;                                   // trim color: ear rings, shoulder caps
  antennaTip?: "ball" | "star" | "heart" | "ring";
  headphones?: boolean;
  sticker?: "none" | "bolt" | "star" | "heart" | "smile";  // a small sticker on the back of the head, beside the logo
}
