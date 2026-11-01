export type GestureKind = 'pan' | 'pinch';
type Scene = { dom: number; svg: number; canvases: number; canvasPixels: number; desks: number; walkers: number; scale: number };
type Snapshot = { viewport: { width: number; height: number; dpr: number }; scene: Scene; renderer: { name: string; visibleTiles?: number; missingTiles?: number; cachePixels?: number; paints?: number; staticTiles?: number; staticMissingTiles?: number } };
type Report = Snapshot & { version: 1; gesture: { kind: GestureKind; durationMs: number; moves: number; commits: number; frameCount: number; meanMs: number; p95Ms: number; maxMs: number; applyMeanMs: number; applyMaxMs: number } };

/** Bounded, aggregate-only samples of actual phone gestures. No idle sampling. */
export class PhoneGestureDiagnostics {
  private frames = new Float64Array(1200);
  private frameCount = 0;
  private sampleCount = 0;
  private totalMs = 0;
  private maxMs = 0;
  private moves = 0;
  private commits = 0;
  private applyMs = 0;
  private applyMaxMs = 0;
  private began = 0;
  private previous = 0;
  private kind: GestureKind = 'pan';
  private raf = 0;
  private limit = 0;
  private flushTimer = 0;
  private lastSent = -Infinity;
  private pending: Report['gesture'] | null = null;
  private inFlight = false;
  private disposed = false;
  private recording = false;
  private held = false;
  constructor(private snapshot: () => Snapshot, private send: (report: Report) => Promise<unknown>) {}
  get active() { return this.recording; }
  start(kind: GestureKind) {
    if (this.disposed) return;
    if (this.held) { if (kind === 'pinch') this.kind = kind; return; }
    this.held = this.recording = true;
    this.kind = kind; this.frameCount = this.sampleCount = this.totalMs = this.maxMs = this.moves = this.commits = this.applyMs = this.applyMaxMs = 0;
    this.began = this.previous = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.limit = window.setTimeout(() => this.stopSampling(), 10000);
  }
  input(kind: GestureKind) { if (this.recording) { this.moves++; if (kind === 'pinch') this.kind = kind; } }
  commit(start: number) {
    if (!this.recording || start < 0) return;
    const ms = Math.min(10000, Math.max(0, performance.now() - start));
    this.commits++; this.applyMs += ms; this.applyMaxMs = Math.max(this.applyMaxMs, ms);
  }
  private frame = (now: number) => {
    this.raf = 0;
    if (!this.recording) return;
    const ms = Math.min(10000, Math.max(0, now - this.previous)); this.previous = now;
    this.frames[this.frameCount % this.frames.length] = ms;
    this.frameCount++; this.sampleCount = Math.min(this.frameCount, this.frames.length);
    this.totalMs += ms; this.maxMs = Math.max(this.maxMs, ms);
    this.raf = requestAnimationFrame(this.frame);
  };
  private stopSampling() {
    if (!this.recording) return;
    this.recording = false; cancelAnimationFrame(this.raf); this.raf = 0;
    clearTimeout(this.limit); this.limit = 0;
    const sorted = Array.from(this.frames.subarray(0, this.sampleCount)).sort((a, b) => a - b);
    this.pending = { kind: this.kind, durationMs: Math.min(10000, Math.max(0, performance.now() - this.began)), moves: this.moves,
      commits: this.commits, frameCount: this.frameCount, meanMs: this.frameCount ? this.totalMs / this.frameCount : 0,
      p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] || 0, maxMs: this.maxMs,
      applyMeanMs: this.commits ? this.applyMs / this.commits : 0, applyMaxMs: this.applyMaxMs };
  }
  end() {
    this.held = false; this.stopSampling();
    this.scheduleFlush();
  }
  private scheduleFlush() {
    if (this.disposed || this.held || !this.pending || this.flushTimer || this.inFlight) return;
    this.flushTimer = window.setTimeout(this.flush, Math.max(50, this.lastSent + 2500 - performance.now()));
  }
  private flush = () => {
    this.flushTimer = 0;
    if (this.disposed || this.held || document.hidden || !this.pending || this.inFlight) return;
    const gesture = this.pending; this.pending = null;
    if (!gesture.moves || !gesture.commits) return;
    // Geometry/DOM counts are read after release, never in the input or draw path.
    let report: Report;
    try { report = { version: 1, gesture, ...this.snapshot() }; } catch { return; }
    this.lastSent = performance.now(); this.inFlight = true;
    void this.send(report).catch(() => {}).finally(() => { this.inFlight = false; this.scheduleFlush(); });
  };
  destroy() {
    this.disposed = true; this.held = false; this.recording = false; this.pending = null;
    cancelAnimationFrame(this.raf); clearTimeout(this.limit); clearTimeout(this.flushTimer);
    this.raf = this.limit = this.flushTimer = 0;
  }
}

export function phoneGestureDiagnostics(scene: HTMLElement, scale: () => number) {
  const send = (window as any).lucidReportPerformance;
  if ((window as any).lucidRemote !== true || typeof send !== 'function') return null;
  return new PhoneGestureDiagnostics(() => {
    const canvases = [...scene.querySelectorAll('canvas')];
    const plane = scene.querySelector<HTMLElement>('.outside-viewport'), presentation = plane?.dataset.presentation;
    const tileMetrics = Object.fromEntries(['visibleTiles', 'missingTiles', 'cachePixels', 'paints'].flatMap(key => {
      const value = Number(plane?.dataset[key]); return Number.isSafeInteger(value) && value >= 0 ? [[key, value]] : [];
    }));
    let staticTiles = 0, staticMissingTiles = 0;
    for (const el of scene.querySelectorAll<HTMLElement>('[data-static-art][data-tiles]')) {
      const match = el.dataset.tiles?.match(/^(\d+)\/(\d+)$/);
      if (match) { staticTiles += Number(match[2]); staticMissingTiles += Math.max(0, Number(match[2]) - Number(match[1])); }
    }
    return { viewport: { width: scene.clientWidth, height: scene.clientHeight, dpr: devicePixelRatio || 1 },
      scene: { dom: scene.querySelectorAll('*').length, svg: scene.querySelectorAll('svg *').length,
        canvases: canvases.length, canvasPixels: canvases.reduce((n, c) => n + c.width * c.height, 0),
        desks: scene.querySelectorAll('.desk-unit').length, walkers: scene.querySelectorAll('.world-walker').length, scale: scale() },
      renderer: { name: ['vectors', 'detail', 'overview', 'vector-canvas', 'tiles', 'mixed'].includes(presentation || '') ? presentation! : 'unknown', ...tileMetrics, staticTiles, staticMissingTiles } };
  }, send);
}
