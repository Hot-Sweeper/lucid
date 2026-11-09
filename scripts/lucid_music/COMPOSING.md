# Writing a Lucid song

Each song is one file in `scripts/lucid_music/songs/<snake_id>.py` with a
`build()` that returns a `Song`. Render with:

```bash
PY=~/.t3/scratch/2026-11-08-in-lucid-check-what-songs-d203e92a/.audio-tools/bin/python
cd ~/Applications/lucid/scripts && $PY render-music.py <snake_id> --png
```

Output (WAV, MP3, JSON with per-track levels, spectrogram PNG) goes to
`~/.cache/lucid-audio-authoring/renders/`. `rain_on_the_tram.py` is the
reference: copy its structure.

## Musical rules (the reason this library was rebuilt)

The previous songs were rejected for random-sounding melodies, silly beats and
bad instruments. Every song must sound like a deliberate, idiomatic record.

- **Write melodies by hand, note by note**, with `melody()`. Never generate
  them randomly. Build each tune from a short motif (2 to 4 notes with a
  recognisable rhythm), then repeat, sequence and answer it: 2-bar question,
  2-bar answer; 8-bar phrases in AABA or ABAB'. A listener should be able to
  hum it after two passes.
- Mostly stepwise motion; leaps resolve by step in the other direction. Keep a
  lead inside about an octave and a half. Leave space: rests are part of it.
- Strong beats land on chord tones or chosen colour tones (9, 11, 13). Run
  `parts.clashes(melody_notes, progression)` and fix every hit that is not a
  deliberate passing tone or appoggiatura. Long notes must never rub.
- Chord progressions are chosen per bar with intent (ii-V-I, borrowed iv,
  chromatic mediants, line clichés). Use `parts.comp`/`pad` (voice-led) rather
  than block chords that jump.
- Bass outlines the harmony idiomatically (`parts.bass` patterns with approach
  notes, `parts.walking` for jazz, `('808',)` with glides for phonk).
- Grooves are genre-correct and consistent, with small fills only at phrase
  ends (bar 4 or 8 of a phrase). No random hit placement. Ghost notes soft.
- Form: intro (4 to 8 bars, thin, filtered or drumless), theme, development or
  bridge with a real contrast (new chords, drop drums, new instrument on the
  tune), theme return with variation, outro that thins out. 2:00 to 3:15.
- Begin and end softly (no hard first downbeat at full level, no abrupt stop).
  Lucid crossfades songs, so the first and last 6 to 8 seconds should be
  sparse: pad, keys or a filtered loop.

## Sound rules ("some instruments just SUCK")

Use the real libraries and good patches only:

- Sampled (`lucid_music.sampler`): `rhodes()` (1977 Rhodes Mk I), `wurlitzer()`,
  `cp80()`, `grand()` (Salamander), `upright_bass()` (pizzicato double bass,
  sounding range about C1 to C4; `style='mute'` for palm-muted),
  `vibraphone()`, `harp()`.
- Drums (`lucid_music.drums`): `acoustic_kit('lofi')` (dusty) or
  `acoustic_kit('mid')` (clean, roomy). Pieces: k s g x r h hh o p ride bell
  crash shaker tamb conga cowbell clap. Analog voices by name inside the same
  pattern dict: kick808 snare909 clap808 hat808 ohat808 cowbell808.
- Synths: `('surge', '<factory patch name>')`. Browse names with
  `synth.list_patches('Pads')` etc. Known good starting points: pads
  `MKS-70 Warm Pad`, `Sunday`, `Still`, `Verb Pad`, `Winter Warmer`,
  `Juno-60 Strings`, `Oberheim Dreams`, `PPG Dreams`; leads `Classic Lead 1`,
  `Crisp PWM`, `Square`, `Sine Lead`, `Smoothness World Cup`; keys/plucks
  `DX EP`, `Soft Suitcase`, `Nice Pluck 1..5`, `VHS Soundtrack`, `The 1980s`,
  `Hasselhoff`, `Bell 1`; basses `Sub 1`, `Mellow`, `Smoothie`, `Bass 1..5`,
  `Rubber Bass`, `Square Bass`. Avoid harsh, distorted, FX or "Scream" patches.
  Render a 4-bar test of a patch and check its spectrogram/RMS before using it.
  Many patches contain their own reverb/delay; lower the send accordingly.
- `('808',)` sub bass: `synth.sub808` (glides when notes overlap).
- `breaks.render_break` + `breaks.chop` for breakbeat edits.

## Mixing

- Give every track `level=` (target active RMS in dBFS before its chain):
  drums -20 to -21, bass -19 to -21, chords -24 to -26, pads -25 to -28, lead
  -21 to -22, counter-melody -24. Then adjust by ear-equivalents: check the
  JSON report so the lead and drums are clearly on top, pads underneath.
- EQ each part into its own band (high-pass everything except bass/kick;
  low-pass lo-fi parts). Reverb and delay through `reverb=`/`delay=` sends.
- `duck=` (0.15 to 0.35) on pads/bass for a gentle kick sidechain.
- Master: `s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)`. Do not
  change these targets; Lucid matches playback loudness itself.

## Checks before you call a song done

1. Renders without errors; 120 to 200 seconds; first and last seconds soft.
2. `parts.clashes` clean (or every remaining item justified).
3. Spectrogram: no empty mid range, no harsh band above 8 kHz dominating, low
   end present but not swamping, clear sections.
4. Track report: no part accidentally silent or 10 dB louder than intended.
