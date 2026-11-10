// A helper with its own T3 thread is another robot. The robot starts that thread and looks in on it
// in T3 Code, where the thread really lives, rather than in a harness window of its own.
import { T3CodeApp, type T3Host, type T3Info } from "./t3code";

type ThreadItem = { id: string; type: string; status?: string; data?: any };

export class T3ChildSession {
  private app: T3CodeApp;
  private info: T3Info;

  constructor(private wm: T3Host & { check(epoch: number): void }, readonly id: string, info: T3Info) {
    this.app = new T3CodeApp(wm);
    this.info = { ...info, id, run: { status: "running" } };
    this.app.setInfo(this.info);
  }

  /** The robot opens the new thread in T3 Code; the brief is its first message. */
  start(prompt: string) { return this.app.user(prompt); }

  /** Model and effort learned once the child thread exists. */
  setMeta(meta: { model?: string; effort?: string }) {
    const next = { ...this.info, ...(meta.model ? { model: meta.model } : {}), ...(meta.effort ? { effort: meta.effort } : {}) };
    if (next.model === this.info.model && next.effort === this.info.effort) return;
    this.info = next;
    this.app.setInfo(next);
  }

  /** A work item of the child thread: a row in its T3 Code view. */
  item(it: ThreadItem) { this.app.activity(it); }

  /** The child's latest reply. */
  stream(text: string) { this.app.reply(text); }

  finish(summary?: string, ok = true) {
    this.info = { ...this.info, run: { status: ok ? "completed" : "failed" } };
    this.app.setInfo(this.info);
    if (summary && summary !== "Done") this.app.reply(summary);
  }

  /** The robot switches to the child thread in T3 Code and reads the latest lines. */
  async checkOn() {
    const e = this.wm.epoch;
    await this.app.show();
    this.wm.check(e);
    this.wm.robot.setPose("read");
    await this.wm.sleep(900 + Math.random() * 700, e);
  }

  reset() { this.app.reset(); }
}
