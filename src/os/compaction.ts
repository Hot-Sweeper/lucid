import type { Item, ThreadInfo } from '../director';
import type { WM } from './wm';
import { getLocale, onLocaleChange } from '../localization';
import { gameSound } from '../office/sound';
import './compaction.css';

const ACTIVE_RUN = new Set(['running', 'starting', 'preparing', 'waiting', 'awaiting_input']);
const ENDED_RUN = new Set(['completed', 'failed', 'interrupted', 'cancelled', 'stopped']);
const ENDED_ITEM = new Set(['completed', 'failed', 'interrupted', 'cancelled']);
type Signal = Pick<Item, 'id' | 'runId' | 'ordinal' | 'status' | 'updatedAt'>;
const activeItem = (status: string) => status === 'running';

/** One current turn, one compaction. Late snapshots cannot reopen a finished operation. */
export class CompactionState {
  private key = '';
  private latest: Signal | null = null;
  private ended = false;
  observe(items: Iterable<Item>, info: ThreadInfo | null): Signal | null {
    const key = JSON.stringify([info?.id || '', info?.run?.id || '']);
    if (key !== this.key) { this.clear(); this.key = key; }
    if (!info?.run) return null;
    if (ENDED_RUN.has(info.run.status)) this.ended = true;
    for (const item of items) {
      if (item.type !== 'compaction' || item.runId !== info.run.id || item.data?.parentItemId) continue;
      if (this.latest && item.ordinal < this.latest.ordinal) continue;
      if (this.latest?.id === item.id) {
        if (ENDED_ITEM.has(this.latest.status) && activeItem(item.status)) continue;
        if (Date.parse(item.updatedAt) < Date.parse(this.latest.updatedAt)) continue;
      }
      this.latest = {id:item.id,runId:item.runId,ordinal:item.ordinal,status:item.status,updatedAt:item.updatedAt};
    }
    return !this.ended && ACTIVE_RUN.has(info.run.status) && this.latest && activeItem(this.latest.status) ? this.latest : null;
  }
  clear() { this.key = ''; this.latest = null; this.ended = false; }
}

/** An OS update screen driven by real compaction events, independent of scene playback. */
export class CompactionScreen {
  private state = new CompactionState();
  private panel: HTMLElement | null = null;
  private visible = true;
  private stopLocale: (() => void) | null = null;
  get isUp() { return !!this.panel; }
  constructor(private wm: WM) {}

  sync(items: Iterable<Item>, info: ThreadInfo | null, quiet = false) {
    const current = this.state.observe(items, info);
    if (!current) { this.hide(quiet); return; }
    if (this.panel) return;
    const panel = document.createElement('section');
    panel.className = 'win focused compaction-screen';
    panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-atomic', 'true');
    panel.innerHTML = '<div class="win-body cc-content"><div class="cc-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><h2></h2><p></p></div><footer></footer>';
    for (const type of ['pointerdown', 'click', 'dblclick', 'wheel']) panel.addEventListener(type, event => event.stopPropagation());
    this.panel = panel; this.paint(); this.wm.root.append(panel);
    this.wm.setOverlayCovered(true, 'compaction');
    this.stopLocale = onLocaleChange(() => this.paint());
    document.addEventListener('visibilitychange', this.visibility);
    this.visibility();
    if (!quiet && this.visible && !document.hidden) gameSound.at('switch', this.wm.root, .35);
  }
  setVisible(visible: boolean) { this.visible = visible; this.visibility(); }
  private visibility = () => { if (this.panel) this.panel.dataset.paused = String(!this.visible || document.hidden); };
  private paint() {
    if (!this.panel) return;
    const de = getLocale() === 'de';
    this.panel.querySelector('h2')!.textContent = de ? 'Kontext wird komprimiert' : 'Compacting context';
    this.panel.querySelector('p')!.textContent = de ? 'Dein Roboter schafft Platz zum Weiterarbeiten.' : 'Your robot is making room to keep working.';
    this.panel.querySelector('footer')!.textContent = de ? 'Bitte den Roboter nicht ausschalten.' : 'Please don’t turn off your robot.';
  }
  private hide(quiet = false) {
    if (!this.panel) return;
    this.panel.remove(); this.panel = null;
    this.wm.setOverlayCovered(false, 'compaction');
    this.stopLocale?.(); this.stopLocale = null;
    document.removeEventListener('visibilitychange', this.visibility);
    if (!quiet && this.visible && !document.hidden) gameSound.at('switch', this.wm.root, .25);
  }
  clear() { this.state.clear(); this.hide(true); }
}
