import littleLights from '../assets/audio/little-lights.mp3';
import windowGarden from '../assets/audio/window-garden.mp3';
import firstCoffee from '../assets/audio/first-coffee.mp3';
import paperKites from '../assets/audio/paper-kites.mp3';
import peachParade from '../assets/audio/peach-parade.mp3';
import apricotHour from '../assets/audio/apricot-hour.mp3';
import tramHome from '../assets/audio/tram-home.mp3';
import moonlitDesks from '../assets/audio/moonlit-desks.mp3';
import sleepySatellites from '../assets/audio/sleepy-satellites.mp3';
import type { SoundtrackSong } from './soundtrack-queue';

export const SOUNDTRACK: readonly SoundtrackSong[] = [
  { id: 'little-lights', title: 'Little Lights', url: littleLights, period: 'day', bpm: 78 },
  { id: 'window-garden', title: 'Window Garden', url: windowGarden, period: 'morning', bpm: 88 },
  { id: 'first-coffee', title: 'First Coffee', url: firstCoffee, period: 'morning', bpm: 96 },
  { id: 'paper-kites', title: 'Paper Kites', url: paperKites, period: 'day', bpm: 102 },
  { id: 'peach-parade', title: 'Peach Parade', url: peachParade, period: 'day', bpm: 92 },
  { id: 'apricot-hour', title: 'Apricot Hour', url: apricotHour, period: 'evening', bpm: 76 },
  { id: 'tram-home', title: 'Tram Home', url: tramHome, period: 'evening', bpm: 82 },
  { id: 'moonlit-desks', title: 'Moonlit Desks', url: moonlitDesks, period: 'night', bpm: 64 },
  { id: 'sleepy-satellites', title: 'Sleepy Satellites', url: sleepySatellites, period: 'night', bpm: 68 },
];
