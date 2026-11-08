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
import glassObservatory from '../assets/audio/the-glass-observatory.mp3';
import briarLanterns from '../assets/audio/briar-lanterns.mp3';
import copperCasebook from '../assets/audio/the-copper-casebook.mp3';
import postcardsHome from '../assets/audio/postcards-from-home.mp3';
import honeycombHours from '../assets/audio/honeycomb-hours.mp3';
import blueHourBookshop from '../assets/audio/blue-hour-bookshop.mp3';
import sundaySignal from '../assets/audio/sunday-signal.mp3';
import snowglobeOrbit from '../assets/audio/snowglobe-orbit.mp3';
import mosslight from '../assets/audio/mosslight.mp3';
import quietConstellations from '../assets/audio/quiet-constellations.mp3';
import mapleStreetMorning from '../assets/audio/maple-street-morning.mp3';
import seasidePostOffice from '../assets/audio/seaside-post-office.mp3';
import electricHorizon from '../assets/audio/electric-horizon.mp3';
import violetMotorway from '../assets/audio/violet-motorway.mp3';
import cityOfComets from '../assets/audio/city-of-comets.mp3';
import fernFrequency from '../assets/audio/fern-frequency.mp3';
import blueHourBreaks from '../assets/audio/blue-hour-breaks.mp3';
import orbitalBloom from '../assets/audio/orbital-bloom.mp3';
import mercuryBoulevard from '../assets/audio/mercury-boulevard.mp3';
import velvetTransmission from '../assets/audio/velvet-transmission.mp3';
import mothlightAtlas from '../assets/audio/mothlight-atlas.mp3';
import theAmberArchive from '../assets/audio/the-amber-archive.mp3';
import foxgloveCrossing from '../assets/audio/foxglove-crossing.mp3';
import theWillowCourt from '../assets/audio/the-willow-court.mp3';
import theVelvetAlibi from '../assets/audio/the-velvet-alibi.mp3';
import clocksOnBakerStreet from '../assets/audio/clocks-on-baker-street.mp3';
import sundayAtTheStation from '../assets/audio/sunday-at-the-station.mp3';
import septemberLetters from '../assets/audio/september-letters.mp3';
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
  { id: 'cassette-clouds', title: 'Cassette Clouds', url: cassetteClouds, period: 'day', bpm: 82, genre: 'lofi', energy: 0.32, seconds: 165.5000, key: 5, mode: 'major', meter: 4, textures: ["piano", "plucked", "drums"], gainDb: -2.29 },
  { id: 'neon-afterglow', title: 'Neon Afterglow', url: neonAfterglow, period: 'evening', bpm: 104, genre: 'synthwave', energy: 0.65, seconds: 159.6822, key: 2, mode: 'minor', meter: 4, textures: ["pads", "bass", "synth", "drums"], gainDb: 0.44 },
  { id: 'tidal-memory', title: 'Tidal Memory', url: tidalMemory, period: 'night', bpm: 66, genre: 'ambient', energy: 0.12, seconds: 160.2903, key: 4, mode: 'lydian', meter: 4, textures: ["pads", "bells", "piano", "plucked"], gainDb: 0.76 },
  { id: 'petal-breaks', title: 'Petal Breaks', url: petalBreaks, period: 'day', bpm: 164, genre: 'breakcore', energy: 0.84, seconds: 146.1600, key: 2, mode: 'minor', meter: 4, textures: ["pads", "bells", "piano", "breaks"], gainDb: -0.81 },
  { id: 'midnight-drift', title: 'Midnight Drift', url: midnightDrift, period: 'night', bpm: 74, genre: 'phonk', energy: 0.51, seconds: 186.4200, key: 3, mode: 'minor', meter: 4, textures: ["pads", "bells", "bass", "drums"], gainDb: -0.53 },
  { id: 'the-glass-observatory', title: 'The Glass Observatory', url: glassObservatory, period: 'night', bpm: 72, genre: 'mystical', energy: 0.18, seconds: 160.5600, key: 4, mode: 'dorian', meter: 4, textures: ["pads", "bells", "strings", "plucked"], gainDb: -3.05 },
  { id: 'briar-lanterns', title: 'Briar Lanterns', url: briarLanterns, period: 'morning', bpm: 90, genre: 'medieval', energy: 0.34, seconds: 171.0400, key: 2, mode: 'dorian', meter: 3, textures: ["pads", "plucked", "reeds", "drums"], gainDb: -2.09 },
  { id: 'the-copper-casebook', title: 'The Copper Casebook', url: copperCasebook, period: 'evening', bpm: 96, genre: 'noir', energy: 0.44, seconds: 150.8400, key: 2, mode: 'minor', meter: 3, textures: ["piano", "strings", "plucked", "reeds"], gainDb: -1.79 },
  { id: 'postcards-from-home', title: 'Postcards from Home', url: postcardsHome, period: 'evening', bpm: 78, genre: 'nostalgic', energy: 0.25, seconds: 173.2000, key: 8, mode: 'major', meter: 4, textures: ["piano", "strings"], gainDb: -3.07 },
  { id: 'honeycomb-hours', title: "Honeycomb Hours", url: honeycombHours, period: 'day', bpm: 76, genre: 'lofi', energy: 0.27, seconds: 165.9294, key: 10, mode: 'major', meter: 4, textures: ["piano", "plucked", "bass", "drums"], gainDb: 0.76 },
  { id: 'blue-hour-bookshop', title: "Blue Hour Bookshop", url: blueHourBookshop, period: 'evening', bpm: 84, genre: 'lofi', energy: 0.34, seconds: 150.0423, key: 7, mode: 'minor', meter: 4, textures: ["piano", "plucked", "bass", "drums"], gainDb: 0.77 },
  { id: 'sunday-signal', title: "Sunday Signal", url: sundaySignal, period: 'morning', bpm: 92, genre: 'lofi', energy: 0.39, seconds: 137.1000, key: 4, mode: 'minor', meter: 4, textures: ["bells", "piano", "bass", "drums"], gainDb: 0.77 },
  { id: 'snowglobe-orbit', title: "Snowglobe Orbit", url: snowglobeOrbit, period: 'night', bpm: 60, genre: 'ambient', energy: 0.1, seconds: 146.5166, key: 9, mode: 'lydian', meter: 4, textures: ["pads", "piano", "plucked"], gainDb: 0.77 },
  { id: 'mosslight', title: "Mosslight", url: mosslight, period: 'night', bpm: 62, genre: 'ambient', energy: 0.17, seconds: 141.5871, key: 2, mode: 'dorian', meter: 4, textures: ["pads", "piano", "plucked"], gainDb: 0.78 },
  { id: 'quiet-constellations', title: "Quiet Constellations", url: quietConstellations, period: 'night', bpm: 70, genre: 'ambient', energy: 0.2, seconds: 125.4952, key: 11, mode: 'major', meter: 4, textures: ["pads", "bells", "piano"], gainDb: 0.76 },
  { id: 'maple-street-morning', title: "Maple Street Morning", url: mapleStreetMorning, period: 'morning', bpm: 94, genre: 'acoustic', energy: 0.36, seconds: 123.7470, key: 7, mode: 'major', meter: 3, textures: ["mallets", "plucked", "bass", "drums"], gainDb: 0.84 },
  { id: 'seaside-post-office', title: "Seaside Post Office", url: seasidePostOffice, period: 'day', bpm: 86, genre: 'acoustic', energy: 0.42, seconds: 146.6600, key: 2, mode: 'major', meter: 4, textures: ["piano", "plucked", "bass", "drums"], gainDb: 1.16 },
  { id: 'electric-horizon', title: "Electric Horizon", url: electricHorizon, period: 'evening', bpm: 112, genre: 'synthwave', energy: 0.63, seconds: 128.6387, key: 0, mode: 'minor', meter: 4, textures: ["pads", "bass", "synth", "drums"], gainDb: 0.60 },
  { id: 'violet-motorway', title: "Violet Motorway", url: violetMotorway, period: 'evening', bpm: 100, genre: 'synthwave', energy: 0.58, seconds: 143.9791, key: 9, mode: 'major', meter: 4, textures: ["pads", "bass", "synth", "drums"], gainDb: 0.62 },
  { id: 'city-of-comets', title: "City of Comets", url: cityOfComets, period: 'night', bpm: 118, genre: 'synthwave', energy: 0.72, seconds: 122.2258, key: 4, mode: 'minor', meter: 4, textures: ["pads", "bass", "synth", "drums"], gainDb: 0.62 },
  { id: 'fern-frequency', title: "Fern Frequency", url: fernFrequency, period: 'day', bpm: 168, genre: 'breakcore', energy: 0.77, seconds: 137.4144, key: 7, mode: 'minor', meter: 4, textures: ["pads", "piano", "breaks", "bass", "drums"], gainDb: 0.61 },
  { id: 'blue-hour-breaks', title: "Blue Hour Breaks", url: blueHourBreaks, period: 'evening', bpm: 160, genre: 'breakcore', energy: 0.74, seconds: 144.2766, key: 11, mode: 'minor', meter: 4, textures: ["pads", "piano", "breaks", "bass", "drums"], gainDb: 0.63 },
  { id: 'orbital-bloom', title: "Orbital Bloom", url: orbitalBloom, period: 'night', bpm: 174, genre: 'breakcore', energy: 0.86, seconds: 132.5110, key: 5, mode: 'minor', meter: 4, textures: ["pads", "bells", "piano", "breaks", "bass", "drums"], gainDb: 0.61 },
  { id: 'mercury-boulevard', title: "Mercury Boulevard", url: mercuryBoulevard, period: 'night', bpm: 78, genre: 'phonk', energy: 0.47, seconds: 147.0705, key: 1, mode: 'minor', meter: 4, textures: ["pads", "bells", "bass", "drums"], gainDb: 0.62 },
  { id: 'velvet-transmission', title: "Velvet Transmission", url: velvetTransmission, period: 'evening', bpm: 70, genre: 'phonk', energy: 0.52, seconds: 163.8635, key: 9, mode: 'minor', meter: 4, textures: ["pads", "bells", "bass", "drums"], gainDb: 0.62 },
  { id: 'mothlight-atlas', title: "Mothlight Atlas", url: mothlightAtlas, period: 'night', bpm: 70, genre: 'mystical', energy: 0.2, seconds: 137.9600, key: 7, mode: 'dorian', meter: 4, textures: ["pads", "bells", "strings", "plucked", "reeds"], gainDb: 0.28 },
  { id: 'the-amber-archive', title: "The Amber Archive", url: theAmberArchive, period: 'night', bpm: 76, genre: 'mystical', energy: 0.25, seconds: 128.1300, key: 0, mode: 'lydian', meter: 4, textures: ["pads", "piano", "strings", "plucked"], gainDb: 0.27 },
  { id: 'foxglove-crossing', title: "Foxglove Crossing", url: foxgloveCrossing, period: 'morning', bpm: 96, genre: 'medieval', energy: 0.38, seconds: 122.0300, key: 9, mode: 'dorian', meter: 3, textures: ["strings", "plucked", "reeds"], gainDb: 0.26 },
  { id: 'the-willow-court', title: "The Willow Court", url: theWillowCourt, period: 'morning', bpm: 84, genre: 'medieval', energy: 0.32, seconds: 139.0700, key: 5, mode: 'major', meter: 3, textures: ["strings", "plucked", "reeds"], gainDb: 0.26 },
  { id: 'the-velvet-alibi', title: "The Velvet Alibi", url: theVelvetAlibi, period: 'evening', bpm: 108, genre: 'noir', energy: 0.46, seconds: 125.5100, key: 7, mode: 'minor', meter: 4, textures: ["piano", "plucked", "reeds", "bass"], gainDb: 0.26 },
  { id: 'clocks-on-baker-street', title: "Clocks on Baker Street", url: clocksOnBakerStreet, period: 'evening', bpm: 100, genre: 'noir', energy: 0.42, seconds: 101.0400, key: 11, mode: 'minor', meter: 3, textures: ["piano", "plucked", "reeds", "bass"], gainDb: 0.26 },
  { id: 'sunday-at-the-station', title: "Sunday at the Station", url: sundayAtTheStation, period: 'evening', bpm: 84, genre: 'nostalgic', energy: 0.3, seconds: 138.0600, key: 2, mode: 'major', meter: 4, textures: ["piano", "strings"], gainDb: 0.26 },
  { id: 'september-letters', title: "September Letters", url: septemberLetters, period: 'evening', bpm: 72, genre: 'nostalgic', energy: 0.23, seconds: 121.0200, key: 3, mode: 'major', meter: 3, textures: ["piano", "strings"], gainDb: 0.26 },
];
