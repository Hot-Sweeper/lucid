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
import reservoirMoon from '../assets/audio/reservoir-moon.mp3';
import glassRiverMorning from '../assets/audio/glass-river-morning.mp3';
import afterTheLastTrain from '../assets/audio/after-the-last-train.mp3';
import lowTideLights from '../assets/audio/low-tide-lights.mp3';
import linenAndSunlight from '../assets/audio/linen-and-sunlight.mp3';
import rainOnTheTram from '../assets/audio/rain-on-the-tram.mp3';
import streetlampHaze from '../assets/audio/streetlamp-haze.mp3';
import citrusCrosswalk from '../assets/audio/citrus-crosswalk.mp3';
import slowDanceForAnEmptyCafe from '../assets/audio/slow-dance-for-an-empty-cafe.mp3';
import citrusPromenade from '../assets/audio/citrus-promenade.mp3';
import sundayCorduroy from '../assets/audio/sunday-corduroy.mp3';
import lastSetAtMarlowes from '../assets/audio/last-set-at-marlowes.mp3';
import satelliteLullaby from '../assets/audio/satellite-lullaby.mp3';
import paleHalo from '../assets/audio/pale-halo.mp3';
import moonwakeDrift from '../assets/audio/moonwake-drift.mp3';
import mothHour from '../assets/audio/moth-hour.mp3';
import sodiumLights from '../assets/audio/sodium-lights.mp3';
import magentaCoastline from '../assets/audio/magenta-coastline.mp3';
import lastLightPromenade from '../assets/audio/last-light-promenade.mp3';
import chromeHorizon from '../assets/audio/chrome-horizon.mp3';
import overpassInBloom from '../assets/audio/overpass-in-bloom.mp3';
import lanternsOnTheWater from '../assets/audio/lanterns-on-the-water.mp3';
import glassPlanetarium from '../assets/audio/glass-planetarium.mp3';
import polaroidSummer from '../assets/audio/polaroid-summer.mp3';
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
  { id: 'reservoir-moon', title: "Reservoir Moon", url: reservoirMoon, period: 'night', bpm: 62, genre: 'ambient', energy: 0.12, seconds: 160.1845, key: 3, mode: 'lydian', meter: 4, textures: ["piano", "pads"], gainDb: -1.75 },
  { id: 'glass-river-morning', title: "Glass River Morning", url: glassRiverMorning, period: 'morning', bpm: 70, genre: 'ambient', energy: 0.15, seconds: 139.8774, key: 7, mode: 'major', meter: 4, textures: ["plucked", "bells", "pads"], gainDb: -1.75 },
  { id: 'after-the-last-train', title: "After the Last Train", url: afterTheLastTrain, period: 'night', bpm: 64, genre: 'ambient', energy: 0.16, seconds: 153.0998, key: 11, mode: 'dorian', meter: 4, textures: ["piano", "pads", "strings", "bass"], gainDb: -1.75 },
  { id: 'low-tide-lights', title: "Low Tide Lights", url: lowTideLights, period: 'evening', bpm: 80, genre: 'ambient', energy: 0.2, seconds: 136.0180, key: 9, mode: 'major', meter: 4, textures: ["synth", "bells", "pads", "drums"], gainDb: -1.75 },
  { id: 'linen-and-sunlight', title: "Linen and Sunlight", url: linenAndSunlight, period: 'morning', bpm: 74, genre: 'lofi', energy: 0.27, seconds: 133.0297, key: 8, mode: 'major', meter: 4, textures: ["piano", "bass", "drums"], gainDb: -1.74 },
  { id: 'rain-on-the-tram', title: "Rain on the Tram", url: rainOnTheTram, period: 'day', bpm: 78, genre: 'lofi', energy: 0.3, seconds: 126.2770, key: 5, mode: 'major', meter: 4, textures: ["piano", "bass", "drums"], gainDb: -1.74 },
  { id: 'streetlamp-haze', title: "Streetlamp Haze", url: streetlampHaze, period: 'night', bpm: 86, genre: 'lofi', energy: 0.33, seconds: 137.5535, key: 4, mode: 'dorian', meter: 4, textures: ["piano", "plucked", "bass", "drums"], gainDb: -1.74 },
  { id: 'citrus-crosswalk', title: "Citrus Crosswalk", url: citrusCrosswalk, period: 'day', bpm: 90, genre: 'lofi', energy: 0.38, seconds: 133.6667, key: 2, mode: 'major', meter: 4, textures: ["piano", "synth", "mallets", "bass", "drums"], gainDb: -1.74 },
  { id: 'slow-dance-for-an-empty-cafe', title: "Slow Dance for an Empty Caf\u00e9", url: slowDanceForAnEmptyCafe, period: 'night', bpm: 68, genre: 'jazz', energy: 0.22, seconds: 141.6597, key: 1, mode: 'major', meter: 4, textures: ["mallets", "piano", "bass", "drums"], gainDb: -1.76 },
  { id: 'citrus-promenade', title: "Citrus Promenade", url: citrusPromenade, period: 'day', bpm: 132, genre: 'jazz', energy: 0.33, seconds: 131.8356, key: 9, mode: 'minor', meter: 4, textures: ["mallets", "piano", "bass", "drums"], gainDb: -1.75 },
  { id: 'sunday-corduroy', title: "Sunday Corduroy", url: sundayCorduroy, period: 'evening', bpm: 90, genre: 'jazz', energy: 0.38, seconds: 143.7504, key: 3, mode: 'major', meter: 4, textures: ["piano", "mallets", "bass", "drums"], gainDb: -1.75 },
  { id: 'last-set-at-marlowes', title: "Last Set at Marlowe's", url: lastSetAtMarlowes, period: 'evening', bpm: 126, genre: 'jazz', energy: 0.4, seconds: 139.0161, key: 10, mode: 'major', meter: 4, textures: ["piano", "bass", "drums"], gainDb: -1.77 },
  { id: 'satellite-lullaby', title: "Satellite Lullaby", url: satelliteLullaby, period: 'night', bpm: 70, genre: 'phonk', energy: 0.48, seconds: 133.3047, key: 11, mode: 'minor', meter: 4, textures: ["piano", "mallets", "bass", "drums", "pads"], gainDb: -1.73 },
  { id: 'pale-halo', title: "Pale Halo", url: paleHalo, period: 'night', bpm: 130, genre: 'phonk', energy: 0.5, seconds: 136.1059, key: 6, mode: 'minor', meter: 4, textures: ["pads", "mallets", "bells", "bass", "drums"], gainDb: -1.74 },
  { id: 'moonwake-drift', title: "Moonwake Drift", url: moonwakeDrift, period: 'night', bpm: 140, genre: 'phonk', energy: 0.6, seconds: 127.3378, key: 4, mode: 'phrygian', meter: 4, textures: ["bells", "bass", "drums", "pads"], gainDb: -1.74 },
  { id: 'moth-hour', title: "Moth Hour", url: mothHour, period: 'evening', bpm: 144, genre: 'phonk', energy: 0.62, seconds: 136.9532, key: 0, mode: 'minor', meter: 4, textures: ["piano", "bells", "bass", "drums", "pads"], gainDb: -1.74 },
  { id: 'sodium-lights', title: "Sodium Lights", url: sodiumLights, period: 'night', bpm: 94, genre: 'synthwave', energy: 0.5, seconds: 174.6928, key: 4, mode: 'minor', meter: 4, textures: ["synth", "pads", "bass", "drums"], gainDb: -1.74 },
  { id: 'magenta-coastline', title: "Magenta Coastline", url: magentaCoastline, period: 'evening', bpm: 96, genre: 'synthwave', energy: 0.55, seconds: 171.0718, key: 2, mode: 'major', meter: 4, textures: ["synth", "pads", "plucked", "bass", "drums"], gainDb: -1.75 },
  { id: 'last-light-promenade', title: "Last Light Promenade", url: lastLightPromenade, period: 'evening', bpm: 104, genre: 'synthwave', energy: 0.65, seconds: 175.9619, key: 0, mode: 'major', meter: 4, textures: ["synth", "pads", "plucked", "bass", "drums"], gainDb: -1.74 },
  { id: 'chrome-horizon', title: "Chrome Horizon", url: chromeHorizon, period: 'night', bpm: 114, genre: 'synthwave', energy: 0.7, seconds: 160.7227, key: 6, mode: 'minor', meter: 4, textures: ["synth", "bass", "pads", "drums"], gainDb: -1.75 },
  { id: 'overpass-in-bloom', title: "Overpass in Bloom", url: overpassInBloom, period: 'evening', bpm: 160, genre: 'breakcore', energy: 0.72, seconds: 133.2541, key: 5, mode: 'dorian', meter: 4, textures: ["piano", "mallets", "pads", "breaks", "bass"], gainDb: -0.90 },
  { id: 'lanterns-on-the-water', title: "Lanterns on the Water", url: lanternsOnTheWater, period: 'evening', bpm: 172, genre: 'breakcore', energy: 0.75, seconds: 135.2945, key: 3, mode: 'major', meter: 4, textures: ["piano", "pads", "mallets", "breaks", "bass"], gainDb: -1.76 },
  { id: 'glass-planetarium', title: "Glass Planetarium", url: glassPlanetarium, period: 'night', bpm: 165, genre: 'breakcore', energy: 0.8, seconds: 142.5353, key: 1, mode: 'minor', meter: 4, textures: ["bells", "pads", "synth", "piano", "breaks", "bass"], gainDb: -1.75 },
  { id: 'polaroid-summer', title: "Polaroid Summer", url: polaroidSummer, period: 'day', bpm: 170, genre: 'breakcore', energy: 0.82, seconds: 136.8566, key: 6, mode: 'minor', meter: 4, textures: ["piano", "pads", "bells", "breaks", "bass"], gainDb: -1.75 },
];
