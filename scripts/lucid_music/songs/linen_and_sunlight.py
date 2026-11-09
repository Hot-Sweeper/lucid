"""Linen and Sunlight: Sunday-morning lo-fi, Ab major, 74 BPM, swung 16ths.

Grand piano comps a IV-iii-ii-V-I-vi-ii-V turnaround while a Rhodes hums a
rising three-note figure (Eb-F-Ab) that it answers higher the second time.
The bridge leans into F minor with a C7#9 and a borrowed Bb13; the grand takes
the tune while the Rhodes comps. Cross-stick, shaker and a soft kick.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.lofi import at, intro_outro_filter

A = progression('Dbmaj9 | Cm7 | Bbm9 | Eb13 | Abmaj9 | Fm9 | Bbm9 | Eb9sus4 Eb7b9')
B = progression('Fm9 | Fm9/Eb | Dbmaj9 | C7#9 | Fm9 | Bb13 | Dbmaj9 | Eb9sus4')
INTRO = progression('Dbmaj9 | Cm7 | Bbm9 | Eb9sus4')
OUTRO = progression('Dbmaj9 | Cm7 | Bbm9 Eb9sus4 | Abmaj9')

THEME = """r:1 Eb5:1/2 F5:1/2 Ab5:1 F5:1/2 Eb5:1/2 | Eb5:3/2 C5:1/2 Bb4:2 |
           r:1 Db5:1/2 F5:1/2 Ab5:1 F5:1/2 Db5:1/2 | C5:3/2 Bb4:1/2 G4:2 |
           r:1/2 Ab4:1/2 C5:1/2 Eb5:1/2 G5:1 F5:1/2 Eb5:1/2 | F5:1 Eb5:1/2 C5:1/2 Ab4:2 |
           Bb4:1/2 C5:1/2 Db5:1 F5:1 Eb5:1 | F5:1 Eb5:1 Db5:1 Bb4:1"""
ANSWER = """r:1 Eb5:1/2 F5:1/2 Ab5:1 Bb5:1/2 Ab5:1/2 | G5:3/2 Eb5:1/2 C5:2 |
            r:1 Db5:1/2 F5:1/2 Ab5:1 Bb5:1/2 Ab5:1/2 | G5:1 F5:1/2 Eb5:1/2 Db5:2 |
            C5:1/2 Eb5:1/2 Ab5:1 G5:1 Eb5:1 | F5:1/2 G5:1/2 Ab5:1 C5:2 |
            Db5:1 C5:1/2 Bb4:1/2 Db5:1 F5:1 | Eb5:2 Db5:1/2 Bb4:1/2 G4:1"""
BRIDGE = """r:1/2 C5:1/2 Eb5:1/2 G5:1/2 Ab5:2 | G5:1 F5:1/2 Eb5:1/2 C5:2 |
            r:1/2 Ab4:1/2 C5:1/2 Eb5:1/2 F5:2 | Eb5:1 E5:1/2 G5:1/2 Bb5:2 |
            Ab5:3/2 G5:1/2 F5:1 C5:1 | D5:1 F5:1/2 G5:1/2 Ab5:2 |
            F5:1 Eb5:1/2 Db5:1/2 C5:2 | Bb4:1 Db5:1 Eb5:2"""
TAG = 'r:1 Eb5:1/2 F5:1/2 Ab5:1 F5:1/2 Eb5:1/2 | Eb5:3/2 C5:1/2 Bb4:2 | r:4 | C5:4'


def build():
    s = Song('linen-and-sunlight', 'Linen and Sunlight', bpm=74, key=8, mode='major', genre='lofi',
             energy=.27, period='morning', textures=['piano', 'bass', 'drums'], swing=.56, swing_unit=.25,
             seed=31, space=dict(seconds=2.3, predelay=.03, damp=.5, bright=6000), delay_beats=.75)
    s.section('intro', 0, 4); s.section('theme', 4, 8); s.section('answer', 12, 8)
    s.section('bridge', 20, 8); s.section('answer return', 28, 8); s.section('outro', 36, 4)
    s.length_beats = 40 * 4

    piano_prog = at(INTRO, 0) + at(A, 4) + at(A, 12) + at(A, 28) + at(OUTRO, 36)
    groove_prog = at(A, 4) + at(A, 12) + at(B, 20) + at(A, 28)

    # Grand piano chords: a long rolled chord on 1, a lighter one on the 'and' of 3.
    pchords = parts.comp(piano_prog, [(0, 2.4, 1), (2.5, 1.4, .68)], lo='C3', hi='F4', n=4, vel=.55,
                         rootless=True, spread=.03)
    pedal = [(b * 4, b * 4 + 3.92) for b in list(range(0, 20)) + list(range(28, 40))]
    s.notes('piano chords', sampler.grand(), pchords, level=-26, reverb=.2, duck=.15, humanize_ms=8,
            pedal=pedal, chain=lambda a, s: fx.eq(a, hp=110, lp=5200, peaks=[(300, -2, .9)]))

    # Rhodes: the tune; in the bridge it steps back to comp.
    lead = melody(THEME, 4 * 4) + melody(ANSWER, 12 * 4) + melody(ANSWER, 28 * 4, vel=.82) \
        + melody(TAG, 36 * 4, vel=.62)
    s.notes('rhodes lead', sampler.rhodes(), lead, level=-21, reverb=.2, delay=.07, humanize_ms=8,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=200, lp=7000, peaks=[(1200, 1, 1)]), rate=.5, depth=.12, mix=.3))
    rcomp = parts.comp(at(B, 20), [(0, 1.6, 1), (1.75, .7, .7), (3, .9, .6)], lo='Ab2', hi='Eb4', n=4,
                       vel=.5, rootless=True, spread=.01)
    s.notes('rhodes comp', sampler.rhodes(), rcomp, level=-25, reverb=.16, duck=.15, humanize_ms=7,
            chain=lambda a, s: fx.eq(a, hp=130, lp=6500))

    # Bridge tune on the grand, a touch brighter.
    bpedal = [(b * 4, b * 4 + 1.95) for b in range(20, 28)] + [(b * 4 + 2, b * 4 + 3.92) for b in range(20, 28)]
    s.notes('piano tune', sampler.grand(), melody(BRIDGE, 20 * 4, vel=.8), level=-21, reverb=.26, delay=.06,
            humanize_ms=9, pedal=bpedal, chain=lambda a, s: fx.eq(a, hp=200, lp=6000, low_shelf=(300, -2)))

    bass_pat = [(0, 1.4, 'R', 1), (1.5, .45, '5', .6), (2.5, .9, '3', .72), (3.5, .45, 'A', .66)]
    bl = parts.bass(groove_prog, bass_pat, lo='Eb1', hi='Db2', vel=.82)
    bl += parts.bass(at(OUTRO, 36), [(0, 3.6, 'R', .7)], lo='Eb1', hi='Db2')
    s.notes('upright bass', sampler.upright_bass(), bl, level=-20, humanize_ms=8, duck=.15,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=2600, peaks=[(100, 2, .9)]), -20, 3, 15, 150))

    kit = drums.acoustic_kit('lofi')
    soft = {'k': 'x.......x.x.....', 'x': '....x.......x...', 'h': 'o.g.o.g.o.g.o.go'}
    soft_turn = {'k': 'x.......x.x..o..', 'x': '....x.......x.x.', 'h': 'o.g.o.g.o.g.o...'}
    snare = {'k': 'x.......x.x.....', 's': '....o.......o...', 'g': '.......g.g....g.', 'h': 'o.g.o.g.o.g.o.go'}
    hits = []
    for start, g in ((4, soft), (12, soft), (28, snare)):
        for b in range(8):
            hits += drums.loop(soft_turn if b == 7 and g is soft else g, 1, start + b)
    for b in range(8):
        hits += drums.loop({'k': 'x.........x.....', 'x': '....o.......o...', 'ride': 'o...o...o...o...'}, 1, 20 + b)
    hits += [(36 * 4, 'k', .6)]
    shaker = []
    for start, bars in ((4, 32),):
        shaker += drums.loop({'shaker': 'xgogxgogxgogxgog'}, bars, start)
    s.drums('kit', kit, hits, level=-22, late={'s': .015, 'g': .01, 'x': .012}, reverb=.06,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=40, lp=8000, peaks=[(60, 1.5, 1.2), (3500, -2.5, 1)]),
                                       -18, 3, 8, 90, 1.5))
    s.drums('shaker', kit, shaker, level=-33, humanize_ms=5, reverb=.08,
            chain=lambda a, s: fx.eq(a, hp=500, lp=9000))

    s.audio('vinyl', lambda n, s: fx.vinyl(n, level=.009, seed=12), gain_db=-10)
    s.bus_chain['music'] = intro_outro_filter(s, 4, 36, 40, closed=1300)
    s.master_chain = lambda a, s: fx.tape(fx.downsample(fx.automate(a, [(0, -12), (s.sec(7, False), 0), (s.sec(38 * 4, False), 0), (s.sec(40 * 4, False) + 2, -12)]), 32000),
                                          wow=.0015, drive=1.25, hiss=.001, seed=8)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s


def check():
    return dict(theme=parts.clashes(melody(THEME), A, strong_only=False),
                answer=parts.clashes(melody(ANSWER), A, strong_only=False),
                bridge=parts.clashes(melody(BRIDGE), B, strong_only=False),
                tag=parts.clashes(melody(TAG), OUTRO, strong_only=False))
