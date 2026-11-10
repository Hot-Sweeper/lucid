import type { World } from "./world";
import { personaMarkdown } from "../robot/persona";
import { getLocale } from "../localization";
import { loadDaily } from "./daily";

// Once a day (and on Regenerate, for example after a language change) every worker's
// persona goes to a headless writer (electron/headless-writer.cjs), which writes the flavor text
// in the current language. Work runs in the main process; this only decides when.

export type DailyLinesState = { date?: string; language?: string; error?: string; at?: number };

export class DailyWriter {
  private flight: Promise<void> | null = null;
  private timer = 0;
  onChange: () => void = () => {};
  constructor(private world: World, private get: () => DailyLinesState, private set: (s: DailyLinesState) => void) {
    window.setTimeout(() => void this.run(false), 120_000);
    this.timer = window.setInterval(() => { if (!document.hidden) void this.run(false); }, 60 * 60 * 1000);
    window.addEventListener("pagehide", () => window.clearInterval(this.timer), { once: true });
  }
  get busy() { return !!this.flight; }
  /** Today's lines in the current language exist (or are being written). */
  get current() { const s = this.get(); return s.date === today() && s.language === getLocale(); }
  regenerate() { return this.run(true); }
  private run(force: boolean): Promise<void> {
    if (this.flight) return this.flight;
    if (!force && this.current) return Promise.resolve();
    const api = (window as any).lucid;
    if (!api?.writerDaily || this.world.lastData?.environmentId) return Promise.resolve();
    const robots = this.world.roster.robots.filter((r) => !r.retired);
    if (!robots.length) return Promise.resolve();
    const language = getLocale(), date = today();
    const topics = (this.world.lastData?.threads ?? []).filter((t) => t.title && Date.now() - Date.parse(t.updatedAt) < 36 * 3600 * 1000).slice(0, 10).map((t) => t.title);
    this.flight = (async () => {
      this.onChange();
      try {
        await api.writerDaily({ personas: robots.map((r) => ({ id: r.id, name: r.name, markdown: personaMarkdown(r) })), language, date, topics });
        this.set({ date, language, at: Date.now() });
        await loadDaily();
      } catch (error: any) {
        // Keep the previous lines; record the reason and retry next hour.
        this.set({ ...this.get(), error: String(error?.message || error), at: Date.now() });
      } finally { this.flight = null; this.onChange(); }
    })();
    return this.flight;
  }
}
const today = () => new Date().toLocaleDateString("en-CA");
