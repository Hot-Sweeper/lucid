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
 * Rare genres may return during a journey while unheard songs remain preferred
 * within each chapter. This keeps a growing acoustic library from burying them.
 */
export class SoundtrackQueue {
  private played = new Set<string>();
  private last: string | null = null;
  private selectedMode: SoundtrackMode = 'journey';
  private chapterIndex = 0;
  private listened = 0;
  private chapterHeard = false;
  private started = false;

  constructor(private songs: readonly SoundtrackSong[], saved?: Partial<SoundtrackHistory> | null, private random = Math.random) {
    const ids = new Set(songs.map(song => song.id));
    if (Array.isArray(saved?.played)) for (const id of saved.played) if (ids.has(id)) this.played.add(id);
    if (typeof saved?.last === 'string' && ids.has(saved.last)) this.last = saved.last;
    if (validMode(saved?.mode)) this.selectedMode = saved.mode;
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
      listened: this.listened, chapterHeard: this.chapterHeard, started: this.started };
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

  /** A deliberate library choice is one song, without changing music direction. */
  select(id: string, date = new Date()): SoundtrackSong | null {
    const song = this.songs.find(value => value.id === id);
    if (!song) return null;
    if (!this.started) {
      this.chapterIndex = openingChapter(date);
      this.started = true;
    }
    if (this.played.size === this.songs.length) this.played.clear();
    this.played.add(song.id); this.last = song.id;
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
      pool = this.songs.filter(song => songMatchesMode(song, this.mode));
      if (!pool.length) throw Error(`There are no ${this.mode} songs in this soundtrack.`);
    } else {
      const chapter = this.chapter;
      const safe = this.songs.filter(song => !previous || song.energy - previous.energy <= .30 && previous.energy - song.energy <= .35);
      const primary = this.songs.filter(song => song.genre === chapter.genres[0]);
      const target = primary.length ? primary : this.songs.filter(song => chapter.genres.includes(song.genre));
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
      if (!pool.length) pool = this.songs;
    }
    if (pool.length > 1) pool = pool.filter(song => song.id !== this.last);
    // Prefer unheard songs without starving a one-song genre for an entire bag.
    const fresh = pool.filter(song => !this.played.has(song.id));
    if (fresh.length) pool = fresh;
    const period = soundtrackPeriod(date);
    const weight = (song: SoundtrackSong) => {
      const time = song.period === period ? 1.6 : 1;
      const energy = this.mode === 'journey' ? 1 / (1 + Math.abs(song.energy - this.chapter.energy) * 5) : 1;
      const continuity = this.mode === 'journey' && previous ? songAffinity(previous, song) : 1;
      return time * energy * continuity;
    };
    let pick = Math.min(1 - Number.EPSILON, Math.max(0, this.random())) * pool.reduce((sum, song) => sum + weight(song), 0);
    const song = pool.find(value => { pick -= weight(value); return pick < 0; }) ?? pool[pool.length - 1];
    this.played.add(song.id); this.last = song.id;
    if (this.mode === 'journey' && song.genre === this.chapter.genres[0]) this.chapterHeard = true;
    // A custom library with no primary genre must not get stuck in one chapter.
    if (this.mode === 'journey' && !this.songs.some(value => value.genre === this.chapter.genres[0])) this.chapterHeard = true;
    return song;
  }
}
