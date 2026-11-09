import { gameSound, spatialMix, type GameCue, type SoundMix } from './sound';
import { daypart, natureFor, naturePhrase, type NatureVoice } from './nature-sounds';
import type { World } from './world';

export type SoundActor = { el: HTMLElement; x: number; y: number; activity: string; moving?: boolean };
type SoundMedia = { el: HTMLElement; x: number; y: number; kind: 'tv' | 'movie'; playing: boolean; powered: boolean; game?: 'boot' | 'fight' | 'race' | null };
type AudioRoom = { soundActors?(): SoundActor[]; soundMedia?(): SoundMedia[] };
type ZoneKind = 'water' | 'birds' | 'pond' | 'meadow';
type Source = { key: string; x: number; y: number; cue?: GameCue; nature?: NatureVoice; interval?: number; pulse?: number; music?: { name: string; bpm: number; phone?: boolean }; gain: number };
// Sparse outdoor phrases get their own small budget so a busy office never mutes the park.
const FOREGROUND = 6, NATURE = 3;
type Stream = { signature: string; next: number; step: number; pulse?: number };
const hash = (value: string) => { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Only visible, actual activities produce foley. There is no random office chatter bed. */
export function actorCue(activity: string, moving = false): { cue: GameCue; interval: number } | null {
  if (moving) return { cue: 'robostep', interval: .4 };
  switch (activity) {
    case 'type': return { cue: 'keyboard', interval: .19 };
    case 'play': return { cue: 'controller', interval: .7 };
    case 'talk': case 'explain': return { cue: 'chatter', interval: 1.9 };
    case 'laugh': return { cue: 'giggle', interval: 1.5 };
    case 'eat': return { cue: 'munch', interval: 1.25 };
    case 'drink': return { cue: 'coffee', interval: 5.2 };
    case 'hold-card': return { cue: 'paper', interval: 7.2 };
    case 'nap': return { cue: 'snore', interval: 4.6 };
    case 'ready': return { cue: 'ping', interval: 1.1 };
    case 'wait': return { cue: 'servo', interval: 7.7 };
    default: return null;
  }
}

// One bounded scheduler supplies audio lookahead. Actor/camera geometry comes
// from state, not getBoundingClientRect or per-frame DOM queries.
export class OfficeSoundscape {
  private timer = 0;
  private destroyed = false;
  private width = 0;
  private height = 0;
  private resize: ResizeObserver;
  private releaseView: () => void;
  private streams = new Map<string, Stream>();
  private audibleKeys: string[] = [];
  private positions = new WeakMap<HTMLElement, { x: number; y: number; at: number }>();
  constructor(private world: World) {
    this.measure();
    world.scene.addEventListener("lucid:desk-key", this.keypress);
    this.resize = new ResizeObserver(this.measure); this.resize.observe(world.scene);
    this.releaseView = gameSound.attachView(world.scene, () => world.cameraState().s);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('lucid:mobile-view', this.visibility);
    window.addEventListener('pagehide', this.destroy);
    this.timer = window.setInterval(() => this.update(), 240);
  }
  private keypress = () => { this.update(); };
  private measure = () => { this.width = this.world.scene.clientWidth; this.height = this.world.scene.clientHeight; };
  private visibility = () => { if (document.hidden || this.world.scene.inert) this.clearStreams(); };
  private clearStreams() { for (const key of this.streams.keys()) gameSound.silence(key); this.streams.clear(); this.audibleKeys = []; }
  /** Exposes state counts for acceptance checks without changing the game. */
  get diagnostics() { return { audible: [...this.audibleKeys], streams: this.streams.size, timer: !!this.timer, active: gameSound.active }; }
  update() {
    if (this.destroyed || document.hidden || this.world.scene.inert || !gameSound.active || !this.width || !this.height) { this.clearStreams(); return; }
    const sources: Source[] = [], cam = this.world.cameraState(), nowMs = performance.now();
    for (const { id, desk, x: offset, y: offsetY } of this.world.campusDesks ?? [...this.world.desks].map(([id, desk]) => ({ id, desk, x: 0, y: 0 }))) {
      if (!desk.el.isConnected || desk.el.classList.contains('arriving') || !desk.wm.operatorPresent) continue;
      const x = offset + parseFloat(desk.el.style.left) + 200, y = offsetY + parseFloat(desk.el.style.top) + 220;
      const pose = desk.robot.currentPose;
      if (desk.lastKeyAt > 0 && nowMs - desk.lastKeyAt < 340) sources.push({ key: `keys:${id}`, x, y, cue: 'keyboard', pulse: desk.lastKeyAt, gain: .85 });
      if (desk.wm.lastClickAt > 0 && nowMs - desk.wm.lastClickAt < 340) sources.push({ key: `mouse:${id}`, x, y, cue: 'mouse', pulse: desk.wm.lastClickAt, gain: .9 });
      const playlist = desk.director.music.playing;
      if (playlist && pose !== 'sleep') sources.push({ key: `music:${id}`, x, y: y + 40, music: { name: playlist.name + ":" + (desk.director.music.soundtrack ?? ""), bpm: playlist.bpm }, gain: 1 });
      if (pose === 'phone' && /clips|shorts|watching.*video/i.test(desk.activity)) sources.push({ key: `phone:${id}`, x: x - 30, y, music: { name: 'Phone clips', bpm: 124, phone: true }, gain: .8 });
      else if (pose === 'phone' && /texting|sending snaps/i.test(desk.activity)) sources.push({ key: `phone:${id}`, x: x - 30, y, cue: 'mouse', interval: 1.1, gain: .35 });
      if (desk.wm.isFront('game') && pose !== 'sleep') sources.push({ key: `game:${id}`, x, y: y - 80, cue: 'clip', interval: 2.1, gain: .35 });
    }
    for (const kind of ['break', 'queue', 'charging'] as const) {
      const room = this.world.rooms.find(r => r.kind === kind);
      const extension = this.world.ext[kind] as AudioRoom | undefined;
      if (!room || !extension) continue;
      for (const actor of extension.soundActors?.() ?? []) {
        if (!actor.el.isConnected) continue;
        const sound = actorCue(actor.activity, this.moving(actor, nowMs)); if (!sound) continue;
        sources.push({ key: `${kind}:${actor.el.dataset.id ?? actor.x + ':' + actor.y}:${sound.cue}`, x: room.x + actor.x, y: room.y + actor.y - 30, ...sound, gain: .75 });
      }
      for (const media of extension.soundMedia?.() ?? []) {
        if (!media.playing || !media.powered || !media.el.isConnected) continue;
        const at = { x: room.x + media.x, y: room.y + media.y };
        // The TV follows what is actually on screen: kart engines, a fight theme, or the console start-up.
        const tv = media.game === 'race' ? { cue: 'kart' as const, interval: .25 } : media.game === 'fight' ? { cue: 'fight' as const, interval: .95 }
          : media.game === 'boot' ? { cue: 'tv-show' as const, interval: 1.6 } : { cue: 'clip' as const, interval: 1.45 };
        sources.push(media.kind === 'movie'
          ? { key: `film:${room.id}`, ...at, music: { name: 'Movie night', bpm: 72 }, gain: .7 }
          : { key: `tv:${room.id}`, ...at, ...tv, gain: .65 });
      }
    }
    // Robots crossing the hallway or the grounds between rooms.
    for (const actor of this.world.soundWalkers?.() ?? []) {
      if (!this.moving(actor, nowMs)) continue;
      sources.push({ key: `hall:${actor.el.dataset.id ?? actor.x + ':' + actor.y}`, x: actor.x, y: actor.y - 20, cue: 'robostep', interval: .4, gain: .7 });
    }
    const park = this.world.park as typeof this.world.park & AudioRoom & { wet?: boolean; soundZones?(): { kind: ZoneKind; x: number; y: number }[] };
    const visitors: SoundActor[] = park.soundActors?.() ?? [];
    for (const actor of visitors) {
      if (!actor.el.isConnected) continue;
      const sound = actorCue(actor.activity, this.moving(actor, nowMs)); if (!sound) continue;
      sources.push({ key: `park:${actor.el.dataset.id ?? actor.x + ':' + actor.y}`, x: actor.x, y: actor.y - 30, ...sound, gain: .65 });
    }
    const zones = park.soundZones?.() ?? (visitors.length ? [{ kind: 'birds' as const, x: visitors[0].x + 80, y: visitors[0].y - 90 }] : []);
    const sky = this.sky(park.wet === true);
    for (const [index, zone] of zones.entries()) {
      if (zone.kind === 'water') { sources.push({ key: `park-zone:${index}`, x: zone.x, y: zone.y, cue: 'water', interval: .56, gain: .65 }); continue; }
      for (const { voice, interval } of natureFor(zone.kind, sky.part, sky.wet)) sources.push({ key: `park-zone:${index}:${voice}`, x: zone.x, y: zone.y, nature: voice, interval, gain: .85 });
    }
    // Weather is heard over the whole park: rain on the leaves, gusts, distant thunder.
    const middle = zones.find(zone => zone.kind === 'water') ?? zones[0];
    if (middle) {
      if (sky.rain) sources.push({ key: 'weather:rain', x: middle.x, y: middle.y + 60, nature: 'rain', interval: .24, gain: sky.storm ? 1 : .75 });
      if (sky.wind) sources.push({ key: 'weather:wind', x: middle.x - 120, y: middle.y, nature: 'wind', interval: 5.5, gain: .9 });
      if (sky.storm) sources.push({ key: 'weather:thunder', x: middle.x + 200, y: middle.y - 200, nature: 'thunder', interval: 24, gain: 1 });
    }

    const candidates = sources.map(source => ({ source, mix: spatialMix(source.x * cam.s + cam.x, source.y * cam.s + cam.y, cam.s, this.width, this.height) }))
      .map(({ source, mix }) => ({ source, mix: { ...mix, gain: mix.gain * source.gain } })).filter(c => c.mix.gain > .014).sort((a, b) => b.mix.gain - a.mix.gain);
    // A close-up has detail, an overview never turns the whole office into a wall of noise.
    const selected: typeof candidates = []; let music = 0, foreground = 0, nature = 0;
    for (const candidate of candidates) {
      if (candidate.source.music && music >= 2) continue;
      if (candidate.source.nature) { if (nature >= NATURE) continue; nature++; }
      else { if (foreground >= FOREGROUND) continue; foreground++; }
      selected.push(candidate); if (candidate.source.music) music++;
      if (foreground === FOREGROUND && nature === NATURE) break;
    }
    const keep = new Set(selected.map(c => c.source.key));
    for (const key of this.streams.keys()) if (!keep.has(key)) { gameSound.silence(key); this.streams.delete(key); }
    this.audibleKeys = [...keep];
    const now = gameSound.time;
    for (const { source, mix } of selected) { gameSound.position(source.key, mix); this.schedule(source, mix, now); }
  }
  /** The office's visible sky: the daylight the world paints (themes included) and the real weather. */
  private sky(parkWet: boolean) {
    const now = new Date(), hour = now.getHours() + now.getMinutes() / 60;
    const night = parseFloat(this.world.root?.style.getPropertyValue('--outdoor-night') ?? '');
    const weather = this.world.weather;
    const rain = !!weather && (weather.kind === 'rain' || weather.kind === 'drizzle' || weather.kind === 'storm');
    const storm = weather?.kind === 'storm';
    return { part: daypart(hour, Number.isFinite(night) ? night : 0), rain, storm, wet: parkWet || rain || weather?.kind === 'snow', wind: !!weather && (weather.windKmh >= 22 || storm) };
  }
  private moving(actor: SoundActor, now: number) {
    const previous = this.positions.get(actor.el); this.positions.set(actor.el, { x: actor.x, y: actor.y, at: now });
    if (actor.moving !== undefined) return actor.moving;
    if (!previous || now - previous.at > 1000) return false;
    const distance = Math.hypot(actor.x - previous.x, actor.y - previous.y);
    return distance > 1.2 && distance < 180;
  }
  private schedule(source: Source, mix: SoundMix, now: number) {
    const signature = source.music?.name ?? source.nature ?? source.cue ?? '';
    let stream = this.streams.get(source.key);
    if (!stream || stream.signature !== signature) { stream = { signature, next: now + (hash(source.key) % 100) / 1000, step: 0 }; this.streams.set(source.key, stream); }
    // Returning sources start from the present. Hidden or offscreen time never creates a catch-up burst.
    if (stream.next < now - .3) stream.next = now;
    if (source.music) {
      const beat = 60 / Math.min(160, Math.max(55, source.music.bpm)) / 2;
      if (stream.next <= now + .26) {
        gameSound.music(mix, source.music.name, source.music.bpm, hash(source.key), stream.step++, source.music.phone, Math.max(0, stream.next - now), source.key);
        stream.next += beat;
      }
    } else if (source.nature) {
      if (stream.next > now) return;
      // A fresh singer starts partway through its pause, so arriving at the park is not a chorus burst.
      if (stream.step++ === 0) { stream.next = now + (source.interval ?? 1) * ((hash(source.key) % 60) / 100); return; }
      gameSound.phrase(naturePhrase(source.nature), mix, source.key);
      stream.next = now + (source.interval ?? 1) * (.7 + Math.random() * .6);
    } else if (source.cue && source.pulse !== undefined) {
      if (stream.pulse === source.pulse) return;
      stream.pulse = source.pulse; gameSound.emit(source.cue, mix, source.key, true);
    } else if (source.cue && stream.next <= now) {
      gameSound.emit(source.cue, mix, source.key, true);
      stream.next = now + (source.interval ?? 1) * (.88 + (hash(source.key + stream.step++) % 25) / 100);
    }
  }
  destroy = () => {
    if (this.destroyed) return;
    this.destroyed = true; window.clearInterval(this.timer); this.timer = 0;
    this.world.scene.removeEventListener("lucid:desk-key", this.keypress);
    this.resize.disconnect(); this.releaseView(); this.clearStreams();
    document.removeEventListener('visibilitychange', this.visibility); window.removeEventListener('lucid:mobile-view', this.visibility); window.removeEventListener('pagehide', this.destroy);
  };
}
