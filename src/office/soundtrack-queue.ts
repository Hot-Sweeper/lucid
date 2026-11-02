export type DayPeriod = 'morning' | 'day' | 'evening' | 'night';
export type SoundtrackSong = { id: string; title: string; url: string; period: DayPeriod; bpm: number };
export type SoundtrackHistory = { played: string[]; last: string | null };

export function soundtrackPeriod(date = new Date()): DayPeriod {
  const hour = date.getHours();
  return hour >= 6 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'day' : hour >= 17 && hour < 22 ? 'evening' : 'night';
}

/** A persistent shuffle bag: hear the whole score before repeating a piece.
 * Time of day changes the odds of the next selection, never interrupts a song.
 */
export class SoundtrackQueue {
  private played = new Set<string>();
  private last: string | null = null;
  constructor(private songs: readonly SoundtrackSong[], saved?: Partial<SoundtrackHistory>, private random = Math.random) {
    const ids = new Set(songs.map(song => song.id));
    if (Array.isArray(saved?.played)) for (const id of saved.played) if (ids.has(id)) this.played.add(id);
    if (typeof saved?.last === 'string' && ids.has(saved.last)) this.last = saved.last;
  }
  get state(): SoundtrackHistory { return { played: [...this.played], last: this.last }; }
  next(date = new Date()): SoundtrackSong {
    if (!this.songs.length) throw Error('The office soundtrack is empty.');
    let available = this.songs.filter(song => !this.played.has(song.id));
    if (!available.length) { this.played.clear(); available = [...this.songs]; }
    if (available.length > 1) available = available.filter(song => song.id !== this.last);
    const periods: DayPeriod[] = ['morning', 'day', 'evening', 'night'];
    const period = soundtrackPeriod(date), index = periods.indexOf(period);
    const weight = (song: SoundtrackSong) => {
      const distance = (periods.indexOf(song.period) + 4 - index) % 4;
      return distance === 0 ? 4 : distance === 1 || distance === 3 ? 1.4 : .6;
    };
    let pick = Math.min(1 - Number.EPSILON, Math.max(0, this.random())) * available.reduce((sum, song) => sum + weight(song), 0);
    const song = available.find(song => { pick -= weight(song); return pick < 0; }) ?? available[available.length - 1];
    this.played.add(song.id); this.last = song.id;
    return song;
  }
}
