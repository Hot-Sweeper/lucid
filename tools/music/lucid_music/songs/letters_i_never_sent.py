"""Letters I Never Sent: emotional atmospheric breakcore, D minor, 174 BPM.

A sad grand piano motif falls D-C-A over Bbmaj9, answers itself a step up over
Am7 and climbs to G6 before sinking home. The chorus lifts into F major. After a
drumless breakdown and a half-time build, the second half breaks into intricate
edits: displaced kicks, 32nd stutters, reversed ghosts and tiny silences.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.breakcore import break_track, break_chain, at

VERSE = 'Bbmaj9 | C6 | Am7 | Dm9 | Gm9 | Am7 | Bbmaj9 | A7sus4 A7b9'
CHORUS = 'Fmaj9 | C6/E | Dm9 | Bbmaj9 | Gm9 | Fmaj9/A | Bbmaj9 | A7sus4 A7'
BREAK = 'Bbmaj9 | Bbmaj9 | Am7 | Am7 | Gm9 | Gm9 | A7sus4 | A7b9'

VERSE_TUNE = """D6:1 C6:1/2 A5:5/2 | G5:1 A5:1/2 C6:5/2 | E6:1 D6:1/2 C6:5/2 | A5:3 r:1 |
                D6:1 C6:1/2 Bb5:1/2 G6:2 | E6:1 D6:1/2 C6:1/2 A5:2 | F5:1 A5:1 C6:1 D6:1 | E6:2 C#6:2"""
CHORUS_TUNE = """A5:1/2 C6:1/2 F6:1 E6:2 | D6:1 E6:1 G5:2 | F6:1 E6:1/2 D6:1/2 A5:2 | C6:1 D6:1 F5:2 |
                 Bb5:1/2 D6:1/2 G6:1 F6:2 | E6:1 C6:1 A5:2 | F6:2 D6:1 C6:1 | D6:2 C#6:2"""
BREAK_TUNE = """D6:2 C6:2 | A5:4 | E6:2 D6:2 | C6:4 | Bb5:2 D6:2 | G6:4 | E6:4 | C#6:4"""


def build():
    s = Song('letters-i-never-sent', 'Letters I Never Sent', bpm=174, key=2, mode='minor', genre='breakcore',
             energy=.84, period='night', textures=['piano', 'pads', 'strings', 'breaks', 'bass'],
             seed=74, space=dict(seconds=3.0, predelay=.03, damp=.5, bright=6500), delay_beats=.75)
    V, C, B = progression(VERSE), progression(CHORUS), progression(BREAK)
    # intro 8 | verse 16 | chorus 16 | breakdown 8 | build 8 | verse 16 (glitch) | chorus 16 (glitch) | outro 8
    plan = [('intro', 0, V), ('verse', 8, V), ('verse', 16, V), ('chorus', 24, C), ('chorus', 32, C),
            ('breakdown', 40, B), ('build', 48, B), ('verse', 56, V), ('verse', 64, V),
            ('chorus', 72, C), ('chorus', 80, C), ('outro', 88, V)]
    for name, bar, _ in plan:
        s.section(name, bar, 8)
    s.length_beats = 96 * 4
    full = sum((at(p, bar) for _, bar, p in plan), [])
    s.full = full

    # Wide, slow pad underneath everything; strings join for the choruses and the build.
    s.notes('pad', ('surge', 'Still'), parts.pad(full, 'A3', 'E5', 4, .55), level=-27, reverb=.2, duck=.25,
            chain=lambda a, s: fx.width(fx.eq(a, hp=170, lp=7500), 1.15))
    lift = sum((at(p, bar) for name, bar, p in plan if name in ('chorus', 'build')), [])
    s.notes('strings', ('surge', 'Juno-60 Strings'), parts.pad(lift, 'D4', 'A5', 3, .5), level=-29, reverb=.22,
            duck=.2, chain=lambda a, s: fx.eq(a, hp=300, lp=7000))

    tunes = {'intro': VERSE_TUNE, 'verse': VERSE_TUNE, 'chorus': CHORUS_TUNE, 'breakdown': BREAK_TUNE,
             'build': BREAK_TUNE, 'outro': VERSE_TUNE}
    lead, low, bell = [], [], []
    for name, bar, _ in plan:
        vel = .58 if name in ('intro', 'outro', 'breakdown') else .8
        lead += melody(tunes[name], bar * 4, vel=vel)
        if name == 'breakdown':                 # left hand answers an octave down, alone with the pad
            low += melody(tunes[name], bar * 4, octave_shift=-1, vel=.5)
        if name == 'chorus' and bar >= 72:      # last choruses: a soft bell an octave above
            bell += melody(tunes[name], bar * 4, octave_shift=1, vel=.55)
    s.notes('piano', sampler.grand(), lead, level=-21, reverb=.28, delay=.1, humanize_ms=6,
            pedal=[(b * 4, b * 4 + 3.92) for b in range(96)],
            chain=lambda a, s: fx.eq(a, hp=140, lp=9500, low_shelf=(300, -2.5), peaks=[(2800, 1.2, 1)]))
    s.notes('piano low', sampler.grand(), low, level=-26, reverb=.3, humanize_ms=8,
            pedal=[(b * 4, b * 4 + 3.92) for b in range(40, 48)], chain=lambda a, s: fx.eq(a, hp=90, lp=6000))
    s.notes('bell', ('surge', 'Fantasy Bell'), bell, level=-29, reverb=.32, delay=.15,
            chain=lambda a, s: fx.eq(a, hp=450, lp=10000))

    bass_prog = sum((at(p, bar) for name, bar, p in plan if name not in ('intro', 'breakdown', 'outro')), [])
    s.notes('sub', ('surge', 'Sub 1'), parts.bass(bass_prog, [(0, 3.5, 'R', 1)], 'E1', 'D#2', .9),
            level=-21, humanize_ms=0, swing=False, chain=lambda a, s: fx.eq(a, lp=220))

    breaks_plan = [(8, 8, 'smooth'), (16, 8, 'roll'), (24, 8, 'roll'), (32, 8, 'edit'), (48, 8, 'build'),
                   (56, 8, 'glitch'), (64, 8, 'glitch'), (72, 8, 'edit'), (80, 8, 'glitch')]
    s.audio('breaks', break_track(breaks_plan, 'think'), level=-21, bus='drums', reverb=.05,
            chain=break_chain(lp=11000, drive=1.2))
    kit = drums.acoustic_kit('mid')
    cym = [(b * 4, 'crash', .7) for b in (8, 24, 56, 72)] + [(b * 4, 'crash', .5) for b in (16, 32, 64, 80)]
    s.drums('crash', kit, cym, level=-28, reverb=.12, humanize_ms=0,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=300, lp=10000), -24, 3, 1, 120))

    end = s.sec(96 * 4, False)
    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 1000), (s.sec(28, False), 1500), (s.sec(32, False), 16000),
                                                            (s.sec(88 * 4, False), 16000), (end + 2, 1200)])
    s.master_chain = lambda a, s: fx.automate(a, [(0, 0), (end - 6, 0), (end + 1.5, -26)])
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
