export interface FunHost {
  sleep(ms: number): Promise<void>;                 // cancellable wait; rejects when interrupted. Clean up and let it propagate.
  pointAt(el: Element, ax?: number, ay?: number, ms?: number): Promise<void>; // moves the robot's on-screen cursor (and its mouse hand)
  click(): Promise<void>;
  tap(key?: string): void;                          // robot presses one physical key (visual), e.g. "a", " ", "Enter"
  react(kind: "focus" | "relax" | "cheer" | "angry" | "laugh" | "shy" | "surprised"): void;
  readonly stopped: boolean;                        // true once new work arrived; check in loops
}
export type Outcome = { result: "win" | "lose" | "ragequit" | "done"; score?: number };
export interface FunOpts { maxMs: number; skill?: number }
