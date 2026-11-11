// The agent's real browser (an agent-workspace Firefox or Chromium) as its own window on the
// robot's desktop. The capture already shows that browser's real tabs and address bar, so the
// window has no second title bar, and its shape is the captured window's real shape.
import type { WM } from "./wm";
import { ICONS } from "./icons";
import { FrontendView } from "./frontend";
import type { BrowserObservation } from "./workspace-browser";

const APP = "livebrowser" as const;
const ICON_OF: Record<string, string> = { Firefox: "firefox", Chromium: "chrome", "Google Chrome": "chrome" };

export class LiveBrowserApp {
  private view: FrontendView | null = null;
  private key = "";
  constructor(private wm: WM) {}

  async follow(o: BrowserObservation) {
    const key = JSON.stringify(o.workspace);
    if (o.browser) this.wm.brandApp(APP, { title: o.browser, icon: ICONS[ICON_OF[o.browser] ?? APP] });
    const open = this.wm.wins.get(APP);
    if (open && this.view && open.body.contains(this.view.root)) {
      if (key !== this.key) { this.key = key; this.view.update({ workspace: o.workspace }); }
      await this.wm.open(APP, o.title);
      return;
    }
    // A new view fetches its first capture before the window opens, so the window opens in
    // the captured window's shape instead of jumping to it a second later.
    this.view?.stop();
    const view = this.view = new FrontendView({ workspace: o.workspace }, () => this.wm.isOpen(APP),
      (title) => this.wm.retitle(APP, title), (size) => this.wm.fitContent(APP, size));
    this.key = key;
    await view.prefetch();
    if (this.view !== view) return;
    const w = await this.wm.open(APP, o.title);
    if (this.view !== view) return;
    w.body.replaceChildren(view.root);
  }

  reset() { this.view?.stop(); this.view = null; this.key = ""; }
}
