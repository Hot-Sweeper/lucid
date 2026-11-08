# Office music and ambience

The Song library contains 23 original pieces, with ten genre directions and two
texture directions. The first fourteen cozy recordings are preserved. The nine
newer pieces use phrase-aligned harmonic plans and recurring written themes,
rather than separate short lead and chord loops.

## Current arrangements

The five electronic recordings have been rebuilt with distinct sources and
arrangements, informed by the user's Lunar Phonk, Breakcore/DnB and Lofi Girl
references. See [music-production-research.md](music-production-research.md) for
research, sources, comparisons and limitations.

- **Cassette Clouds**, lo-fi, 82 BPM: sampled electric piano, nylon guitar,
  a recurring eight-bar tune with open and closed sixteen-bar endings, piano
  development and acoustic bass in complementary registers. An original
  four-bar keys performance is resampled over relaxed acoustic drums with
  ghost strokes, alternate takes and restrained drift.
- **Neon Afterglow**, synthwave, 104 BPM: original Surge XT analog patches,
  a syncopated repeated-note hook, connected bass, restrained lower arpeggios,
  drum pickups and a contrasting tunnel section. The pad sits behind the lead.
  A sampled snare has a short gated room; its direct attack remains distinct.
- **Tidal Memory**, ambient, 66 BPM: sampled soft electric piano, nylon
  guitar and occasional celesta. An eight-bar falling theme develops on piano,
  slows into a pad-free interlude and returns on nylon. Brief sine-only chord
  breaths leave clear pauses, with restrained filtered reflections.
- **Petal Breaks**, atmospheric breakcore/DnB, 164 BPM: an original eight-bar
  performance using recorded acoustic hits is sliced into musical phrases.
  Ghost notes, displaced answers and selective retriggers retain clear anchors.
  A sixteen-bar falling theme uses actual sampled acoustic piano. Drumless and
  half-time resets, a related bell variation and the theme's return give the
  dense sections a purpose.
- **Midnight Drift**, lunar phonk, 74 BPM with a 148 BPM feel: a clean mono
  808, stereo pads, an original pitched-metal motif with sampled vibraphone
  body, developed hats and a quiet underpass. A recurring Eb-Gb-Bb cell follows
  two-bar common-tone harmonies and develops through sixteen-bar sentences.
  No reference melody or vocal recording is included.

Four chamber pieces add separate story moods:

- **The Glass Observatory**, mystical, 72 BPM, E Dorian: suspended pads,
  bell questions, harp and bowed-string responses.
- **Briar Lanterns**, medieval, 90 BPM in 3/4, D Dorian: lute-like plucks,
  recorder, an open drone and restrained hand percussion.
- **The Copper Casebook**, detective, 96 BPM in 3/4, D minor: pizzicato,
  clarinet, piano and chromatic questions that resolve in the returning theme.
- **Postcards from Home**, nostalgic, 78 BPM, A-flat major: piano and cello
  trade phrases over quiet strings and a contrasting middle.

FluidSynth renders actual FluidR3 instrument samples for the chamber parts.
Sustained instruments receive authored breath/bow expression; keys and plucks
retain velocity and articulation. Stem-specific EQ and filtered room sends
support the arrangement. FluidR3 is a modest sample bank, without the
articulation depth of a large contemporary orchestral library.

The earlier score remains available: Little Lights, Window Garden, First
Coffee, Paper Kites, Peach Parade, Apricot Hour, Tram Home, Moonlit Desks,
Sleepy Satellites, Pocket Sunrise, Cloud Arcade, Velvet Elevator, Lantern
Carousel and The Last Constellation. Thirteen older additions had 34.43 seconds
of unwanted trailing silence removed by packet copying. That cleanup retained
every decoded sample before the trim. A later percussion pass rebuilt the six
daytime additions and five encore recordings with recorded CC0 drums, leaving
their written harmonies and hooks in place. Two earlier drumless ambient pieces
and Little Lights subsequently received the same natural bell-release correction.

## Percussion and space

The percussion revision replaces swept oscillator kicks and generated noise hits
in eleven earlier arrangements, Neon and Petal with recorded drum sources. Family
calibration retains the quieter levels and tonal differences of soft strokes and
alternate takes. Kick, snare and hat material is treated separately; the kick
stays centered and dry, with excessive acoustic ring gently damped.

Midnight also has stable-note sub attacks instead of sweeping from the previous
bass pitch at every hit. Smooth kick-triggered ducking makes room for the kick
without pumping every musical layer. Its snare and hats get selective filtered,
predelayed room returns and quiet phrase-end echoes. Sparse metal accents sit
beneath the sampled motif. Cassette retains its laid-back timing and sampled keys.

Neon's kick now uses recorded body instead of an exaggerated oscillator sweep;
selected snare answers carry stereo delays. Tidal remains drumless. Its remake uses soft sampled figures and brief chord
breaths with genuine gaps, replacing the earlier long overlapping unison bed.
These effects are authored into the recordings and do not run in the app.

## Direction and playback

**Office radio**, below the volume controls, defaults to **Evolving journey**.
Eleven listening-time chapters develop the mood: Still water, Observatory,
Briar path, Old postcards, Warm tape, Copper casebook, Night drive, Neon rise,
Petal rush, Afterglow and Soft landing. Chapter budgets range from two to five
minutes and advance between complete songs, after their defining genre has
played. Each recording also contains its own authored development.

Selections consider energy, related major/minor/modal keys, half/double-time
tempo relationships and shared textures. A compatible bridge can lead into a
remote key or larger energy change. This is song-boundary curation, without
live beat matching or time stretching. No adjacent songs repeat in the journey.
Unheard tracks get preference within compatible pools; every piece is reachable.

Only active media playback advances the journey. Pausing, muting, hiding Lucid,
buffering, seeking and wall-clock time do not count. Local time chooses the
initial chapter and lightly weights later selections. Chapter progress,
history, playback position, pause state and direction persist across restarts.
Older saved chapter IDs still migrate.

Choose a genre to stay in it, **Ambient pads** for quiet pad-led pieces, or
**Bells & wonder** for gentle bell material. A direction schedules the next
song; **Next song** applies it immediately. A one-song genre may repeat when
locked. **Pause music** leaves room ambience and game sounds alone.

**Sound volume** controls everything. **Theme music** and **Room ambience**
adjust the background layers independently; zero pauses that layer. Global
mute remains authoritative. Trusted user input unlocks audio. Hidden music
resumes from its position after the next gesture. Two reused local streaming
sources feed the singleton audio context and master gain. Only room air loops;
songs rotate on actual media-ended events. Muted or hidden late events cannot
restart playback.

Each piece has a measured constant playback trim targeting -20 LUFS. This
matches playback loudness while preserving section dynamics. The separate
room-air bed is quiet, low-band stereo tone (100 to 650 Hz), with restrained
modulation rather than rain-like hiss and swells. Its playback calibration is
6 dB lower than the earlier bed, including for previously saved slider levels;
zero still pauses it. This layer is independent of weather. Spatial typing,
footsteps, water, birds and object sounds follow real visible activity.

## Song library

Open **App library**, then **Song library** under Media. The 23-song catalogue
supports title, genre and texture search, genre filters, durations and whole-row
Play, Pause, Resume or Retry. The playback disclosure contains the same music
direction and Next controls. A chosen song plays immediately through the office
stream, then the selected direction resumes with the following song.

Switching apps or returning to the office keeps playback running. Exiting the
library releases subscriptions; search, filters and scroll position survive
reopening. Narrow views offer **All apps** to return to the grid. English/German
labels update without changing authored song titles. Botify remains a separate
fictional robot-app demo.

## Authoring and provenance

These are offline tools. The app ships MP3 recordings and needs no plug-in,
sample bank, Python process or music service at runtime. Install Python
dependencies from `scripts/requirements-music.txt`; FFmpeg and FluidSynth are
separate prerequisites.

Acoustic hits come from the CC0
[Versilian Community Sample Library](https://github.com/sgossner/VCSL).
`scripts/assets/vcsl-drums.json` pins 23 paths, sizes and SHA256 hashes:

```bash
python scripts/fetch-vcsl-drums.py --output-dir /tmp/lucid-vcsl-drums
```

Use the MIT FluidR3 GM bank through `FLUID_SOUNDFONT`. Its notice is retained
in `docs/licenses/FluidR3-GM.txt`. For synth renders, `SURGE_VST3` points to a
compatible Linux Surge XT VST3; `SURGE_DATA_HOME` can identify portable data.
Original patch parameters and source information are recorded with the renders.
Factory presets and reference recordings are not composition inputs.

```bash
python scripts/reference_mixes.py --soundfont "$FLUID_SOUNDFONT" --drums /tmp/lucid-vcsl-drums
VCSL_DRUMS=/tmp/lucid-vcsl-drums python scripts/surge_arrangements.py
python scripts/compose-office-genres.py --only petal-breaks --sample-dir /tmp/lucid-vcsl-drums
python scripts/compose-office-stories.py
python scripts/sync-music-catalog.py
python scripts/verify-music-masters.py --write
```

`compose-office-genres.py` now renders only Petal Breaks. Its earlier sketches
cannot overwrite newer sampled/native masters through the command line.
`reference-mix-metrics.json`, `surge-mix-metrics.json`,
`tidal-remake-metrics.json`, `genre-metrics.json` and `story-metrics.json` retain
structure and production provenance. Tidal can be rebuilt separately with
`python scripts/tidal_arrangement.py`; `surge_arrangements.py --only tidal-memory` delegates to this remake, so it
cannot regenerate the retired sustained pad version.
`library-mastering.json` measures actual packaged MP3 hashes, duration, DC,
stereo correlation, silence, loudness and true peaks.

Regenerate room air alone with `python scripts/compose-office-theme.py --only ambience`,
which preserves every music recording. Earlier generation tools remain `compose-office-theme.py`,
`compose-office-playlist.py` and `compose-office-encore.py`. The latter two use
`cozy_percussion.py` and the same pinned VCSL cache, passed with `--sample-dir`
or `LUCID_VCSL_DRUMS`. Their `--only` option can render selected recordings
without deleting other metadata rows. After regenerating older additions, run
`master-office-legacy.py`, then measure the library again. That trimming pass
is idempotent.

## Verification

```bash
python scripts/verify-music-masters.py
node scripts/verify-game-sound.cjs
node scripts/verify-background-audio.cjs
node scripts/verify-soundtrack.cjs
node scripts/verify-soundscape.cjs
node scripts/verify-background-audio-native.cjs
npm run verify:update
```

Encoded-master checks reject dead starts/tails, invalid samples, poor peak
headroom, stale durations and inconsistent playback loudness. Director checks
exercise 24 seeded persisted journeys, genre/texture locks, harmonic bridges,
manual choices and older saved-state migration.

For browser acceptance, run `node scripts/prepare-music-review.mjs --serve`
in the hidden agent workspace. Open its loopback URL in agent Firefox and
press **Run checks**. Production controls, the director and the audio engine
feed an analyser through a zero-gain output. Checks cover every new direction,
decoded signal, pause/resume, listening time, seeking, mute, bounded streams,
keyboard focus, narrow layout and German labels. A loopback origin is necessary
because Firefox isolates separate `file://` media from analysis.

`node scripts/prepare-song-library-review.mjs --serve` similarly exercises
the production app library, real selection, filters, empty results, locale,
cleanup, playback continuity, focus and narrow navigation. Neither fixture
touches the running office's saved settings. Stop its hidden workspace afterward.

Signal analysis and functional checks do not establish musical enjoyment.
No subjective listening approval is claimed by these automated tools.

## Themes and phrasing

The newer scores have explicit multi-bar melodies with repeated identifying
rhythms, connected bass movement and written phrase endings. Development uses
the theme's own material, then makes its return recognizable. Supporting parts
leave gaps around the lead; reducing unrelated counterlines and excessive high
register decoration is part of the arrangement. The first fourteen recordings
remain byte-for-byte identical to the approved cozy collection at this revision.

Source note tables and render sidecars record these decisions for review. They
document the writing rather than assign it an automatic musical-quality score.

## Bell articulation

Bell strikes ring independently of the short written melody gate. The release
correction preserves their attack, note placement and written phrases, while
allowing modest overlap and a final taper only after the ring is quiet. This
applies to Little Lights, Moonlit Desks, Sleepy Satellites, Lantern Carousel,
The Glass Observatory, Petal Breaks and Midnight Drift. Midnight's sampled
vibraphone also uses independent MIDI voices so an earlier note-off cannot
choke a repeated strike. Tidal's sampled celesta already has a natural release.
