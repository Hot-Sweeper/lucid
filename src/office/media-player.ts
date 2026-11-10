import { getLocale, onLocaleChange } from '../localization';
import './media-player.css';
import { icon } from '../ui/icons';

const text = (en: string, de: string) => getLocale() === 'de' ? de : en;
const icons = {
  play: icon('play', 18),
  pause: icon('pause', 18),
  volume: icon('volume', 18),
  muted: icon('muted', 18),
  full: icon('fullscreen', 18),
  shrink: icon('fullscreenExit', 18),
};
export function mediaTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const n = Math.floor(seconds), h = Math.floor(n / 3600), m = Math.floor(n / 60) % 60;
  return `${h ? `${h}:` : ''}${h ? String(m).padStart(2, '0') : m}:${String(n % 60).padStart(2, '0')}`;
}

const mounted = new WeakMap<HTMLMediaElement, OfficeMediaPlayer>();
const playing = new Set<OfficeMediaPlayer>();

/** Native decoding and media events, with the app's own accessible controls. */
export class OfficeMediaPlayer {
  readonly el = document.createElement('div');
  private abort = new AbortController();
  private stopLocale: () => void;
  private play: HTMLButtonElement;
  private mute: HTMLButtonElement;
  private full: HTMLButtonElement;
  private retry: HTMLButtonElement;
  private seek: HTMLInputElement;
  private volume: HTMLInputElement;
  private speed: HTMLSelectElement;
  private time: HTMLElement;
  private status: HTMLElement;
  private waiting = false;
  private failed = false;
  private disposed = false;
  private min = 0;
  private max = 0;
  private video: boolean;
  constructor(readonly media: HTMLMediaElement) {
    this.video = media instanceof HTMLVideoElement;
    const name = media.getAttribute('aria-label') || media.getAttribute('title') || this.filename();
    this.el.className = `lucid-player lp-${this.video ? 'video' : 'audio'}`;
    this.el.setAttribute('role', 'group'); this.el.setAttribute('aria-label', name); this.el.tabIndex = 0;
    this.el.innerHTML = '<div class="lp-stage"></div><div class="lp-controls"><div class="lp-heading"><span class="lp-name"></span><span class="lp-status" role="status"></span><button class="lp-retry" type="button" hidden></button></div><input class="lp-seek" type="range" min="0" max="0" step="0.1" value="0" disabled><div class="lp-toolbar"><button class="lp-play" type="button"></button><span class="lp-time"></span><div class="lp-volume"><button class="lp-mute" type="button"></button><input class="lp-volume-slider" type="range" min="0" max="1" step="0.05"></div><select class="lp-speed"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><button class="lp-full" type="button"></button></div></div>';
    for (const button of this.el.querySelectorAll('button')) button.type = 'button';
    this.el.querySelector('.lp-name')!.textContent = name;
    this.el.querySelector<HTMLElement>('.lp-name')!.title = name;
    const q = <T extends Element>(s: string) => this.el.querySelector<T>(s)!;
    this.play = q('.lp-play'); this.mute = q('.lp-mute'); this.full = q('.lp-full'); this.retry = q('.lp-retry');
    this.seek = q('.lp-seek'); this.volume = q('.lp-volume-slider'); this.speed = q('.lp-speed');
    this.time = q('.lp-time'); this.status = q('.lp-status');
    media.before(this.el); q('.lp-stage').append(media);
    media.controls = false; media.autoplay = false; media.removeAttribute('autoplay'); media.preload = 'metadata';
    if (this.video) { (media as HTMLVideoElement).playsInline = true; }
    else q<HTMLElement>('.lp-stage').hidden = true;
    this.full.hidden = !this.video || !document.fullscreenEnabled;
    const listen = (target: EventTarget, name: string, fn: EventListener) => target.addEventListener(name, fn, { signal: this.abort.signal });
    listen(this.play, 'click', () => { void this.toggle(); });
    if (this.video) listen(media, 'click', () => { void this.toggle(); });
    listen(this.mute, 'click', () => { media.muted = !media.muted; if (!media.muted && media.volume === 0) media.volume = .5; });
    listen(this.volume, 'input', () => { media.volume = Number(this.volume.value); media.muted = media.volume === 0; });
    listen(this.seek, 'input', () => this.jump(Number(this.seek.value)));
    listen(this.speed, 'change', () => { media.playbackRate = Number(this.speed.value); });
    listen(this.full, 'click', () => { void this.fullscreen(); });
    listen(this.retry, 'click', () => { this.failed = false; this.waiting = false; media.load(); this.sync(); });
    listen(document, 'fullscreenchange', () => this.sync());
    listen(this.el, 'keydown', e => this.key(e as KeyboardEvent));
    for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'progress', 'pause', 'ended', 'ratechange', 'volumechange', 'seeked', 'canplay', 'emptied']) {
      listen(media, event, () => { if (['pause', 'ended', 'seeked', 'canplay', 'emptied'].includes(event)) this.waiting = false; if (media.paused) playing.delete(this); this.sync(); });
    }
    listen(media, 'waiting', () => { this.waiting = !media.paused; this.sync(); });
    listen(media, 'playing', () => { this.waiting = false; this.failed = false; this.sync(); });
    listen(media, 'play', () => {
      for (const other of playing) if (other !== this) other.media.pause();
      playing.add(this); this.sync();
    });
    listen(media, 'error', () => { this.failed = true; this.waiting = false; this.sync(); });
    this.stopLocale = onLocaleChange(() => this.sync());
    this.failed = !!media.error;
    this.sync(); mounted.set(media, this);
  }
  private filename() {
    try { return decodeURIComponent(new URL(this.media.currentSrc || this.media.src).pathname).split(/[\\/]/).pop() || text('Media', 'Medium'); }
    catch { return text('Media', 'Medium'); }
  }
  private async toggle() {
    if (!this.media.paused) { this.media.pause(); return; }
    this.failed = false;
    try { await this.media.play(); }
    catch (e) { if (!this.disposed && (e as Error).name !== 'AbortError') { this.failed = true; this.sync(); } }
  }
  private jump(to: number) {
    if (this.max <= this.min) return;
    try { this.media.currentTime = Math.max(this.min, Math.min(this.max, to)); this.sync(); } catch { /* A remote stream may lose its seekable range during reconnect. */ }
  }
  private async fullscreen() {
    try { if (document.fullscreenElement === this.el) await document.exitFullscreen(); else await this.el.requestFullscreen(); }
    catch { this.status.textContent = text('Fullscreen is unavailable here.', 'Vollbild ist hier nicht verfügbar.'); }
  }
  private key(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey || (e.target as Element).closest('button,input,select,a')) return;
    let handled = true;
    switch (e.key.toLowerCase()) {
      case ' ': case 'k': void this.toggle(); break;
      case 'arrowleft': this.jump(this.media.currentTime - (e.shiftKey ? 10 : 5)); break;
      case 'arrowright': this.jump(this.media.currentTime + (e.shiftKey ? 10 : 5)); break;
      case 'home': this.jump(this.min); break;
      case 'end': this.jump(this.max); break;
      case 'm': this.mute.click(); break;
      case 'f': if (this.video && !this.full.hidden) void this.fullscreen(); else handled = false; break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }
  private name(button: HTMLElement, label: string) { button.setAttribute('aria-label', label); button.title = label; }
  private sync() {
    if (this.disposed) return;
    const m = this.media, paused = m.paused || m.ended, silent = m.muted || m.volume === 0;
    this.play.innerHTML = paused ? icons.play : icons.pause;
    this.name(this.play, paused ? text('Play', 'Abspielen') : text('Pause', 'Pausieren'));
    this.mute.innerHTML = silent ? icons.muted : icons.volume;
    this.name(this.mute, silent ? text('Unmute', 'Ton einschalten') : text('Mute', 'Stummschalten'));
    this.mute.setAttribute('aria-pressed', String(silent));
    const full = document.fullscreenElement === this.el;
    this.full.innerHTML = full ? icons.shrink : icons.full;
    this.name(this.full, full ? text('Exit fullscreen', 'Vollbild verlassen') : text('Fullscreen', 'Vollbild'));
    this.name(this.seek, text('Seek', 'Wiedergabeposition'));
    this.name(this.volume, text('Volume', 'Lautstärke'));
    this.name(this.speed, text('Playback speed', 'Wiedergabegeschwindigkeit'));
    this.el.title = text('Space: play/pause · Arrow keys: seek · M: mute', 'Leertaste: Abspielen/Pause · Pfeiltasten: Spulen · M: Stumm');
    this.min = 0; this.max = Number.isFinite(m.duration) ? m.duration : 0;
    if (!this.max && m.seekable.length) { this.min = m.seekable.start(0); this.max = m.seekable.end(m.seekable.length - 1); }
    this.seek.disabled = this.max <= this.min;
    this.seek.min = String(this.min); this.seek.max = String(this.max);
    this.seek.value = String(Math.max(this.min, Math.min(this.max, m.currentTime || 0)));
    this.seek.setAttribute('aria-valuetext', `${mediaTime(m.currentTime)} / ${mediaTime(m.duration)}`);
    const percent = this.max > this.min ? Math.max(0, Math.min(100, (m.currentTime - this.min) / (this.max - this.min) * 100)) : 0;
    this.seek.style.setProperty('--lp-value', `${percent}%`);
    this.volume.value = String(silent ? 0 : m.volume); this.volume.style.setProperty('--lp-value', `${silent ? 0 : m.volume * 100}%`);
    this.volume.setAttribute('aria-valuetext', `${Math.round((silent ? 0 : m.volume) * 100)}%`);
    this.speed.value = String(m.playbackRate);
    this.time.textContent = `${mediaTime(m.currentTime)} / ${mediaTime(m.duration)}`;
    this.status.textContent = this.failed ? text('Could not play this file.', 'Diese Datei konnte nicht abgespielt werden.') : this.waiting ? text('Buffering…', 'Wird geladen…') : '';
    this.retry.hidden = !this.failed; this.retry.textContent = text('Retry', 'Erneut versuchen');
    this.el.dataset.playing = String(!paused); this.el.dataset.failed = String(this.failed);
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort(); this.stopLocale(); playing.delete(this); mounted.delete(this.media);
    this.media.pause(); this.media.removeAttribute('src'); this.media.load();
  }
}

/** Watch only this media surface. Reparenting chat turns preserves playback and listeners. */
export function watchMedia(root: HTMLElement) {
  const players = new Set<OfficeMediaPlayer>();
  const add = (node: Node) => {
    if (!(node instanceof Element)) return;
    const media = [...node.querySelectorAll<HTMLMediaElement>('audio,video')];
    if (node instanceof HTMLMediaElement) media.unshift(node);
    for (const item of media) {
      if (mounted.has(item) || !root.contains(item) || item.closest('.lucid-player')) continue;
      const player = new OfficeMediaPlayer(item); players.add(player);
    }
  };
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) add(node);
    if (records.some(record => record.removedNodes.length)) for (const player of players) {
      if (root.contains(player.el)) continue;
      player.destroy(); players.delete(player);
    }
  });
  observer.observe(root, { childList: true, subtree: true }); add(root);
  return () => { observer.disconnect(); for (const player of players) player.destroy(); players.clear(); };
}
