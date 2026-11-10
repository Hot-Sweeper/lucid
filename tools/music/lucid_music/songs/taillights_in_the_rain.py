"""Taillights in the Rain: romantic night synthwave, C minor, 88 BPM.

A breathy, sax-like lead sings over soft electric piano, big pads and a round
pulsing bass. Verse i-VI-III-VII, a chorus over VI-VII-v-i that turns through
Fm9-Bb13 to a G7 half cadence, and a half-time bridge that opens on the
Neapolitan Dbmaj7. Gated tom fills close each phrase; rain frames the song.
"""
from lucid_music import fx, parts, drums
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles import synthwave as sw


def build():
    s = Song('taillights-in-the-rain', 'Taillights in the Rain', bpm=88, key=0, mode='minor', genre='synthwave',
             energy=.56, period='night', textures=['synth', 'pads', 'bass', 'drums'], swing=.5,
             seed=83, space=dict(seconds=3.4, predelay=.035, damp=.45, bright=6800), delay_beats=.75)

    INTRO = progression('Abmaj7 | Bb6 | Gm7 | Cm9')
    VERSE = progression('Cm9 | Abmaj7 | Ebmaj7 | Bb6 | Cm9 | Abmaj7 | Fm9 | G7sus4 G7')
    CHORUS = progression('Abmaj7 | Bb6 | Gm7 | Cm9 | Fm9 | Bb13 | Ebmaj7 | G7sus4 G7')
    BRIDGE = progression('Dbmaj7 | Cm7 | Bbm7 Eb7 | Abmaj7 | Fm9 | Gm7 | Abmaj7 | G7sus4 G7')
    OUTRO = progression('Abmaj7 | Bb6 | Gm7 | Cm9 | Abmaj7 | Cm9')

    verse = """r:1 G5:1/2 Bb5:1/2 C6:1 Bb5:1/2 G5:1/2 | G5:3/2 Eb5:1/2 C5:2 |
               r:1 Bb4:1/2 D5:1/2 Eb5:1 G5:1 | F5:3/2 D5:1/2 Bb4:2 |
               r:1 G5:1/2 Bb5:1/2 D6:1 C6:1/2 Bb5:1/2 | C6:3/2 G5:1/2 Eb5:2 |
               r:1/2 F5:1/2 Ab5:1/2 C6:1/2 Eb6:1 C6:1 | C6:1 Bb5:1 B5:1 D6:1"""
    hook = """r:1/2 Eb5:1/2 Ab5:1/2 C6:1/2 Bb5:1 G5:1 | F5:3/2 G5:1/2 D5:2 |
              r:1/2 D5:1/2 G5:1/2 Bb5:1/2 F5:1 G5:1 | Eb5:3/2 D5:1/2 C5:2 |
              r:1/2 C5:1/2 F5:1/2 Ab5:1/2 G5:1 Eb5:1 | F5:3/2 G5:1/2 Ab5:2 |
              G5:1 Bb5:1/2 G5:1/2 Eb6:1 D6:1 | C6:2 B5:2"""
    bridge = """F5:2 Ab5:1 C6:1 | Bb5:3 G5:1 | Ab5:1 F5:1 G5:1 Db6:1 | C6:4 |
                Ab5:1 C6:1 Eb6:1 C6:1 | D6:2 Bb5:1 G5:1 | Eb5:1 G5:1 C6:1 Eb6:1 | D6:2 B5:1 G5:1"""
    farewell = """r:1/2 Eb5:1/2 Ab5:1/2 C6:1/2 Bb5:1 G5:1 | F5:3/2 G5:1/2 D5:2 |
                  r:1/2 D5:1/2 G5:1/2 Bb5:1/2 F5:1 G5:1 | C5:4"""

    form = [('intro', 0, 4), ('verse', 4, 8), ('chorus', 12, 8), ('interlude', 20, 4), ('verse', 24, 8),
            ('chorus', 32, 8), ('bridge', 40, 8), ('chorus', 48, 8), ('outro', 56, 6)]
    for name, b, n in form:
        s.section(name, b, n)
    s.length_beats = 62 * 4

    harmony = (sw.at(INTRO, 0) + sw.at(VERSE, 4) + sw.at(CHORUS, 12) + sw.at(INTRO, 20) + sw.at(VERSE, 24)
               + sw.at(CHORUS, 32) + sw.at(BRIDGE, 40) + sw.at(CHORUS, 48) + sw.at(OUTRO, 56))
    s.harmony = harmony
    chorus_spans = ((12, 20), (32, 40), (48, 56))

    lead = (melody(verse, 4 * 4, vel=.74) + melody(hook, 12 * 4, vel=.82) + melody(verse, 24 * 4, vel=.76)
            + melody(hook, 32 * 4, vel=.84) + melody(bridge, 40 * 4, vel=.82) + melody(hook, 48 * 4, vel=.86)
            + melody(farewell, 56 * 4, vel=.66))
    s.lead_notes = lead
    s.notes('sax lead', ('surge', 'Smoothness World Cup'), lead, level=-20.5, reverb=.2, delay=.16,
            humanize_ms=6, legato=True, chain=lambda a, s: fx.eq(a, hp=200, lp=7500, peaks=[(1800, 2.5, .8), (400, -2, 1)]))

    s.notes('pad', ('surge', 'Verb Pad'), parts.pad(harmony, 'G3', 'D5', 4, .55), level=-26.5, duck=.25,
            reverb=.15, chain=lambda a, s: sw.pad_chain(a, s, .85))
    lift = [c for c in harmony if any(a * 4 <= c[0] < b * 4 for a, b in chorus_spans) or 40 * 4 <= c[0] < 48 * 4]
    s.notes('strings', ('surge', 'Juno-60 Strings'), parts.pad(lift, 'C4', 'G5', 4, .5), level=-28, duck=.2,
            reverb=.18, chain=lambda a, s: sw.pad_chain(a, s, .8))

    ep_rhythm = [(0, 1.4, 1), (1.5, .4, .6), (2.5, 1.2, .82)]
    s.notes('electric piano', ('surge', 'EP 1'), parts.comp(harmony[4:], ep_rhythm, lo='G3', hi='D5', n=4, vel=.55,
                                                             rootless=True, spread=.015),
            level=-26, reverb=.14, humanize_ms=5, chain=lambda a, s: fx.chorus(fx.eq(a, hp=160, lp=6500), .35, .1, .25))

    # Smoothie sounds an octave below the written note: C3 is a C2 bass.
    bass_pat = [(0, .9, 'R', 1), (1, .4, 'R', .7), (1.5, .4, '8', .74), (2, .9, 'R', .9), (3, .4, 'R', .7),
                (3.5, .4, '5', .74)]
    groove_prog = [c for c in harmony if 4 * 4 <= c[0] < 40 * 4 or 48 * 4 <= c[0] < 56 * 4]
    bass = parts.bass(groove_prog, bass_pat, lo='A#2', hi='A3', vel=.82)
    bass += parts.bass(sw.at(BRIDGE, 40), [(0, 1.8, 'R', .85), (2, 1.8, 'R', .72)], 'A#2', 'A3')
    bass += parts.bass(sw.at(OUTRO, 56)[:4], [(0, 3.6, 'R', .7)], 'A#2', 'A3')
    s.notes('bass', ('surge', 'Smoothie'), bass, level=-20.5, duck=.25, humanize_ms=2,
            chain=lambda a, s: sw.bass_chain(fx.eq(a, lp=3000), s))

    k = sw.add_toms(sw.kit('mid', tune=48, decay=.34))
    hits = sw.section('pulse', 2, 2, fill=None, crash=False)
    for start in (4, 24):                       # verses: drive, tom fill at bar 8
        hits += sw.section('drive', start, 7, fill=None, crash=True)
        hits += sw.tom_bar('drive', start + 7)
    for start in chorus_spans:
        hits += sw.section('four', start[0], 7, fill=None, crash=True)
        hits += sw.tom_bar('four', start[0] + 7, 'toms_long')
    hits += sw.section('pulse', 20, 3, fill=None, crash=True)
    hits += sw.tom_bar('pulse', 23)
    hits += sw.section('half', 40, 7, fill=None, crash=True)
    hits += sw.tom_bar('half', 47, 'toms_long')
    hits += sw.section('pulse', 56, 3, fill=None, crash=True)
    for a, b in chorus_spans:
        hits += [(beat, 'shaker', v * .7) for beat, p, v in drums.loop({'shaker': 'x.o.x.o.x.o.x.o.'}, b - a, a)]
    hits = sw.layer_808(hits, .5)
    rest, gated = sw.split_gated(hits)
    ride = lambda a, s: fx.automate(a, [(0, -10), (s.sec(4 * 4 - .5, False), -10), (s.sec(4 * 4, False), -1.5),
                                        (s.sec(12 * 4 - .5, False), -1.5), (s.sec(12 * 4, False), 0),
                                        (s.sec(40 * 4 - .5, False), 0), (s.sec(40 * 4, False), -3),
                                        (s.sec(48 * 4 - .5, False), -3), (s.sec(48 * 4, False), 0),
                                        (s.sec(56 * 4, False), 0), (s.sec(59 * 4, False), -8)])
    s.drums('drums', k, rest, level=-23.5, chain=lambda a, s: ride(sw.drums_chain(a, s), s), humanize_ms=3)
    s.drums('gated snare and toms', k, gated, level=-26.5,
            chain=lambda a, s: ride(sw.snare_chain(a, s, mix=.8, gate=.3), s), humanize_ms=3, reverb=.06)

    s.audio('rain', lambda n, s: fx.automate(sw.rain(n, s), [(0, 0), (s.sec(6 * 4, False), -14),
                                                             (s.sec(54 * 4, False), -14), (s.sec(60 * 4, False), 0)]),
            gain_db=-8)
    s.bus_chain['music'] = sw.sweep([(0, 650), (3.5, 2600), (4, 15000), (58, 15000), (62, 800), (64, 600)], s)
    s.master_chain = sw.outro_fade(seconds=8)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
