// When saved renders reach the Studio frame, and whether they play back. Pure: no DOM, no timers.
// Saves only count up; the frame always gets the newest one, so a later save replaces a render
// still waiting and playback continues from what is visible.

/** seated: the robot is in its chair. shown: the Studio window is drawn on a visible monitor.
 * sharp: the monitor is close enough for full detail. still: reduced motion or catching up. */
export type StudioPresence = { seated: boolean; shown: boolean; sharp: boolean; still: boolean };
export type StudioCommand = { type: "render"; version: number; animate: boolean } | { type: "motion"; on: boolean };

export class StudioSchedule {
  latest = 0;
  private sent = 0;
  private settled = 0;
  private motion: boolean | null = null;
  private fresh = false;

  /** A save on disk. `created`: the page is new, so its first render is built from a blank canvas. */
  save(created = false) {
    if (created && this.sent === 0) this.fresh = true;
    return ++this.latest;
  }
  /** The frame finished a render (played back or shown directly). */
  settle(version: number) { this.settled = Math.max(this.settled, Math.min(version, this.sent)); }
  /** A new frame has nothing to diff against: its first render appears directly. */
  frameLost() { this.sent = this.settled = 0; this.motion = null; }

  get playing() { return this.settled < this.sent; }
  get pending() { return this.latest > this.sent; }
  get idle() { return !this.playing && !this.pending; }
  /** Live: someone can watch the robot work on a sharp, visible Studio window. */
  live(p: StudioPresence) { return p.seated && p.shown && p.sharp; }
  /** True once `version` is on screen, or when nobody is watching so nothing will play. */
  done(version: number, p: StudioPresence) { return this.settled >= version || !this.live(p); }

  next(p: StudioPresence): StudioCommand[] {
    const out: StudioCommand[] = [];
    const live = this.live(p), motion = live && !p.still;
    if (motion !== this.motion) { this.motion = motion; out.push({ type: "motion", on: motion }); }
    if (live && this.pending) {
      out.push({ type: "render", version: this.latest, animate: motion && (this.sent > 0 || this.fresh) });
      this.sent = this.latest;
      this.fresh = false;
    }
    return out;
  }
}
