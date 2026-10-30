// Shared contract between desks (furniture, computer) and the seated robot (character art).
// View: fake top-down, like Stardew Valley. The floor and furniture are seen from above at a
// steep angle; characters and monitors are upright 2D figures. A robot sits on the SOUTH side
// of its desk, so we see its back and the top of its head, its hands on the keyboard, and the
// monitor screen facing us.

export type Pt = { x: number; y: number };
export type Hand = "left" | "right";

// Desk unit coordinates (one workstation), origin top-left. All values in desk-unit pixels.
export const UNIT = { w: 400, h: 440 };
export const GEOM = {
  monitor: { x: 88, y: 8, w: 224, h: 132 },             // bezel billboard, screen inside it
  screen: { x: 95, y: 15, w: 210, h: 118, scale: 210 / 820 }, // the robot's desktop (820x461 DOM, scaled)
  stand: { x: 200, top: 140, base: 170 },
  table: { x: 24, y: 150, w: 352, h: 112, front: 14 },  // top surface, then a 14px front face
  keyboard: { x: 110, y: 192, w: 180, h: 44 },          // 4 key rows + a space bar row, columns left to right
  mouse: { x: 304, y: 222 },
  mug: { x: 340, y: 180 },
  phoneRest: { x: 64, y: 214 },
  chair: { x: 200, y: 330 },                            // seat center; backrest is south of it (y 330..376)
  head: { x: 200, y: 268 },                             // where the seated robot's head center rests
  shoulders: { left: { x: 166, y: 304 }, right: { x: 234, y: 304 } },
  bubble: { x: 300, y: -30 },                           // speech and thought bubbles anchor (top-left)
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
  destroy(): void;
}
