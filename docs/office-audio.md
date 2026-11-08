# Office music and ambience

The Song library contains 23 original pieces, with ten genre directions and two
texture directions. The original Little Lights recording is preserved.

## Current arrangements

The five electronic recordings have been rebuilt with distinct sources and
arrangements, informed by the user's Lunar Phonk, Breakcore/DnB and Lofi Girl
references. See [music-production-research.md](music-production-research.md) for
research, sources, comparisons and limitations.

- **Cassette Clouds**, lo-fi, 82 BPM: sampled electric piano, nylon guitar,
  piano replies and acoustic bass in complementary registers. An original
  four-bar keys performance is resampled over relaxed acoustic drums with
  ghost strokes, alternate takes and restrained drift.
- **Neon Afterglow**, synthwave, 104 BPM: original Surge XT analog patches,
  syncopated bass, arpeggios, melodic answers, drum pickups and a contrasting
  tunnel section. A sampled snare has a short gated room; its direct attack
  remains distinct.
- **Tidal Memory**, ambient, 66 BPM: native synth pads overlap independent
  phrases. Original plucks become evolving washes, with sparse motifs and
  slow releases.
- **Petal Breaks**, atmospheric breakcore/DnB, 164 BPM: an original eight-bar
  performance using recorded acoustic hits is sliced into musical phrases.
  Ghost notes, displaced answers and selective retriggers retain clear anchors.
  Drumless and half-time resets, a bell-led middle and a brighter return give
  the dense sections a purpose.
- **Midnight Drift**, lunar phonk, 74 BPM with a 148 BPM feel: a clean mono
  808, stereo pads, an original pitched-metal motif with sampled vibraphone
  body, developed hats and a quiet underpass. No reference melody or vocal
  recording is included.

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
of unwanted trailing silence removed by packet copying. Every retained decoded
sample matches its earlier recording exactly.

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
room-air bed is filtered stereo air. Spatial typing, footsteps, water, birds
and object sounds continue to follow real visible activity.

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
`reference-mix-metrics.json`, `surge-mix-metrics.json`, `genre-metrics.json` and
`story-metrics.json` retain structure and production provenance.
`library-mastering.json` measures actual packaged MP3 hashes, duration, DC,
stereo correlation, silence, loudness and true peaks.

Earlier generation tools remain `compose-office-theme.py`,
`compose-office-playlist.py` and `compose-office-encore.py`. After regenerating
older additions, run `master-office-legacy.py`, then measure the library again.
That trimming pass is idempotent.

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
