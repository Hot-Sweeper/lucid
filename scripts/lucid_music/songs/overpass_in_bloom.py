"""Overpass in Bloom: gentle jungle, F dorian, 160 BPM.

The Fm9 - Bb13 dorian sway carries a vibraphone tune (Ab-C-Eb, answered by
D natural). The first verse rides a half-time break that tightens into a
snare roll; the full jungle break arrives with the chorus (Dbmaj9 - Eb13 -
Cm7 - Fm9). A drumless Rhodes breakdown resets before the last two rounds.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.breakcore import break_track, break_chain, at

VERSE = 'Fm9 | Bb13 | Fm9 | Bb13 | Dbmaj9 | Cm7 | Bbm9 | C7sus4 C7b9'
CHORUS = 'Dbmaj9 | Eb13 | Cm7 | Fm9 | Bbm9 | Eb13 | Abmaj9 | C7sus4 C7'
BREAK = 'Dbmaj9 | Dbmaj9 | Cm7 | Cm7 | Bbm9 | Eb13 | Abmaj9 | C7sus4 C7b9'

VERSE_TUNE = """Ab5:1/2 C6:1/2 Eb6:1 C6:2 | D6:1 C6:1 Ab5:2 | Ab5:1/2 C6:1/2 Eb6:1 G6:2 | F6:1 D6:1 C6:2 |
                F6:1 Eb6:1 C6:2 | Bb5:1 C6:1 G5:2 | F5:1 Ab5:1 C6:2 | F5:2 E5:2"""
CHORUS_TUNE = """C6:1 Eb6:1 F6:2 | G6:1 F6:1 Db6:2 | Eb6:1 G5:1 Bb5:2 | Ab5:1 G5:1 F5:2 |
                 Db6:1 C6:1 Ab5:2 | G5:1 Bb5:1 Db6:2 | C6:1 Eb6:1 G6:1 Eb6:1 | F6:2 E6:2"""
BREAK_TUNE = """F5:2 Ab5:2 | C6:4 | Bb5:2 G5:2 | Eb5:4 | Db6:2 C6:2 | G5:4 | C6:2 Eb6:2 | F5:2 E5:2"""


def build():
    s = Song('overpass-in-bloom', 'Overpass in Bloom', bpm=160, key=5, mode='dorian', genre='breakcore',
             energy=.72, period='evening', textures=['piano', 'mallets', 'pads', 'breaks', 'bass'],
             seed=58, space=dict(seconds=2.6, predelay=.025, damp=.55, bright=6000), delay_beats=.75)
    V, C, B = progression(VERSE), progression(CHORUS), progression(BREAK)
    # intro 8 | verse (half-time) 8 + verse (build) 8 | chorus 16 | breakdown 8 | verse 16 | chorus 16 | outro 8
    plan = [('intro', 0, V), ('verse', 8, V), ('verse', 16, V), ('chorus', 24, C), ('chorus', 32, C),
            ('breakdown', 40, B), ('verse', 48, V), ('verse', 56, V), ('chorus', 64, C), ('chorus', 72, C),
            ('outro', 80, V)]
    for name, bar, _ in plan:
        s.section(name, bar, 8)
    s.length_beats = 88 * 4
    full = sum((at(p, bar) for _, bar, p in plan), [])
    s.full = full

    rh = parts.comp(full, [(0, 2.5, 1), (2.75, .6, .62), (3.5, .45, .55)], lo='Bb2', hi='F4', n=4, vel=.55,
                    rootless=True, spread=.012)
    s.notes('rhodes', sampler.rhodes(), rh, level=-24, reverb=.18, duck=.2, humanize_ms=6,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=130, lp=7000, peaks=[(420, -2, .8)]), rate=.4, depth=.14, mix=.3))
    s.notes('pad', ('surge', 'MKS-70 Warm Pad'), parts.pad(full, 'Ab3', 'Eb5', 4, .5), level=-28, reverb=.15,
            duck=.28, chain=lambda a, s: fx.eq(a, hp=180, lp=6500))

    tunes = {'intro': VERSE_TUNE, 'verse': VERSE_TUNE, 'chorus': CHORUS_TUNE, 'breakdown': BREAK_TUNE,
             'outro': VERSE_TUNE}
    vib = []
    for name, bar, _ in plan:
        vel = .6 if name in ('intro', 'outro', 'breakdown') else .78
        vib += melody(tunes[name], bar * 4, vel=vel)
    s.notes('vibes', sampler.vibraphone(), vib, level=-22, reverb=.26, delay=.12, humanize_ms=5,
            chain=lambda a, s: fx.eq(a, hp=220, lp=9000))
    # Chorus counterline on soft bells, entering the second time round.
    bell = sum((melody(CHORUS_TUNE, bar * 4, octave_shift=1, vel=.55) for bar in (32, 72)), [])
    s.notes('bells', ('surge', 'Bell 1'), bell, level=-29, reverb=.3, delay=.15, chain=lambda a, s: fx.eq(a, hp=500, lp=11000))

    bass_prog = sum((at(p, bar) for name, bar, p in plan if name not in ('intro', 'breakdown', 'outro')), [])
    s.notes('sub', ('surge', 'Sub 1'), parts.bass(bass_prog, [(0, 1.75, 'R', 1), (2.5, 1, '5', .85), (3.5, .45, 'R', .75)],
                                                    'E1', 'Eb2', .9),
            level=-21, humanize_ms=0, chain=lambda a, s: fx.eq(a, lp=240))

    breaks_plan = [(8, 8, 'half'), (16, 8, 'build'), (24, 8, 'roll'), (32, 8, 'edit'),
                   (48, 8, 'roll'), (56, 8, 'roll'), (64, 8, 'roll'), (72, 8, 'edit')]
    s.audio('breaks', break_track(breaks_plan, 'think'), level=-21, bus='drums', reverb=.05, chain=break_chain(lp=10000))
    kit = drums.acoustic_kit('mid')
    cym = [(b * 4, 'crash', .7) for b in (24, 48, 64)] + [(b * 4, 'crash', .5) for b in (8, 32, 56, 72)]
    for start in (24, 32, 64, 72):
        cym += drums.loop({'ride': 'x...x...x...x...'}, 8, start)
    s.drums('cymbals', kit, cym, level=-31, reverb=.12, humanize_ms=3,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=300, lp=10000), -24, 3, 1, 120))

    end = s.sec(88 * 4, False)
    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 1100), (s.sec(28, False), 1600), (s.sec(32, False), 15000),
                                                            (s.sec(80 * 4, False), 15000), (end + 2, 1300)])
    # Fade the last six seconds so Lucid's crossfade starts from a soft tail.
    s.master_chain = lambda a, s: fx.automate(a, [(0, 0), (end - 6, 0), (end + 1.5, -26)])
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
