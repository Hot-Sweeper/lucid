"""Glass Planetarium: starry breakcore, C# minor, 165 BPM.

A wide pad and a sparkling sixteenth-note arpeggio frame a bell melody that
climbs G#-B-D# and settles back (i - VI - III - VII). The chorus rises
through Amaj9 - B6 - G#m7 - C#m9; the breakdown hangs on two-bar chords with
the bell alone before the breaks return.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.breakcore import break_track, break_chain, at

VERSE = 'C#m9 | Amaj9 | Emaj9 | B6 | C#m9 | Amaj9 | Emaj9 | G#7'
CHORUS = 'Amaj9 | B6 | G#m7 | C#m9 | F#m9 | G#m7 | Amaj9 | G#7sus4 G#7'
BREAK = 'Amaj9 | Amaj9 | Emaj9 | Emaj9 | F#m9 | F#m9 | G#7sus4 | G#7'

VERSE_TUNE = """G#5:1 B5:1 D#6:2 | C#6:1 B5:1 G#5:2 | E6:1 D#6:1 B5:2 | D#6:1 C#6:1/2 B5:1/2 F#5:2 |
                G#5:1 B5:1 E6:2 | E6:1 C#6:1 G#6:2 | F#6:1 E6:1 D#6:1 B5:1 | D#6:2 C6:2"""
CHORUS_TUNE = """C#6:1/2 E6:1/2 G#6:1 E6:2 | F#6:1 D#6:1 B5:2 | B5:1 D#6:1 F#6:2 | E6:1 D#6:1/2 C#6:1/2 G#5:2 |
                 A5:1 C#6:1 E6:2 | F#6:1 D#6:1 B5:2 | C#6:1 E6:1 G#6:1 E6:1 | C#6:2 C6:2"""
BREAK_TUNE = """G#5:2 B5:2 | C#6:4 | B5:2 G#5:2 | D#6:4 | C#6:2 A5:2 | E6:4 | C#6:4 | C6:4"""


def build():
    s = Song('glass-planetarium', 'Glass Planetarium', bpm=165, key=1, mode='minor', genre='breakcore',
             energy=.8, period='night', textures=['bells', 'pads', 'synth', 'piano', 'breaks', 'bass'],
             seed=47, space=dict(seconds=3.2, predelay=.03, damp=.35, bright=8000), delay_beats=.75)
    V, C, B = progression(VERSE), progression(CHORUS), progression(BREAK)
    plan = [('intro', 0, V), ('verse', 8, V), ('verse', 16, V), ('chorus', 24, C), ('chorus', 32, C),
            ('breakdown', 40, B), ('build', 48, B), ('verse', 56, V), ('verse', 64, V),
            ('chorus', 72, C), ('chorus', 80, C), ('outro', 88, V)]
    for name, bar, _ in plan:
        s.section(name, bar, 8)
    s.length_beats = 96 * 4
    full = sum((at(p, bar) for _, bar, p in plan), [])
    s.full = full

    s.notes('pad', ('surge', 'Verb Pad'), parts.pad(full, 'G#3', 'D#5', 4, .55), level=-27, reverb=.12, duck=.3,
            chain=lambda a, s: fx.eq(a, hp=160, lp=7500))

    # Glass arpeggio: rests in the intro's first half and in the breakdown.
    arp_prog = [c for c in full if not (40 * 4 <= c[0] < 48 * 4) and 4 * 4 <= c[0] < 92 * 4]
    s.notes('arp', ('surge', 'Diamonds'), parts.arp(arp_prog, (0, 1, 2, 3, 2, 1, 2, 3), .25, 'C#5', 'D#6', 4, .5,
                                                     gate=.7, accents=(1, .7, .8, .7)),
            level=-29, reverb=.15, delay=.1, pan=.2, duck=.2, chain=lambda a, s: fx.eq(a, hp=500, lp=9500))

    tunes = {'intro': VERSE_TUNE, 'verse': VERSE_TUNE, 'chorus': CHORUS_TUNE, 'breakdown': BREAK_TUNE,
             'build': BREAK_TUNE, 'outro': VERSE_TUNE}
    bell, piano = [], []
    for name, bar, _ in plan:
        vel = .62 if name in ('intro', 'outro', 'breakdown') else .8
        bell += melody(tunes[name], bar * 4, vel=vel)
        if name not in ('intro', 'outro'):
            piano += melody(tunes[name], bar * 4, octave_shift=-1, vel=.6)
    s.notes('bell lead', ('surge', 'Fantasy Bell'), bell, level=-21, reverb=.28, delay=.14,
            chain=lambda a, s: fx.eq(a, hp=300, lp=11000))
    s.notes('piano double', sampler.grand(), piano, level=-28, reverb=.2, humanize_ms=4,
            chain=lambda a, s: fx.eq(a, hp=180, lp=6000, low_shelf=(300, -3)))

    bass_prog = sum((at(p, bar) for name, bar, p in plan if name not in ('intro', 'breakdown', 'outro')), [])
    s.notes('sub', ('surge', 'Sub 1'), parts.bass(bass_prog, [(0, 4, 'R', 1)], 'E1', 'D#2', .9),
            level=-21, humanize_ms=0, chain=lambda a, s: fx.eq(a, lp=220))

    breaks_plan = [(8, 8, 'roll'), (16, 8, 'roll'), (24, 8, 'edit'), (32, 8, 'edit'), (48, 8, 'build'),
                   (56, 8, 'roll'), (64, 8, 'roll'), (72, 8, 'edit'), (80, 8, 'edit')]
    s.audio('breaks', break_track(breaks_plan, 'think'), level=-21, bus='drums', reverb=.05, chain=break_chain(lp=11500))
    kit = drums.acoustic_kit('mid')
    crashes = [(b * 4, 'crash', .75) for b in (8, 24, 56, 72)] + [(b * 4, 'crash', .5) for b in (16, 32, 64, 80)]
    crashes += [(b * 4 + o, 'bell', .45) for b in range(24, 40) for o in (0, 2)]   # ride bell pulse in chorus 1
    s.drums('cymbals', kit, crashes, level=-28, reverb=.12, humanize_ms=2)

    end = s.sec(96 * 4, False)
    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 1300), (s.sec(28, False), 1800), (s.sec(32, False), 17000),
                                                            (s.sec(88 * 4, False), 17000), (end + 2, 1400)])
    # Fade the last six seconds so Lucid's crossfade starts from a soft tail.
    s.master_chain = lambda a, s: fx.automate(a, [(0, 0), (end - 6, 0), (end + 1.5, -26)])
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
