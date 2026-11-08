export type DayPeriod = 'morning' | 'day' | 'evening' | 'night';
export type SoundtrackGenre = 'acoustic' | 'lofi' | 'synthwave' | 'ambient' | 'breakcore' | 'phonk' | 'mystical' | 'medieval' | 'noir' | 'nostalgic';
export type SoundtrackMode = 'journey' | 'pads' | 'bells' | SoundtrackGenre;
export type SoundtrackSong = {
  id: string; title: string; url: string; period: DayPeriod; bpm: number;
  genre: SoundtrackGenre; energy: number; seconds: number;
  key: number; mode: string; meter: number; textures: readonly string[]; gainDb?: number;
};
export type SoundtrackChapter = {
  id: string; title: string; genres: readonly SoundtrackGenre[]; energy: number; seconds: number;
};
export const SOUNDTRACK_CHAPTERS: readonly SoundtrackChapter[] = [
  { id: 'still-water', title: 'Still water', genres: ['ambient', 'acoustic'], energy: .16, seconds: 300 },
  { id: 'observatory', title: 'Glass observatory', genres: ['mystical', 'ambient'], energy: .22, seconds: 240 },
  { id: 'briar-path', title: 'Briar lanterns', genres: ['medieval', 'mystical'], energy: .34, seconds: 210 },
  { id: 'old-postcards', title: 'Old postcards', genres: ['nostalgic', 'acoustic'], energy: .27, seconds: 240 },
  { id: 'warm-tape', title: 'Warm tape', genres: ['lofi', 'acoustic'], energy: .30, seconds: 300 },
  { id: 'copper-casebook', title: 'Copper casebook', genres: ['noir', 'nostalgic'], energy: .43, seconds: 240 },
  { id: 'night-drive', title: 'Night drive', genres: ['phonk', 'lofi'], energy: .50, seconds: 180 },
  { id: 'neon-rise', title: 'Neon rise', genres: ['synthwave', 'phonk'], energy: .66, seconds: 180 },
  { id: 'petal-rush', title: 'Petal rush', genres: ['breakcore', 'synthwave'], energy: .82, seconds: 120 },
  { id: 'afterglow', title: 'Afterglow', genres: ['synthwave', 'phonk'], energy: .53, seconds: 180 },
  { id: 'soft-landing', title: 'Soft landing', genres: ['acoustic', 'lofi', 'ambient'], energy: .28, seconds: 300 },
];
export type SoundtrackHistory = {
  played: string[]; last: string | null; mode: SoundtrackMode;
  chapter: string; listened: number; chapterHeard: boolean; started: boolean;
  modePlayed?: Partial<Record<SoundtrackMode, string[]>>; recent?: string[];
};
const GENRES: readonly SoundtrackGenre[] = ['acoustic', 'lofi', 'synthwave', 'ambient', 'breakcore', 'phonk', 'mystical', 'medieval', 'noir', 'nostalgic'];
const validMode = (mode: unknown): mode is SoundtrackMode => mode === 'journey' || mode === 'pads' || mode === 'bells' || GENRES.includes(mode as SoundtrackGenre);

export function songMatchesMode(song: SoundtrackSong, mode: SoundtrackMode): boolean {
  if (mode === 'journey') return true;
  if (mode === 'pads') return song.textures.includes('pads') && song.energy <= .35;
  if (mode === 'bells') return song.textures.includes('bells') && song.energy <= .50;
  return song.genre === mode;
}

/** Compare the related major scales, including the authored modal pieces. */
const relativeMajorKey = (song: SoundtrackSong) => (song.key + (song.mode === 'minor' ? 3 : song.mode === 'dorian' ? 10 : song.mode === 'lydian' ? 7 : 0)) % 12;
export function harmonicDistance(a: SoundtrackSong, b: SoundtrackSong): number {
  const fifths = ((relativeMajorKey(a) - relativeMajorKey(b) + 12) * 7) % 12;
  return Math.min(fifths, 12 - fifths);
}
/** Musical continuity is a selection preference, never pitch shifting or beat mixing. */
export function songAffinity(previous: SoundtrackSong, song: SoundtrackSong): number {
  const distance = harmonicDistance(previous, song);
  const key = distance === 0 ? 1.45 : distance === 1 ? 1.25 : distance === 2 ? 1.1 : distance < 5 ? .9 : .65;
  // Breakcore at 164 can sit naturally beside a half-time 82 BPM track.
  const tempi = [song.bpm / 2, song.bpm, song.bpm * 2];
  const tempoGap = Math.min(...tempi.map(bpm => Math.abs(Math.log2(bpm / previous.bpm))));
  const texture = song.textures.some(value => previous.textures.includes(value)) ? 1.15 : 1;
  return key * texture / (1 + tempoGap * 1.8);
}

const openingChapter = (date: Date) => {
  const period = soundtrackPeriod(date);
  const id = period === 'night' ? 'still-water' : period === 'evening' ? 'night-drive' : 'warm-tape';
  return SOUNDTRACK_CHAPTERS.findIndex(chapter => chapter.id === id);
};

export function soundtrackPeriod(date = new Date()): DayPeriod {
  const hour = date.getHours();
  return hour >= 6 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'day' : hour >= 17 && hour < 22 ? 'evening' : 'night';
}

/** A listening-time music director. Chapters turn only between complete songs.
 * The whole-library rotation takes priority over a chapter's genre preference.
 * Genre/texture locks own separate rotations, retained across mode changes.
 */
export class SoundtrackQueue {
  private played = new Set<string>();
  private modePlayed = new Map<SoundtrackMode, Set<string>>();
  private recent: string[] = [];
  private last: string | null = null;
  private selectedMode: SoundtrackMode = 'journey';
  private chapterIndex = 0;
  private listened = 0;
  private chapterHeard = false;
  private started = false;

  constructor(private songs: readonly SoundtrackSong[], saved?: Partial<SoundtrackHistory> | null, private random = Math.random) {
    const ids = new Set(songs.map(song => song.id));
    if (Array.isArray(saved?.played)) for (const id of saved.played) if (ids.has(id)) this.played.add(id);
    if (saved?.modePlayed && typeof saved.modePlayed === 'object') {
      for (const [mode, heard] of Object.entries(saved.modePlayed)) {
        if (!validMode(mode) || mode === 'journey' || !Array.isArray(heard)) continue;
        this.modePlayed.set(mode, new Set(heard.filter(id => ids.has(id) && songMatchesMode(songs.find(song => song.id === id)!, mode))));
      }
    }
    if (Array.isArray(saved?.recent)) this.recent = saved.recent.filter(id => ids.has(id)).slice(-24);
    if (typeof saved?.last === 'string' && ids.has(saved.last)) this.last = saved.last;
    if (validMode(saved?.mode)) this.selectedMode = saved.mode;
    const current = songs.find(song => song.id === this.last);
    if (current) this.creditLocks(current, false);
    const chapter = SOUNDTRACK_CHAPTERS.findIndex(value => value.id === saved?.chapter);
    if (chapter >= 0) {
      this.chapterIndex = chapter;
      this.listened = typeof saved?.listened === 'number' && Number.isFinite(saved.listened) ? Math.min(3600, Math.max(0, saved.listened)) : 0;
      this.chapterHeard = saved?.chapterHeard === true;
      this.started = saved?.started === true;
    }
  }

  get mode() { return this.selectedMode; }
  get chapter() { return SOUNDTRACK_CHAPTERS[this.chapterIndex]; }
  get chapterProgress() { return Math.min(1, this.listened / this.chapter.seconds); }
  get state(): SoundtrackHistory {
    return { played: [...this.played], last: this.last, mode: this.mode, chapter: this.chapter.id,
      listened: this.listened, chapterHeard: this.chapterHeard, started: this.started,
      modePlayed: Object.fromEntries([...this.modePlayed].map(([mode, heard]) => [mode, [...heard]])), recent: [...this.recent] };
  }
  setMode(mode: unknown): boolean {
    if (!validMode(mode)) return false;
    this.selectedMode = mode;
    return true;
  }
  /** The audio owner reports actual, seek-filtered playback deltas, never a timer. */
  listen(seconds: number) {
    if (this.mode === 'journey' && this.started && Number.isFinite(seconds) && seconds > 0) {
      this.listened = Math.min(3600, this.listened + seconds);
    }
  }

  private rotation(mode: SoundtrackMode, songs: readonly SoundtrackSong[]) {
    if (mode === 'journey') return this.played;
    let heard = this.modePlayed.get(mode);
    if (!heard) {
      // Legacy history still counts, including when the expanded library adds
      // more songs to a formerly single-recording genre.
      heard = new Set(songs.filter(song => this.played.has(song.id)).map(song => song.id));
      this.modePlayed.set(mode, heard);
    }
    return heard;
  }

  private remember(song: SoundtrackSong) {
    this.played.add(song.id); this.last = song.id;
    this.recent.push(song.id); this.recent = this.recent.slice(-24);
    if (this.mode !== 'journey' && songMatchesMode(song, this.mode)) {
      this.rotation(this.mode, this.songs.filter(value => songMatchesMode(value, this.mode)));
    }
    this.creditLocks(song);
  }

  private creditLocks(song: SoundtrackSong, newlySelected = true) {
    // An ambient bell heard in another direction is still heard. Otherwise an
    // overlapping lock can retain it as its sole "unheard" song and replay it.
    for (const [mode, heard] of this.modePlayed) if (songMatchesMode(song, mode)) {
      // A manual or overlapping choice can be the first song of a new pass.
      // Restoring the current song only reconciles credit; it is not a replay.
      if (newlySelected && this.songs.filter(value => songMatchesMode(value, mode)).every(value => heard.has(value.id))) heard.clear();
      heard.add(song.id);
    }
  }

  /** Keep the remaining energy route connected before spending its last bridge. */
  private canContinue(song: SoundtrackSong, remaining: readonly SoundtrackSong[], memo: Map<string, boolean>, budget: { left: number }): boolean {
    const rest = remaining.filter(value => value.id !== song.id).sort((a, b) => a.energy - b.energy);
    if (!rest.length) return true;
    const key = song.energy + '|' + rest.map(value => value.energy).join(',');
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (--budget.left < 0) return false;
    if (rest.some((value, index) => index > 0 && value.energy - rest[index - 1].energy > .35001)) return false;
    const reached = new Set<string>();
    let frontier = [song];
    while (frontier.length) {
      const next = rest.filter(value => !reached.has(value.id) && frontier.some(from => value.energy - from.energy <= .30001 && from.energy - value.energy <= .35001));
      next.forEach(value => reached.add(value.id)); frontier = next;
    }
    if (reached.size !== rest.length) { memo.set(key, false); return false; }
    // Find a complete route, including the way back from an energetic peak.
    // Equivalent energy values share a branch. A fixed work budget bounds this
    // preference; the unheard rotation remains authoritative if it runs out.
    const choices = rest.filter((value, index) => (index === 0 || value.energy !== rest[index - 1].energy)
      && value.energy - song.energy <= .30001 && song.energy - value.energy <= .35001);
    const degree = (from: SoundtrackSong) => rest.filter(value => value.id !== from.id && value.energy - from.energy <= .30001 && from.energy - value.energy <= .35001).length;
    choices.sort((a, b) => degree(a) - degree(b) || Math.abs(a.energy - song.energy) - Math.abs(b.energy - song.energy));
    const possible = choices.some(value => this.canContinue(value, rest, memo, budget));
    memo.set(key, possible);
    return possible;
  }

  /** A deliberate library choice is one song, without changing music direction. */
  select(id: string, date = new Date()): SoundtrackSong | null {
    const song = this.songs.find(value => value.id === id);
    if (!song) return null;
    if (!this.started) {
      this.chapterIndex = openingChapter(date);
      this.started = true;
    }
    if (this.played.size === this.songs.length) this.played.clear();
    this.remember(song);
    if (this.mode === 'journey' && song.genre === this.chapter.genres[0]) this.chapterHeard = true;
    return song;
  }

  next(date = new Date()): SoundtrackSong {
    if (!this.songs.length) throw Error('The office soundtrack is empty.');
    if (!this.started) {
      // Time of day chooses the opening only. An office left open overnight
      // continues its musical arc rather than jumping to a wall-clock preset.
      this.chapterIndex = openingChapter(date);
      this.started = true;
    } else if (this.mode === 'journey' && this.listened >= this.chapter.seconds && this.chapterHeard) {
      this.chapterIndex = (this.chapterIndex + 1) % SOUNDTRACK_CHAPTERS.length;
      this.listened = 0;
      this.chapterHeard = false;
    }
    if (this.played.size === this.songs.length) this.played.clear();
    const previous = this.songs.find(song => song.id === this.last);
    let pool: readonly SoundtrackSong[];
    if (this.mode !== 'journey') {
      const matches = this.songs.filter(song => songMatchesMode(song, this.mode));
      if (!matches.length) throw Error(`There are no ${this.mode} songs in this soundtrack.`);
      const heard = this.rotation(this.mode, matches);
      if (matches.every(song => heard.has(song.id))) heard.clear();
      pool = matches.filter(song => !heard.has(song.id));
    } else {
      const chapter = this.chapter;
      const unheard = this.songs.filter(song => !this.played.has(song.id));
      const fits = (song: SoundtrackSong) => !previous || song.energy - previous.energy <= .30001 && previous.energy - song.energy <= .35001;
      let safe = unheard.filter(fits);
      const memo = new Map<string, boolean>(), budget = { left: 4000 };
      const connected = safe.filter(song => this.canContinue(song, unheard, memo, budget));
      if (connected.length) safe = connected;
      // A legacy/custom rotation can have spent all its bridge songs. Complete
      // the remaining recordings with the nearest energy instead of replaying
      // familiar music or discarding the saved bag.
      if (!safe.length) {
        const nearest = Math.min(...unheard.map(song => Math.abs(song.energy - (previous?.energy ?? song.energy))));
        safe = unheard.filter(song => Math.abs(song.energy - (previous?.energy ?? song.energy)) <= nearest + .00001);
      }
      const primary = unheard.filter(song => song.genre === chapter.genres[0]);
      const target = primary.length ? primary : unheard.filter(song => chapter.genres.includes(song.genre));
      // A chapter whose defining recordings were already heard this rotation
      // yields to other unheard music instead of repeatedly replaying them.
      if (!primary.length) this.chapterHeard = true;
      // Give each chapter its defining genre before moving on. If it is too far
      // from the outgoing energy, use a real neighboring song as a bridge first.
      const direct = target.filter(song => safe.includes(song) && (song.id !== this.last || this.songs.length === 1) && (!previous || harmonicDistance(previous, song) < 5));
      if (!this.chapterHeard && direct.length) pool = direct;
      else if (!this.chapterHeard && target.length && safe.length) {
        // A bridge must actually lead to a defining song on the next boundary.
        // An arbitrary calm-energy cap can trap a return from a quiet lock
        // below the synthwave step needed to reach the breakcore chapter.
        const harmonicBridges = safe.filter(song => song.id !== this.last && previous && harmonicDistance(previous, song) < 5 && target.some(next => harmonicDistance(song, next) < 5 && next.energy - song.energy <= .30 && song.energy - next.energy <= .35));
        const energyReady = target.filter(song => safe.includes(song) && song.id !== this.last);
        const energyGap = (song: SoundtrackSong) => Math.min(...target.map(next => Math.abs(next.energy - song.energy)));
        const toward = safe.filter(song => song.id !== this.last && (!previous || energyGap(song) < energyGap(previous)));
        const neighbors = safe.filter(song => song.id !== this.last);
        pool = harmonicBridges.length ? harmonicBridges : energyReady.length ? energyReady : toward.length ? toward : neighbors.length ? neighbors : safe;
      } else {
        const matches = safe.filter(song => chapter.genres.includes(song.genre));
        pool = matches.length ? matches : safe.length ? safe : this.songs;
      }
      // A small/custom catalogue can lack bridge songs; still remain usable.
      if (!pool.length) pool = unheard;
    }
    if (pool.length > 1) pool = pool.filter(song => song.id !== this.last);
    // At a completed rotation, leave recent recordings until later in the next
    // pass. Never throw away an unheard song to satisfy this soft preference.
    const lessRecent = pool.filter(song => !this.recent.includes(song.id));
    if (lessRecent.length) pool = lessRecent;
    const period = soundtrackPeriod(date);
    const weight = (song: SoundtrackSong) => {
      const time = song.period === period ? 1.6 : 1;
      const energy = this.mode === 'journey' ? 1 / (1 + Math.abs(song.energy - this.chapter.energy) * 5) : 1;
      const continuity = this.mode === 'journey' && previous ? songAffinity(previous, song) : 1;
      return time * energy * continuity;
    };
    let pick = Math.min(1 - Number.EPSILON, Math.max(0, this.random())) * pool.reduce((sum, song) => sum + weight(song), 0);
    const song = pool.find(value => { pick -= weight(value); return pick < 0; }) ?? pool[pool.length - 1];
    this.remember(song);
    if (this.mode === 'journey' && song.genre === this.chapter.genres[0]) this.chapterHeard = true;
    // A custom library with no primary genre must not get stuck in one chapter.
    if (this.mode === 'journey' && !this.songs.some(value => value.genre === this.chapter.genres[0])) this.chapterHeard = true;
    return song;
  }
}
