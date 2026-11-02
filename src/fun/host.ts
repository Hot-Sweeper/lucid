export interface FunHost {
  /** Cancellable wait. Rejects (throws) when the activity is interrupted; clean up and let it propagate. */
  sleep(ms: number): Promise<void>;
  /** Move the robot's on-screen cursor to an element (the robot's hand moves the mouse with it). */
  pointAt(el: Element, ax?: number, ay?: number, ms?: number): Promise<void>;
  click(): Promise<void>;
  /** The robot presses one key on its physical keyboard (visual only), e.g. "ArrowUp", " ". */
  tap(key?: string): void;
  /** Body language. */
  react(kind: "focus" | "relax" | "cheer" | "angry" | "laugh" | "shy" | "surprised"): void;
  /** True once the activity should stop (new work arrived). Check it in loops too. */
  readonly stopped: boolean;
  /** Optional: the robot's thumb touches the phone (visual only). */
  thumb?(kind: "tap" | "doubleTap" | "swipe"): void;
  /** Optional: the thumb presses a spot of the phone screen (0..1 across and down, e.g. a key). Negative: back to rest. */
  thumbAt?(nx: number, ny: number): void;
  /** Optional: scroll wheel nudge on the mouse (visual only). */
  scroll?(): void;
}
export type Outcome = { result: "win" | "lose" | "ragequit" | "done"; score?: number };
export interface FunOpts { maxMs: number; skill?: number /* 0..1, default about 0.6 */ }
