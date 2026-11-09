"""Lemonade Skyline: sunlit liquid breakcore, E major, 168 BPM.

Rhodes pushes the Emaj9 - G#m7 - C#m9 - Amaj9 liquid loop; vibes sing a rising
G#-B-D# verse tune. The chorus hook (repeated E6 notes, a bright skip to F#6)
belongs to a bell lead doubled by vibes, with harp sixteenths sparkling above.
The breakdown slips to C major (bVI) before a half-time build brings the
rolling breaks back.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.breakcore import break_track, break_chain, at

VERSE = 'Emaj9 | G#m7 | C#m9 | Amaj9 | F#m9 | G#m7 | Amaj9 | B9sus4 B13'
CHORUS = 'Amaj9 | B6 | G#m7 | C#m9 | Amaj9 | B6 | C#m9 | F#m9 B13'
BREAK = 'Cmaj9 | Cmaj9 | Amaj9 | Amaj9 | F#m9 | F#m9 | B9sus4 | B13'

VERSE_TUNE = """G#5:1/2 B5:1/2 D#6:1 B5:2 | C#6:1 B5:1/2 G#5:5/2 | G#5:1/2 B5:1/2 E6:1 D#6:2 | C#6:1 B5:1 E5:2 |
                A5:1/2 C#6:1/2 F#6:1 E6:2 | D#6:1 B5:1/2 G#5:5/2 | A5:1 B5:1 C#6:1 E6:1 | F#6:2 D#6:2"""
CHORUS_TUNE = """E6:1/2 E6:1/2 C#6:1/2 E6:1 F#6:1/2 E6:1 | D#6:1 F#6:1/2 D#6:1/2 B5:2 |
                 D#6:1/2 D#6:1/2 B5:1/2 D#6:1 F#6:1/2 D#6:1 | G#5:1 B5:1 C#6:2 |
                 E6:1/2 E6:1/2 C#6:1/2 E6:1 F#6:1/2 G#6:1 | F#6:1 D#6:1/2 B5:1/2 F#6:2 |
                 E6:1 D#6:1 C#6:1 B5:1 | A5:2 D#6:2"""
BREAK_TUNE = """E6:2 D6:2 | B5:4 | E6:2 C#6:2 | G#5:4 | A5:2 C#6:2 | F#6:4 | E6:4 | D#6:4"""


def build():
    s = Song('lemonade-skyline', 'Lemonade Skyline', bpm=168, key=4, mode='major', genre='breakcore',
             energy=.78, period='day', textures=['bells', 'mallets', 'piano', 'plucked', 'pads', 'breaks', 'bass'],
             seed=168, space=dict(seconds=2.6, predelay=.025, damp=.4, bright=7500), delay_beats=.75)
    V, C, B = progression(VERSE), progression(CHORUS), progression(BREAK)
    # intro 8 | verse 16 | chorus 16 | breakdown 8 | build 8 | verse 16 | chorus 16 | outro 8
    plan = [('intro', 0, V), ('verse', 8, V), ('verse', 16, V), ('chorus', 24, C), ('chorus', 32, C),
            ('breakdown', 40, B), ('build', 48, B), ('verse', 56, V), ('verse', 64, V),
            ('chorus', 72, C), ('chorus', 80, C), ('outro', 88, V)]
    for name, bar, _ in plan:
        s.section(name, bar, 8)
    s.length_beats = 96 * 4
    full = sum((at(p, bar) for _, bar, p in plan), [])
    s.full = full

    # Liquid Rhodes: chord on 1, push on the 'and' of 2, short answer on 4-and.
    rh = parts.comp(full, [(0, 1.4, 1), (1.5, 1.8, .7), (3.5, .45, .55)], lo='B2', hi='F#4', n=4, vel=.55,
                    rootless=True, spread=.01)
    s.notes('rhodes', sampler.rhodes(), rh, level=-24, reverb=.18, duck=.22, humanize_ms=6,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=130, lp=8000, peaks=[(420, -2, .8)]), rate=.45, depth=.14, mix=.32))
    s.notes('pad', ('surge', 'Sunday'), parts.pad(full, 'G#3', 'E5', 4, .5), level=-28, reverb=.18, duck=.28,
            chain=lambda a, s: fx.eq(a, hp=180, lp=8000))

    vib, bell = [], []
    for name, bar, _ in plan:
        if name in ('intro', 'verse', 'outro'):
            vib += melody(VERSE_TUNE, bar * 4, vel=.58 if name != 'verse' else .76)
        elif name == 'chorus':
            bell += melody(CHORUS_TUNE, bar * 4, vel=.8)
            vib += melody(CHORUS_TUNE, bar * 4, octave_shift=-1, vel=.55)
        else:
            vib += melody(BREAK_TUNE, bar * 4, vel=.62)
            if name == 'build':
                bell += melody(BREAK_TUNE, bar * 4, vel=.6)
    s.notes('vibes', sampler.vibraphone(), vib, level=-22, reverb=.26, delay=.1, humanize_ms=5,
            chain=lambda a, s: fx.eq(a, hp=220, lp=9500))
    s.notes('bell lead', ('surge', 'Bell 1'), bell, level=-23, reverb=.26, delay=.14,
            chain=lambda a, s: fx.eq(a, hp=350, lp=10500))

    # Harp sixteenths sparkle over the choruses only.
    harp_prog = sum((at(C, bar) for name, bar, _ in plan if name == 'chorus'), [])
    s.notes('harp', sampler.harp(), parts.arp(harp_prog, (0, 1, 2, 3, 4, 3, 2, 1), .25, 'E4', 'B5', 4, .5),
            level=-28, reverb=.22, pan=.2, duck=.15, humanize_ms=4, chain=lambda a, s: fx.eq(a, hp=350, lp=10000))

    bass_prog = sum((at(p, bar) for name, bar, p in plan if name not in ('intro', 'breakdown', 'outro')), [])
    s.notes('sub', ('surge', 'Sub 1'), parts.bass(bass_prog, [(0, 1.75, 'R', 1), (2.5, 1.4, 'R', .85)], 'E1', 'D#2', .9),
            level=-21, humanize_ms=0, swing=False, chain=lambda a, s: fx.eq(a, lp=230))

    breaks_plan = [(8, 8, 'smooth'), (16, 8, 'smooth'), (24, 8, 'roll'), (32, 8, 'roll'), (48, 8, 'build'),
                   (56, 8, 'smooth'), (64, 8, 'roll'), (72, 8, 'roll'), (80, 8, 'edit')]
    s.audio('breaks', break_track(breaks_plan, 'roller'), level=-21.5, bus='drums', reverb=.05,
            chain=break_chain(lp=11500, drive=1.1))
    kit = drums.acoustic_kit('mid')
    perc = []
    for name, bar, _ in plan:
        if name in ('verse', 'chorus'):
            perc += drums.loop({'shaker': 'x.o.x.o.x.o.x.oo'}, 8, bar)
        if name == 'chorus':
            perc += drums.loop({'ride': 'x...x...x...x...'}, 8, bar)
    perc += [(b * 4, 'crash', .7) for b in (8, 24, 56, 72)] + [(b * 4, 'crash', .5) for b in (32, 80)]
    s.drums('perc', kit, perc, level=-29, reverb=.1, humanize_ms=3,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=300, lp=10500), -24, 3, 1, 120))

    end = s.sec(96 * 4, False)
    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 1200), (s.sec(28, False), 1800), (s.sec(32, False), 16000),
                                                            (s.sec(88 * 4, False), 16000), (end + 2, 1400)])
    s.master_chain = lambda a, s: fx.automate(a, [(0, 0), (end - 6, 0), (end + 1.5, -26)])
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
