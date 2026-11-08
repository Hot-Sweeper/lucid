// Original local sound design. All sources share one gesture-unlocked audio graph.
import { SOUNDTRACK } from './soundtrack';
import { SoundtrackQueue, type SoundtrackSong, type SoundtrackMode } from './soundtrack-queue';
import ambienceUrl from '../assets/audio/room-air.mp3';

export type MusicState = {
  song: SoundtrackSong | null; mode: SoundtrackMode;
  chapter: SoundtrackQueue['chapter']; chapterProgress: number; paused: boolean;
  status: 'playing' | 'loading' | 'error' | 'paused' | 'muted' | 'hidden' | 'locked';
};
type BackgroundKind = 'theme' | 'ambience';
type BackgroundTrack = { media: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode; pending: boolean; fading: boolean; release: () => void };
export type GameCue = 'collect' | 'clink' | 'ready' | 'purchase' | 'poke' | 'coffee' | 'phone' | 'open' | 'level'
  | 'rustle' | 'splash' | 'switch' | 'projector' | 'boop' | 'chirp' | 'quack'
  | 'keyboard' | 'mouse' | 'paper' | 'servo' | 'step' | 'chatter' | 'controller' | 'ping' | 'snore' | 'water' | 'clip';
export type SoundMix = { gain: number; pan: number; lowpass?: number };
type Note = [frequency: number, delay: number, duration: number, gain: number, wave?: OscillatorType, endFrequency?: number];
type EmitterBus = { gain: GainNode; pan: StereoPannerNode; filter: BiquadFilterNode; trim: number; cutoff: number; mode: 'normal' | 'headphones' | 'phone' };
// Zero frequency means a shaped noise transient, never a continuous noise loop.
const SCORES: Record<GameCue, Note[]> = {
  clink: [[2093, 0, .045, .1], [3135.96, .016, .06, .05]],
  collect: [[1046.5, 0, .16, .32], [1318.5, .055, .18, .28], [1568, .11, .22, .24], [2093, .18, .28, .17], [523.25, 0, .2, .15]],
  ready: [[659.25, 0, .18, .15], [987.77, .12, .28, .12]],
  purchase: [[783.99, 0, .09, .2], [659.25, .07, .1, .18], [1046.5, .15, .22, .22]],
  poke: [[392, 0, .075, .22, 'sine', 510], [587.33, .035, .1, .15]],
  coffee: [[0, 0, .13, .07], [880, .045, .14, .12], [1320, .08, .12, .035]],
  phone: [[739.99, 0, .065, .1], [987.77, .08, .065, .1]],
  open: [[330, 0, .045, .1], [660, .025, .06, .07]],
  level: [[523.25, 0, .16, .18], [659.25, .1, .16, .18], [783.99, .2, .16, .18], [1046.5, .32, .4, .22]],
  rustle: [[0, 0, .16, .18], [0, .10, .12, .11], [0, .20, .16, .065]],
  splash: [[0, 0, .11, .2], [510, .025, .16, .07, 'sine', 170], [0, .09, .24, .12]],
  switch: [[0, 0, .018, .12], [270, .008, .035, .1]],
  projector: [[120, 0, .2, .085, 'triangle', 240], [0, .02, .24, .045]],
  boop: [[520, 0, .12, .17, 'sine', 820], [1040, .045, .14, .06]],
  chirp: [[2100, 0, .1, .1, 'sine', 3400], [2600, .12, .12, .085, 'sine', 3900]],
  quack: [[460, 0, .1, .07, 'triangle', 270], [410, .11, .13, .06, 'triangle', 240]],
  keyboard: [[0, 0, .022, .16], [176, 0, .035, .065, 'triangle'], [0, .047, .016, .06]],
  mouse: [[0, 0, .012, .11], [0, .027, .01, .065], [740, 0, .015, .025]],
  paper: [[0, 0, .11, .09], [0, .075, .14, .06]],
  servo: [[210, 0, .11, .04, 'triangle', 270]],
  step: [[0, 0, .023, .07], [110, 0, .038, .045]],
  chatter: [[410, 0, .055, .038, 'triangle', 540], [610, .075, .05, .04, 'triangle', 460], [480, .145, .055, .03]],
  controller: [[0, 0, .014, .07], [0, .052, .014, .045]],
  ping: [[790, 0, .035, .11], [0, 0, .018, .045]],
  snore: [[126, 0, .28, .045, 'triangle', 86], [0, .04, .2, .025]],
  water: [[0, 0, .29, .07], [680, .06, .14, .018, 'sine', 380]],
  clip: [[392, 0, .09, .07, 'triangle'], [587.33, .1, .075, .065, 'triangle'], [783.99, .21, .13, .065], [0, .27, .035, .08]],
};
const KEY = 'lucid:sound', MAX_VOICES = 48;
const UI_CUES = new Set<GameCue>(['collect', 'clink', 'purchase', 'level', 'ready', 'open']);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Screen-space emitter relative to the camera's listening position. No DOM reads. */
export function spatialMix(x: number, y: number, scale: number, width: number, height: number): SoundMix {
  if (![x, y, scale, width, height].every(Number.isFinite) || scale <= 0 || width <= 0 || height <= 0) return { gain: 0, pan: 0 };
  const nx = (x - width / 2) / Math.max(240, width / 2), ny = (y - height / 2) / Math.max(180, height / 2);
  if (x < -80 || y < -80 || x > width + 80 || y > height + 80) return { gain: 0, pan: clamp(nx, -.9, .9) };
  const depth = Math.pow(clamp(scale / 1.05, 0, 1), 1.35);
  const gain = depth / (1 + (nx * nx + ny * ny) * 2.4);
  return { gain, pan: clamp(nx * .8, -.9, .9), lowpass: 1900 + 10800 * Math.sqrt(gain) };
}

export class GameSound {
  enabled = true;
  volume = .45;
  themeVolume = .3;
  ambienceVolume = .18;
  private background = new Map<BackgroundKind, BackgroundTrack>();
  private soundtrack = new SoundtrackQueue(SOUNDTRACK);
  private themeSong: SoundtrackSong | null = null;
  private musicPaused = false;
  private musicError = false;
  private musicWaiting = false;
  private musicListeners = new Set<(state: MusicState) => void>();
  private musicSignature = '';
  private musicPosition: number | null = null;
  private musicClock: number | null = null;
  private musicUnsaved = 0;
  private restoredPosition = 0;
  private skipRequested = false;
  private requestedSong: string | null = null;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<AudioScheduledSourceNode>();
  private releases = new Map<AudioScheduledSourceNode, () => void>();
  private ambient = new Set<AudioScheduledSourceNode>();
  private emitterVoices = new Map<string, Set<AudioScheduledSourceNode>>();
  private emitterBuses = new Map<string, Set<EmitterBus>>();
  private last = new Map<string, number>();
  private sourceIds = new WeakMap<Element, number>();
  private sequence = 0;
  private noise: AudioBuffer | null = null;
  private disposed = false;
  private authorized = false;
  private view: { scene: HTMLElement; scale: () => number } | null = null;
  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (typeof saved?.enabled === 'boolean') this.enabled = saved.enabled;
      if (Number.isFinite(saved?.volume)) this.volume = clamp(saved.volume, 0, 1);
      if (Number.isFinite(saved?.themeVolume)) this.themeVolume = clamp(saved.themeVolume, 0, 1);
      if (Number.isFinite(saved?.ambienceVolume)) this.ambienceVolume = clamp(saved.ambienceVolume, 0, 1);
      this.soundtrack = new SoundtrackQueue(SOUNDTRACK, saved?.soundtrack);
      if (typeof saved?.musicPaused === 'boolean') this.musicPaused = saved.musicPaused;
      if (typeof saved?.currentTheme?.id === 'string') {
        this.themeSong = SOUNDTRACK.find(song => song.id === saved.currentTheme.id) ?? null;
        if (this.themeSong && Number.isFinite(saved.currentTheme.position)) {
          this.restoredPosition = clamp(saved.currentTheme.position, 0, Math.max(0, this.themeSong.seconds - 2));
        }
      }
    } catch { /* Storage is optional. */ }
    window.addEventListener('pointerdown', this.gesture, true);
    window.addEventListener('keydown', this.gesture, true);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.destroy);
  }
  get active() { return !this.disposed && this.authorized && this.enabled && this.volume > 0 && !document.hidden && this.context?.state === 'running'; }
  get time() { return this.context?.currentTime ?? 0; }
  get currentTheme() { return this.themeSong; }
  get musicState(): MusicState {
    const track = this.background.get('theme');
    const status: MusicState['status'] = this.disposed || this.musicPaused ? 'paused'
      : !this.enabled || !this.volume || !this.themeVolume ? 'muted'
      : document.hidden ? 'hidden'
      : !this.authorized ? 'locked'
      : this.musicError ? 'error'
      : this.context?.state !== 'running' ? 'locked'
      : track?.pending || this.musicWaiting ? 'loading'
      : track && !track.media.paused ? 'playing' : 'paused';
    return { song: this.themeSong, mode: this.soundtrack.mode, chapter: this.soundtrack.chapter,
      chapterProgress: this.soundtrack.chapterProgress, paused: this.musicPaused, status };
  }
  subscribeMusic(listener: (state: MusicState) => void) {
    if (this.disposed) return () => {};
    this.musicListeners.add(listener);
    try { listener(this.musicState); } catch { /* An observer cannot own playback. */ }
    return () => { this.musicListeners.delete(listener); };
  }
  private notifyMusic() {
    const state = this.musicState;
    // Chapter progress is UI guidance, not a per-frame animation or clock.
    const signature = JSON.stringify([state.song?.id, state.mode, state.chapter.id,
      Math.floor(state.chapterProgress * 100), state.paused, state.status]);
    if (signature === this.musicSignature) return;
    this.musicSignature = signature;
    for (const listener of this.musicListeners) {
      try { listener(state); } catch { /* A stale control cannot interrupt sound. */ }
    }
  }
  configureMusic(mode: SoundtrackMode) {
    if (this.disposed) return;
    const track = this.background.get('theme'); if (track) this.recordMusic(track);
    if (!this.soundtrack.setMode(mode)) return;
    // Finish the current composition. The user's Next action can apply it now.
    this.save(); this.notifyMusic();
  }
  pauseTheme(paused: boolean) {
    if (this.disposed || typeof paused !== 'boolean') return;
    const track = this.background.get('theme');
    if (track) this.recordMusic(track);
    this.musicPaused = paused;
    if (paused) { track?.media.pause(); this.resetMusicClock(); }
    else this.syncBackground();
    this.save(); this.notifyMusic();
  }
  retryTheme() {
    if (this.disposed) return;
    this.musicError = false; this.musicWaiting = false;
    this.syncBackground(); this.notifyMusic();
  }
  nextTheme() {
    if (this.disposed) return;
    this.requestedSong = null;
    const track = this.background.get('theme');
    // Changing src during a pending play can let an old promise own the new song.
    // Collapse repeated Next presses until that one attempt has settled.
    if (track?.pending) { this.skipRequested = true; return; }
    this.skipRequested = false;
    if (track) {
      this.recordMusic(track); track.media.pause();
      track.gain.gain.cancelScheduledValues(this.time);
      track.gain.gain.setValueAtTime(0, this.time);
    }
    this.themeSong = this.soundtrack.next(); this.restoredPosition = 0;
    this.musicError = false; this.musicWaiting = false; this.resetMusicClock();
    if (track) { track.media.src = this.themeSong.url; track.media.currentTime = 0; track.fading = false; }
    this.save(); this.syncBackground(); this.notifyMusic();
  }
  /** Play a catalogue selection through the office's existing music stream. */
  playTheme(id: string): boolean { return this.selectTheme(id, true); }
  private selectTheme(id: string, resume: boolean): boolean {
    if (this.disposed || !SOUNDTRACK.some(song => song.id === id)) return false;
    const track = this.background.get('theme');
    if (resume) this.musicPaused = false;
    this.skipRequested = false;
    if (track?.pending) {
      this.requestedSong = id;
      this.save(); this.notifyMusic(); return true;
    }
    this.requestedSong = null;
    if (this.themeSong?.id === id && track && !track.media.ended) {
      this.musicError = false; this.musicWaiting = false;
      this.syncBackground(); this.save(); this.notifyMusic(); return true;
    }
    if (track) {
      this.recordMusic(track); track.media.pause();
      track.gain.gain.cancelScheduledValues(this.time);
      track.gain.gain.setValueAtTime(0, this.time);
    }
    this.themeSong = this.soundtrack.select(id)!; this.restoredPosition = 0;
    this.musicError = false; this.musicWaiting = false; this.resetMusicClock();
    if (track) { track.media.src = this.themeSong.url; track.media.currentTime = 0; track.fading = false; }
    this.save(); this.syncBackground(); this.notifyMusic(); return true;
  }
  private resetMusicClock() { this.musicPosition = null; this.musicClock = null; }
  private recordMusic(track: BackgroundTrack, ended = false) {
    const media = track.media, position = media.currentTime, clock = this.time;
    const audible = this.active && !this.musicPaused && this.themeVolume > 0
      && (!media.paused || ended) && !media.seeking && !track.pending;
    if (audible && Number.isFinite(position) && this.musicPosition !== null && this.musicClock !== null) {
      const delta = position - this.musicPosition, elapsed = clock - this.musicClock;
      // A seek cannot spend listening time. AudioContext time also stops on suspension.
      if (delta > 0 && elapsed >= 0 && delta <= elapsed + .5) {
        const heard = Math.min(delta, elapsed + .05);
        this.soundtrack.listen(heard); this.musicUnsaved += heard;
        if (this.musicUnsaved >= 15) { this.musicUnsaved = 0; this.save(); }
      }
    }
    this.musicPosition = audible && Number.isFinite(position) ? position : null;
    this.musicClock = audible ? clock : null;
  }
  position(key: string, mix: SoundMix) {
    if (!this.context || !Number.isFinite(mix.gain) || !Number.isFinite(mix.pan)) return;
    for (const bus of this.emitterBuses.get(key) ?? []) {
      bus.gain.gain.setTargetAtTime(clamp(mix.gain * bus.trim, 0, 2), this.time, .08);
      bus.pan.pan.setTargetAtTime(clamp(mix.pan, -1, 1), this.time, .08);
      const cutoff = bus.mode === 'headphones' ? 900 + mix.gain * 850 : bus.mode === 'phone' ? 3200 : bus.cutoff;
      bus.filter.frequency.setTargetAtTime(Math.min(cutoff, mix.lowpass ?? cutoff), this.time, .08);
    }
  }
  silence(key: string) {
    for (const voice of [...(this.emitterVoices.get(key) ?? [])]) { try { voice.stop(); } catch {} this.releases.get(voice)?.(); }
  }
  attachView(scene: HTMLElement, scale: () => number) {
    const view = { scene, scale }; this.view = view;
    return () => { if (this.view === view) this.view = null; };
  }
  private gesture = (event: Event) => {
    if (!event.isTrusted || document.hidden || this.disposed) return;
    this.authorized = true;
    if (this.enabled && this.volume) this.unlock();
  };
  private unlock() {
    if (!this.authorized || this.disposed) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume * .32;
        this.master.connect(this.context.destination);
        this.context.addEventListener('statechange', this.audioState);
      }
      if (this.context.state === 'suspended') this.resumeContext();
      this.syncBackground(); this.notifyMusic();
    } catch { this.musicError = true; this.notifyMusic(); /* A missing device cannot block the game. */ }
  }
  private resumeContext() {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'suspended') return;
    void ctx.resume().then(() => {
      if (this.context === ctx) this.audioState();
    }).catch(() => {
      if (!this.disposed) { this.musicError = true; this.notifyMusic(); }
    });
  }
  private stop() {
    const theme = this.background.get('theme'); if (theme) this.recordMusic(theme);
    this.resetMusicClock();
    for (const track of this.background.values()) track.media.pause();
    for (const voice of [...this.voices]) { try { voice.stop(); } catch { /* Already ended. */ } this.releases.get(voice)?.(); }
  }
  private audioState = () => {
    // A resume may finish after mute, hide, or teardown. Recheck the actual owner.
    const wanted = !this.disposed && this.authorized && this.enabled && this.volume > 0 && !document.hidden;
    if (!wanted) {
      for (const track of this.background.values()) track.media.pause();
      if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
      this.resetMusicClock(); this.notifyMusic(); return;
    }
    // A pending mute suspension may settle after the user has already unmuted.
    // Follow current intent rather than leaving a valid listener stuck as locked.
    if (this.context?.state === 'suspended') { this.resumeContext(); return; }
    this.syncBackground(); this.notifyMusic();
  };
  // Asset headroom keeps the default theme around -40 dBFS RMS and air below it.
  private backgroundLevel(kind: BackgroundKind) {
    const trim = Number.isFinite(this.themeSong?.gainDb) ? clamp(this.themeSong!.gainDb!, -4, 2) : 0;
    return kind === 'theme' ? this.themeVolume * 2.2 * Math.pow(10, trim / 20) : this.ambienceVolume * 4;
  }
  private syncBackground() {
    const ctx = this.context, master = this.master;
    if (!ctx || !master || !this.authorized || !this.active) return;
    for (const kind of ['theme', 'ambience'] as const) {
      const level = this.backgroundLevel(kind);
      let track = this.background.get(kind);
      if (!level || kind === 'theme' && this.musicPaused) { track?.media.pause(); continue; }
      if (!track) {
        // Stream local compressed audio instead of decoding a whole song into RAM.
        if (kind === 'theme' && !this.themeSong) { this.themeSong = this.soundtrack.next(); this.save(); }
        const media = new Audio(kind === 'theme' ? this.themeSong!.url : ambienceUrl);
        media.loop = kind === 'ambience'; media.preload = 'none';
        const source = ctx.createMediaElementSource(media), gain = ctx.createGain();
        gain.gain.value = 0; source.connect(gain); gain.connect(master);
        track = { media, source, gain, pending: false, fading: false, release: () => {} };
        this.background.set(kind, track);
        if (kind === 'theme') {
          const current = track;
          const ended = () => {
            if (this.disposed || this.background.get('theme') !== current) return;
            this.recordMusic(current, true); this.resetMusicClock();
            current.fading = false;
            // A hidden/muted ending waits for the next authorized resume.
            if (this.active && this.backgroundLevel('theme') && !this.musicPaused) this.syncBackground();
            this.notifyMusic();
          };
          const tail = () => {
            this.recordMusic(current); this.notifyMusic();
            const remaining = media.duration - media.currentTime;
            if (!this.active || this.musicPaused || current.fading || !Number.isFinite(remaining) || remaining <= 0 || remaining > 1.8) return;
            current.fading = true;
            gain.gain.cancelScheduledValues(this.time);
            gain.gain.setTargetAtTime(0, this.time, Math.max(.08, remaining / 4));
          };
          const seeking = () => { this.resetMusicClock(); };
          const playing = () => { this.musicWaiting = false; this.musicError = false; this.notifyMusic(); };
          const waiting = () => { this.musicWaiting = true; this.notifyMusic(); };
          const failed = () => { this.musicError = true; this.musicWaiting = false; this.notifyMusic(); };
          const events: [string, EventListener][] = [['ended', ended], ['timeupdate', tail],
            ['seeking', seeking], ['seeked', seeking], ['playing', playing], ['waiting', waiting], ['error', failed]];
          for (const [event, listener] of events) media.addEventListener(event, listener);
          current.release = () => { for (const [event, listener] of events) media.removeEventListener(event, listener); };
          if (this.restoredPosition) { media.currentTime = this.restoredPosition; this.restoredPosition = 0; }
        }
      }
      const { media, gain } = track;
      if (!media.paused || track.pending) continue;
      if (kind === 'theme' && media.ended) {
        this.themeSong = this.soundtrack.next();
        media.src = this.themeSong.url; media.currentTime = 0; track.fading = false;
        this.musicError = false; this.musicWaiting = false; this.resetMusicClock(); this.save();
      }
      // Fade in from the retained playhead, including when a hidden office returns.
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      // Initial selection and an ended-event rotation may change themeSong
      // above. Apply the incoming recording's measured trim to its fade.
      gain.gain.setTargetAtTime(track.fading ? 0 : this.backgroundLevel(kind), ctx.currentTime, .65);
      track.pending = true;
      if (kind === 'theme') { this.musicError = false; this.musicWaiting = false; this.notifyMusic(); }
      const current = track;
      void media.play().then(() => {
        if (!this.active || !this.backgroundLevel(kind) || kind === 'theme' && this.musicPaused || this.background.get(kind) !== current) media.pause();
      }).catch(() => {
        if (kind === 'theme' && !this.disposed) this.musicError = true;
        // Retry on the next gesture, never block work or loop retries.
      }).finally(() => {
        current.pending = false;
        if (kind === 'theme') {
          if (this.requestedSong && !this.disposed) this.selectTheme(this.requestedSong, false);
          else if (this.skipRequested && !this.disposed) this.nextTheme();
          else { this.recordMusic(current); this.notifyMusic(); }
        }
      });
    }
  }
  configureBackground(kind: BackgroundKind, volume: number) {
    if (!Number.isFinite(volume) || this.disposed) return;
    if (kind === 'theme') { const track = this.background.get('theme'); if (track) this.recordMusic(track); this.themeVolume = clamp(volume, 0, 1); }
    else this.ambienceVolume = clamp(volume, 0, 1);
    const track = this.background.get(kind);
    if (track && this.context) {
      track.gain.gain.cancelScheduledValues(this.time);
      track.gain.gain.setTargetAtTime(track.fading ? 0 : this.backgroundLevel(kind), this.time, .08);
      if (!this.backgroundLevel(kind)) track.media.pause();
    }
    this.syncBackground(); this.save(); this.notifyMusic();
  }
  private save() {
    const position = this.background.get('theme')?.media.currentTime ?? this.restoredPosition;
    try { localStorage.setItem(KEY, JSON.stringify({ enabled: this.enabled, volume: this.volume, themeVolume: this.themeVolume, ambienceVolume: this.ambienceVolume, musicPaused: this.musicPaused, currentTheme: this.themeSong ? { id: this.themeSong.id, position: Number.isFinite(position) ? position : 0 } : null, soundtrack: this.soundtrack.state })); } catch { /* Optional persistence. */ }
  }
  private visibility = () => {
    if (document.hidden) {
      this.authorized = false;
      this.stop(); this.save(); this.notifyMusic(); this.last.clear();
      if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
    }
    // A returning window stays quiet until the next user gesture, with no backlog.
  };
  configure(enabled: boolean, volume = this.volume) {
    const theme = this.background.get('theme'); if (theme) this.recordMusic(theme);
    this.enabled = enabled;
    this.volume = Number.isFinite(volume) ? clamp(volume, 0, 1) : this.volume;
    if (!enabled || !this.volume) {
      this.stop();
      if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
    } else if (this.authorized && !document.hidden) this.unlock();
    if (this.master && this.context) this.master.gain.setTargetAtTime(enabled ? this.volume * .32 : 0, this.context.currentTime, .015);
    this.save(); this.notifyMusic();
  }
  play(cue: GameCue) { this.emit(cue, { gain: 1, pan: 0 }, 'ui'); }
  /** Player actions on physical objects use their current position and camera scale. */
  at(cue: GameCue, source: Element, intensity = 1) {
    if (!this.active || !source.isConnected) return;
    const scene = this.view?.scene ?? source.closest<HTMLElement>('.scene');
    if (!scene) { this.play(cue); return; }
    const bounds = scene.getBoundingClientRect(), rect = source.getBoundingClientRect();
    const mix = spatialMix(rect.left + rect.width / 2 - bounds.left, rect.top + rect.height / 2 - bounds.top, this.view?.scale() ?? 1, bounds.width, bounds.height);
    let id = this.sourceIds.get(source);
    if (!id) { id = ++this.sequence; this.sourceIds.set(source, id); }
    mix.gain *= clamp(Number.isFinite(intensity) ? intensity : 1, 0, 2);
    this.emit(cue, mix, `object:${id}`);
  }
  /** State-driven emitters supply computed geometry and perform no layout reads. */
  emit(cue: GameCue, mix: SoundMix, key: string, ambient = false) {
    if (!this.active || !Number.isFinite(mix.gain) || mix.gain < .006) return;
    const now = this.time, rateKey = `${key}:${cue}`;
    if (now - (this.last.get(rateKey) ?? -10) < (cue === 'ready' ? 1.5 : cue === 'keyboard' ? .025 : .07)) return;
    if (this.last.size > 256) for (const [k, at] of this.last) if (now - at > 5) this.last.delete(k);
    this.last.set(rateKey, now);
    const cutoff = cue === 'rustle' || cue === 'water' ? 1900 : cue === 'chatter' || cue === 'snore' ? 1400 : mix.lowpass;
    this.score(SCORES[cue], { ...mix, lowpass: cutoff }, ambient, !ambient && UI_CUES.has(cue), ambient ? key : '');
  }
  /** Original music for fictional Botify playlists, muffled as headphone leakage. */
  music(mix: SoundMix, playlist: string, bpm: number, seed: number, step: number, phone = false, delay = 0, owner = '') {
    if (!this.active || mix.gain < .012) return;
    let trackSeed = 0; for (const c of playlist) trackSeed = (Math.imul(trackSeed, 31) + c.charCodeAt(0)) >>> 0;
    const roots = [0, -5, 3, -2], root = 46 + trackSeed % 5 + roots[Math.floor(step / 16) % 4];
    const melody = [7, 10, 14, 10, 3, 7, 12, 7, 10, 14, 15, 14, 7, 3, 10, 7];
    const beat = 60 / clamp(bpm, 55, 160) / 2;
    const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
    const waveform = /synth|hype|rock/i.test(playlist) ? 'triangle' : 'sine';
    const notes: Note[] = [];
    if (step % 4 === 0) notes.push([hz(root - 12), 0, beat * 1.8, .15, 'sine']);
    if (step % 8 === 0) for (const note of [0, 3, 7, 10]) notes.push([hz(root + note), .008 * note, beat * 3.1, .035, waveform]);
    notes.push([hz(root + melody[(step + (seed + trackSeed) % 16) % 16]), 0, beat * .8, phone ? .1 : .07, waveform]);
    if (step % 2) notes.push([0, .01, .025, .045]);
    if (step % 8 === 4) notes.push([0, 0, .07, .065]);
    for (const note of notes) note[1] += clamp(delay, 0, .3);
    const trim = phone ? .55 : .72, mode = phone ? 'phone' : owner.startsWith('music:') ? 'headphones' : 'normal';
    this.score(notes, { ...mix, gain: mix.gain * trim, lowpass: mode === 'phone' ? 3200 : mode === 'headphones' ? 900 + mix.gain * 850 : 6500 }, true, false, owner, trim, mode);
  }
  private score(notes: Note[], mix: SoundMix, ambient: boolean, priority = false, owner = '', trim = 1, mode: EmitterBus['mode'] = 'normal') {
    const ctx = this.context, master = this.master;
    if (!ctx || !master || !this.active) return;
    const needed = notes.reduce((sum, n) => sum + (n[0] && priority ? 2 : 1), 0);
    if (priority && this.voices.size + needed > MAX_VOICES) for (const voice of [...this.ambient]) { try { voice.stop(); } catch {} this.releases.get(voice)?.(); }
    if (this.voices.size + needed > MAX_VOICES || ambient && this.ambient.size + needed > 30) return;
    const bus = ctx.createGain(), filter = ctx.createBiquadFilter(), pan = ctx.createStereoPanner();
    bus.gain.value = clamp(mix.gain, 0, 2); filter.type = 'lowpass'; filter.frequency.value = clamp(mix.lowpass ?? 14000, 120, 18000); filter.Q.value = .5;
    pan.pan.value = clamp(mix.pan, -1, 1); bus.connect(filter); filter.connect(pan); pan.connect(master);
    const chain: EmitterBus = { gain: bus, pan, filter, trim, cutoff: filter.frequency.value, mode };
    if (owner) {
      if (!this.emitterVoices.has(owner)) this.emitterVoices.set(owner, new Set());
      if (!this.emitterBuses.has(owner)) this.emitterBuses.set(owner, new Set());
      this.emitterBuses.get(owner)!.add(chain);
    }
    let remaining = needed;
    const done = () => { if (--remaining === 0) {
      bus.disconnect(); filter.disconnect(); pan.disconnect();
      if (owner) { const buses = this.emitterBuses.get(owner); buses?.delete(chain); if (!buses?.size) this.emitterBuses.delete(owner); }
    } };
    for (const [frequency, delay, duration, gain, wave = 'sine', endFrequency] of notes) {
      for (const [ratio, strength] of frequency && priority ? [[1, 1], [2.003, .16]] : [[1, 1]]) {
        let voice: OscillatorNode | AudioBufferSourceNode;
        if (!frequency) {
          if (!this.noise) {
            this.noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .5), ctx.sampleRate);
            const samples = this.noise.getChannelData(0); let brown = 0;
            for (let i = 0; i < samples.length; i++) { const white = Math.random() * 2 - 1; brown = (brown + .03 * white) / 1.03; samples[i] = white * .7 + brown * 3; }
          }
          voice = ctx.createBufferSource(); voice.buffer = this.noise;
        } else {
          voice = ctx.createOscillator(); voice.type = wave; voice.frequency.value = frequency * ratio;
          if (endFrequency) voice.frequency.exponentialRampToValueAtTime(endFrequency * ratio, ctx.currentTime + delay + duration);
        }
        const envelope = ctx.createGain(), at = ctx.currentTime + delay;
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(Math.max(.0001, gain * strength), at + Math.min(.006, duration / 4));
        envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
        voice.connect(envelope); envelope.connect(bus);
        this.voices.add(voice); if (ambient) this.ambient.add(voice);
        if (owner) this.emitterVoices.get(owner)!.add(voice);
        let released = false;
        const release = () => { if (released) return; released = true; this.voices.delete(voice); this.ambient.delete(voice); this.releases.delete(voice);
          if (owner) { const voices = this.emitterVoices.get(owner); voices?.delete(voice); if (!voices?.size) this.emitterVoices.delete(owner); }
          voice.disconnect(); envelope.disconnect(); done(); };
        this.releases.set(voice, release); voice.onended = release;
        voice.start(at); voice.stop(at + duration + .01);
      }
    }
  }
  destroy = () => {
    if (this.disposed) return;
    const theme = this.background.get('theme'); if (theme) this.recordMusic(theme); this.save();
    this.disposed = true; this.stop(); this.skipRequested = false; this.musicListeners.clear(); this.last.clear(); this.view = null; this.noise = null;
    window.removeEventListener('pointerdown', this.gesture, true);
    window.removeEventListener('keydown', this.gesture, true);
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.destroy);
    this.context?.removeEventListener('statechange', this.audioState);
    for (const track of this.background.values()) {
      track.release();
      track.media.pause(); track.media.removeAttribute('src'); track.media.load();
      track.source.disconnect(); track.gain.disconnect();
    }
    this.background.clear();
    this.master?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null; this.master = null;
  };
}
export const gameSound = new GameSound();
