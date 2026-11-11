// Sound, volume, theme music and ambience controls in the settings panel.
import { gameSound } from "../office/sound";
import { icon as uiIcon } from "../ui/icons";
import { rangeFill } from "../ui/range";
import { mountMusicControls } from "../office/music-controls";
import type { Room } from "../office/world";
import { $ } from "./dom";
import type { App } from "./context";

export function mountSoundControls(app: App) {
  // The HUD speaker: one icon button whose pressed state is "sound on".
  app.soundButton = $('game-sound');
  app.paintSound = () => {
    const on = gameSound.enabled;
    app.soundButton.innerHTML = uiIcon(on ? 'volume' : 'muted');
    app.soundButton.setAttribute('aria-pressed', String(on));
    app.soundButton.title = on ? 'Game sound is on. Click to mute' : 'Game sound is off. Click to turn it on';
  };
  app.paintSound();
  app.soundButton.addEventListener('click', () => { gameSound.configure(!gameSound.enabled); app.paintSound(); if (gameSound.enabled) gameSound.play('open'); });
  app.volumeControl = document.createElement('label');
  app.volumeControl.className = 'game-volume';
  app.volumeControl.innerHTML = '<span>Sound volume</span><input type="range" min="0" max="100" step="5" aria-label="Game sound volume">';
  app.volumeSlider = app.volumeControl.querySelector('input')!;
  app.volumeSlider.value = String(gameSound.volume * 100);
  rangeFill(app.volumeSlider);
  app.volumeSlider.addEventListener('input', () => gameSound.configure(gameSound.enabled, Number(app.volumeSlider.value) / 100));
  app.volumeSlider.addEventListener('change', () => gameSound.play('collect'));
  app.extrasSound.append(app.volumeControl);
  for (const [kind, label, value] of [
    ['theme', 'Theme music', gameSound.themeVolume],
    ['ambience', 'Room ambience', gameSound.ambienceVolume],
  ] as const) {
    const control = document.createElement('label'); control.className = 'game-volume';
    const text = document.createElement('span'); text.textContent = label;
    const slider = document.createElement('input'); slider.type = 'range';
    slider.min = '0'; slider.max = '100'; slider.step = '1'; slider.value = String(Math.round(value * 100));
    slider.setAttribute('aria-label', `${label} volume`);
    rangeFill(slider);
    slider.addEventListener('input', () => gameSound.configureBackground(kind, Number(slider.value) / 100));
    control.append(text, slider); app.extrasSound.append(control);
  }
  mountMusicControls(app.extrasSound.parentElement!);
}
