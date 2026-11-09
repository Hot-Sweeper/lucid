"""Polaroid Summer: nostalgic piano breakcore, F# minor, 170 BPM.

The verse walks the bittersweet IV-V-iii-vi 'royal road' (Dmaj9 E6 C#m7 F#m9)
under a falling three-note piano motif (C#-B-A). The chorus lifts to A major
with a bell double and a plucked arpeggio; a drumless piano breakdown builds
back through a half-time break and a snare roll.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.breakcore import break_track, break_chain, at

VERSE = 'Dmaj9 | E6 | C#m7 | F#m9 | Dmaj9 | E6 | C#7sus4 C#7 | F#m9'
CHORUS = 'Amaj9 | Eadd9/G# | F#m9 | C#m7 | Dmaj9 | E6 | Bm9 | C#7sus4 C#7'
BREAK = 'Dmaj9 | Dmaj9 | C#m7 | C#m7 | Bm9 | Bm9 | C#7sus4 | C#7'

VERSE_TUNE = """C#6:1 B5:1/2 A5:5/2 | G#5:1 A5:1/2 B5:5/2 | E6:1 C#6:1 B5:1 G#5:1 | A5:3 r:1 |
                C#6:1 B5:1/2 A5:1/2 F#6:2 | E6:1 C#6:1/2 B5:1/2 G#5:2 | F#5:1 G#5:1 B5:1 F5:1 | F#5:4"""
CHORUS_TUNE = """E6:1/2 F#6:1/2 G#6:1 E6:2 | B5:1 C#6:1 B5:1 G#5:1 | A5:1 C#6:1 E6:2 | G#5:1 B5:1 E6:2 |
                 F#6:1 E6:1/2 C#6:1/2 A5:2 | G#5:1 B5:1 E6:2 | D6:1 C#6:1 B5:1 A5:1 | F#5:2 F5:2"""
BREAK_TUNE = """C#6:2 B5:2 | A5:4 | G#5:2 B5:2 | E6:4 | D6:2 C#6:2 | B5:4 | F#5:4 | F5:4"""


def build():
    s = Song('polaroid-summer', 'Polaroid Summer', bpm=170, key=6, mode='minor', genre='breakcore',
             energy=.82, period='day', textures=['piano', 'pads', 'bells', 'breaks', 'bass'],
             seed=21, space=dict(seconds=2.6, predelay=.02, damp=.45, bright=7000), delay_beats=.75)
    V, C, B = progression(VERSE), progression(CHORUS), progression(BREAK)
    # intro 8 | verse 16 | chorus 16 | breakdown 8 + half-time build 8 | verse 16 | chorus 16 | outro 8
    plan = [('intro', 0, V), ('verse', 8, V), ('verse', 16, V), ('chorus', 24, C), ('chorus', 32, C),
            ('breakdown', 40, B), ('build', 48, B), ('verse', 56, V), ('verse', 64, V),
            ('chorus', 72, C), ('chorus', 80, C), ('outro', 88, V)]
    for name, bar, _ in plan:
        s.section(name, bar, 8)
    s.length_beats = 96 * 4
    full = sum((at(p, bar) for _, bar, p in plan), [])
    s.full = full

    pad = parts.pad(full, 'A3', 'E5', 4, .55)
    s.notes('pad', ('surge', 'PPG Dreams'), pad, level=-27, reverb=.18, duck=.25,
            chain=lambda a, s: fx.eq(a, hp=170, lp=8000))

    tunes = {'intro': VERSE_TUNE, 'verse': VERSE_TUNE, 'chorus': CHORUS_TUNE, 'breakdown': BREAK_TUNE,
             'build': BREAK_TUNE, 'outro': VERSE_TUNE}
    lead, bell = [], []
    for name, bar, _ in plan:
        vel = .62 if name in ('intro', 'outro', 'breakdown') else .8
        lead += melody(tunes[name], bar * 4, vel=vel)
        if name in ('chorus', 'build') or (name == 'verse' and bar >= 56):
            bell += melody(tunes[name], bar * 4, octave_shift=1 if name == 'build' else 0, vel=.7)
    s.notes('piano', sampler.grand(), lead, level=-21, reverb=.26, delay=.1, humanize_ms=5,
            pedal=[(b * 4, b * 4 + 3.95) for b in range(96)],
            chain=lambda a, s: fx.eq(a, hp=150, lp=9000, low_shelf=(300, -2.5), peaks=[(3000, 1.5, 1)]))
    s.notes('bell', ('surge', 'Fantasy Bell'), bell, level=-27, reverb=.3, delay=.15,
            chain=lambda a, s: fx.eq(a, hp=400, lp=10000))

    arp_prog = at(C, 24) + at(C, 32) + at(C, 72) + at(C, 80)
    s.notes('pluck arp', ('surge', 'Nice Pluck 2'), parts.arp(arp_prog, (0, 1, 2, 3, 2, 1, 2, 3), .5, 'C#4', 'E5', 4, .6),
            level=-29, reverb=.15, delay=.12, pan=-.15, duck=.2, chain=lambda a, s: fx.eq(a, hp=300, lp=8500))

    bass_prog = sum((at(p, bar) for name, bar, p in plan if name not in ('intro', 'breakdown', 'outro')), [])
    s.notes('sub', ('surge', 'Sub 1'), parts.bass(bass_prog, [(0, 4, 'R', 1)], 'E1', 'D#2', .9),
            level=-21, humanize_ms=0, chain=lambda a, s: fx.eq(a, lp=220))

    breaks_plan = [(8, 8, 'roll'), (16, 8, 'roll'), (24, 8, 'edit'), (32, 8, 'edit'), (48, 8, 'build'),
                   (56, 8, 'roll'), (64, 8, 'roll'), (72, 8, 'edit'), (80, 8, 'edit')]
    s.audio('breaks', break_track(breaks_plan, 'think'), level=-21, bus='drums', reverb=.04, chain=break_chain())
    kit = drums.acoustic_kit('mid')
    crashes = [(b * 4, 'crash', .75) for b in (8, 24, 56, 72)] + [(b * 4, 'crash', .55) for b in (16, 32, 64, 80)]
    s.drums('crash', kit, crashes, level=-27, reverb=.1, humanize_ms=0)

    end = s.sec(96 * 4, False)
    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 1100), (s.sec(28, False), 1600), (s.sec(32, False), 16000),
                                                            (s.sec(88 * 4, False), 16000), (end + 2, 1300)])
    # Fade the last six seconds so Lucid's crossfade starts from a soft tail.
    s.master_chain = lambda a, s: fx.automate(a, [(0, 0), (end - 6, 0), (end + 1.5, -26)])
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
