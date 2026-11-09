export type DayPeriod = 'morning' | 'day' | 'evening' | 'night';
export type SoundtrackGenre = 'acoustic' | 'lofi' | 'jazz' | 'ambient' | 'synthwave' | 'phonk' | 'breakcore';
export type SoundtrackMode = 'journey' | 'pads' | 'bells' | SoundtrackGenre;
export type SoundtrackSong = {
  id: string; title: string; url: string; period: DayPeriod; bpm: number;
  genre: SoundtrackGenre; energy: number; seconds: number;
  key: number; mode: string; meter: number; textures: readonly string[]; gainDb?: number;
};
export type SoundtrackChapter = {
  id: string; title: string; genres: readonly SoundtrackGenre[]; energy: number; seconds: number;
};
/** A gradual arc: calm instrumentals, warm tape and cafe jazz, a night drive
 * into synthwave and a breakcore peak, then the same way back down. */
export const SOUNDTRACK_CHAPTERS: readonly SoundtrackChapter[] = [
  { id: 'still-water', title: 'Still water', genres: ['ambient', 'acoustic'], energy: .15, seconds: 300 },
  { id: 'morning-light', title: 'Morning light', genres: ['acoustic', 'lofi', 'ambient'], energy: .26, seconds: 240 },
  { id: 'warm-tape', title: 'Warm tape', genres: ['lofi', 'jazz', 'acoustic'], energy: .31, seconds: 300 },
  { id: 'late-cafe', title: 'Late cafe', genres: ['jazz', 'lofi'], energy: .37, seconds: 240 },
  { id: 'night-drive', title: 'Night drive', genres: ['phonk', 'jazz', 'lofi'], energy: .52, seconds: 240 },
  { id: 'neon-rise', title: 'Neon rise', genres: ['synthwave', 'phonk'], energy: .64, seconds: 210 },
  { id: 'petal-rush', title: 'Petal rush', genres: ['breakcore', 'synthwave'], energy: .8, seconds: 150 },
  { id: 'afterglow', title: 'Afterglow', genres: ['synthwave', 'phonk'], energy: .6, seconds: 180 },
  { id: 'lunar-drift', title: 'Lunar drift', genres: ['phonk', 'lofi'], energy: .48, seconds: 180 },
  { id: 'soft-landing', title: 'Soft landing', genres: ['lofi', 'jazz', 'ambient', 'acoustic'], energy: .28, seconds: 300 },
];
/** Genres that can follow each other directly, like a DJ moving between crates.
 * A song always connects to its own genre. Breakcore is only entered and left
 * through synthwave or phonk, so calm music never jumps straight to the peak. */
export const GENRE_NEIGHBORS: Readonly<Record<SoundtrackGenre, readonly SoundtrackGenre[]>> = {
  acoustic: ['ambient', 'lofi', 'jazz'],
  ambient: ['acoustic', 'lofi', 'jazz'],
  lofi: ['acoustic', 'ambient', 'jazz', 'phonk'],
  jazz: ['acoustic', 'ambient', 'lofi', 'phonk'],
  phonk: ['lofi', 'jazz', 'synthwave', 'breakcore'],
  synthwave: ['phonk', 'breakcore'],
  breakcore: ['synthwave', 'phonk'],
};
/** Largest energy change between consecutive automatic songs. */
export const MAX_ENERGY_STEP = .2;
export function genresConnect(a: SoundtrackGenre, b: SoundtrackGenre): boolean {
  return a === b || (GENRE_NEIGHBORS[a]?.includes(b) ?? false);
}
/** An automatic transition a listener will not hear as a jarring jump. */
export function transitionFits(previous: SoundtrackSong, song: SoundtrackSong): boolean {
  return genresConnect(previous.genre, song.genre) && Math.abs(song.energy - previous.energy) <= MAX_ENERGY_STEP + 1e-5;
}
export type SoundtrackHistory = {
  played: string[]; last: string | null; mode: SoundtrackMode;
  chapter: string; listened: number; chapterHeard: boolean; started: boolean;
  modePlayed?: Partial<Record<SoundtrackMode, string[]>>; recent?: string[];
};
const GENRES: readonly SoundtrackGenre[] = ['acoustic', 'lofi', 'jazz', 'ambient', 'synthwave', 'phonk', 'breakcore'];
const validMode = (mode: unknown): mode is SoundtrackMode => mode === 'journey' || mode === 'pads' || mode === 'bells' || GENRES.includes(mode as SoundtrackGenre);

export function songMatchesMode(song: SoundtrackSong, mode: SoundtrackMode): boolean {
  if (mode === 'journey') return true;
  if (mode === 'pads') return song.textures.includes('pads') && song.energy <= .35;
  if (mode === 'bells') return song.textures.includes('bells') && song.energy <= .50;
  return song.genre === mode;
}

/** Compare the related major scales, including the authored modal pieces. */
const MODE_TO_MAJOR: Record<string, number> = { minor: 3, dorian: 10, phrygian: 8, lydian: 7, mixolydian: 5 };
const relativeMajorKey = (song: SoundtrackSong) => (song.key + (MODE_TO_MAJOR[song.mode] ?? 0)) % 12;
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
  const id = period === 'night' ? 'still-water' : period === 'morning' ? 'morning-light' : period === 'evening' ? 'late-cafe' : 'warm-tape';
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
    // A saved genre the library no longer offers falls back to the journey.
    if (validMode(saved?.mode) && this.playable(saved.mode)) this.selectedMode = saved.mode;
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
  private playable(mode: SoundtrackMode) {
    return mode === 'journey' || this.songs.some(song => songMatchesMode(song, mode));
  }
  setMode(mode: unknown): boolean {
    if (!validMode(mode) || !this.playable(mode)) return false;
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

  /** For each unheard song: can the rest of the bag still be played through
   * fitting transitions if it plays now? A bounded depth-first search over a
   * precomputed transition matrix tries the hardest songs first (Warnsdorff).
   * If the budget runs out the answer is "no" and the caller relaxes it. */
  private routePlanner(unheard: readonly SoundtrackSong[]) {
    const n = unheard.length;
    const adj = unheard.map(a => unheard.map(b => a !== b && transitionFits(a, b)));
    // Songs with equal genre and energy are interchangeable for routing.
    const sign = unheard.map(song => song.genre + ':' + song.energy);
    const memo = new Map<string, boolean>(), budget = { left: 4000 };
    const search = (current: number, rest: number[]): boolean => {
      if (!rest.length) return true;
      const key = sign[current] + '|' + rest.map(i => sign[i]).sort().join(',');
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      if (--budget.left < 0) return false;
      const seen = new Uint8Array(n), stack = [current];
      let count = 0;
      while (stack.length) {
        const from = stack.pop()!;
        for (const to of rest) if (!seen[to] && adj[from][to]) { seen[to] = 1; count++; stack.push(to); }
      }
      if (count !== rest.length) { memo.set(key, false); return false; }
      const used = new Set<string>();
      const choices = rest.filter(i => adj[current][i] && !used.has(sign[i]) && !!used.add(sign[i]));
      const degree = (from: number) => rest.reduce((sum, to) => sum + (adj[from][to] ? 1 : 0), 0);
      choices.sort((x, y) => degree(x) - degree(y) || Math.abs(unheard[x].energy - unheard[current].energy) - Math.abs(unheard[y].energy - unheard[current].energy));
      const possible = choices.some(next => search(next, rest.filter(i => i !== next)));
      memo.set(key, possible);
      return possible;
    };
    return (song: SoundtrackSong) => {
      const index = unheard.indexOf(song);
      return index < 0 || search(index, unheard.map((_, i) => i).filter(i => i !== index));
    };
  }

  /** Fewest fitting transitions from each song to any song in `targets`. */
  private routeDistance(targets: readonly SoundtrackSong[]) {
    const distance = new Map<string, number>(targets.map(song => [song.id, 0]));
    let frontier = [...targets];
    for (let step = 1; frontier.length; step++) {
      const next = this.songs.filter(song => !distance.has(song.id) && frontier.some(to => transitionFits(song, to)));
      for (const song of next) distance.set(song.id, step);
      frontier = next;
    }
    return (song: SoundtrackSong) => distance.get(song.id) ?? Infinity;
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
      const fits = (song: SoundtrackSong) => !previous || transitionFits(previous, song);
      let safe = unheard.filter(fits);
      const plannable = this.routePlanner(unheard);
      const connected = safe.filter(plannable);
      if (connected.length) safe = connected;
      if (!safe.length && previous) {
        // Only distant songs remain unheard. Walk toward them through fitting
        // songs (a short reprise) instead of jumping across genres or energy.
        const toUnheard = this.routeDistance(unheard);
        const here = toUnheard(previous);
        const bridges = this.songs.filter(song => song.id !== this.last && transitionFits(previous, song) && toUnheard(song) < here);
        const fresh = bridges.filter(song => !this.recent.includes(song.id));
        const usable = fresh.length ? fresh : bridges;
        if (usable.length) {
          const best = Math.min(...usable.map(toUnheard));
          pool = usable.filter(song => toUnheard(song) === best);
          return this.finish(pool, previous, date);
        }
        // A disconnected custom catalogue: finish its songs at the nearest energy.
        const nearest = Math.min(...unheard.map(song => Math.abs(song.energy - previous.energy)));
        safe = unheard.filter(song => Math.abs(song.energy - previous.energy) <= nearest + .00001);
      }
      if (!safe.length) safe = unheard;
      const primary = unheard.filter(song => song.genre === chapter.genres[0]);
      const target = primary.length ? primary : unheard.filter(song => chapter.genres.includes(song.genre));
      // A chapter whose defining recordings were already heard this rotation
      // yields to other unheard music instead of repeatedly replaying them.
      if (!primary.length) this.chapterHeard = true;
      const direct = target.filter(song => safe.includes(song) && (song.id !== this.last || this.songs.length === 1));
      const harmonic = direct.filter(song => !previous || harmonicDistance(previous, song) < 5);
      if (!this.chapterHeard && direct.length) pool = harmonic.length ? harmonic : direct;
      else if (!this.chapterHeard && target.length) {
        // Move toward the chapter's defining genre one fitting step at a time.
        const toTarget = this.routeDistance(target);
        const candidates = safe.filter(song => song.id !== this.last);
        const closer = candidates.filter(song => !previous || toTarget(song) < toTarget(previous));
        const options = closer.length ? closer : candidates.length ? candidates : safe;
        const best = Math.min(...options.map(toTarget));
        pool = options.filter(song => toTarget(song) === best);
      } else {
        const matches = safe.filter(song => chapter.genres.includes(song.genre));
        pool = matches.length ? matches : safe;
      }
    }
    return this.finish(pool, previous, date);
  }

  private finish(candidates: readonly SoundtrackSong[], previous: SoundtrackSong | undefined, date: Date): SoundtrackSong {
    let pool = candidates;
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
