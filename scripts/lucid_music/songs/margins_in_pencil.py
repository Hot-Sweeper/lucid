"""Margins in Pencil: jazzy study-beats lo-fi, C major, 82 BPM, swung 16ths.

A felt-soft grand piano tune built on one syncopated cell (rest, up a third,
up a step, hold) that walks down the IV - iii - ii - I staircase
(Fmaj9 - Em9 - Dm9 - Cmaj9), then turns through E7b9 to Am9 and a D9 - G13
turnaround. The upright bass plays a two-feel and walks the last bar of every
four. The bridge borrows Bbmaj7 and Fm6 (the minor iv line cliche) under a
cross-stick groove.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.lofi import at, intro_outro_filter, check_bars

A = progression('Fmaj9 | Em9 | Dm9 | Cmaj9 | Fmaj9 | E7b9 | Am9 | D9 G13')
B = progression('Bbmaj7 | A7b9 | Dm9 | Gm9 C13 | Fmaj9 | Fm6 | Em7 A7b9 | Dm9 G7b9')
INTRO = progression('Fmaj9 | Em9 | Dm9 | D9 G13')
OUTRO = progression('Fmaj9 | Em9 | Dm9 G13 | Cmaj9')

THEME = """r:1/2 E5:1/2 G5:1/2 A5:3/2 G5:1/2 E5:1/2 | r:1/2 D5:1/2 E5:1/2 G5:3/2 E5:1/2 B4:1/2 |
           r:1/2 C5:1/2 E5:1/2 F5:3/2 E5:1/2 C5:1/2 | B4:1 G4:1/2 A4:1/2 B4:2 |
           r:1/2 A5:1/2 C6:1/2 A5:1 G5:1/2 E5:1 | F5:1/2 E5:1/2 D5:1 G#4:1 B4:1 |
           C5:3/2 B4:1/2 A4:1 E5:1 | F#5:1/2 E5:1/2 C5:1 B4:1/2 A4:1/2 F5:1"""
ANSWER = """r:1/2 E5:1/2 G5:1/2 A5:1/2 C6:1 A5:1/2 G5:1/2 | E5:3/2 D5:1/2 B4:2 |
            r:1/2 F5:1/2 A5:1/2 C6:1 A5:1/2 F5:1 | E5:1/2 D5:1/2 B4:1 G4:2 |
            r:1 C5:1/2 E5:1/2 A5:1 G5:1 | G#5:1/2 F5:1/2 D5:1 B4:1/2 G#4:1/2 E5:1 |
            A4:1/2 C5:1/2 E5:1 G5:1 B5:1 | A5:1 F#5:1 F5:1/2 E5:1/2 D5:1"""
BRIDGE = """r:1/2 D5:1/2 F5:1/2 A5:2 G5:1/2 | F5:1 E5:1/2 C#5:1/2 A4:2 |
            D5:1/2 E5:1/2 F5:1 A5:1 C6:1 | Bb5:1 A5:1 G5:1/2 E5:1/2 D5:1 |
            C5:3/2 E5:1/2 G5:1 A5:1 | Ab5:1 G5:1/2 F5:1/2 D5:2 |
            E5:1 B4:1 Bb4:1 C#5:1 | D5:1 F5:1 Ab5:1 G5:1"""
TAG = 'r:1/2 E5:1/2 G5:1/2 A5:3/2 G5:1/2 E5:1/2 | r:1/2 D5:1/2 E5:1/2 G5:5/2 | F5:1/2 E5:1/2 C5:1 B4:2 | [E5,G5,B5]:4'

for _m in (THEME, ANSWER, BRIDGE, TAG):
    check_bars(_m)


def bass_line(prog_bars):
    """Two-feel (root on 1, fifth on 3, approach on 4-and) with a walked bar
    at the end of every four-bar phrase."""
    out = []
    for i, bar in enumerate(prog_bars):
        if i % 4 == 3:
            nxt = prog_bars[i + 1][:1] if i + 1 < len(prog_bars) else []
            end = bar[-1][0] + bar[-1][1]
            out += [n for n in parts.walking(bar + nxt, lo='E1', hi='A2', vel=.8, seed=5 + i) if n.t < end - 1e-6]
        else:
            out += parts.bass(bar, [(0, 1.6, 'R', 1), (2, 1.3, '5', .78), (3.5, .45, 'A', .66)],
                              lo='E1', hi='D2', vel=.86)
    return out


def bars_of(prog, bar0, n):
    shifted = at(prog, bar0)
    return [[c for c in shifted if bar0 * 4 + b * 4 <= c[0] < bar0 * 4 + b * 4 + 4] for b in range(n)]


def build():
    s = Song('margins-in-pencil', 'Margins in Pencil', bpm=82, key=0, mode='major', genre='lofi',
             energy=.32, period='day', textures=['piano', 'bass', 'drums'], swing=.56, swing_unit=.25,
             seed=57, space=dict(seconds=2.2, predelay=.025, damp=.58, bright=5600), delay_beats=.75)
    s.section('intro', 0, 4); s.section('theme', 4, 8); s.section('answer', 12, 8)
    s.section('bridge', 20, 8); s.section('theme return', 28, 8); s.section('answer', 36, 8)
    s.section('outro', 44, 4)
    s.length_beats = 48 * 4

    groove_prog = at(A, 4) + at(A, 12) + at(B, 20) + at(A, 28) + at(A, 36)
    full = at(INTRO, 0) + groove_prog + at(OUTRO, 44)

    # Rhodes comping in short quarter stabs: 1, the 'and' of 2, and 4 (study-beat bounce).
    rh = parts.comp(full, [(0, .8, 1), (1.5, .7, .7), (3, .6, .58)], lo='G2', hi='D4', n=4,
                    vel=.52, rootless=True, spread=.008)
    s.notes('rhodes', sampler.rhodes(), rh, level=-23, reverb=.14, duck=.2, humanize_ms=7,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=130, lp=6500, peaks=[(420, -2, .8)]),
                                         rate=.4, depth=.1, mix=.25))

    lead = melody(THEME, 4 * 4, vel=.78) + melody(ANSWER, 12 * 4, vel=.8) + melody(BRIDGE, 20 * 4, vel=.72) \
        + melody(THEME, 28 * 4, vel=.8) + melody(ANSWER, 36 * 4, vel=.82) + melody(TAG, 44 * 4, vel=.6)
    pedal = [(b * 4, b * 4 + 1.9) for b in range(4, 48)] + [(b * 4 + 2, b * 4 + 3.9) for b in range(4, 48)]
    s.notes('piano lead', sampler.grand(), lead, level=-23, reverb=.22, delay=.05, humanize_ms=9,
            pedal=sorted(pedal), chain=lambda a, s: fx.eq(a, hp=170, lp=4600, peaks=[(2600, -2, 1)],
                                                           low_shelf=(300, -2)))

    # Intro and outro: the piano plays the chords softly, arpeggiated upward.
    edge = parts.comp(at(INTRO, 0) + at(OUTRO, 44), [(0, 3.8, 1)], lo='E3', hi='E5', n=4, vel=.42, spread=.12)
    s.notes('piano edge', sampler.grand(), edge, level=-25, reverb=.3, humanize_ms=6,
            chain=lambda a, s: fx.eq(a, hp=150, lp=4200))

    bl = bass_line(bars_of(A, 4, 8) + bars_of(A, 12, 8) + bars_of(B, 20, 8) + bars_of(A, 28, 8) + bars_of(A, 36, 8))
    bl += parts.bass(at(OUTRO, 44)[:4], [(0, 1.9, 'R', .75)], lo='E1', hi='D2')
    s.notes('upright bass', sampler.upright_bass(), bl, level=-20, humanize_ms=8, duck=.15,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=2800, peaks=[(110, 2, .9)]), -20, 3, 15, 150))

    kit = drums.acoustic_kit('lofi')
    groove = {'k': 'x.......x.x.....', 's': '....x.......x...', 'g': '.......g......g.',
              'h': 'x.xox.xox.xox.xo'}
    turn = {'k': 'x.......x.x..x..', 's': '....x.......x.gx', 'g': '..g....g........',
            'h': 'x.xox.xox.xox...'}
    hits = []
    for start in (4, 12, 28, 36):
        for b in range(8):
            g = turn if b == 7 else groove
            if b == 0 and start in (4, 28):
                g = dict(g, h='....x.xox.xox.xo')
            hits += drums.loop(g, 1, start + b)
    for b in range(8):      # bridge: cross-stick, softer hats, kick on 1 and 3
        hits += drums.loop({'k': 'x.......x.......', 'x': '....x.......x...', 'h': 'x.o.x.o.x.o.x.o.'}, 1, 20 + b)
    hits += drums.grid('........g.g.gggg', 'g', 27 * 4)
    hits += [(44 * 4, 'k', .65)]
    s.drums('kit', kit, hits, level=-21, late={'s': .012, 'g': .01, 'x': .01}, reverb=.04,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=40, lp=8500, peaks=[(62, 2, 1.2), (3500, -2, 1)]),
                                       -18, 3.5, 8, 90, 2))

    s.audio('vinyl', lambda n, s: fx.vinyl(n, level=.01, seed=19), gain_db=-9, bus='texture')
    s.bus_chain['music'] = intro_outro_filter(s, 4, 44, 48, closed=1000)
    s.master_chain = lambda a, s: fx.tape(fx.downsample(fx.automate(a, [(0, -9), (s.sec(10, False), 0), (s.sec(46 * 4, False), 0), (s.sec(48 * 4, False) + 2, -14)]), 30000),
                                          wow=.0016, drive=1.3, hiss=.0011, seed=9)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s


def check():
    return {'theme': parts.clashes(melody(THEME), A, strong_only=False),
            'answer': parts.clashes(melody(ANSWER), A, strong_only=False),
            'bridge': parts.clashes(melody(BRIDGE), B, strong_only=False),
            'tag': parts.clashes(melody(TAG), OUTRO, strong_only=False)}
