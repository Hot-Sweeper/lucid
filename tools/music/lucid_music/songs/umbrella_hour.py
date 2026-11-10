"""Umbrella Hour: rainy-night lo-fi, Bb minor, 70 BPM, swung 16ths.

A vibraphone carries a falling four-note figure (rest, up a triad, step down)
that sequences down a third over Gbmaj9 - Fm9 - Ebm9 - Ab13, then climbs to a
diminished-seventh leap over F7b9 before settling. The bridge hands the tune to
the Rhodes over Ebm9 - Ab13 - Dbmaj9 while the kit drops to cross-stick, and
the theme returns with the Rhodes shadowing the vibes an octave below.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.lofi import at, intro_outro_filter, rain, check_bars

A = progression('Gbmaj9 | Fm9 | Ebm9 | Ab13 | Dbmaj9 | Cm7b5 F7b9 | Bbm9 | Gbmaj7#11 F7#9')
B = progression('Ebm9 | Ab13 | Dbmaj9 | Bbm9 | Ebm9 | Ab13 | Fm7 Bbm9 | Cm7b5 F7#9')
INTRO = progression('Gbmaj9 | Fm9 | Ebm9 | Ab13')
OUTRO = progression('Gbmaj9 | Fm9 | Ebm9 | Gbmaj7#11')

THEME = """r:1/2 Db5:1/2 F5:1/2 Ab5:1 Gb5:1/2 F5:1 | Eb5:1/2 C5:1/2 Ab4:2 r:1 |
           r:1/2 Bb4:1/2 Db5:1/2 Gb5:1 F5:1/2 Eb5:1 | C5:1/2 Bb4:1/2 Ab4:1 F5:2 |
           r:1/2 F5:1/2 Ab5:1/2 C6:1 Bb5:1/2 Ab5:1 | Gb5:1/2 Eb5:1/2 C5:1 A4:1 Gb5:1 |
           F5:3/2 Db5:1/2 C5:1 Db5:1 | Bb4:2 A4:1 C5:1"""
ANSWER = """r:1/2 F5:1/2 Ab5:1/2 Bb5:1 Ab5:1/2 F5:1 | G5:1/2 Ab5:1/2 Eb5:2 r:1 |
            r:1/2 Db5:1/2 F5:1/2 Gb5:1 F5:1/2 Db5:1 | Eb5:1/2 C5:1/2 Bb4:1 Ab4:2 |
            r:1 F5:1/2 Ab5:1/2 C6:1 Ab5:1 | Bb5:1/2 Gb5:1/2 Eb5:1 Eb5:1/2 C5:1/2 A4:1 |
            Db5:1/2 F5:1/2 Ab5:1 C6:1 Bb5:1 | Ab5:1/2 F5:1/2 Db5:1 C5:1/2 A4:3/2"""
BRIDGE = """r:1 Bb4:1/2 Db5:1/2 F5:2 | Eb5:1/2 C5:1/2 Gb5:1/2 F5:1/2 C5:2 |
            r:1 Ab4:1/2 C5:1/2 Eb5:1 F5:1 | Db5:3 r:1 |
            r:1 Bb4:1/2 Db5:1/2 Gb5:1 F5:1 | Eb5:1/2 F5:1/2 C5:3 |
            Ab4:1 C5:1 Db5:1 F5:1 | Eb5:1 Gb5:1 A4:1 Ab5:1"""
TAG = 'r:1/2 Db5:1/2 F5:1/2 Ab5:1 Gb5:1/2 F5:1 | Eb5:1/2 C5:1/2 Ab4:3 | r:4 | Bb4:4'

for _m in (THEME, ANSWER, BRIDGE, TAG):
    check_bars(_m)


def build():
    s = Song('umbrella-hour', 'Umbrella Hour', bpm=70, key=10, mode='minor', genre='lofi',
             energy=.28, period='night', textures=['mallets', 'piano', 'bass', 'drums'], swing=.58,
             swing_unit=.25, seed=41, space=dict(seconds=2.8, predelay=.03, damp=.6, bright=5200),
             delay_beats=.75)
    s.section('intro', 0, 4); s.section('theme', 4, 8); s.section('answer', 12, 8)
    s.section('bridge', 20, 8); s.section('theme return', 28, 8); s.section('outro', 36, 4)
    s.length_beats = 40 * 4

    groove_prog = at(A, 4) + at(A, 12) + at(B, 20) + at(A, 28)
    full = at(INTRO, 0) + groove_prog + at(OUTRO, 36)

    # Rhodes: long chord on 1, soft re-strike on the 'a' of 2, push into the next bar.
    rh = parts.comp(full, [(0, 1.6, 1), (1.75, 1.0, .62), (3.5, .5, .5)], lo='Ab2', hi='Eb4', n=4,
                    vel=.5, rootless=True, spread=.014)
    s.notes('rhodes', sampler.rhodes(), rh, level=-24, reverb=.18, duck=.2, humanize_ms=8,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=120, lp=6500, peaks=[(380, -2, .8)]),
                                         rate=.45, depth=.14, mix=.32))

    lead = melody(THEME, 4 * 4, vel=.76) + melody(ANSWER, 12 * 4, vel=.78) + melody(THEME, 28 * 4, vel=.8) \
        + melody(TAG, 36 * 4, vel=.6)
    s.notes('vibes', sampler.vibraphone(), lead, level=-21, reverb=.28, delay=.1, humanize_ms=8,
            chain=lambda a, s: fx.eq(a, hp=230, lp=7000, peaks=[(2400, -1.5, 1)]))

    # Bridge tune on a brighter Rhodes; on the return it shadows the vibes an octave down.
    tune = melody(BRIDGE, 20 * 4, vel=.74) + melody(THEME, 28 * 4, octave_shift=-1, vel=.55)
    s.notes('rhodes tune', sampler.rhodes(), tune, level=-23, reverb=.22, delay=.08, humanize_ms=8,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=200, lp=6000), rate=.5, depth=.12, mix=.28))

    bass_pat = [(0, 1.7, 'R', 1), (2.5, .9, '5', .75), (3.5, .45, 'A', .68)]
    bl = parts.bass(groove_prog, bass_pat, lo='Eb1', hi='Db2', vel=.85)
    bl += parts.bass(at(OUTRO, 36)[:3], [(0, 3.5, 'R', .75)], lo='Eb1', hi='Db2')
    s.notes('upright bass', sampler.upright_bass(), bl, level=-20, humanize_ms=8, duck=.16,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=2600, peaks=[(100, 2, .9)]), -20, 3, 15, 150))

    kit = drums.acoustic_kit('lofi')
    groove = {'k': 'x.........x.....', 's': '....x.......x...', 'g': '.......g.g....g.',
              'h': 'x.o.x.o.x.o.x.o.'}
    turn = {'k': 'x.........x..o..', 's': '....x.......x.g.', 'g': '..g....g.g......',
            'h': 'x.o.x.o.x.o.x...', 'o': '..............x.'}
    hits = []
    for start in (4, 12, 28):
        for b in range(8):
            g = turn if b in (3, 7) else groove
            if b == 0 and start == 4:
                g = dict(g, h='....x.o.x.o.x.o.')
            hits += drums.loop(g, 1, start + b)
    for b in range(8):      # bridge: cross-stick and ride, kick only on 1
        hits += drums.loop({'k': 'x...............', 'x': '....x.......x...', 'ride': 'x...x.o.x...x.o.'}, 1, 20 + b)
    hits += drums.grid('........g.g.g.gg', 'g', 27 * 4)
    hits += [(36 * 4, 'k', .6)]
    s.drums('kit', kit, hits, level=-21, late={'s': .016, 'g': .012, 'x': .012}, reverb=.05,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=40, lp=7500, peaks=[(60, 2, 1.2), (3500, -2.5, 1)]),
                                       -18, 3.5, 8, 90, 2))

    s.audio('rain', lambda n, s: rain(n, seed=4, level=.004), gain_db=-6, bus='texture',
            chain=lambda a, s: fx.automate(a, [(0, 0), (s.sec(6 * 4, False), -6), (s.sec(36 * 4, False), -6),
                                              (s.sec(40 * 4, False), 0)]))
    s.audio('vinyl', lambda n, s: fx.vinyl(n, level=.01, seed=12), gain_db=-10)
    s.bus_chain['music'] = intro_outro_filter(s, 4, 36, 40, closed=950)
    s.master_chain = lambda a, s: fx.tape(fx.downsample(fx.automate(a, [(0, -10), (s.sec(12, False), 0), (s.sec(38 * 4, False), 0), (s.sec(40 * 4, False) + 2, -14)]), 30000),
                                          wow=.0019, drive=1.3, hiss=.0012, seed=8)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s


def check():
    return {'theme': parts.clashes(melody(THEME), A, strong_only=False),
            'answer': parts.clashes(melody(ANSWER), A, strong_only=False),
            'bridge': parts.clashes(melody(BRIDGE), B, strong_only=False),
            'tag': parts.clashes(melody(TAG), OUTRO, strong_only=False)}
