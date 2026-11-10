"""Sodium Lights: midnight-cruise synthwave, E minor, 94 BPM.

Spacious and moody: a slow Sine Lead melody over Warm Pad and a deep sub bass.
Harmonic-minor B7 turns give the verse its pull; the chorus rides VI-VII-v-i.
A half-time bridge hands the tune to a soft square lead before the return.
"""
from lucid_music import fx, parts, drums
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles import synthwave as sw

sw.GROOVES.setdefault('cruise', {'k': 'x.....x...x.....', 's': '....x.......x...', 'clap808': '....x.......x...',
                                 'h': 'x.o.x.o.x.o.x.o.'})
sw.GROOVES.setdefault('cruise_open', {'k': 'x.....x...x.....', 's': '....x.......x...',
                                      'clap808': '....x.......x...', 'h': 'x.o.x.o.x.o.x.o.',
                                      'o': '..........x.....'})


def build():
    s = Song('sodium-lights', 'Sodium Lights', bpm=94, key=4, mode='minor', genre='synthwave',
             energy=.5, period='night', textures=['synth', 'pads', 'bass', 'drums'], swing=.5,
             seed=73, space=dict(seconds=3.6, predelay=.04, damp=.5, bright=6500), delay_beats=.75)

    VERSE = progression('Em9 | Cmaj9 | Am9 | B7sus4:2 B7:2 | Em9 | Cmaj9 | Am9 | Bm7')
    CHORUS = progression('Cmaj7 | D6 | Bm7 | Em9 | Cmaj7 | D6 | B7sus4:2 B7:2 | Em9')
    BRIDGE = progression('Am9 | Bm7 | Cmaj7 | D6 | Am9 | Bm7 | Cmaj7 | B7sus4:2 B7:2')
    INTRO = progression('Em9 | Cmaj9 | Am9 | Bm7')

    verse = """B4:1 E5:1 F#5:2 | G5:3 E5:1 | r:1/2 E5:1/2 G5:1/2 A5:1/2 B5:2 | A5:2 D#5:2 |
               B4:1 E5:1 G5:2 | B5:2 A5:1 G5:1 | C6:2 B5:1 A5:1 | F#5:3 r:1"""
    hook = """E5:1/2 G5:1/2 B5:3/2 A5:1/2 G5:1 | F#5:1/2 A5:1/2 B5:3 |
              r:1/2 F#5:1/2 A5:1/2 B5:1/2 D6:2 | B5:1 A5:1/2 G5:1/2 F#5:1 E5:1 |
              E5:1/2 G5:1/2 B5:3/2 A5:1/2 G5:1 | F#5:1/2 A5:1/2 D6:3 |
              E6:2 D#6:2 | B5:2 G5:2"""
    bridge = """C5:2 B4:1 A4:1 | D5:3 F#5:1 | E5:2 G5:2 | F#5:3 A5:1 |
                C6:2 B5:1 A5:1 | B5:2 F#5:2 | G5:2 E5:1 B5:1 | A5:2 F#5:1 D#5:1"""

    form = [('intro', 0, 8), ('verse', 8, 8), ('chorus', 16, 8), ('interlude', 24, 4), ('verse', 28, 8),
            ('chorus', 36, 8), ('bridge (half time)', 44, 8), ('chorus', 52, 8), ('outro', 60, 8)]
    for name, b, n in form:
        s.section(name, b, n)
    s.length_beats = 68 * 4

    harmony = (sw.at(INTRO, 0) + sw.at(INTRO, 4) + sw.at(VERSE, 8) + sw.at(CHORUS, 16) + sw.at(INTRO, 24)
               + sw.at(VERSE, 28) + sw.at(CHORUS, 36) + sw.at(BRIDGE, 44) + sw.at(CHORUS, 52)
               + sw.at(INTRO, 60) + sw.at(INTRO, 64))
    s.harmony = harmony
    choruses = ((16, 24), (36, 44), (52, 60))

    lead = (melody(verse, 8 * 4, vel=.72) + melody(hook, 16 * 4, vel=.8) + melody(verse, 28 * 4, vel=.74)
            + melody(hook, 36 * 4, vel=.82) + melody(hook, 52 * 4, vel=.84)
            + melody('B4:1 E5:1 F#5:2 | G5:3 E5:1 | r:4 | B4:4', 60 * 4, vel=.6))
    s.notes('lead', ('surge', 'Sine Lead'), lead, level=-20.5, reverb=.22, delay=.2, humanize_ms=4,
            chain=lambda a, s: fx.eq(a, hp=200, lp=8000, peaks=[(1800, 1.5, .8)]))
    # Square patch sounds an octave below the written note, so the line is written up an octave.
    s.notes('bridge square', ('surge', 'Square'), melody(bridge, 44 * 4, octave_shift=1, vel=.7), level=-22,
            reverb=.3, delay=.25, humanize_ms=4, chain=lambda a, s: fx.eq(a, hp=250, lp=5500))
    harmony_line = melody(hook, 52 * 4, octave_shift=-1, vel=.5)
    s.notes('hook shadow', ('surge', 'Butter'), harmony_line, level=-27, reverb=.25, humanize_ms=4,
            chain=lambda a, s: fx.eq(a, hp=250, lp=6000))

    s.notes('pad', ('surge', 'MKS-70 Warm Pad'), parts.pad(harmony, 'G3', 'D5', 4, .62), level=-25.5, duck=.25,
            reverb=.18, chain=lambda a, s: sw.pad_chain(a, s, .8))
    swell = [c for c in harmony if any(a * 4 <= c[0] < b * 4 for a, b in choruses + ((44, 52),))]
    s.notes('verb pad', ('surge', 'Verb Pad'), parts.pad(swell, 'B3', 'G5', 3, .5), level=-29, duck=.2,
            chain=lambda a, s: fx.eq(a, hp=300, lp=7500))

    arp_prog = [c for c in harmony if 4 * 4 <= c[0] < 64 * 4]
    arp = sw.arp(arp_prog, order=(0, 1, 2, 3, 4, 3, 2, 1), step=.5, lo='E4', hi='B5', n=4, vel=.5, gate=.5,
                 accents=(1, .7, .85, .7))
    s.notes('pluck', ('surge', 'Nice Pluck 2'), arp, level=-29, duck=.15, delay=.15, reverb=.12, humanize_ms=2,
            chain=sw.arp_chain)

    # Sub: long roots in verses and bridge, 8th pulse with a defined bass in the choruses
    long_prog = [c for c in harmony if 2 * 4 <= c[0] < 64 * 4 and not any(a * 4 <= c[0] < b * 4 for a, b in choruses)]
    sub = parts.bass(long_prog, [(0, 2.8, 'R', .95), (3, .9, 'R', .7)], 'E2', 'D#3')
    ch_prog = [c for c in harmony if any(a * 4 <= c[0] < b * 4 for a, b in choruses)]
    sub += sw.pump_bass(ch_prog, lo='E2', hi='D#3', octave_steps=(), gate=.45)
    s.notes('sub', ('surge', 'Sub 1'), sub, level=-20, duck=.3, humanize_ms=2,
            chain=lambda a, s: fx.eq(a, hp=28, lp=900))
    s.notes('bass edge', ('surge', 'Bass 2'), sw.pump_bass(ch_prog, lo='E2', hi='D#3', octave_steps=(3, 7)),
            level=-26, duck=.3, humanize_ms=2, chain=lambda a, s: fx.eq(a, hp=120, lp=3000))

    hits = sw.section('pulse', 6, 2, fill=None, crash=False)
    hits += sw.section('cruise', 8, 8)
    hits += sw.section('cruise_open', 16, 8)
    hits += sw.section('pulse', 24, 4, fill='lift', crash=False, every=4)
    hits += sw.section('cruise', 28, 8)
    hits += sw.section('cruise_open', 36, 8)
    hits += sw.section('half', 44, 7, fill=None)
    hits += sw.bar_hits('half', 51, fill='lift')
    hits += sw.section('cruise_open', 52, 8)
    hits += sw.section('pulse', 60, 2, fill=None, crash=True)
    for a, b in choruses:
        hits += [(beat, 'shaker', v * .8) for beat, p, v in drums.loop({'shaker': 'x.o.x.o.x.o.x.o.'}, b - a, a)]
    hits = sw.layer_808(hits, .5)
    rest, snare = sw.split_snares(hits)
    kit = sw.kit('mid', tune=47, decay=.35)
    ride = lambda a, s: fx.automate(a, [(0, -10), (s.sec(24, False), -10), (s.sec(32 - .5, False), -1),
                                        (s.sec(60 * 4, False), -1), (s.sec(62 * 4, False), -6)])
    s.drums('drums', kit, rest, level=-22.5, chain=lambda a, s: ride(sw.drums_chain(a, s), s), humanize_ms=3)
    s.drums('snare', kit, snare, level=-26.5, chain=lambda a, s: sw.snare_chain(a, s, mix=.7, gate=.32),
            humanize_ms=3, reverb=.1)

    s.bus_chain['music'] = sw.sweep([(0, 500), (7.5, 2400), (8, 16000), (62, 16000), (68, 800), (70, 500)], s)
    s.master_chain = sw.outro_fade(8)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
