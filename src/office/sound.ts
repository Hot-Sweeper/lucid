// Original local sound design. All sources share one gesture-unlocked audio graph.
import { SOUNDTRACK } from './soundtrack';
import { SoundtrackQueue, type SoundtrackSong, type SoundtrackMode } from './soundtrack-queue';
import ambienceUrl from '../assets/audio/room-air.opus';

export type MusicState = {
  song: SoundtrackSong | null; mode: SoundtrackMode;
  chapter: SoundtrackQueue['chapter']; chapterProgress: number; paused: boolean;
  status: 'playing' | 'loading' | 'error' | 'paused' | 'muted' | 'hidden' | 'locked';
};
type BackgroundKind = 'theme' | 'ambience';
type BackgroundTrack = { media: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode; pending: boolean; fading: boolean; release: () => void; fadeIn?: number };
export type GameCue = 'collect' | 'clink' | 'ready' | 'poke' | 'coffee' | 'phone' | 'open' | 'level'
  | 'rustle' | 'splash' | 'switch' | 'projector' | 'boop' | 'chirp' | 'quack' | 'build'
  | 'keyboard' | 'mouse' | 'paper' | 'servo' | 'step' | 'chatter' | 'controller' | 'ping' | 'snore' | 'water' | 'clip'
  | FoleyCue;
// Physical break room, robot and media foley. Each one follows a visible event.
export type FoleyCue = 'robostep' | 'giggle' | 'munch' | 'charge'
  | 'pp-paddle' | 'pp-table' | 'pp-floor' | 'pp-net'
  | 'mw-door' | 'mw-beep' | 'mw-hum' | 'mw-ding' | 'grind' | 'pour' | 'fridge-open' | 'fridge-close' | 'pop'
  | 'chess' | 'chess-take' | 'kart' | 'kart-boost' | 'kart-spin' | 'kart-pass' | 'fight' | 'fight-hit' | 'fight-big'
  | 'movie-gasp' | 'movie-scare' | 'movie-laugh' | 'movie-aww' | 'movie-credits' | 'tv-show';
export type SoundMix = { gain: number; pan: number; lowpass?: number };
/** `band` gives a note its own band-pass filter (noise color, or a hollow tone). */
export type Note = [frequency: number, delay: number, duration: number, gain: number, wave?: OscillatorType, endFrequency?: number, band?: number];
type EmitterBus = { gain: GainNode; pan: StereoPannerNode; filter: BiquadFilterNode; trim: number; cutoff: number; mode: 'normal' | 'headphones' | 'phone' };
// Zero frequency means a shaped noise transient, never a continuous noise loop.
const SCORES: Record<GameCue, Note[]> = {
  clink: [[2093, 0, .045, .1], [3135.96, .016, .06, .05]],
  collect: [[1046.5, 0, .16, .32], [1318.5, .055, .18, .28], [1568, .11, .22, .24], [2093, .18, .28, .17], [523.25, 0, .2, .15]],
  ready: [[659.25, 0, .18, .15], [987.77, .12, .28, .12]],
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
  // A desk assembles: the top lands with a soft wooden thump, a leg clicks in, the monitor latches and rises.
  build: [[0, 0, .05, .13, 'sine', undefined, 900], [150, 0, .1, .09, 'triangle', 92], [0, .13, .014, .06, 'sine', undefined, 3800], [0, .21, .016, .05, 'sine', undefined, 4400], [620, .21, .1, .04, 'sine', 930]],
  // Robots: a metal foot tick, a low thunk and a short servo whine.
  robostep: [[0, 0, .018, .1, 'sine', undefined, 3600], [92, 0, .055, .09, 'sine', 64], [430, .012, .05, .018, 'triangle', 560]],
  giggle: [[930, 0, .055, .04, 'square', 840], [880, .085, .055, .04, 'square', 790], [835, .17, .055, .036, 'square', 745], [790, .255, .08, .032, 'square', 690]],
  munch: [[0, 0, .035, .07, 'sine', undefined, 1900], [0, .11, .03, .05, 'sine', undefined, 2300], [0, .2, .04, .04, 'sine', undefined, 1600]],
  charge: [[196, 0, .7, .03, 'sine', 392], [784, .55, .12, .022, 'sine'], [0, 0, .5, .012, 'sine', undefined, 5200]],
  // Ping pong: a wooden paddle "tok", a hollow table "tik", a dull floor bounce, the net.
  'pp-paddle': [[0, 0, .016, .3, 'sine', undefined, 3900], [1180, 0, .045, .22, 'sine', 700], [2360, 0, .018, .06, 'sine']],
  'pp-table': [[1780, 0, .036, .2, 'sine', 1240], [0, 0, .011, .15, 'sine', undefined, 5400], [3560, 0, .014, .04, 'sine']],
  'pp-floor': [[640, 0, .05, .09, 'sine', 420], [0, 0, .014, .06, 'sine', undefined, 2400]],
  'pp-net': [[0, 0, .09, .11, 'sine', undefined, 900], [270, 0, .06, .05, 'triangle', 180], [0, .05, .07, .04, 'sine', undefined, 3200]],
  // Kitchen machines.
  'mw-door': [[0, 0, .03, .14, 'sine', undefined, 1500], [150, 0, .07, .1, 'triangle', 88], [0, .05, .02, .05, 'sine', undefined, 4200]],
  'mw-beep': [[1976, 0, .075, .035, 'square'], [1976, .12, .075, .035, 'square']],
  'mw-hum': [[118, 0, 1.05, .05, 'sawtooth'], [236, 0, 1.05, .018, 'triangle'], [59, 0, 1.05, .03, 'sine']],
  'mw-ding': [[1568, 0, .5, .11, 'sine'], [3136, 0, .3, .025, 'sine'], [1568, .62, .5, .11, 'sine'], [3136, .62, .3, .025, 'sine'], [1568, 1.24, .7, .11, 'sine'], [3136, 1.24, .4, .025, 'sine']],
  grind: [[0, 0, .95, .2, 'sine', undefined, 2700], [96, 0, .95, .06, 'sawtooth', 112], [0, .3, .65, .1, 'sine', undefined, 5200]],
  pour: [[0, 0, 1.7, .11, 'sine', undefined, 1250], [880, .25, .06, .05, 'sine', 1320], [990, .7, .06, .05, 'sine', 1500], [840, 1.15, .06, .05, 'sine', 1260], [0, .4, 1.3, .06, 'sine', undefined, 4300]],
  'fridge-open': [[0, 0, .08, .13, 'sine', undefined, 700], [176, 0, .12, .05, 'triangle', 118], [2960, .1, .09, .012, 'sine', 2800], [0, .05, .4, .02, 'sine', undefined, 260]],
  'fridge-close': [[0, 0, .1, .17, 'sine', undefined, 480], [88, 0, .15, .12, 'sine', 58], [0, .06, .03, .05, 'sine', undefined, 3000], [2093, .2, .05, .015, 'sine']],
  pop: [[0, 0, .022, .2, 'sine', undefined, 2300], [720, 0, .03, .05, 'sine', 380]],
  // Chess pieces on a wooden board.
  chess: [[0, 0, .02, .2, 'sine', undefined, 3200], [1900, 0, .03, .06, 'sine', 1500], [700, .004, .035, .04, 'triangle']],
  'chess-take': [[0, 0, .02, .22, 'sine', undefined, 3000], [1700, 0, .03, .06, 'sine', 1300], [0, .09, .02, .14, 'sine', undefined, 3600], [0, .12, .22, .04, 'sine', undefined, 1800]],
  // The TV console games and the movie night soundtrack stings.
  kart: [[92, 0, .26, .05, 'sawtooth', 122], [184, 0, .26, .022, 'square', 232]],
  'kart-boost': [[300, 0, .38, .07, 'square', 1500], [0, 0, .3, .06, 'sine', undefined, 2400]],
  'kart-spin': [[980, 0, .14, .06, 'triangle', 520], [880, .14, .14, .06, 'triangle', 420], [760, .28, .2, .06, 'triangle', 240]],
  'kart-pass': [[880, 0, .08, .05, 'square'], [1320, .085, .13, .05, 'square']],
  fight: [[523, 0, .07, .03, 'square', 660], [392, .2, .07, .03, 'square', 330]],
  'fight-hit': [[1250, 0, .12, .07, 'square', 260], [0, 0, .05, .1, 'sine', undefined, 1800]],
  'fight-big': [[300, 0, .32, .1, 'sawtooth', 56], [0, 0, .28, .13, 'sine', undefined, 760], [1600, .02, .2, .03, 'square', 400]],
  'tv-show': [[523.25, 0, .09, .035, 'triangle'], [659.25, .11, .09, .03, 'triangle'], [0, .22, .03, .04, 'sine', undefined, 3000], [392, .3, .14, .03, 'triangle']],
  'movie-gasp': [[0, 0, .9, .13, 'sine', undefined, 260], [70, 0, .9, .09, 'triangle', 44], [0, .1, .4, .04, 'sine', undefined, 1500]],
  'movie-scare': [[0, 0, .55, .15, 'sine', undefined, 620], [110, 0, .65, .1, 'sawtooth', 55], [1760, 0, .45, .03, 'sawtooth', 1660], [1865, 0, .45, .025, 'sawtooth', 1750]],
  'movie-laugh': [[392, 0, .12, .04, 'square', 470], [349, .16, .12, .04, 'square', 420], [330, .32, .16, .04, 'square', 380], [0, .05, .5, .03, 'sine', undefined, 1600]],
  'movie-aww': [[1046.5, 0, .7, .05, 'sine'], [1318.5, .14, .7, .05, 'sine'], [1568, .28, .9, .05, 'sine'], [523.25, 0, 1.1, .04, 'triangle']],
  'movie-credits': [[392, 0, .5, .05, 'triangle'], [493.88, .2, .5, .05, 'triangle'], [587.33, .4, .5, .05, 'triangle'], [783.99, .6, 1.2, .06, 'triangle'], [196, 0, 1.8, .05, 'sine']],
};
// A quiet body for a sustained machine, a darker one for kitchen and TV sounds.
const CUE_LOWPASS: Partial<Record<GameCue, number>> = { rustle: 1900, water: 1900, chatter: 1400, snore: 1400, 'mw-hum': 900, kart: 1400, grind: 4200, giggle: 2600, 'movie-gasp': 2200 };
const KEY = 'lucid:sound', MAX_VOICES = 48;
// Song-to-song overlap. Natural endings blend for CROSSFADE seconds; a manual
// Next uses a short blend so the choice still feels immediate.
const CROSSFADE = 7, QUICK_FADE = 1.5;
/** Equal-power gain curve: the summed loudness stays even through the overlap. */
const powerCurve = (level: number, rising: boolean, steps = 48) => Float32Array.from({ length: steps }, (_, i) => {
  const x = i / (steps - 1);
  return level * (rising ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2));
});
const UI_CUES = new Set<GameCue>(['collect', 'clink', 'level', 'ready', 'open']);
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
  // At most two theme streams: the playing one (in background) and either a
  // fading outgoing stream or an idle spare ready for the next blend.
  private outgoing: BackgroundTrack | null = null;
  private outgoingEnd = 0;
  private spareTheme: BackgroundTrack | null = null;
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
    if (paused) { track?.media.pause(); this.finishOutgoing(); this.resetMusicClock(); }
    else this.syncBackground();
    this.save(); this.notifyMusic();
  }
  nextTheme(blend = true) {
    if (this.disposed) return;
    const track = this.background.get('theme');
    // Changing src during a pending play can let an old promise own the new song.
    // Collapse repeated Next presses until that one attempt has settled.
    if (track?.pending) { this.skipRequested = true; return; }
    this.skipRequested = false;
    if (blend && track && this.canBlend(track)) {
      this.crossfadeTo(this.soundtrack.next(), QUICK_FADE);
      this.save(); this.notifyMusic(); return;
    }
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
  private resetMusicClock() { this.musicPosition = null; this.musicClock = null; }
  /** A blend needs an audible, settled current song; otherwise switch directly. */
  private canBlend(track: BackgroundTrack) {
    return !!this.context && this.active && !this.musicPaused && this.backgroundLevel('theme') > 0
      && !track.pending && !track.media.paused && !track.media.ended;
  }
  /** Start `song` on the spare stream while the current one fades out. */
  private crossfadeTo(song: SoundtrackSong, seconds: number) {
    const old = this.background.get('theme')!, now = this.time;
    this.recordMusic(old); this.resetMusicClock();
    this.finishOutgoing();
    old.fading = true;
    const from = old.gain.gain.value;
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueCurveAtTime(powerCurve(from, false), now, seconds);
    this.outgoing = old; this.outgoingEnd = now + seconds;
    let incoming = this.spareTheme; this.spareTheme = null;
    if (incoming) { incoming.media.src = song.url; incoming.media.currentTime = 0; }
    else incoming = this.createTrack('theme', song.url);
    incoming.fading = false; incoming.fadeIn = seconds;
    this.background.set('theme', incoming);
    this.themeSong = song; this.restoredPosition = 0;
    this.musicError = false; this.musicWaiting = false;
    this.syncBackground();
  }
  /** Silence the fading stream and keep it as the idle spare. */
  private finishOutgoing() {
    const track = this.outgoing;
    if (!track) return;
    this.outgoing = null;
    track.media.pause(); track.fading = false;
    track.gain.gain.cancelScheduledValues(this.time);
    track.gain.gain.setValueAtTime(0, this.time);
    if (this.spareTheme) this.releaseTrack(track); else this.spareTheme = track;
  }
  private releaseTrack(track: BackgroundTrack) {
    track.release();
    track.media.pause(); track.media.removeAttribute('src'); track.media.load();
    track.source.disconnect(); track.gain.disconnect();
  }
  private createTrack(kind: BackgroundKind, url: string): BackgroundTrack {
    const ctx = this.context!, media = new Audio(url);
    media.loop = kind === 'ambience'; media.preload = 'none';
    const source = ctx.createMediaElementSource(media), gain = ctx.createGain();
    gain.gain.value = 0; source.connect(gain); gain.connect(this.master!);
    const track: BackgroundTrack = { media, source, gain, pending: false, fading: false, release: () => {} };
    if (kind !== 'theme') return track;
    const current = track;
    const primary = () => this.background.get('theme') === current;
    const ended = () => {
      if (this.disposed) return;
      if (this.outgoing === current) { this.finishOutgoing(); return; }
      if (!primary()) return;
      this.recordMusic(current, true); this.resetMusicClock();
      current.fading = false;
      // A hidden/muted ending waits for the next authorized resume.
      if (this.active && this.backgroundLevel('theme') && !this.musicPaused) this.syncBackground();
      this.notifyMusic();
    };
    const tail = () => {
      if (this.outgoing === current) { if (this.time >= this.outgoingEnd - .05) this.finishOutgoing(); return; }
      if (!primary()) return;
      this.recordMusic(current); this.notifyMusic();
      // Begin the next song while this one still plays out its last seconds.
      const remaining = media.duration - media.currentTime;
      const blendWindow = Math.min(CROSSFADE, media.duration / 3);
      if (!Number.isFinite(remaining) || remaining <= 0 || remaining > blendWindow || !this.canBlend(current)) return;
      this.crossfadeTo(this.soundtrack.next(), Math.max(.5, remaining));
      this.save(); this.notifyMusic();
    };
    const seeking = () => { if (primary()) this.resetMusicClock(); };
    const playing = () => { if (!primary()) return; this.musicWaiting = false; this.musicError = false; this.notifyMusic(); };
    const waiting = () => { if (!primary()) return; this.musicWaiting = true; this.notifyMusic(); };
    const failed = () => { if (!primary()) return; this.musicError = true; this.musicWaiting = false; this.notifyMusic(); };
    const events: [string, EventListener][] = [['ended', ended], ['timeupdate', tail],
      ['seeking', seeking], ['seeked', seeking], ['playing', playing], ['waiting', waiting], ['error', failed]];
    for (const [event, listener] of events) media.addEventListener(event, listener);
    current.release = () => { for (const [event, listener] of events) media.removeEventListener(event, listener); };
    return track;
  }
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
    this.resetMusicClock(); this.finishOutgoing();
    for (const track of this.background.values()) track.media.pause();
    for (const voice of [...this.voices]) { try { voice.stop(); } catch { /* Already ended. */ } this.releases.get(voice)?.(); }
  }
  private audioState = () => {
    // A resume may finish after mute, hide, or teardown. Recheck the actual owner.
    const wanted = !this.disposed && this.authorized && this.enabled && this.volume > 0 && !document.hidden;
    if (!wanted) {
      this.finishOutgoing();
      for (const track of this.background.values()) track.media.pause();
      if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
      this.resetMusicClock(); this.notifyMusic(); return;
    }
    // A pending mute suspension may settle after the user has already unmuted.
    // Follow current intent rather than leaving a valid listener stuck as locked.
    if (this.context?.state === 'suspended') { this.resumeContext(); return; }
    this.syncBackground(); this.notifyMusic();
  };
  // Room tone stays a quiet indoor bed, including with previously saved levels.
  private backgroundLevel(kind: BackgroundKind) {
    const trim = Number.isFinite(this.themeSong?.gainDb) ? clamp(this.themeSong!.gainDb!, -4, 2) : 0;
    return kind === 'theme' ? this.themeVolume * 2.2 * Math.pow(10, trim / 20) : this.ambienceVolume * 2;
  }
  private syncBackground() {
    const ctx = this.context, master = this.master;
    if (!ctx || !master || !this.authorized || !this.active) return;
    for (const kind of ['theme', 'ambience'] as const) {
      const level = this.backgroundLevel(kind);
      let track = this.background.get(kind);
      if (!level || kind === 'theme' && this.musicPaused) { track?.media.pause(); if (kind === 'theme') this.finishOutgoing(); continue; }
      if (!track) {
        // Stream local compressed audio instead of decoding a whole song into RAM.
        if (kind === 'theme' && !this.themeSong) { this.themeSong = this.soundtrack.next(); this.save(); }
        track = this.createTrack(kind, kind === 'theme' ? this.themeSong!.url : ambienceUrl);
        this.background.set(kind, track);
        if (kind === 'theme' && this.restoredPosition) { track.media.currentTime = this.restoredPosition; this.restoredPosition = 0; }
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
      // Initial selection and an ended-event rotation may change themeSong
      // above. Apply the incoming recording's measured trim to its fade.
      const target = track.fading ? 0 : this.backgroundLevel(kind);
      // A blend curve starts at silence itself; no other event may share its start.
      if (track.fadeIn && target) gain.gain.setValueCurveAtTime(powerCurve(target, true), ctx.currentTime, track.fadeIn);
      else { gain.gain.setValueAtTime(0, ctx.currentTime); gain.gain.setTargetAtTime(target, ctx.currentTime, .65); }
      track.fadeIn = 0;
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
        if (kind === 'theme' && this.background.get('theme') === current) {
          // The superseded recording barely started; switch without a blend.
          if (this.skipRequested && !this.disposed) this.nextTheme(false);
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
      if (!this.backgroundLevel(kind)) { track.media.pause(); if (kind === 'theme') this.finishOutgoing(); }
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
    const placed = this.placement(source, intensity);
    if (placed) this.emit(cue, placed.mix, placed.key);
    else if (placed === null && this.active && source.isConnected) this.play(cue);
  }
  /** Where a world object sits for the listening camera (one layout read, for discrete events).
   *  Undefined: nothing can sound now. Null: the element is outside any scene (UI placement). */
  placement(source: Element, intensity = 1): { mix: SoundMix; key: string } | null | undefined {
    // A folded office keeps its robots working out of sight, and out of earshot.
    if (!this.active || !source.isConnected || source.closest('.folded-away')) return undefined;
    const scene = this.view?.scene ?? source.closest<HTMLElement>('.scene');
    if (!scene) return null;
    const bounds = scene.getBoundingClientRect(), rect = source.getBoundingClientRect();
    const mix = spatialMix(rect.left + rect.width / 2 - bounds.left, rect.top + rect.height / 2 - bounds.top, this.view?.scale() ?? 1, bounds.width, bounds.height);
    let id = this.sourceIds.get(source);
    if (!id) { id = ++this.sequence; this.sourceIds.set(source, id); }
    mix.gain *= clamp(Number.isFinite(intensity) ? intensity : 1, 0, 2);
    return { mix, key: `object:${id}` };
  }
  /** State-driven emitters supply computed geometry and perform no layout reads. */
  emit(cue: GameCue, mix: SoundMix, key: string, ambient = false) {
    if (!this.active || !Number.isFinite(mix.gain) || mix.gain < .006) return;
    const now = this.time, rateKey = `${key}:${cue}`;
    if (now - (this.last.get(rateKey) ?? -10) < (cue === 'ready' ? 1.5 : cue === 'keyboard' ? .025 : .07)) return;
    if (this.last.size > 256) for (const [k, at] of this.last) if (now - at > 5) this.last.delete(k);
    this.last.set(rateKey, now);
    const cutoff = CUE_LOWPASS[cue] ?? mix.lowpass;
    this.score(SCORES[cue], { ...mix, lowpass: cutoff }, ambient, !ambient && UI_CUES.has(cue), ambient ? key : '');
  }
  /** A generated phrase (birdsong, crickets, rain) through the same ambient bus and budgets. */
  phrase(notes: Note[], mix: SoundMix, key: string) {
    if (!this.active || !notes.length || !Number.isFinite(mix.gain) || mix.gain < .006) return;
    this.score(notes, mix, true, false, key);
  }
  /** Custom synthesis on the shared graph (robot voices). `build` receives the spatial bus input
   *  and returns its scheduled sources; voice budgets, camera tracking and cleanup stay here. */
  synth(mix: SoundMix, owner: string, sources: number, build: (ctx: AudioContext, input: AudioNode, noise: AudioBuffer) => AudioScheduledSourceNode[]): boolean {
    const ctx = this.context, master = this.master;
    if (!ctx || !master || !this.active || !Number.isFinite(mix.gain) || mix.gain < .006) return false;
    if (this.voices.size + sources > MAX_VOICES || this.ambient.size + sources > 30) return false;
    const bus = ctx.createGain(), filter = ctx.createBiquadFilter(), pan = ctx.createStereoPanner();
    bus.gain.value = clamp(mix.gain, 0, 2); filter.type = 'lowpass'; filter.frequency.value = clamp(mix.lowpass ?? 14000, 120, 18000); filter.Q.value = .5;
    pan.pan.value = clamp(mix.pan, -1, 1); bus.connect(filter); filter.connect(pan); pan.connect(master);
    const chain: EmitterBus = { gain: bus, pan, filter, trim: 1, cutoff: filter.frequency.value, mode: 'normal' };
    let built: AudioScheduledSourceNode[] = [];
    try { built = build(ctx, bus, this.noiseBuffer(ctx)); } catch { built = []; }
    if (!built.length) { bus.disconnect(); filter.disconnect(); pan.disconnect(); return false; }
    if (!this.emitterVoices.has(owner)) this.emitterVoices.set(owner, new Set());
    if (!this.emitterBuses.has(owner)) this.emitterBuses.set(owner, new Set());
    this.emitterBuses.get(owner)!.add(chain);
    let remaining = built.length;
    for (const voice of built) {
      this.voices.add(voice); this.ambient.add(voice); this.emitterVoices.get(owner)!.add(voice);
      let released = false;
      const release = () => { if (released) return; released = true; this.voices.delete(voice); this.ambient.delete(voice); this.releases.delete(voice);
        const voices = this.emitterVoices.get(owner); voices?.delete(voice); if (!voices?.size) this.emitterVoices.delete(owner);
        voice.disconnect();
        if (--remaining === 0) {
          bus.disconnect(); filter.disconnect(); pan.disconnect();
          const buses = this.emitterBuses.get(owner); buses?.delete(chain); if (!buses?.size) this.emitterBuses.delete(owner);
        } };
      this.releases.set(voice, release); voice.onended = release;
    }
    return true;
  }
  private noiseBuffer(ctx: AudioContext) {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .5), ctx.sampleRate);
      const samples = this.noise.getChannelData(0); let brown = 0;
      for (let i = 0; i < samples.length; i++) { const white = Math.random() * 2 - 1; brown = (brown + .03 * white) / 1.03; samples[i] = white * .7 + brown * 3; }
    }
    return this.noise;
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
    for (const [frequency, delay, duration, gain, wave = 'sine', endFrequency, band] of notes) {
      for (const [ratio, strength] of frequency && priority ? [[1, 1], [2.003, .16]] : [[1, 1]]) {
        let voice: OscillatorNode | AudioBufferSourceNode;
        if (!frequency) {
          voice = ctx.createBufferSource(); voice.buffer = this.noiseBuffer(ctx);
          // A slightly different speed keeps repeated colored transients from sounding identical.
          if (band) voice.playbackRate.value = .85 + Math.random() * .3;
        } else {
          voice = ctx.createOscillator(); voice.type = wave; voice.frequency.value = frequency * ratio;
          if (endFrequency) voice.frequency.exponentialRampToValueAtTime(endFrequency * ratio, ctx.currentTime + delay + duration);
        }
        const envelope = ctx.createGain(), at = ctx.currentTime + delay;
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(Math.max(.0001, gain * strength), at + Math.min(.006, duration / 4));
        envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
        let color: BiquadFilterNode | null = null;
        if (band) { color = ctx.createBiquadFilter(); color.type = 'bandpass'; color.frequency.value = clamp(band, 80, 16000); color.Q.value = frequency ? 4 : 1.1; voice.connect(color); color.connect(envelope); }
        else voice.connect(envelope);
        envelope.connect(bus);
        this.voices.add(voice); if (ambient) this.ambient.add(voice);
        if (owner) this.emitterVoices.get(owner)!.add(voice);
        let released = false;
        const release = () => { if (released) return; released = true; this.voices.delete(voice); this.ambient.delete(voice); this.releases.delete(voice);
          if (owner) { const voices = this.emitterVoices.get(owner); voices?.delete(voice); if (!voices?.size) this.emitterVoices.delete(owner); }
          voice.disconnect(); envelope.disconnect(); color?.disconnect(); done(); };
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
    for (const track of [...this.background.values(), this.outgoing, this.spareTheme]) if (track) this.releaseTrack(track);
    this.background.clear(); this.outgoing = null; this.spareTheme = null;
    this.master?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null; this.master = null;
  };
}
export const gameSound = new GameSound();
