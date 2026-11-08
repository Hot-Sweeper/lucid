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
import cassetteClouds from '../assets/audio/cassette-clouds.mp3';
import neonAfterglow from '../assets/audio/neon-afterglow.mp3';
import tidalMemory from '../assets/audio/tidal-memory.mp3';
import petalBreaks from '../assets/audio/petal-breaks.mp3';
import midnightDrift from '../assets/audio/midnight-drift.mp3';
import type { SoundtrackSong } from './soundtrack-queue';

export const SOUNDTRACK: readonly SoundtrackSong[] = [
  { id: 'little-lights', title: 'Little Lights', url: littleLights, period: 'day', bpm: 78, genre: 'acoustic', energy: 0.29, seconds: 196.9231 },
  { id: 'window-garden', title: 'Window Garden', url: windowGarden, period: 'morning', bpm: 88, genre: 'acoustic', energy: 0.32, seconds: 113.0909 },
  { id: 'first-coffee', title: 'First Coffee', url: firstCoffee, period: 'morning', bpm: 96, genre: 'acoustic', energy: 0.32, seconds: 94.0000 },
  { id: 'paper-kites', title: 'Paper Kites', url: paperKites, period: 'day', bpm: 102, genre: 'acoustic', energy: 0.4, seconds: 98.1176 },
  { id: 'peach-parade', title: 'Peach Parade', url: peachParade, period: 'day', bpm: 92, genre: 'acoustic', energy: 0.38, seconds: 108.3478 },
  { id: 'apricot-hour', title: 'Apricot Hour', url: apricotHour, period: 'evening', bpm: 76, genre: 'acoustic', energy: 0.25, seconds: 130.3158 },
  { id: 'tram-home', title: 'Tram Home', url: tramHome, period: 'evening', bpm: 82, genre: 'acoustic', energy: 0.24, seconds: 109.3659 },
  { id: 'moonlit-desks', title: 'Moonlit Desks', url: moonlitDesks, period: 'night', bpm: 64, genre: 'ambient', energy: 0.14, seconds: 154.0000 },
  { id: 'sleepy-satellites', title: 'Sleepy Satellites', url: sleepySatellites, period: 'night', bpm: 68, genre: 'ambient', energy: 0.16, seconds: 145.1765 },
  { id: 'pocket-sunrise', title: 'Pocket Sunrise', url: pocketSunrise, period: 'morning', bpm: 104, genre: 'acoustic', energy: 0.46, seconds: 134.2308 },
  { id: 'cloud-arcade', title: 'Cloud Arcade', url: cloudArcade, period: 'day', bpm: 110, genre: 'acoustic', energy: 0.51, seconds: 127.1818 },
  { id: 'velvet-elevator', title: 'Velvet Elevator', url: velvetElevator, period: 'evening', bpm: 86, genre: 'acoustic', energy: 0.3, seconds: 161.2791 },
  { id: 'lantern-carousel', title: 'Lantern Carousel', url: lanternCarousel, period: 'night', bpm: 78, genre: 'acoustic', energy: 0.19, seconds: 134.2308 },
  { id: 'the-last-constellation', title: 'The Last Constellation', url: lastConstellation, period: 'night', bpm: 72, genre: 'ambient', energy: 0.22, seconds: 191.6667 },
  { id: 'cassette-clouds', title: 'Cassette Clouds', url: cassetteClouds, period: 'day', bpm: 82, genre: 'lofi', energy: 0.32, seconds: 158.1951 },
  { id: 'neon-afterglow', title: 'Neon Afterglow', url: neonAfterglow, period: 'evening', bpm: 104, genre: 'synthwave', energy: 0.65, seconds: 153.6923 },
  { id: 'tidal-memory', title: 'Tidal Memory', url: tidalMemory, period: 'night', bpm: 66, genre: 'ambient', energy: 0.12, seconds: 162.7273 },
  { id: 'petal-breaks', title: 'Petal Breaks', url: petalBreaks, period: 'day', bpm: 164, genre: 'breakcore', energy: 0.84, seconds: 146.4878 },
  { id: 'midnight-drift', title: 'Midnight Drift', url: midnightDrift, period: 'night', bpm: 88, genre: 'phonk', energy: 0.51, seconds: 158.7273 },
];
