import { gameSound, type MusicState } from './sound';
import { SOUNDTRACK } from './soundtrack';
import type { SoundtrackGenre, SoundtrackSong } from './soundtrack-queue';
import { mountMusicControls } from './music-controls';
import { getLocale, onLocaleChange } from '../localization';
import './song-library.css';

type GenreFilter = 'all' | SoundtrackGenre;
const allGenres: [GenreFilter, string, string][] = [
  ['all', 'All genres', 'Alle Genres'],
  ['acoustic', 'Cozy instrumentals', 'Gemütliche Instrumentals'],
  ['ambient', 'Ambient', 'Ambient'],
  ['lofi', 'Chill lo-fi', 'Chill Lo-Fi'],
  ['jazz', 'Jazz', 'Jazz'],
  ['phonk', 'Lunar phonk', 'Lunar Phonk'],
  ['synthwave', 'Synthwave', 'Synthwave'],
  ['breakcore', 'Breakcore / DnB', 'Breakcore / DnB'],
];
// Filters list only genres present in the catalogue, so none leads nowhere.
const genres = allGenres.filter(([id]) => id === 'all' || SOUNDTRACK.some(song => song.genre === id));
const genreName = (genre: SoundtrackGenre, de: boolean) => allGenres.find(([id]) => id === genre)?.[de ? 2 : 1] ?? genre;
const textureWords: Record<string, [string, string]> = { pads: ['pads', 'Flächen'], bells: ['bells', 'Glocken'], strings: ['strings', 'Streicher'], piano: ['piano', 'Klavier'], plucked: ['plucked strings', 'Zupfsaiten'], reeds: ['woodwinds', 'Holzbläser'], drums: ['drums', 'Schlagzeug'], breaks: ['breaks', 'Breaks'], bass: ['bass', 'Bass'], mallets: ['mallets', 'Mallets'], synth: ['synth', 'Synth'], cowbell: ['cowbell', 'Cowbell'] };
const textureText = (song: SoundtrackSong, de: boolean) => song.textures.map(value => textureWords[value]?.[de ? 1 : 0] ?? '').filter(Boolean).join(', ');
const duration = (seconds: number) => {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
};
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
// Moving between apps should not discard the listener's browsing place.
let retained: { query: string; genre: GenreFilter; scroll: number; controlsOpen: boolean } = {
  query: '', genre: 'all', scroll: 0, controlsOpen: false,
};

/** A real catalog browser using the office's one audio owner, never a demo player. */
export function mountSongLibrary(parent: HTMLElement): () => void {
  const section = document.createElement('section'); section.className = 'song-library';
  const player = document.createElement('details'); player.className = 'sl-player'; player.open = retained.controlsOpen;
  const summary = document.createElement('summary');
  const controlsLabel = document.createElement('span'), currentTitle = document.createElement('span');
  currentTitle.className = 'sl-current-title'; summary.append(controlsLabel, currentTitle);
  const controlHost = document.createElement('div'); controlHost.className = 'sl-controls';
  player.append(summary, controlHost);
  const filters = document.createElement('div'); filters.className = 'sl-filters';
  const searchLabel = document.createElement('label'); searchLabel.className = 'sl-search';
  const searchCaption = document.createElement('span');
  const search = document.createElement('input'); search.type = 'search'; search.maxLength = 120; search.value = retained.query;
  searchLabel.append(searchCaption, search);
  const genreLabel = document.createElement('label'); genreLabel.className = 'sl-genre';
  const genreCaption = document.createElement('span');
  const filter = document.createElement('select');
  for (const [value] of genres) { const option = document.createElement('option'); option.value = value; filter.append(option); }
  filter.value = genres.some(([id]) => id === retained.genre) ? retained.genre : 'all'; genreLabel.append(genreCaption, filter);
  filters.append(searchLabel, genreLabel);
  const count = document.createElement('p'); count.className = 'sl-result-count'; count.setAttribute('role', 'status');
  const note = document.createElement('p'); note.className = 'sl-playback-note'; note.setAttribute('role', 'status');
  const tracks = document.createElement('ul'); tracks.className = 'sl-tracks'; tracks.tabIndex = 0;
  const empty = document.createElement('li'); empty.className = 'sl-empty';
  const emptyTitle = document.createElement('b'), emptyHint = document.createElement('span'); empty.append(emptyTitle, emptyHint);
  section.append(player, filters, count, note, tracks); parent.append(section);
  const releaseControls = mountMusicControls(controlHost);
  let state = gameSound.musicState;
  const rowParts = new Map<string, { row: HTMLLIElement; button: HTMLButtonElement; genre: HTMLElement; action: HTMLElement; song: SoundtrackSong }>();
  const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
  for (const song of SOUNDTRACK) {
    const row = document.createElement('li'); row.className = 'sl-track';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'sl-track-action'; button.dataset.songId = song.id;
    const info = document.createElement('span'); info.className = 'sl-track-info';
    const title = document.createElement('b'); title.textContent = song.title;
    const genre = document.createElement('span'); genre.className = 'sl-track-genre';
    info.append(title, genre);
    const time = document.createElement('span'); time.className = 'sl-duration'; time.textContent = duration(song.seconds);
    const action = document.createElement('span'); action.className = 'sl-action-label'; action.setAttribute('aria-hidden', 'true');
    button.append(info, time, action); row.append(button); tracks.append(row);
    button.addEventListener('click', () => {
      if (gameSound.musicState.song?.id === song.id && gameSound.musicState.status === 'loading') return;
      if (gameSound.musicState.song?.id === song.id && gameSound.musicState.status === 'playing') gameSound.pauseTheme(true);
      else if (gameSound.musicState.song?.id === song.id && gameSound.musicState.status === 'error') gameSound.retryTheme();
      else gameSound.playTheme(song.id);
    });
    rowParts.set(song.id, { row, button, genre, action, song });
  }
  tracks.append(empty);
  const paintPlayback = (nextState: MusicState = state) => {
    state = nextState;
    const de = getLocale() === 'de';
    text(controlsLabel, de ? 'Wiedergabe & Musikrichtung' : 'Playback & music direction');
    text(currentTitle, state.song?.title ?? (de ? 'Wähle einen Song' : 'Choose a song'));
    for (const { row, button, genre, action, song } of rowParts.values()) {
      const active = state.song?.id === song.id;
      if (active) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
      row.classList.toggle('sl-current', active);
      const loading = active && state.status === 'loading';
      row.setAttribute('aria-busy', String(loading));
      // Keep keyboard focus on the chosen row while its recording loads.
      button.setAttribute('aria-disabled', String(loading));
      const verb = loading ? (de ? 'Lädt…' : 'Loading…')
        : active && state.status === 'playing' ? (de ? 'Pause' : 'Pause')
        : active && state.status === 'error' ? (de ? 'Erneut' : 'Retry')
        : active && state.paused ? (de ? 'Weiter' : 'Resume')
        : (de ? 'Abspielen' : 'Play');
      text(action, verb);
      text(genre, `${genreName(song.genre, de)} · ${song.bpm} BPM · ${textureText(song, de)}`);
      button.setAttribute('aria-label', `${verb}: ${song.title}, ${genreName(song.genre, de)}, ${duration(song.seconds)}`);
    }
    const messages: Partial<Record<MusicState['status'], [string, string]>> = {
      muted: ['Sound is muted. Enable sound and raise Theme music in Office & settings.', 'Der Ton ist stumm. Aktiviere den Ton und erhöhe die Musiklautstärke unter Büro & Einstellungen.'],
      error: ['This song could not play. Retry it or choose another song.', 'Dieser Song konnte nicht abgespielt werden. Versuche es erneut oder wähle einen anderen Song.'],
      hidden: ['Music pauses while Lucid is hidden.', 'Die Musik pausiert, wenn Lucid ausgeblendet ist.'],
    };
    const message = messages[state.status]?.[de ? 1 : 0] ?? '';
    text(note, message); note.hidden = !message;
  };
  const paintFilter = () => {
    const de = getLocale() === 'de', query = normalize(search.value.trim());
    let visible = 0;
    for (const { row, song } of rowParts.values()) {
      const match = (filter.value === 'all' || song.genre === filter.value)
        && normalize(`${song.title} ${genreName(song.genre, false)} ${genreName(song.genre, true)} ${textureText(song, false)} ${textureText(song, true)}`).includes(query);
      row.hidden = !match; if (match) visible++;
    }
    empty.hidden = visible > 0;
    const full = visible === SOUNDTRACK.length;
    text(count, de
      ? `${visible}${full ? '' : ` von ${SOUNDTRACK.length}`} ${visible === 1 ? 'Song' : 'Songs'}`
      : `${visible}${full ? '' : ` of ${SOUNDTRACK.length}`} ${visible === 1 ? 'song' : 'songs'}`);
    tracks.scrollTop = 0;
  };
  const paintLocale = () => {
    const de = getLocale() === 'de';
    section.setAttribute('aria-label', de ? 'Song-Bibliothek' : 'Song library');
    tracks.setAttribute('aria-label', de ? 'Songs' : 'Songs');
    text(searchCaption, de ? 'Songs suchen' : 'Search songs');
    search.placeholder = de ? 'Titel, Genre oder Instrument' : 'Title, genre or instrument';
    text(genreCaption, 'Genre');
    for (let i = 0; i < genres.length; i++) text(filter.options[i], genres[i][de ? 2 : 1]);
    text(emptyTitle, de ? 'Keine passenden Songs' : 'No matching songs');
    text(emptyHint, de ? 'Versuche einen anderen Suchbegriff oder ein anderes Genre.' : 'Try a different search or genre.');
    // Locale changes update text only. Preserve the listener's scrolling place.
    const top = tracks.scrollTop; paintPlayback(); paintFilter(); tracks.scrollTop = top;
  };
  search.addEventListener('input', paintFilter); filter.addEventListener('change', paintFilter);
  paintLocale(); tracks.scrollTop = retained.scroll;
  const unsubscribe = gameSound.subscribeMusic(paintPlayback);
  const stopLocale = onLocaleChange(paintLocale);
  let removed = false;
  const destroy = () => {
    if (removed) return; removed = true;
    retained = { query: search.value, genre: filter.value as GenreFilter, scroll: tracks.scrollTop, controlsOpen: player.open };
    unsubscribe(); stopLocale(); releaseControls();
    search.removeEventListener('input', paintFilter); filter.removeEventListener('change', paintFilter);
    window.removeEventListener('pagehide', destroy); section.remove();
  };
  window.addEventListener('pagehide', destroy);
  return destroy;
}
