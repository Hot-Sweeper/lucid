"""Soft Focus: dreamy morning lo-fi, B major, 76 BPM, swung 16ths.

The harp sings a rising 3-5-9-root figure over Bmaj9 - Emaj9 - G#m9 and then
the borrowed Gmaj7#11 (bVI), the chord that gives the song its hazy colour.
A tape-warbled pad sits under a soft Wurlitzer. In the bridge the Wurlitzer
takes the tune over G#m9 - C#m9 - Amaj9 - Gmaj7#11 while the harp ripples
arpeggios; cross-stick and shaker keep the kit light.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.lofi import at, intro_outro_filter, check_bars

A = progression('Bmaj9 | Emaj9 | G#m9 | Gmaj7#11 | Bmaj9 | Emaj9 | C#m9 | F#9sus4')
B = progression('G#m9 | C#m9 | Amaj9 | Gmaj7#11 | G#m9 | C#m9 | Emaj9 | F#9sus4')
INTRO = progression('Bmaj9 | Emaj9 | G#m9 | Gmaj7#11')
OUTRO = progression('Bmaj9 | Emaj9 | Gmaj7#11 | Bmaj9')

THEME = """r:1/2 D#5:1/2 F#5:1/2 C#6:3/2 B5:1 | G#5:1/2 F#5:1/2 D#5:2 r:1 |
           r:1/2 B4:1/2 D#5:1/2 A#5:3/2 G#5:1 | F#5:1/2 D5:1/2 B4:2 r:1 |
           r:1/2 F#5:1/2 A#5:1/2 C#6:1 D#6:1/2 C#6:1 | B5:1 G#5:1/2 F#5:1/2 E5:2 |
           D#5:1/2 E5:1/2 G#5:1 B5:1 G#5:1 | G#5:1 F#5:1/2 E5:1/2 C#5:2"""
ANSWER = """r:1/2 F#5:1/2 A#5:1/2 B5:3/2 C#6:1 | B5:1/2 G#5:1/2 E5:2 F#5:1 |
            r:1/2 D#5:1/2 F#5:1/2 B5:3/2 A#5:1 | B5:1/2 F#5:1/2 D5:1 C#5:1 B4:1 |
            r:1 D#5:1/2 F#5:1/2 A#5:1 F#5:1 | G#5:1 F#5:1/2 E5:1/2 D#5:2 |
            E5:1/2 G#5:1/2 B5:1 D#6:1 C#6:1 | B5:1 G#5:1/2 E5:1/2 F#5:2"""
BRIDGE = """r:1/2 B4:1/2 D#5:1/2 F#5:2 D#5:1/2 | E5:1 D#5:1/2 B4:1/2 G#4:2 |
            r:1/2 C#5:1/2 E5:1/2 G#5:2 B4:1/2 | D5:1 C#5:1/2 B4:1/2 F#4:2 |
            r:1/2 D#5:1/2 F#5:1/2 A#5:2 G#5:1/2 | G#5:1 E5:1/2 D#5:1/2 C#5:2 |
            B4:1/2 D#5:1/2 E5:1 F#5:1 G#5:1 | E5:1 C#5:1 B4:1 G#4:1"""
TAG = 'r:1/2 D#5:1/2 F#5:1/2 C#6:3/2 B5:1 | G#5:1/2 F#5:1/2 D#5:3 | r:1/2 B4:1/2 D5:1/2 F#5:5/2 | [D#5,F#5,A#5,C#6]:4'

for _m in (THEME, ANSWER, BRIDGE, TAG):
    check_bars(_m)


def build():
    s = Song('soft-focus', 'Soft Focus', bpm=76, key=11, mode='major', genre='lofi',
             energy=.26, period='morning', textures=['plucked', 'piano', 'pads', 'bass', 'drums'], swing=.57,
             swing_unit=.25, seed=73, space=dict(seconds=3.0, predelay=.035, damp=.55, bright=5800),
             delay_beats=.75)
    s.section('intro', 0, 4); s.section('theme', 4, 8); s.section('answer', 12, 8)
    s.section('bridge', 20, 8); s.section('theme return', 28, 8); s.section('answer', 36, 8)
    s.section('outro', 44, 4)
    s.length_beats = 48 * 4

    groove_prog = at(A, 4) + at(A, 12) + at(B, 20) + at(A, 28) + at(A, 36)
    full = at(INTRO, 0) + groove_prog + at(OUTRO, 44)

    # Soft Wurlitzer: chord on 1, gentle answer on the 'and' of 3.
    chords = parts.comp(full, [(0, 2.2, 1), (2.5, 1.3, .66)], lo='A2', hi='E4', n=4, vel=.5,
                        rootless=True, spread=.012)
    s.notes('wurli', sampler.wurlitzer(), chords, level=-25, reverb=.16, duck=.18, humanize_ms=8,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=140, lp=5800, peaks=[(360, -2.5, .8)]),
                                         rate=4.5, depth=.07, mix=.2))

    # Tape-warbled pad: deep wow on this part only.
    s.notes('pad', ('surge', 'Sunday'), parts.pad(full, 'B2', 'F#4', 4, .5), level=-32, reverb=.18,
            duck=.28, humanize_ms=0,
            chain=lambda a, s: fx.tape(fx.eq(a, hp=170, lp=4200), wow=.0045, flutter=.0004, drive=1.2, seed=31))

    lead = melody(THEME, 4 * 4, vel=.8) + melody(ANSWER, 12 * 4, vel=.82) + melody(THEME, 28 * 4, vel=.84) \
        + melody(ANSWER, 36 * 4, vel=.84) + melody(TAG, 44 * 4, vel=.66)
    s.notes('harp', sampler.harp(), lead, level=-22.5, reverb=.28, delay=.1, humanize_ms=7,
            chain=lambda a, s: fx.eq(a, hp=220, lp=8000, peaks=[(3000, -1.5, 1)]))

    # Harp ripples: intro shimmer and bridge arpeggios.
    ripples = parts.arp(at(INTRO, 0) + at(B, 20), order=(0, 1, 2, 3, 4, 3, 2, 1), step=.5, lo='B3', hi='B5',
                        n=4, vel=.45, gate=1.6, accents=(1, .8, .85, .8))
    s.notes('harp ripples', sampler.harp(), ripples, level=-26, reverb=.3, humanize_ms=6,
            chain=lambda a, s: fx.eq(a, hp=260, lp=7500))

    tune = melody(BRIDGE, 20 * 4, vel=.78)
    s.notes('wurli tune', sampler.wurlitzer(), tune, level=-22, reverb=.22, delay=.08, humanize_ms=8,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=220, lp=6500, peaks=[(1800, 1.5, .9)]),
                                         rate=5, depth=.09, mix=.28))

    bass_pat = [(0, 1.8, 'R', 1), (2.5, .9, '5', .74), (3.5, .45, 'A', .66)]
    bl = parts.bass(groove_prog, bass_pat, lo='E1', hi='D#2', vel=.84)
    bl += parts.bass(at(OUTRO, 44)[:3], [(0, 3.5, 'R', .72)], lo='E1', hi='D#2')
    s.notes('upright bass', sampler.upright_bass(), bl, level=-20, humanize_ms=8, duck=.15,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=2600, peaks=[(105, 2, .9)]), -20, 3, 15, 150))

    kit = drums.acoustic_kit('lofi')
    groove = {'k': 'x.........x.....', 'x': '....x.......x...', 'g': '.......g......g.',
              'h': 'x.o.x.o.x.o.x.o.', 'shaker': 'x.xxx.xxx.xxx.xx'}
    turn = {'k': 'x.........x..o..', 'x': '....x.......x...', 'g': '..g....g.g...gg.',
            'h': 'x.o.x.o.x.o.x...', 'o': '..............x.', 'shaker': 'x.xxx.xxx.xxx.xx'}
    full_groove = {'k': 'x.........x.....', 's': '....x.......x...', 'g': '.......g......g.',
                   'h': 'x.o.x.o.x.o.x.o.', 'shaker': 'x.xxx.xxx.xxx.xx'}
    hits = []
    for start, base in ((4, groove), (12, full_groove), (28, groove), (36, full_groove)):
        for b in range(8):
            g = turn if b == 7 else base
            if b == 0 and start == 4:
                g = dict(g, h='....x.o.x.o.x.o.')
            hits += drums.loop(g, 1, start + b)
    for b in range(8):      # bridge: no kick, ride bell sparkle and shaker
        hits += drums.loop({'x': '....x.......x...', 'ride': 'x.......x.......', 'shaker': 'x.xxx.xxx.xxx.xx'}, 1, 20 + b)
    hits += drums.grid('........g.g.g.gg', 'g', 27 * 4)
    hits += [(44 * 4, 'k', .6)]
    s.drums('kit', kit, hits, level=-21, late={'s': .014, 'g': .01, 'x': .012}, reverb=.06,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=40, lp=7800, peaks=[(60, 2, 1.2), (3500, -2.5, 1)]),
                                       -18, 3.5, 8, 90, 2))

    s.audio('vinyl', lambda n, s: fx.vinyl(n, level=.009, seed=27), gain_db=-10, bus='texture')
    s.bus_chain['music'] = intro_outro_filter(s, 4, 44, 48, closed=1100)
    s.master_chain = lambda a, s: fx.tape(fx.downsample(fx.automate(a, [(0, -10), (s.sec(10, False), 0), (s.sec(46 * 4, False), 0), (s.sec(48 * 4, False) + 2, -14)]), 30000),
                                          wow=.0022, drive=1.3, hiss=.0012, seed=13)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s


def check():
    return {'theme': parts.clashes(melody(THEME), A, strong_only=False),
            'answer': parts.clashes(melody(ANSWER), A, strong_only=False),
            'bridge': parts.clashes(melody(BRIDGE), B, strong_only=False),
            'tag': parts.clashes(melody(TAG), OUTRO, strong_only=False)}
