import { renderFps, renderPixelRatio } from '../perf/render';
import { setDetailScene, clearDetailScene, type DetailScene } from '../perf/detail-scene';
import './frontend.css';
import { BRAND } from '../brand';
import type { WorkspaceBrowserTarget } from './workspace-browser';

export type FrontendTarget = { workspace?: WorkspaceBrowserTarget; url?: string; html?: string; file?: string; root?: string };
export type FrontendAction = { selector?: string; role?: string; name?: string; x?: number; y?: number; viewportWidth?: number; viewportHeight?: number };
type Frame = DetailScene & { ok: boolean; unchanged?: boolean; missing?: boolean; error?: string; image?: string; title?: string; pointer?: { x: number; y: number }; target?: { x: number; y: number; w: number; h: number } };
type Api = { frontendFrame(req: object): Promise<Frame> };

/** One serial polling loop per tab. LOD changes only presentation, not its source. */
export class FrontendView {
  readonly root = document.createElement('div');
  private image = document.createElement('img');
  private status = document.createElement('div');
  private marker = document.createElement('div');
  private pointer = document.createElement('div');
  private id = crypto.randomUUID();
  private timer = 0;
  private dead = false;
  private bound = false;
  private opened = false;
  private action?: FrontendAction;
  private actionUntil = 0;
  private signature = '';
  private revision = 0;
  private paused = false;
  private viewportHeight = 540;
  private resize: ResizeObserver;
  private target: FrontendTarget;
  private api: Api | undefined = (window as any).lucid;
  constructor(target: FrontendTarget, private active: () => boolean, private title: (title: string) => void) {
    this.target = target;
    this.root.className = 'frontend-view';
    this.root.classList.toggle('workspace-browser-view', !!target.workspace);
    if (target.workspace) this.image.alt = 'The agent’s actual browser window';
    this.image.className = 'frontend-frame'; if (!target.workspace) this.image.alt = ''; this.image.draggable = false;
    this.status.className = 'frontend-status'; this.status.textContent = 'Opening the frontend…';
    this.marker.className = 'frontend-target'; this.pointer.className = 'frontend-pointer';
    this.marker.hidden = this.pointer.hidden = true;
    this.root.append(this.image, this.status, this.marker, this.pointer);
    this.resize = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) this.viewportHeight = Math.round(960 * entry.contentRect.height / entry.contentRect.width);
    });
    this.resize.observe(this.root);
    this.timer = window.setTimeout(() => void this.poll(), 0);
  }
  update(target: FrontendTarget) { this.root.classList.toggle('workspace-browser-view', !!target.workspace); this.target = target; this.opened = false; this.revision++; }
  point(action: FrontendAction) { this.action = action; this.actionUntil = performance.now() + 2200; }
  stop() {
    if (this.dead) return;
    this.dead = true; clearTimeout(this.timer); this.resize.disconnect(); clearDetailScene(this.root);
    void this.api?.frontendFrame({ id: this.id, close: true }).catch(() => {});
    this.image.removeAttribute('src');
  }
  private async poll() {
    if (this.dead) return;
    if (this.root.isConnected) this.bound = true;
    else if (this.bound) { this.stop(); return; }
    const host = this.root.closest<HTMLElement>('.screen, .phone-screen');
    const mode = host?.dataset.screenDetail || 'full';
    let delay = this.target.workspace ? 1000 : mode === 'full' ? 125 : mode === 'lines' ? 750 : 1500;
    try {
      if (!this.root.isConnected || !this.active() || !renderFps(this.root) || mode === 'icon') {
        if (this.opened && !this.paused) { this.paused = true; await this.api?.frontendFrame({ id: this.id, mode: 'paused' }); }
        delay = 500; return;
      }
      this.paused = false;
      if (!this.api?.frontendFrame) { this.status.textContent = `Update ${BRAND.name} to view live frontends.`; return; }
      const revision = this.revision;
      const frame = await this.api.frontendFrame({ id: this.id, target: this.opened ? undefined : this.target, mode,
        density: Math.min(2, Math.max(1, renderPixelRatio(this.root))), height: this.viewportHeight,
        action: performance.now() < this.actionUntil ? this.action : undefined });
      if (this.dead) { void this.api.frontendFrame({ id: this.id, close: true }).catch(() => {}); return; }
      if (revision !== this.revision) return;
      if (!frame.ok) { if (frame.missing) this.opened = false; this.status.hidden = false; this.status.textContent = frame.error || 'Waiting for the frontend…'; delay = 2000; return; }
      this.opened = true;
      this.status.hidden = true;
      if (frame.unchanged) return;
      if (frame.title) this.title(frame.title);
      const scene: DetailScene = { width: frame.width, height: frame.height, background: frame.background, shapes: frame.shapes };
      const signature = JSON.stringify(scene);
      if (signature !== this.signature) { setDetailScene(this.root, scene); this.signature = signature; }
      if (frame.image) { this.image.src = frame.image; this.image.hidden = false; }
      this.status.hidden = true;
      this.marker.hidden = !frame.target; this.pointer.hidden = !frame.pointer;
      if (frame.target) {
        const r = frame.target; this.marker.style.cssText = `left:${r.x / frame.width * 100}%;top:${r.y / frame.height * 100}%;width:${r.w / frame.width * 100}%;height:${r.h / frame.height * 100}%`;
      }
      if (frame.pointer) this.pointer.style.cssText = `left:${frame.pointer.x / frame.width * 100}%;top:${frame.pointer.y / frame.height * 100}%`;
    } catch { if (!this.dead) { this.status.hidden = false; this.status.textContent = 'Waiting for the frontend connection…'; delay = 2000; } }
    finally { if (!this.dead) this.timer = window.setTimeout(() => void this.poll(), delay); }
  }
}

export function localFrontendUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const u = new URL(value); return /^https?:$/.test(u.protocol) && ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(u.hostname) && !u.username && !u.password ? u.href : null; } catch { return null; }
}

/** Only an actual server URL in tool output starts a mirror. Never scan ports. */
export function frontendUrlFromOutput(output: string) {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
  // Only server readiness announcements count. Commands, curl errors and API
  // endpoints in ordinary tool results are not frontend launches.
  const announced = clean.split(/\r?\n/).filter(line => /(?:\bLocal\s*:|\b(?:ready|running|listening|available|started|serving)\b)/i.test(line) && !/\b(?:error|failed|refused|curl|fetch)\b/i.test(line)).join('\n');
  const candidates = announced.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d{2,5}(?:\/[^\s<>"']*)?/gi) || [];
  for (const candidate of candidates) { const url = localFrontendUrl(candidate.replace(/[),.;]+$/, '')); if (url) return url; }
  return null;
}
