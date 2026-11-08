import { gameSound, type MusicState } from './sound';
import { type SoundtrackMode } from './soundtrack-queue';
import { getLocale, onLocaleChange } from '../localization';
import './music-controls.css';

const directions: [SoundtrackMode, string, string][] = [
  ['journey', 'Evolving journey', 'Musikalische Reise'],
  ['lofi', 'Chill lo-fi', 'Chill Lo-Fi'],
  ['synthwave', 'Synthwave', 'Synthwave'],
  ['ambient', 'Ambient', 'Ambient'],
  ['breakcore', 'Melodic breakcore', 'Melodischer Breakcore'],
  ['phonk', 'Chill phonk', 'Chill Phonk'],
  ['acoustic', 'Cozy instrumentals', 'Gemütliche Instrumentals'],
];
const chapters: Record<string, string> = {
  'still-water': 'Stilles Wasser', 'warm-tape': 'Warmes Tonband',
  'night-drive': 'Nachtfahrt', 'neon-rise': 'Neonaufstieg', 'petal-rush': 'Blütenrausch',
  afterglow: 'Nachglühen', 'soft-landing': 'Sanfte Landung',
};
const genreNames: Record<string, string> = {
  acoustic: 'Instrumental', lofi: 'Lo-fi', synthwave: 'Synthwave', ambient: 'Ambient',
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
  pause.type = next.type = 'button'; actions.append(pause, next);
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
    text(detail, state.song ? `${genreNames[state.song.genre]} · ${state.song.bpm} BPM` : (de ? '19 eigene Instrumentals' : '19 original instrumentals'));
    const mood = state.chapter ? (de ? chapters[state.chapter.id] ?? state.chapter.title : state.chapter.title) : '';
    text(journey, state.mode === 'journey'
      ? (de ? `Stimmung: ${mood}. Entwickelt sich beim Zuhören.` : `Mood: ${mood}. Develops as you listen.`)
      : (de ? 'Diese Musikrichtung bleibt ausgewählt.' : 'Stays in this genre until you change it.'));
    text(pause, state.paused ? (de ? 'Fortsetzen' : 'Resume music') : (de ? 'Musik pausieren' : 'Pause music'));
    pause.setAttribute('aria-pressed', String(state.paused));
    text(next, de ? 'Nächster Song' : 'Next song');
    next.disabled = state.status === 'loading';
    const pending = state.song && state.mode !== 'journey' && state.song.genre !== state.mode;
    const messages: Record<string, [string, string]> = {
      loading: ['Loading song…', 'Song wird geladen…'],
      error: ['Could not play this song. Choose Next song to try again.', 'Song konnte nicht abgespielt werden. Versuche den nächsten Song.'],
      locked: ['Click or press a key to start listening.', 'Klicke oder drücke eine Taste, um Musik zu starten.'],
      hidden: ['Listening pauses while Lucid is hidden.', 'Die Musik pausiert, wenn Lucid ausgeblendet ist.'],
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
