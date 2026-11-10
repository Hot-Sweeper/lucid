# Office music: references, production decisions and limits

## What was inspected

The reference playlists were [Lunar Phonk](https://open.spotify.com/playlist/4TSS20kz15g85iWvy93H5t)
and [Breakcore/DnB](https://open.spotify.com/playlist/2ctnq32JxZBG7LDEVYxv8G),
plus Lofi Girl for lo-fi and a broad Spotify synthwave sound. Spotify's
public embeds exposed their track lists and short preview URLs. Eight public
previews were analysed privately, including KEDELA's VACUUM, SATURN and ASTRAL,
DVRST's Dream Space, INTERWORLD's METAMORPHOSIS, ERRx's breaking down and
Sxnctuary's I Want You and Alone. Reference recordings are not included in the
repository, renders, samples or application.

This is source research and signal analysis, not a claim of subjective listening.
The middle 24 seconds of each preview were compared with a 24-second section of
the app's earlier render. Detected onsets, stereo energy, spectrum and tempo
candidates help identify production differences; they do not score musical taste.
Preview mastering, excerpt position and half/double-time ambiguity limit such
comparisons. They are not numeric targets to copy.

The older Midnight Drift was considerably narrower above 200 Hz (side/mid about
-13.4 dB versus -8 to -3 dB in those lunar references), had fewer detected onsets
(2.6 per second versus 3.8 to 7.8), and more relative energy in the low mids.
Petal Breaks was similarly narrow and less detailed in its transients than the
ERRx/Sxnctuary excerpts. Cassette Clouds was heavily concentrated in the low mids.
These findings motivate better sources, voice placement and arrangements, rather
than adding more low-pass filtering or making the lead louder.

## Genre-specific decisions

| Direction | Evidence and musical purpose | Production response |
| --- | --- | --- |
| Atmospheric breaks / melodic breakcore | The supplied playlist mixes breakcore and DnB. Sxnctuary's own catalog also uses atmospheric DnB, jungle and breaks tags. Detailed rhythmic edits can coexist with memorable harmony and quiet space. | An original multi-bar drum performance using recorded acoustic hits, followed by phrase slicing, ghost notes, displaced answers, selective ratchets and clear returns. Keep recognizable anchors between edits and a clean sub beneath them. |
| Lunar / chill phonk | The supplied references favor atmosphere and bass alongside their recurring motifs. This is a different target from requiring archival Memphis vocals or treating a cowbell alone as the genre. | Wider upper pads and delayed answers, a focused mono 808, less crowded low mids, a developed drum pocket, sparse motifs and a contrasting passage. No borrowed vocals or melodies. |
| Study lo-fi | Lofi Girl's official site distinguishes study, jazz, sleep and synthwave stations. Lophiile describes tailoring voicings to each layer and manipulating a rendered performance, rather than copying one MIDI part everywhere. | Sampled keys and plucked instruments in complementary registers, an original rendered/resampled phrase, a human drum pocket, restrained modulation and a real stereo room return. Avoid making every layer uniformly dark and muffled. |
| Synthwave | Com Truise's public teaching syllabus emphasizes drum time feel, bass writing, B sections, reverse swells, drum glue and sidechain treatment. | A proper subtractive synth with original patches, expressive filter/envelope motion, syncopated bass and two-bar drum answers, pickups, gaps and a clear contrasting section. Avoid an endless four-on-the-floor and eighth-note bass template. |
| Ambient pads / bells | S1gns of L1fe's demonstration transforms a simple plucked source into evolving washes, with interacting layers and controlled modulation. | Independent overlapping phrase lengths, slow arrivals, transformed original material, occasional recognizable motifs and releases. Space should develop rather than repeat the same chord reset at every section. |
| Mystical / medieval / detective / nostalgic | Instrument articulation, modal harmony and arrangement establish these moods; changing a patch name does not. | Modal drones and open voicings for medieval material; bell questions and suspended textures for mystical passages; pizzicato, reeds and chromatic resolution for the detective piece; piano/cello answers for nostalgia. Sustained acoustic parts use breath/bow expression, while plucked parts retain their attacks. |

These are production interpretations drawn from the references, not universal
rules defining the genres.

## Libraries and instrument sources

- **[VCSL](https://github.com/sgossner/VCSL):** actual recorded acoustic samples,
  released CC0. The selected drum subset retains velocity layers and alternate
  takes, with pinned source paths and hashes. This replaces an oscillator/noise
  approximation of an acoustic break. Raw sample caches remain authoring inputs;
  the app streams the composed recordings.
- **[Surge XT](https://surge-synthesizer.github.io/manual-xt/):** a developed
  subtractive/hybrid instrument, with filters, envelopes, modulation and effects.
  The authoring setup loads its native Linux VST3 through Pedalboard and creates
  original patches from basic oscillators. A factory-preset download is not
  necessary for that approach. Version and patch parameters are recorded with
  the renders.
- **[Pedalboard](https://github.com/spotify/pedalboard):** native offline VST3
  hosting and audio processors. It is used on explicit stems: filtered parallel
  room sends, restrained corrective EQ, stable low end and selective movement.
  A reverb on the master cannot repair a weak melody or drum pattern. Its
  algorithmic room effect is not described as a measured room impulse response.
- **[FluidSynth](https://www.fluidsynth.org/) and
  [FluidR3 GM](https://sources.debian.org/src/fluid-soundfont/3.1-5.3/COPYING/):**
  sampled acoustic instruments used for the chamber scores. MIDI notes are
  authored for their roles, with instrument-specific attack/hold lengths,
  velocity and CC11 phrase expression. This bank is useful but does not have the
  articulation depth of a large contemporary orchestral library. The MIT notice
  is retained in `docs/licenses/FluidR3-GM.txt`.
- **[DawDreamer](https://github.com/DBraun/DawDreamer):** evaluated as another
  offline instrument/effect and automation host. Pedalboard already supplies the
  required hosting here, so a second host is not an application dependency.
- **[sfizz](https://github.com/sfztools/sfizz)** and
  **[Decent Sampler](https://www.decentsamples.com/product/decent-sampler-plugin/)**
  were investigated. Instrument access and individual sample-library terms still
  matter. Neither is assumed to make arbitrary downloaded material reusable.

The effects and instruments run only during authoring. There is no new live DSP,
plug-in process or sample-bank dependency in the office application.

## Composition review

The user's later feedback distinguished the successful earlier cozy pieces from
newer recordings that sounded like chord loops with arbitrary melodies. Reviewing
the scores found independent short melodic and harmonic cycles, excessive high
register decoration and phrase endings without matching harmonic resolution.
Better sample sources and effects had not corrected those writing problems.

The newer nine arrangements now use deliberately written multi-bar themes,
phrase-aligned harmonic plans, recurring rhythmic cells, clear cadences and
related contrasting material. Supporting parts leave room for a primary line.
Tidal's quiet interlude augments its own falling motif; it does not introduce
another unrelated bell figure. The earlier fourteen recordings are preserved.
These are inspectable composition decisions, not evidence of listener approval.

## Primary production sources

- [Renoise sampler manual](https://tutorials.renoise.com/wiki/Sampler) and
  [pattern effects](https://tutorials.renoise.com/wiki/Pattern_Effect_Commands):
  slicing, note/velocity behavior, cut groups and deliberate sample commands.
- [Venetian Snares interview](https://igloomag.com/profiles/venetian-snares-greg-still-hates-car-culture):
  an artist's account of rhythmic experimentation. It is not used to insist that
  every atmospheric playlist must become abrasive or use one time signature.
- [Sxnctuary's artist page/community](https://sxnctuary.bandcamp.com/community).
- [Lofi Girl's official stations](https://www.lofigirl.com/) and
  [label catalog](https://lofigirl.bandcamp.com/music).
- [Lophiile's production interview](https://blog.native-instruments.com/real-talk-lo-fi-hip-hop-producer-lophiile-offers-up-7-tips-for-keeping-things-wavy/).
- [Com Truise's public course syllabus](https://soundfly.com/courses/com-truise-mid-fi-synthwave-slow-motion-funk).
- [S1gns of L1fe production demonstration](https://www.ableton.com/en/blog/made-in-ableton-live-s1gns-of-l1fe/).

## Quality gates and their limits

The audit found 34.43 seconds of unwanted silent tail across thirteen older
additions. Packet-copy trimming removed that padding while retaining every
remaining decoded sample bit for bit. New arrangements close with authored
cadences and natural releases. Encoded masters are checked for dead starts and
ends, finite stereo, DC, true-peak headroom, loudness and stale duration metadata.
Measured constant playback trims target -20 LUFS without flattening the internal
section dynamics.

The music director uses authored genre, texture, energy, key/mode and tempo
metadata. Related major/minor/modal scales, half/double-time relationships and
shared textures influence selection. It can use a compatible bridge before a
remote key or energy change. Complete songs still finish; no claim of live DJ
beat matching or time stretching is made.

Those checks establish a functioning and more deliberate production process.
They cannot establish that a piece is moving, memorable or enjoyable. Musical
quality still needs audition, revision and the listener's judgment; no subjective
listening approval is claimed by these automated checks.

## Percussion revision after listener feedback

The next source audit found that some samplers normalized every soft take and
hard take to the same peak, erasing much of the recorded velocity behavior.
Several older generators also used a pronounced oscillator pitch fall for every
kick and noise bursts for other drum parts. The revision restores shared
instrument-family calibration, alternate takes, recorded attacks and separately
controlled kick/snare/hat stems. Longer room and delay treatments belong to
selected upper percussion and melodic replies; deep bass stays focused.

[Sound On Sound's reverb production guide](https://www.soundonsound.com/advanced-reverberation-0)
explains the low-end smear caused by obvious kick reverb and the usefulness of
short ambience and filtered returns. Its
[drum recording guide](https://www.soundonsound.com/techniques/recording-drums)
also treats the kick and bass as complementary sources. The
[Ableton effect reference](https://www.ableton.com/en/manual/live-audio-effect-reference/)
describes sidechain ducking for kick/bass space, per-chain drum processing,
reverb predelay and frequency shaping. These are technical production references,
not evidence that the resulting compositions have been subjectively approved.

## Tidal Memory remake

Listener feedback distinguished preview loudness from the musical problem:
the continuous saw-like sustain lasted too long. The remake changes the source
and arrangement. Soft sampled electric piano, nylon plucks and celesta carry
short questions and answers. Sine-only chord gestures have bounded durations
and clear gaps; filtered returns support those phrases. The older overlapping
Classic/unison renderer is retired from the authoring entry point.

Preview exports must include the office's theme and master gains when described
as default app-level listening. A full master at its measured playback trim alone
bypasses those controls and can sound substantially louder than office playback.
