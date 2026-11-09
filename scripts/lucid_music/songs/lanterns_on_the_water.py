"""Lanterns on the Water: liquid drum and bass, Eb major, 172 BPM.

Lush major-seventh harmony (IVmaj9 - iii7 - ii9 - V13) on Rhodes and string
pad, a smooth rolling break and a rising vibraphone motif (G-Bb-C). The chorus
moves to the relative minor and doubles the tune with a soft lead; the
breakdown drops to Rhodes and vibes before a half-time return.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.breakcore import break_track, break_chain, at

VERSE = 'Abmaj9 | Gm7 | Fm9 | Bb13 | Ebmaj9 | Cm9 | Fm9 | Bb7sus4 Bb7'
CHORUS = 'Cm9 | Abmaj9 | Gm7 | Abmaj9 | Fm9 | Gm7 | Abmaj9 | Bb13'
BREAK = 'Abmaj9 | Abmaj9 | Gm7 | Cm9 | Fm9 | Fm9 | Bb7sus4 | Bb13'

VERSE_TUNE = """G5:1 Bb5:1 C6:2 | Bb5:1 D6:1/2 C6:1/2 Bb5:2 | Ab5:1 G5:1 F5:2 | G5:1 F5:1 D5:2 |
                G5:1 Bb5:1 D6:2 | Eb6:1 D6:1/2 C6:1/2 G5:2 | Ab5:1 C6:1 Bb5:1 Ab5:1 | Eb5:2 D5:2"""
CHORUS_TUNE = """G5:1/2 Bb5:1/2 D6:1 Eb6:2 | C6:1 Bb5:1 G5:2 | Bb5:1 D6:1 F6:2 | Eb6:1 C6:1 Ab5:2 |
                 G5:1/2 Ab5:1/2 C6:1 Eb6:2 | D6:1 Bb5:1 G5:2 | C6:1 Eb6:1 G6:2 | F6:2 D6:2"""
BREAK_TUNE = """C6:2 Bb5:2 | G5:4 | Bb5:2 D6:2 | Eb6:4 | Ab5:2 G5:2 | F5:4 | Eb5:4 | D5:4"""


def build():
    s = Song('lanterns-on-the-water', 'Lanterns on the Water', bpm=172, key=3, mode='major', genre='breakcore',
             energy=.75, period='evening', textures=['piano', 'pads', 'mallets', 'breaks', 'bass'],
             seed=33, space=dict(seconds=2.8, predelay=.025, damp=.5, bright=6500), delay_beats=.75)
    V, C, B = progression(VERSE), progression(CHORUS), progression(BREAK)
    plan = [('intro', 0, V), ('verse', 8, V), ('verse', 16, V), ('chorus', 24, C), ('chorus', 32, C),
            ('breakdown', 40, B), ('half-time', 48, B), ('verse', 56, V), ('verse', 64, V),
            ('chorus', 72, C), ('chorus', 80, C), ('outro', 88, V)]
    for name, bar, _ in plan:
        s.section(name, bar, 8)
    s.length_beats = 96 * 4
    full = sum((at(p, bar) for _, bar, p in plan), [])
    s.full = full

    # Rhodes: long chord on the downbeat, soft push on the 'and' of 3.
    rh = parts.comp(full, [(0, 2.6, 1), (2.75, 1.15, .68)], lo='Bb2', hi='F4', n=4, vel=.55,
                    rootless=True, spread=.01)
    s.notes('rhodes', sampler.rhodes(), rh, level=-24, reverb=.18, duck=.2, humanize_ms=5,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=140, lp=7500, peaks=[(450, -2, .8)]), rate=.35, depth=.12, mix=.3))
    s.notes('strings', ('surge', 'Juno-60 Strings'), parts.pad(full, 'G4', 'G5', 3, .5), level=-29,
            reverb=.2, duck=.3, chain=lambda a, s: fx.eq(a, hp=350, lp=7000))

    tunes = {'intro': VERSE_TUNE, 'verse': VERSE_TUNE, 'chorus': CHORUS_TUNE, 'breakdown': BREAK_TUNE,
             'half-time': BREAK_TUNE, 'outro': VERSE_TUNE}
    vib, lead = [], []
    for name, bar, _ in plan:
        vel = .6 if name in ('intro', 'outro', 'breakdown') else .78
        vib += melody(tunes[name], bar * 4, vel=vel)
        if name == 'chorus' or name == 'half-time':
            lead += melody(tunes[name], bar * 4, octave_shift=-1, vel=.7)
    s.notes('vibes', sampler.vibraphone(), vib, level=-21, reverb=.25, delay=.12, humanize_ms=5,
            chain=lambda a, s: fx.eq(a, hp=220, lp=9000))
    s.notes('soft lead', ('surge', 'Smoothness World Cup'), lead, level=-27, reverb=.2, legato=True,
            chain=lambda a, s: fx.eq(a, hp=200, lp=6000))

    bass_prog = sum((at(p, bar) for name, bar, p in plan if name not in ('intro', 'breakdown', 'outro')), [])
    s.notes('sub', ('surge', 'Sub 1'), parts.bass(bass_prog, [(0, 2.5, 'R', 1), (3, 1, '5', .8)], 'E1', 'Eb2', .9),
            level=-21, humanize_ms=0, chain=lambda a, s: fx.eq(a, lp=240))

    breaks_plan = [(8, 8, 'smooth'), (16, 8, 'smooth'), (24, 8, 'roll'), (32, 8, 'roll'), (48, 8, 'half'),
                   (56, 8, 'smooth'), (64, 8, 'smooth'), (72, 8, 'roll'), (80, 8, 'roll')]
    s.audio('breaks', break_track(breaks_plan, 'roller'), level=-22, bus='drums', reverb=.04, chain=break_chain(lp=10500))
    kit = drums.acoustic_kit('mid')
    extras = [(b * 4, 'crash', .7) for b in (8, 24, 56, 72)] + [(b * 4, 'crash', .5) for b in (16, 32, 48, 64, 80)]
    for start in (24, 32, 72, 80):     # shaker lifts the choruses
        extras += drums.loop({'shaker': '.x.x.x.x.x.x.x.x'}, 8, start)
    s.drums('perc', kit, extras, level=-27, reverb=.1, humanize_ms=3)

    end = s.sec(96 * 4, False)
    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 1100), (s.sec(28, False), 1600), (s.sec(32, False), 16000),
                                                            (s.sec(88 * 4, False), 16000), (end + 2, 1300)])
    # Fade the last six seconds so Lucid's crossfade starts from a soft tail.
    s.master_chain = lambda a, s: fx.automate(a, [(0, 0), (end - 6, 0), (end + 1.5, -26)])
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
