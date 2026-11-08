# Office music and ambience

The soundtrack now contains nineteen original pieces, about 45 minutes in total:

- Morning: **Window Garden** (bright mallets, 88 BPM) and **First Coffee**
  (electric-piano waltz, 96 BPM).
- Daytime: **Little Lights** (78 BPM), **Paper Kites** (plucked melody,
  102 BPM) and **Peach Parade** (mallets and soft percussion, 92 BPM).
- Evening: **Apricot Hour** (warm jazz harmony, 76 BPM) and **Tram Home**
  (minor-key waltz, 82 BPM).
- Night: **Moonlit Desks** (sparse glass tones, 64 BPM) and **Sleepy Satellites**
  (soft pads and keys, 68 BPM).

Five encore pieces extend the score with separate authored hooks and arrangements:

- **Pocket Sunrise**, morning, 104 BPM: syncopated marimba, plucked chords and a
  light bossa pulse, with an ascending hook that returns in a fuller final section.
- **Cloud Arcade**, daytime, 110 BPM: rounded triangle-synth melody, offbeat
  plucks and soft electronic drums, with a contrasting piano bridge.
- **Velvet Elevator**, evening, 86 BPM: swung tine piano, walking bass answers,
  brushed percussion and a borrowed minor chord in the turnaround.
- **Lantern Carousel**, night, 78 BPM: a music-box waltz in A minor, with rolled
  chords, a rising middle phrase and a quiet low-register reprise.
- **The Last Constellation**, night, 72 BPM: a slow, spacious synth melody over
  major-ninth harmony, soft pads and restrained half-time percussion.

These five recordings add roughly 12½ minutes. Their intro, contrasting bridge,
quiet middle, reprise and closing cadence are rendered into the audio files.

## Genre journeys

The five genre recordings add 13 minutes with different production approaches:

- **Cassette Clouds**, lo-fi, 82 BPM (2:38): dusty, detuned keys and plucked
  guitar over swung drums; a stripped middle gives the returning hook space.
- **Neon Afterglow**, synthwave, 104 BPM (2:34): detuned saw and pulse leads,
  sequenced arpeggios, pumping pads and a gated snare.
- **Tidal Memory**, ambient, 66 BPM (2:43): drumless overlapping textures,
  slow stereo blooms, shimmer and a sparse motif.
- **Petal Breaks**, melodic breakcore, 164 BPM (2:26): an original synthetic
  break is physically sliced, rearranged, reversed and ratcheted around an airy
  melody, with quiet respite sections between the denser passages.
- **Midnight Drift**, chill phonk, 88 BPM (2:39): a dark cowbell hook, gliding
  808 sub-bass, crisp hats and a half-time groove.

**Office radio**, in Office & settings below the volume controls, defaults to
**Evolving journey**. Seven chapters develop the mood: Still water, Warm tape,
Night drive, Neon rise, Petal rush, Afterglow, and Soft landing. Their listening
budgets range from two to five minutes; they turn only between songs after the
chapter's defining genre has played. Energy-aware bridge songs build toward the
faster material and settle afterward. Each piece also contains its own authored
arrangement and breakdowns.

Only actual, active media playback advances this arc. Muting, pausing, hiding
Lucid, waiting for media, seeking and wall-clock time do not advance it. Local
time chooses the initial chapter and lightly weights later selections; it never
interrupts the current song. Genre, chapter progress, playback position and pause
state persist locally across restarts. Older soundtrack history migrates.

Unheard songs get preference within compatible chapters. Rare genres can return
before every cozy instrumental has played, keeping the journey varied; all songs
remain reachable. There are no adjacent repeats in the normal journey. A genre
lock stays in that style, intentionally repeating its recording when only one is
available. **Cozy instrumentals** retains access to the older light arrangements.
The mode selector schedules the next song; **Next song** applies it immediately.
**Pause music** leaves room ambience and the rest of the game sound alone.

Lucid's original theme, **Little Lights**, is a 64-bar, 78 BPM instrumental in
D major (3:17). A short bell melody returns between warm electric-piano passages,
rounded bass, soft pads and brushed percussion. The middle thins out before the
melody returns. This recording is preserved. The first eight additions have separate
authored chord progressions, hooks, rhythms and arrangements.

The separate room-air bed is quiet, filtered stereo air. Existing spatial typing,
footsteps, park water, birds and object sounds still follow actual visible activity.
The ambience does not imply rain, conversations or agent activity.

In Office & tools, **Sound volume** controls everything. **Theme music** and
**Room ambience** adjust the two background layers independently; zero pauses
that layer. The existing Sound on/off button mutes everything. Settings persist.
Audio starts only after a trusted gesture, pauses while hidden, and fades back in
from its previous position after the next gesture. The tracks use the singleton
audio context and master gain, with two reused local streaming sources and no new
timers. Only room air loops. The music player advances on the actual media-ended
event and uses media time updates for its tail fade. Muting or hiding the office
prevents a late song-ending event from restarting playback.

The assets in `src/assets/audio` contain original synthesis with no third-party
samples or services. To regenerate the original theme and air, run
`python scripts/compose-office-theme.py`. To regenerate the eight added songs,
run `python scripts/compose-office-playlist.py`. To regenerate the five encore
pieces, run `python scripts/compose-office-encore.py`. All three use numpy, scipy
and ffmpeg. Run `python scripts/compose-office-genres.py` for the five genre
recordings. These are authoring tools only, not app dependencies. Per-song source PCM levels
and durations are recorded in `src/assets/audio/soundtrack-metrics.json` and
`src/assets/audio/genre-metrics.json`; the new
pieces have roughly matched average levels around -20 dBFS RMS. The original source PCM theme measures
-2.85 dBFS peak and -19.86 dBFS RMS; room air measures -13.98 dBFS peak and
-29.01 dBFS RMS. At default gains the calculated theme RMS is about -40.3 dBFS,
and the air about -48.7 dBFS, before device volume. These are digital signal levels,
not measured listening loudness or device performance.

Regression checks:

```
node scripts/verify-game-sound.cjs
node scripts/verify-background-audio.cjs
node scripts/verify-soundtrack.cjs
node scripts/verify-soundscape.cjs
node scripts/verify-background-audio-native.cjs
npm run verify:update
```

The native fixture uses real Chromium decoding and an analyser, with its output
muted. It checks the entire soundtrack for codec coverage and separately checks
real ended-event rotation,
nonzero signal, the bounded two-stream pool, the ambience loop and controls.
It seeks near song endings to exercise the transitions. It is not a listening test.

For a local Firefox acceptance fixture using the production controls, director,
and audio engine, run `node scripts/prepare-music-review.mjs --serve` inside the
hidden agent workspace. Open its printed loopback URL in agent Firefox and press
**Run checks**. The loopback origin permits real Web Audio analysis; separate
`file://` media files are blocked from the analyser by Firefox origin isolation. It routes
audio into a zero-gain output, checks all five genres for real decoded signal,
then checks pause/resume, delayed mode changes, actual listening time, seeking,
mute, bounded streams, keyboard focus, narrow layout and German labels. This is
functional audio verification, not a subjective listening test. The fixture does
not touch the running office or its saved settings. Stop the hidden workspace
afterward to close both Firefox and the local QA server.
