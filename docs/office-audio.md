# Office music and ambience

The office soundtrack holds 51 pieces, about two hours of music, in seven genres:
lo-fi (7), jazz (6), ambient (9), lunar phonk (6), synthwave (6), atmospheric
breakcore (6) and the 11 acoustic pieces of the original cozy collection. The
14 original recordings (Little Lights, Window Garden, First Coffee, Paper Kites,
Peach Parade, Apricot Hour, Tram Home, Moonlit Desks, Sleepy Satellites, Pocket
Sunrise, Cloud Arcade, Velvet Elevator, Lantern Carousel, The Last
Constellation) are unchanged. The 37 genre pieces replace an earlier set that
was rejected for random-sounding melodies, weak beats and poor instruments.

## How the genre pieces are made

Every genre piece is a score written by hand in
`tools/music/lucid_music/songs/<id>.py`: chord progressions chosen bar by bar,
melodies written note by note from a short motif that is repeated, sequenced
and answered, and idiomatic parts (voice-led comping, walking bass, boom-bap,
swing ride, Memphis hats, chopped breaks). Each has an intro and outro soft
enough for crossfading, a contrasting middle section and a varied return.
`parts.clashes` checks every melody against its harmony on strong beats.

Instruments are real recordings or professional synth patches:

- Rhodes Mark I (jRhodes3d), Wurlitzer EP200 and Yamaha CP80 (Greg Sullivan
  E-Pianos), Salamander Grand Piano V3, Karoryfer Sneakybass (pizzicato double
  bass), Karoryfer x Bigcat cello, VCSL vibraphone, harp and claps.
- Virtuosity Drums (multi-velocity, round-robin kit in "lofi" and "mid" mic
  perspectives, plus shaker, tambourine, congas and cowbell).
- Surge XT 1.3.4 factory and third-party patches for pads, leads, plucks and
  synth basses, loaded through the plug-in state.
- Small DSP voices for genre staples: a gliding 808 sub, TR-808 style kick,
  clap, hats and the two-oscillator 808 cowbell used for phonk melodies.

Mixing happens per part (level targets, EQ, sidechain from the kick, shared
reverb and tempo-synced delay sends, tape and vinyl character where the genre
wants it), then a master stage sets -18 LUFS with true peaks at or below
-3.4 dBTP. The genre writing rules are in
[tools/music/lucid_music/COMPOSING.md](../tools/music/lucid_music/COMPOSING.md).
Background on the reference playlists is in
[music-production-research.md](music-production-research.md); its comments on
individual songs describe the retired set.

## Direction and playback

**Office radio**, below the volume controls, defaults to **Evolving journey**.
Ten listening-time chapters form one arc: Still water, Morning light, Warm
tape, Late cafe, Night drive, Neon rise, Petal rush (the breakcore peak),
Afterglow, Lunar drift and Soft landing. Local time picks a calm opening (night
Still water, morning Morning light, day Warm tape, evening Late cafe). A chapter
turns only between complete songs, after its budget of real listening time and
once its defining genre has played or was already heard in this rotation.

The journey flows like a DJ set. Consecutive automatic songs must connect in
the genre graph (`GENRE_NEIGHBORS` in `soundtrack-queue.ts`) and differ by at
most 0.2 energy (`MAX_ENERGY_STEP`):

- acoustic, ambient, lo-fi and jazz form the calm cluster;
- lo-fi and jazz lead into lunar phonk;
- phonk leads into synthwave;
- breakcore is entered and left only through synthwave or phonk.

Within those rules, selection prefers related keys, half or double tempo
relationships, shared textures, the chapter's energy and the time of day. A
route planner keeps the rest of the unheard bag playable through fitting steps,
so a full rotation completes without repeats. If only distant songs remain, the
director walks toward them through fitting songs (a short reprise) instead of
jumping. Manual picks are one-off; the next automatic song continues smoothly
from whatever was picked.

Songs crossfade. About seven seconds before a song ends, the next one starts on
a second stream and both follow equal-power curves, so overall loudness stays
even. **Next song** and library picks blend over 1.5 seconds. Songs shorter
than two blends overlap for at most a third of their length. Each stream fades
to its own measured trim. Pause, mute, hiding Lucid and a zero music level stop
the outgoing stream at once; resuming plays only the current song. At most two
theme streams exist, alternating between playing and idle.

Only active playback of the current song advances the journey. Pausing,
muting, hiding Lucid, buffering, seeking, the outgoing half of a blend and
wall-clock time do not count. Chapter progress, history, playback position,
pause state and direction persist across restarts. Saved state that names a
removed song, chapter or genre direction falls back gracefully (removed songs
leave the history, an unknown chapter restarts from the local-time opening and
a direction without songs returns to the journey).

Choose a genre to stay in it, **Ambient pads** for quiet pad-led pieces, or
**Bells & wonder** for gentle bell material. Only directions with songs in the
library are offered. A direction schedules the next song; **Next song** applies
it immediately. Each genre and texture direction completes its own rotation,
and songs heard through another matching direction or a manual pick count
toward it. **Pause music** leaves room ambience and game sounds alone.

**Sound volume** controls everything. **Theme music** and **Room ambience**
adjust the background layers independently; zero pauses that layer. Global
mute remains authoritative. Trusted user input unlocks audio. Hidden music
resumes from its position after the next gesture. Reused local streaming sources
(two theme streams and room air) feed the singleton audio context and master gain. Only room air loops;
songs blend near their end and rotate on actual media events. Muted or hidden
late events cannot restart playback.

Each piece has a measured constant playback trim targeting -20 LUFS. This
matches playback loudness while preserving section dynamics. The separate
room-air bed is quiet, low-band stereo tone (100 to 650 Hz), with restrained
modulation rather than rain-like hiss and swells. Its playback calibration is
6 dB lower than the earlier bed, including for previously saved slider levels;
zero still pauses it. This layer is independent of weather. Spatial typing,
footsteps, water, birds and object sounds follow real visible activity.

## Authoring and provenance

These are offline tools. The app ships Opus recordings (128 kbps) and needs no plug-in,
sample library, Python process or music service at runtime.

```bash
python tools/music/render-music.py <song_module> [--png] [--preview 30]
python tools/music/sync-music-catalog.py      # installs renders, rewrites soundtrack.ts
python tools/music/verify-music-masters.py --write
```

Use a Python environment with `tools/music/requirements-music.txt` and FFmpeg.
Sample libraries live in `~/.cache/lucid-audio-authoring/libs` (fetched from
the sfzinstruments and VCSL GitHub repositories); `LUCID_MUSIC_LIBS` and
`SURGE_VST3` override the default locations. Renders, JSON track reports and
spectrograms go to `~/.cache/lucid-audio-authoring/renders`.
`src/assets/audio/library-songs.json` records each piece's source module,
sections, parts and the libraries and licenses used. `library-mastering.json`
measures the packaged Opus hashes, duration, loudness, true peak, silence, DC and
stereo correlation.

The original cozy recordings came from `compose-office-theme.py`,
`compose-office-playlist.py` and `compose-office-encore.py` (with
`cozy_percussion.py`, `music_production.py` and the pinned VCSL drums from
`fetch-vcsl-drums.py`). Regenerate room air alone with
`python tools/music/compose-office-theme.py --only ambience`.

## Verification

```bash
python tools/music/verify-music-masters.py
node scripts/checks/verify-game-sound.cjs
node scripts/checks/verify-background-audio.cjs
node scripts/checks/verify-soundtrack.cjs
node scripts/checks/verify-soundscape.cjs
npm run verify:update
```

Encoded-master checks reject dead starts and tails, invalid samples, poor
headroom, stale durations and inconsistent loudness. The soundtrack checks walk
the real catalogue and a synthetic one through the genre graph, energy cap,
rotations, locks, crossfades and saved-state migration.

Signal analysis and functional checks do not establish musical enjoyment. No
subjective listening approval is claimed by these automated tools.
