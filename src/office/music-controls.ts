import { gameSound, type MusicState } from './sound';
import { songMatchesMode, type SoundtrackMode } from './soundtrack-queue';
import { SOUNDTRACK } from './soundtrack';
import { getLocale, onLocaleChange } from '../localization';
import './music-controls.css';
import { BRAND } from "../brand";

const allDirections: [SoundtrackMode, string, string][] = [
  ['journey', 'Evolving journey', 'Musikalische Reise'],
  ['acoustic', 'Cozy instrumentals', 'Gemütliche Instrumentals'],
  ['ambient', 'Ambient', 'Ambient'],
  ['lofi', 'Chill lo-fi', 'Chill Lo-Fi'],
  ['jazz', 'Jazz', 'Jazz'],
  ['phonk', 'Lunar phonk', 'Lunar Phonk'],
  ['synthwave', 'Synthwave', 'Synthwave'],
  ['breakcore', 'Breakcore / DnB', 'Breakcore / DnB'],
  ['pads', 'Ambient pads', 'Ambient-Flächen'],
  ['bells', 'Bells & wonder', 'Glocken & Staunen'],
];
// Offer only directions the library can actually play.
const directions = allDirections.filter(([mode]) => mode === 'journey' || SOUNDTRACK.some(song => songMatchesMode(song, mode)));
const chapters: Record<string, string> = {
  'still-water': 'Stilles Wasser', 'morning-light': 'Morgenlicht', 'warm-tape': 'Warmes Tonband',
  'late-cafe': 'Spätes Café', 'night-drive': 'Nachtfahrt', 'neon-rise': 'Neonaufstieg',
  'petal-rush': 'Blütenrausch', afterglow: 'Nachglühen', 'lunar-drift': 'Mondtreiben', 'soft-landing': 'Sanfte Landung',
};
const genreNames: Record<string, string> = {
  acoustic: 'Instrumental', lofi: 'Lo-fi', jazz: 'Jazz', synthwave: 'Synthwave', ambient: 'Ambient',
  breakcore: 'Breakcore', phonk: 'Phonk',
};

/** Small controls in the existing settings shelf. All state comes from the audio owner. */
export function mountMusicControls(parent: HTMLElement): () => void {
  const section = document.createElement('section');
  section.className = 'office-radio';
  const heading = document.createElement('h3');
  const now = document.createElement('p'); now.className = 'office-radio-now';
  const title = document.createElement('b'), detail = document.createElement('span');
  now.append(title, detail);
  const label = document.createElement('label'); label.className = 'office-radio-direction';
  const caption = document.createElement('span');
  const select = document.createElement('select');
  for (const [value] of directions) {
    const option = document.createElement('option'); option.value = value; select.append(option);
  }
  label.append(caption, select);
  const journey = document.createElement('p'); journey.className = 'office-radio-journey';
  const actions = document.createElement('div'); actions.className = 'office-radio-actions';
  const pause = document.createElement('button'), next = document.createElement('button');
  pause.type = next.type = 'button'; pause.className = next.className = 'ghost'; actions.append(pause, next);
  const status = document.createElement('p'); status.className = 'office-radio-status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  section.append(heading, now, label, journey, actions, status); parent.append(section);
  let state = gameSound.musicState;
  const text = (element: HTMLElement, value: string) => { if (element.textContent !== value) element.textContent = value; };
  const update = (nextState: MusicState = state) => {
    state = nextState;
    const de = getLocale() === 'de';
    text(heading, de ? 'Büroradio' : 'Office radio');
    text(caption, de ? 'Musikrichtung' : 'Music direction');
    for (let i = 0; i < directions.length; i++) text(select.options[i], directions[i][de ? 2 : 1]);
    select.value = state.mode;
    text(title, state.song?.title ?? (de ? 'Die Musik wartet auf dich' : 'Music is ready when you are'));
    text(detail, state.song ? `${directions.find(([id]) => id === state.song!.genre)?.[de ? 2 : 1] ?? genreNames[state.song.genre]} · ${state.song.bpm} BPM` : (de ? `${SOUNDTRACK.length} eigene Instrumentals` : `${SOUNDTRACK.length} original instrumentals`));
    const mood = state.chapter ? (de ? chapters[state.chapter.id] ?? state.chapter.title : state.chapter.title) : '';
    text(journey, state.mode === 'journey'
      ? (de ? `Stimmung: ${mood}. Entwickelt sich beim Zuhören.` : `Mood: ${mood}. Develops as you listen.`)
      : (de ? 'Diese Musikrichtung bleibt ausgewählt.' : 'Stays in this direction until you change it.'));
    text(pause, state.paused ? (de ? 'Fortsetzen' : 'Resume music') : (de ? 'Musik pausieren' : 'Pause music'));
    pause.setAttribute('aria-pressed', String(state.paused));
    text(next, de ? 'Nächster Song' : 'Next song');
    next.disabled = state.status === 'loading';
    const pending = state.song && state.mode !== 'journey' && !songMatchesMode(state.song, state.mode);
    const messages: Record<string, [string, string]> = {
      loading: ['Loading song…', 'Song wird geladen…'],
      error: ['Could not play this song. Choose Next song to try again.', 'Song konnte nicht abgespielt werden. Versuche den nächsten Song.'],
      locked: ['Click or press a key to start listening.', 'Klicke oder drücke eine Taste, um Musik zu starten.'],
      hidden: [`Listening pauses while ${BRAND.name} is hidden.`, `Die Musik pausiert, wenn ${BRAND.name} ausgeblendet ist.`],
      muted: ['Turn on sound and raise Theme music to listen.', 'Aktiviere den Ton und erhöhe die Musiklautstärke.'],
      paused: ['Music paused. Your place is saved.', 'Musik pausiert. Deine Position bleibt gespeichert.'],
    };
    const message = messages[state.status]?.[de ? 1 : 0] ?? (pending
      ? (de ? 'Wechselt nach diesem Song. „Nächster Song“ wechselt sofort.' : 'Changes after this song. Next song switches now.')
      : (state.mode === 'journey'
        ? (de ? 'Die Stimmung wechselt zwischen ganzen Songs.' : 'Mood changes happen between complete songs.')
        : ''));
    text(status, message);
  };
  const onDirection = () => { gameSound.configureMusic(select.value as SoundtrackMode); gameSound.play('switch'); };
  const onPause = () => { gameSound.pauseTheme(!gameSound.musicState.paused); };
  const onNext = () => { gameSound.nextTheme(); };
  select.addEventListener('change', onDirection);
  pause.addEventListener('click', onPause); next.addEventListener('click', onNext);
  const unsubscribe = gameSound.subscribeMusic(update);
  const stopLocale = onLocaleChange(() => update());
  let removed = false;
  const destroy = () => {
    if (removed) return; removed = true;
    unsubscribe(); stopLocale();
    select.removeEventListener('change', onDirection);
    pause.removeEventListener('click', onPause); next.removeEventListener('click', onNext);
    window.removeEventListener('pagehide', destroy); section.remove();
  };
  window.addEventListener('pagehide', destroy);
  return destroy;
}
