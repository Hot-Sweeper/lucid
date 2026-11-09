import littleLights from '../assets/audio/little-lights.mp3';
import windowGarden from '../assets/audio/window-garden.mp3';
import firstCoffee from '../assets/audio/first-coffee.mp3';
import paperKites from '../assets/audio/paper-kites.mp3';
import peachParade from '../assets/audio/peach-parade.mp3';
import apricotHour from '../assets/audio/apricot-hour.mp3';
import tramHome from '../assets/audio/tram-home.mp3';
import moonlitDesks from '../assets/audio/moonlit-desks.mp3';
import sleepySatellites from '../assets/audio/sleepy-satellites.mp3';
import pocketSunrise from '../assets/audio/pocket-sunrise.mp3';
import cloudArcade from '../assets/audio/cloud-arcade.mp3';
import velvetElevator from '../assets/audio/velvet-elevator.mp3';
import lanternCarousel from '../assets/audio/lantern-carousel.mp3';
import lastConstellation from '../assets/audio/the-last-constellation.mp3';
import type { SoundtrackSong } from './soundtrack-queue';

export const SOUNDTRACK: readonly SoundtrackSong[] = [
  { id: 'little-lights', title: 'Little Lights', url: littleLights, period: 'day', bpm: 78, genre: 'acoustic', energy: 0.29, seconds: 196.9231, key: 2, mode: 'major', meter: 4, textures: ["bells", "piano", "pads"], gainDb: -1.38 },
  { id: 'window-garden', title: 'Window Garden', url: windowGarden, period: 'morning', bpm: 88, genre: 'acoustic', energy: 0.32, seconds: 110.5513, key: 0, mode: 'major', meter: 4, textures: ["mallets", "piano", "drums"], gainDb: -1.55 },
  { id: 'first-coffee', title: 'First Coffee', url: firstCoffee, period: 'morning', bpm: 96, genre: 'acoustic', energy: 0.32, seconds: 92.2133, key: 5, mode: 'major', meter: 3, textures: ["piano", "drums"], gainDb: -2.34 },
  { id: 'paper-kites', title: 'Paper Kites', url: paperKites, period: 'day', bpm: 102, genre: 'acoustic', energy: 0.4, seconds: 95.9749, key: 7, mode: 'major', meter: 4, textures: ["plucked", "piano", "drums"], gainDb: -1.83 },
  { id: 'peach-parade', title: 'Peach Parade', url: peachParade, period: 'day', bpm: 92, genre: 'acoustic', energy: 0.38, seconds: 105.9015, key: 2, mode: 'major', meter: 4, textures: ["mallets", "drums"], gainDb: -1.65 },
  { id: 'apricot-hour', title: 'Apricot Hour', url: apricotHour, period: 'evening', bpm: 76, genre: 'acoustic', energy: 0.25, seconds: 127.4002, key: 3, mode: 'major', meter: 4, textures: ["piano", "pads", "drums"], gainDb: -1.38 },
  { id: 'tram-home', title: 'Tram Home', url: tramHome, period: 'evening', bpm: 82, genre: 'acoustic', energy: 0.24, seconds: 107.3382, key: 9, mode: 'minor', meter: 3, textures: ["plucked", "piano", "drums"], gainDb: -1.72 },
  { id: 'moonlit-desks', title: 'Moonlit Desks', url: moonlitDesks, period: 'night', bpm: 64, genre: 'ambient', energy: 0.14, seconds: 151.2500, key: 11, mode: 'minor', meter: 4, textures: ["bells", "pads"], gainDb: -1.11 },
  { id: 'sleepy-satellites', title: 'Sleepy Satellites', url: sleepySatellites, period: 'night', bpm: 68, genre: 'ambient', energy: 0.16, seconds: 142.3945, key: 4, mode: 'major', meter: 4, textures: ["bells", "pads"], gainDb: -0.52 },
  { id: 'pocket-sunrise', title: 'Pocket Sunrise', url: pocketSunrise, period: 'morning', bpm: 104, genre: 'acoustic', energy: 0.46, seconds: 130.9268, key: 0, mode: 'major', meter: 4, textures: ["mallets", "plucked", "drums"], gainDb: -1.97 },
  { id: 'cloud-arcade', title: 'Cloud Arcade', url: cloudArcade, period: 'day', bpm: 110, genre: 'acoustic', energy: 0.51, seconds: 123.8476, key: 2, mode: 'major', meter: 4, textures: ["synth", "plucked", "drums"], gainDb: -2.32 },
  { id: 'velvet-elevator', title: 'Velvet Elevator', url: velvetElevator, period: 'evening', bpm: 86, genre: 'acoustic', energy: 0.3, seconds: 158.1464, key: 5, mode: 'major', meter: 4, textures: ["piano", "bass", "drums"], gainDb: -2.56 },
  { id: 'lantern-carousel', title: 'Lantern Carousel', url: lanternCarousel, period: 'night', bpm: 78, genre: 'acoustic', energy: 0.19, seconds: 131.9456, key: 9, mode: 'minor', meter: 3, textures: ["bells", "piano", "drums"], gainDb: -2.61 },
  { id: 'the-last-constellation', title: 'The Last Constellation', url: lastConstellation, period: 'night', bpm: 72, genre: 'ambient', energy: 0.22, seconds: 188.6835, key: 3, mode: 'major', meter: 4, textures: ["pads", "bells", "drums"], gainDb: -2.46 },
];
