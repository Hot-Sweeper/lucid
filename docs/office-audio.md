# Office music and ambience

The soundtrack now contains nine original pieces, about 19 minutes in total:

- Morning: **Window Garden** (bright mallets, 88 BPM) and **First Coffee**
  (electric-piano waltz, 96 BPM).
- Daytime: **Little Lights** (78 BPM), **Paper Kites** (plucked melody,
  102 BPM) and **Peach Parade** (mallets and soft percussion, 92 BPM).
- Evening: **Apricot Hour** (warm jazz harmony, 76 BPM) and **Tram Home**
  (minor-key waltz, 82 BPM).
- Night: **Moonlit Desks** (sparse glass tones, 64 BPM) and **Sleepy Satellites**
  (soft pads and keys, 68 BPM).

A persistent shuffle bag plays every piece before repeating one and avoids an
immediate repeat when the bag refills. Local time weights the next choice toward
morning (06:00 to 11:00), day (11:00 to 17:00), evening (17:00 to 22:00), or night.
It does not interrupt the current song at a time boundary. The outgoing song
fades down and the next fades in. History survives app restarts.

Lucid's original theme, **Little Lights**, is a 64-bar, 78 BPM instrumental in
D major (3:17). A short bell melody returns between warm electric-piano passages,
rounded bass, soft pads and brushed percussion. The middle thins out before the
melody returns. This recording is preserved. The eight additions have separate
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
run `python scripts/compose-office-playlist.py`. Both use numpy, scipy and ffmpeg.
These are authoring tools only, not app dependencies. Per-song source PCM levels
and durations are recorded in `src/assets/audio/soundtrack-metrics.json`; the new
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
muted. It checks all nine songs, real ended-event rotation without repetitions,
nonzero signal, the bounded two-stream pool, the ambience loop and controls.
It seeks near song endings to exercise the transitions. It is not a listening test.
