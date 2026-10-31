import type { Expression, Pose, Reaction, RobotLook, SeatedRobot } from "../office/rig";

// Computers keep one stable robot reference, but an unoccupied desk needs no SVG
// character, animation ticker or repeating tween. Assignment materializes the
// real rig synchronously before its first brand, look, pose or input is applied.
export class DeferredRobot implements SeatedRobot {
  private current: SeatedRobot | null = null;
  constructor(private host: Element, private create: () => SeatedRobot) {}
  get mounted() { return !!this.current; }
  get el() { return this.current?.el ?? this.host; }
  get brandName() { return this.current?.brandName ?? "codex"; }
  get currentPose(): Pose { return this.current?.currentPose ?? "rest"; }
  mount() { return this.current ??= this.create(); }
  destroy() { const old = this.current; this.current = null; old?.destroy(); }
  setBrand(provider: string) { this.current?.setBrand(provider); }
  setPose(pose: Pose) { this.current?.setPose(pose); }
  setTyping(on: boolean) { this.current?.setTyping(on); }
  pressKey(key: string) { this.current?.pressKey(key); }
  tap(key?: string) { this.current?.tap(key); }
  click() { this.current?.click(); }
  mouseTo(x: number, y: number) { this.current?.mouseTo(x, y); }
  nudgeMouse(x: number, y: number) { this.current?.nudgeMouse(x, y); }
  lookAt(x: number, y?: number) { this.current?.lookAt(x, y); }
  setExpression(expression: Expression) { this.current?.setExpression(expression); }
  react(reaction: Reaction) { this.current?.react(reaction); }
  wake() { this.current?.wake(); }
  drink() { return this.current?.drink() ?? Promise.resolve(); }
  holdPhone(on: boolean) { return this.current?.holdPhone(on) ?? Promise.resolve(); }
  swipe() { this.current?.swipe(); }
  thumbAt(x: number, y: number) { (this.current as SeatedRobot & { thumbAt?(x: number, y: number): void } | null)?.thumbAt?.(x, y); }
  setModel(model: string | null) { this.current?.setModel?.(model); }
  setLook(look: RobotLook) { this.current?.setLook?.(look); }
  setHeadphones(on: boolean) { this.current?.setHeadphones?.(on); }
  setGroove(bpm: number) { this.current?.setGroove?.(bpm); }
}
