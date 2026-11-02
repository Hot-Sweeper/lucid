/** Expensive scratch raster/readback work yields to camera input. Ready artwork
 * stays mounted; callers keep exact native vectors for any missing pixels. */
export class RasterQuietGate {
  private until = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private waiting = new Set<{ valid: () => boolean; resolve: (ready: boolean) => void }>();

  constructor(private delay = 120, private now = () => performance.now()) {}

  changed() { this.until = this.now() + this.delay; }

  wait(valid: () => boolean): Promise<boolean> {
    if (!valid()) return Promise.resolve(false);
    if (this.now() >= this.until) return Promise.resolve(true);
    return new Promise(resolve => {
      this.waiting.add({ valid, resolve });
      this.flush();
    });
  }

  /** Release obsolete/hidden owners immediately, without starting their work. */
  prune() { this.flush(); }

  cancel() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const waiting = [...this.waiting]; this.waiting.clear();
    for (const entry of waiting) entry.resolve(false);
  }

  private flush = () => {
    const quiet = this.now() >= this.until;
    for (const entry of this.waiting) {
      const valid = entry.valid();
      if (!valid || quiet) { this.waiting.delete(entry); entry.resolve(valid); }
    }
    if (!this.waiting.size) {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
    } else if (this.timer === null) {
      // Motion extends the deadline without allocating a timer per input event.
      this.timer = setTimeout(() => { this.timer = null; this.flush(); }, Math.max(1, this.until - this.now()));
    }
  };
}
