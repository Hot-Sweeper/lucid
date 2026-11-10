import littleLights from '../assets/audio/little-lights.opus';
import windowGarden from '../assets/audio/window-garden.opus';
import firstCoffee from '../assets/audio/first-coffee.opus';
import paperKites from '../assets/audio/paper-kites.opus';
import peachParade from '../assets/audio/peach-parade.opus';
import apricotHour from '../assets/audio/apricot-hour.opus';
import tramHome from '../assets/audio/tram-home.opus';
import moonlitDesks from '../assets/audio/moonlit-desks.opus';
import sleepySatellites from '../assets/audio/sleepy-satellites.opus';
import pocketSunrise from '../assets/audio/pocket-sunrise.opus';
import cloudArcade from '../assets/audio/cloud-arcade.opus';
import velvetElevator from '../assets/audio/velvet-elevator.opus';
import lanternCarousel from '../assets/audio/lantern-carousel.opus';
import lastConstellation from '../assets/audio/the-last-constellation.opus';
import nightConservatory from '../assets/audio/night-conservatory.opus';
import reservoirMoon from '../assets/audio/reservoir-moon.opus';
import glassRiverMorning from '../assets/audio/glass-river-morning.opus';
import afterTheLastTrain from '../assets/audio/after-the-last-train.opus';
import honeyOnTheWindowsill from '../assets/audio/honey-on-the-windowsill.opus';
import lowTideLights from '../assets/audio/low-tide-lights.opus';
import softFocus from '../assets/audio/soft-focus.opus';
import linenAndSunlight from '../assets/audio/linen-and-sunlight.opus';
import umbrellaHour from '../assets/audio/umbrella-hour.opus';
import rainOnTheTram from '../assets/audio/rain-on-the-tram.opus';
import marginsInPencil from '../assets/audio/margins-in-pencil.opus';
import streetlampHaze from '../assets/audio/streetlamp-haze.opus';
import citrusCrosswalk from '../assets/audio/citrus-crosswalk.opus';
import slowDanceForAnEmptyCafe from '../assets/audio/slow-dance-for-an-empty-cafe.opus';
import citrusPromenade from '../assets/audio/citrus-promenade.opus';
import waltzForTheWindowSeat from '../assets/audio/waltz-for-the-window-seat.opus';
import sundayCorduroy from '../assets/audio/sunday-corduroy.opus';
import lastSetAtMarlowes from '../assets/audio/last-set-at-marlowes.opus';
import indigoStairwell from '../assets/audio/indigo-stairwell.opus';
import satelliteLullaby from '../assets/audio/satellite-lullaby.opus';
import paleHalo from '../assets/audio/pale-halo.opus';
import astralFerry from '../assets/audio/astral-ferry.opus';
import moonwakeDrift from '../assets/audio/moonwake-drift.opus';
import mothHour from '../assets/audio/moth-hour.opus';
import auroraRun from '../assets/audio/aurora-run.opus';
import sodiumLights from '../assets/audio/sodium-lights.opus';
import magentaCoastline from '../assets/audio/magenta-coastline.opus';
import taillightsInTheRain from '../assets/audio/taillights-in-the-rain.opus';
import lastLightPromenade from '../assets/audio/last-light-promenade.opus';
import coinOpDaybreak from '../assets/audio/coin-op-daybreak.opus';
import chromeHorizon from '../assets/audio/chrome-horizon.opus';
import overpassInBloom from '../assets/audio/overpass-in-bloom.opus';
import lanternsOnTheWater from '../assets/audio/lanterns-on-the-water.opus';
import lemonadeSkyline from '../assets/audio/lemonade-skyline.opus';
import glassPlanetarium from '../assets/audio/glass-planetarium.opus';
import polaroidSummer from '../assets/audio/polaroid-summer.opus';
import lettersINeverSent from '../assets/audio/letters-i-never-sent.opus';
import type { SoundtrackSong } from './soundtrack-queue';

export const SOUNDTRACK: readonly SoundtrackSong[] = [
  { id: 'little-lights', title: 'Little Lights', url: littleLights, period: 'day', bpm: 78, genre: 'acoustic', energy: 0.29, seconds: 196.9231, key: 2, mode: 'major', meter: 4, textures: ["bells", "piano", "pads"], gainDb: -1.38 },
  { id: 'window-garden', title: 'Window Garden', url: windowGarden, period: 'morning', bpm: 88, genre: 'acoustic', energy: 0.32, seconds: 110.5513, key: 0, mode: 'major', meter: 4, textures: ["mallets", "piano", "drums"], gainDb: -1.55 },
  { id: 'first-coffee', title: 'First Coffee', url: firstCoffee, period: 'morning', bpm: 96, genre: 'acoustic', energy: 0.32, seconds: 92.2133, key: 5, mode: 'major', meter: 3, textures: ["piano", "drums"], gainDb: -2.35 },
  { id: 'paper-kites', title: 'Paper Kites', url: paperKites, period: 'day', bpm: 102, genre: 'acoustic', energy: 0.4, seconds: 95.9750, key: 7, mode: 'major', meter: 4, textures: ["plucked", "piano", "drums"], gainDb: -1.84 },
  { id: 'peach-parade', title: 'Peach Parade', url: peachParade, period: 'day', bpm: 92, genre: 'acoustic', energy: 0.38, seconds: 105.9015, key: 2, mode: 'major', meter: 4, textures: ["mallets", "drums"], gainDb: -1.65 },
  { id: 'apricot-hour', title: 'Apricot Hour', url: apricotHour, period: 'evening', bpm: 76, genre: 'acoustic', energy: 0.25, seconds: 127.4003, key: 3, mode: 'major', meter: 4, textures: ["piano", "pads", "drums"], gainDb: -1.39 },
  { id: 'tram-home', title: 'Tram Home', url: tramHome, period: 'evening', bpm: 82, genre: 'acoustic', energy: 0.24, seconds: 107.3382, key: 9, mode: 'minor', meter: 3, textures: ["plucked", "piano", "drums"], gainDb: -1.73 },
  { id: 'moonlit-desks', title: 'Moonlit Desks', url: moonlitDesks, period: 'night', bpm: 64, genre: 'ambient', energy: 0.14, seconds: 151.2501, key: 11, mode: 'minor', meter: 4, textures: ["bells", "pads"], gainDb: -1.11 },
  { id: 'sleepy-satellites', title: 'Sleepy Satellites', url: sleepySatellites, period: 'night', bpm: 68, genre: 'ambient', energy: 0.16, seconds: 142.3946, key: 4, mode: 'major', meter: 4, textures: ["bells", "pads"], gainDb: -0.52 },
  { id: 'pocket-sunrise', title: 'Pocket Sunrise', url: pocketSunrise, period: 'morning', bpm: 104, genre: 'acoustic', energy: 0.46, seconds: 130.9268, key: 0, mode: 'major', meter: 4, textures: ["mallets", "plucked", "drums"], gainDb: -1.97 },
  { id: 'cloud-arcade', title: 'Cloud Arcade', url: cloudArcade, period: 'day', bpm: 110, genre: 'acoustic', energy: 0.51, seconds: 123.8476, key: 2, mode: 'major', meter: 4, textures: ["synth", "plucked", "drums"], gainDb: -2.32 },
  { id: 'velvet-elevator', title: 'Velvet Elevator', url: velvetElevator, period: 'evening', bpm: 86, genre: 'acoustic', energy: 0.3, seconds: 158.1464, key: 5, mode: 'major', meter: 4, textures: ["piano", "bass", "drums"], gainDb: -2.57 },
  { id: 'lantern-carousel', title: 'Lantern Carousel', url: lanternCarousel, period: 'night', bpm: 78, genre: 'acoustic', energy: 0.19, seconds: 131.9456, key: 9, mode: 'minor', meter: 3, textures: ["bells", "piano", "drums"], gainDb: -2.62 },
  { id: 'the-last-constellation', title: 'The Last Constellation', url: lastConstellation, period: 'night', bpm: 72, genre: 'ambient', energy: 0.22, seconds: 188.6835, key: 3, mode: 'major', meter: 4, textures: ["pads", "bells", "drums"], gainDb: -2.47 },
  { id: 'night-conservatory', title: "Night Conservatory", url: nightConservatory, period: 'night', bpm: 58, genre: 'ambient', energy: 0.12, seconds: 153.5047, key: 2, mode: 'major', meter: 4, textures: ["strings", "piano", "pads"], gainDb: -1.75 },
  { id: 'reservoir-moon', title: "Reservoir Moon", url: reservoirMoon, period: 'night', bpm: 62, genre: 'ambient', energy: 0.12, seconds: 160.0245, key: 3, mode: 'lydian', meter: 4, textures: ["piano", "pads"], gainDb: -1.75 },
  { id: 'glass-river-morning', title: "Glass River Morning", url: glassRiverMorning, period: 'morning', bpm: 70, genre: 'ambient', energy: 0.15, seconds: 139.8752, key: 7, mode: 'major', meter: 4, textures: ["plucked", "bells", "pads"], gainDb: -1.76 },
  { id: 'after-the-last-train', title: "After the Last Train", url: afterTheLastTrain, period: 'night', bpm: 64, genre: 'ambient', energy: 0.16, seconds: 153.1201, key: 11, mode: 'dorian', meter: 4, textures: ["piano", "pads", "strings", "bass"], gainDb: -1.75 },
  { id: 'honey-on-the-windowsill', title: "Honey on the Windowsill", url: honeyOnTheWindowsill, period: 'morning', bpm: 72, genre: 'ambient', energy: 0.17, seconds: 137.0735, key: 5, mode: 'lydian', meter: 4, textures: ["piano", "plucked", "bells", "pads"], gainDb: -1.75 },
  { id: 'low-tide-lights', title: "Low Tide Lights", url: lowTideLights, period: 'evening', bpm: 80, genre: 'ambient', energy: 0.2, seconds: 135.9946, key: 9, mode: 'major', meter: 4, textures: ["synth", "bells", "pads", "drums"], gainDb: -1.75 },
  { id: 'soft-focus', title: "Soft Focus", url: softFocus, period: 'morning', bpm: 76, genre: 'lofi', energy: 0.26, seconds: 155.5790, key: 11, mode: 'major', meter: 4, textures: ["plucked", "piano", "pads", "bass", "drums"], gainDb: -1.75 },
  { id: 'linen-and-sunlight', title: "Linen and Sunlight", url: linenAndSunlight, period: 'morning', bpm: 74, genre: 'lofi', energy: 0.27, seconds: 133.0298, key: 8, mode: 'major', meter: 4, textures: ["piano", "bass", "drums"], gainDb: -1.75 },
  { id: 'umbrella-hour', title: "Umbrella Hour", url: umbrellaHour, period: 'night', bpm: 70, genre: 'lofi', energy: 0.28, seconds: 140.9429, key: 10, mode: 'minor', meter: 4, textures: ["mallets", "piano", "bass", "drums"], gainDb: -1.74 },
  { id: 'rain-on-the-tram', title: "Rain on the Tram", url: rainOnTheTram, period: 'day', bpm: 78, genre: 'lofi', energy: 0.3, seconds: 126.2770, key: 5, mode: 'major', meter: 4, textures: ["piano", "bass", "drums"], gainDb: -1.74 },
  { id: 'margins-in-pencil', title: "Margins in Pencil", url: marginsInPencil, period: 'day', bpm: 82, genre: 'lofi', energy: 0.32, seconds: 143.6878, key: 0, mode: 'major', meter: 4, textures: ["piano", "bass", "drums"], gainDb: -1.75 },
  { id: 'streetlamp-haze', title: "Streetlamp Haze", url: streetlampHaze, period: 'night', bpm: 86, genre: 'lofi', energy: 0.33, seconds: 137.5535, key: 4, mode: 'dorian', meter: 4, textures: ["piano", "plucked", "bass", "drums"], gainDb: -1.75 },
  { id: 'citrus-crosswalk', title: "Citrus Crosswalk", url: citrusCrosswalk, period: 'day', bpm: 90, genre: 'lofi', energy: 0.38, seconds: 133.6667, key: 2, mode: 'major', meter: 4, textures: ["piano", "synth", "mallets", "bass", "drums"], gainDb: -1.75 },
  { id: 'slow-dance-for-an-empty-cafe', title: "Slow Dance for an Empty Caf\u00e9", url: slowDanceForAnEmptyCafe, period: 'night', bpm: 68, genre: 'jazz', energy: 0.22, seconds: 141.6678, key: 1, mode: 'major', meter: 4, textures: ["mallets", "piano", "bass", "drums"], gainDb: -1.76 },
  { id: 'citrus-promenade', title: "Citrus Promenade", url: citrusPromenade, period: 'day', bpm: 132, genre: 'jazz', energy: 0.33, seconds: 131.9000, key: 9, mode: 'minor', meter: 4, textures: ["mallets", "piano", "bass", "drums"], gainDb: -1.74 },
  { id: 'waltz-for-the-window-seat', title: "Waltz for the Window Seat", url: waltzForTheWindowSeat, period: 'day', bpm: 160, genre: 'jazz', energy: 0.36, seconds: 145.4830, key: 7, mode: 'minor', meter: 3, textures: ["piano", "bass", "drums"], gainDb: -1.79 },
  { id: 'sunday-corduroy', title: "Sunday Corduroy", url: sundayCorduroy, period: 'evening', bpm: 90, genre: 'jazz', energy: 0.38, seconds: 143.7504, key: 3, mode: 'major', meter: 4, textures: ["piano", "mallets", "bass", "drums"], gainDb: -1.75 },
  { id: 'last-set-at-marlowes', title: "Last Set at Marlowe's", url: lastSetAtMarlowes, period: 'evening', bpm: 126, genre: 'jazz', energy: 0.4, seconds: 139.0455, key: 10, mode: 'major', meter: 4, textures: ["piano", "bass", "drums"], gainDb: -1.77 },
  { id: 'indigo-stairwell', title: "Indigo Stairwell", url: indigoStairwell, period: 'night', bpm: 110, genre: 'jazz', energy: 0.42, seconds: 167.2272, key: 2, mode: 'dorian', meter: 4, textures: ["mallets", "piano", "bass", "drums"], gainDb: -1.77 },
  { id: 'satellite-lullaby', title: "Satellite Lullaby", url: satelliteLullaby, period: 'night', bpm: 70, genre: 'phonk', energy: 0.48, seconds: 133.2579, key: 11, mode: 'minor', meter: 4, textures: ["piano", "mallets", "bass", "drums", "pads"], gainDb: -1.73 },
  { id: 'pale-halo', title: "Pale Halo", url: paleHalo, period: 'night', bpm: 130, genre: 'phonk', energy: 0.5, seconds: 136.0019, key: 6, mode: 'minor', meter: 4, textures: ["pads", "mallets", "bells", "bass", "drums"], gainDb: -1.74 },
  { id: 'astral-ferry', title: "Astral Ferry", url: astralFerry, period: 'night', bpm: 128, genre: 'phonk', energy: 0.55, seconds: 138.0625, key: 8, mode: 'minor', meter: 4, textures: ["mallets", "bells", "pads", "bass", "drums"], gainDb: -1.75 },
  { id: 'moonwake-drift', title: "Moonwake Drift", url: moonwakeDrift, period: 'night', bpm: 140, genre: 'phonk', energy: 0.6, seconds: 127.4285, key: 4, mode: 'phrygian', meter: 4, textures: ["bells", "bass", "drums", "pads"], gainDb: -1.74 },
  { id: 'moth-hour', title: "Moth Hour", url: mothHour, period: 'evening', bpm: 144, genre: 'phonk', energy: 0.62, seconds: 137.0436, key: 0, mode: 'minor', meter: 4, textures: ["piano", "bells", "bass", "drums", "pads"], gainDb: -1.75 },
  { id: 'aurora-run', title: "Aurora Run", url: auroraRun, period: 'evening', bpm: 135, genre: 'phonk', energy: 0.64, seconds: 131.5069, key: 7, mode: 'minor', meter: 4, textures: ["bells", "synth", "bass", "drums", "pads"], gainDb: -1.74 },
  { id: 'sodium-lights', title: "Sodium Lights", url: sodiumLights, period: 'night', bpm: 94, genre: 'synthwave', energy: 0.5, seconds: 174.6883, key: 4, mode: 'minor', meter: 4, textures: ["synth", "pads", "bass", "drums"], gainDb: -1.73 },
  { id: 'magenta-coastline', title: "Magenta Coastline", url: magentaCoastline, period: 'evening', bpm: 96, genre: 'synthwave', energy: 0.55, seconds: 171.0898, key: 2, mode: 'major', meter: 4, textures: ["synth", "pads", "plucked", "bass", "drums"], gainDb: -1.75 },
  { id: 'taillights-in-the-rain', title: "Taillights in the Rain", url: taillightsInTheRain, period: 'night', bpm: 88, genre: 'synthwave', energy: 0.56, seconds: 170.4226, key: 0, mode: 'minor', meter: 4, textures: ["synth", "pads", "bass", "drums"], gainDb: -1.74 },
  { id: 'last-light-promenade', title: "Last Light Promenade", url: lastLightPromenade, period: 'evening', bpm: 104, genre: 'synthwave', energy: 0.65, seconds: 176.0230, key: 0, mode: 'major', meter: 4, textures: ["synth", "pads", "plucked", "bass", "drums"], gainDb: -1.74 },
  { id: 'coin-op-daybreak', title: "Coin-Op Daybreak", url: coinOpDaybreak, period: 'morning', bpm: 120, genre: 'synthwave', energy: 0.68, seconds: 153.0641, key: 9, mode: 'major', meter: 4, textures: ["synth", "pads", "plucked", "bass", "drums"], gainDb: -1.75 },
  { id: 'chrome-horizon', title: "Chrome Horizon", url: chromeHorizon, period: 'night', bpm: 114, genre: 'synthwave', energy: 0.7, seconds: 160.7773, key: 6, mode: 'minor', meter: 4, textures: ["synth", "bass", "pads", "drums"], gainDb: -1.75 },
  { id: 'overpass-in-bloom', title: "Overpass in Bloom", url: overpassInBloom, period: 'evening', bpm: 160, genre: 'breakcore', energy: 0.72, seconds: 133.2967, key: 5, mode: 'dorian', meter: 4, textures: ["piano", "mallets", "pads", "breaks", "bass"], gainDb: -1.76 },
  { id: 'lanterns-on-the-water', title: "Lanterns on the Water", url: lanternsOnTheWater, period: 'evening', bpm: 172, genre: 'breakcore', energy: 0.75, seconds: 135.3963, key: 3, mode: 'major', meter: 4, textures: ["piano", "pads", "mallets", "breaks", "bass"], gainDb: -1.76 },
  { id: 'lemonade-skyline', title: "Lemonade Skyline", url: lemonadeSkyline, period: 'day', bpm: 168, genre: 'breakcore', energy: 0.78, seconds: 138.2651, key: 4, mode: 'major', meter: 4, textures: ["bells", "mallets", "piano", "plucked", "pads", "breaks", "bass"], gainDb: -1.76 },
  { id: 'glass-planetarium', title: "Glass Planetarium", url: glassPlanetarium, period: 'night', bpm: 165, genre: 'breakcore', energy: 0.8, seconds: 142.5457, key: 1, mode: 'minor', meter: 4, textures: ["bells", "pads", "synth", "piano", "breaks", "bass"], gainDb: -1.75 },
  { id: 'polaroid-summer', title: "Polaroid Summer", url: polaroidSummer, period: 'day', bpm: 170, genre: 'breakcore', energy: 0.82, seconds: 136.7724, key: 6, mode: 'minor', meter: 4, textures: ["piano", "pads", "bells", "breaks", "bass"], gainDb: -1.75 },
  { id: 'letters-i-never-sent', title: "Letters I Never Sent", url: lettersINeverSent, period: 'night', bpm: 174, genre: 'breakcore', energy: 0.84, seconds: 133.7532, key: 2, mode: 'minor', meter: 4, textures: ["piano", "pads", "strings", "breaks", "bass"], gainDb: -1.75 },
];
