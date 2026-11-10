// Sound, volume, theme music and ambience controls in the settings panel.
import { gameSound } from "../office/sound";
import { mountMusicControls } from "../office/music-controls";
import type { Room } from "../office/world";
import { $ } from "./dom";
import type { App } from "./context";

export function mountSoundControls(app: App) {
  app.soundButton = $('game-sound');
  app.terribleSongButton = document.querySelector<HTMLButtonElement>('#terrible-song')!;
  app.paintTerribleSong = () => {
    const state = gameSound.musicState;
    app.terribleSongButton.disabled = !state.song;
    app.terribleSongButton.textContent = state.terrible ? 'Unmark terrible song' : 'Mark song terrible';
    app.terribleSongButton.setAttribute('aria-pressed', String(state.terrible));
    app.terribleSongButton.title = state.song ? `${state.terrible ? 'Unmark' : 'Mark'} ${state.song.title} as terrible` : 'No song selected';
  };
  gameSound.subscribeMusic(app.paintTerribleSong);
  app.terribleSongButton.addEventListener('click', () => { gameSound.toggleTerribleSong(); gameSound.play('switch'); });
  app.paintSound = () => { app.soundButton.textContent = gameSound.enabled ? 'Sound on' : 'Sound off'; app.soundButton.setAttribute('aria-pressed', String(gameSound.enabled)); app.soundButton.title = gameSound.enabled ? 'Mute game sounds' : 'Enable game sounds'; };
  app.paintSound();
  app.soundButton.addEventListener('click', () => { gameSound.configure(!gameSound.enabled); app.paintSound(); if (gameSound.enabled) gameSound.play('open'); });
  app.volumeControl = document.createElement('label');
   app.volumeControl.className = 'game-volume';
  app.volumeControl.innerHTML = '<span>Sound volume</span><input type="range" min="0" max="100" step="5" aria-label="Game sound volume">';
  app.volumeSlider = app.volumeControl.querySelector('input')!;
   app.volumeSlider.value = String(gameSound.volume * 100);
  app.volumeSlider.addEventListener('input', () => gameSound.configure(gameSound.enabled, Number(app.volumeSlider.value) / 100));
  app.volumeSlider.addEventListener('change', () => gameSound.play('collect'));
  app.extrasBody.append(app.volumeControl);
  for (const [kind, label, value] of [
    ['theme', 'Theme music', gameSound.themeVolume],
    ['ambience', 'Room ambience', gameSound.ambienceVolume],
  ] as const) {
    const control = document.createElement('label'); control.className = 'game-volume';
    const text = document.createElement('span'); text.textContent = label;
    const slider = document.createElement('input'); slider.type = 'range';
    slider.min = '0'; slider.max = '100'; slider.step = '1'; slider.value = String(Math.round(value * 100));
    slider.setAttribute('aria-label', `${label} volume`);
    slider.addEventListener('input', () => gameSound.configureBackground(kind, Number(slider.value) / 100));
    control.append(text, slider); app.extrasBody.append(control);
  }
  mountMusicControls(app.extrasBody);
}
