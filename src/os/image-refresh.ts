export type ImageState = { done: boolean; failed?: string; sources: string[] };
export type ImageRefresh = { id: string; generation: number; signature: string; state: ImageState };
const signature = (s: ImageState) => JSON.stringify([s.done, s.failed ?? "", s.sources]);

/** Route late results only to the latest presented image, once per result revision. */
export class ImageRefreshGate {
  private generation = 0;
  private current: { id: string; generation: number; presenting: boolean; state: ImageState; painted: string } | null = null;

  reset() { this.current = null; this.generation++; }
  tracks(id: string) { return this.current?.id === id; }
  begin(id: string, state: ImageState) {
    this.current = { id, generation: ++this.generation, presenting: true, state, painted: "" };
  }
  observe(id: string, state: ImageState): ImageRefresh | null {
    const c = this.current;
    if (!c || c.id !== id) return null;
    c.state = state;
    const sig = signature(state);
    if (c.presenting || (!state.done && !state.failed) || c.painted === sig) return null;
    c.painted = sig;
    return { id, generation: c.generation, signature: sig, state };
  }
  release(id: string, painted: ImageState): ImageRefresh | null {
    const c = this.current;
    if (!c || c.id !== id) return null;
    c.presenting = false;
    c.painted = signature(painted);
    return this.observe(id, c.state);
  }
  valid(update: ImageRefresh) {
    const c = this.current;
    return !!c && c.id === update.id && c.generation === update.generation && signature(c.state) === update.signature;
  }
}
