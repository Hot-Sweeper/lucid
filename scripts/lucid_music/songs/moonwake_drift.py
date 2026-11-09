"""Moonwake Drift: lunar drift phonk, E phrygian, 140 BPM (half-time feel).

A pitched 808 cowbell riff (2-bar figure, sequenced up through F lydian and G)
over gliding 808 sub, Memphis hats with triplet rolls and a clap on 3.
The middle section hands the tune to a slow bell melody over open pads.
"""
from lucid_music import drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.phonk import cowbell_track, memphis_hats, line808, at


RIFF = """E5:3/4 E5:1/4 G5:1/2 B5:1/2 A5:1/2 G5:1/4 F5:1/4 E5:1 |
          r:1/2 D5:1/4 E5:1/4 G5:1/2 E5:1/2 D5:1/2 B4:1/2 r:1 |
          F5:3/4 F5:1/4 A5:1/2 C6:1/2 B5:1/2 A5:1/4 G5:1/4 F5:1 |
          r:1/2 E5:1/4 F5:1/4 A5:1/2 F5:1/2 E5:1/2 C5:1/2 r:1 |
          G5:3/4 G5:1/4 B5:1/2 D6:1/2 E6:1/2 D6:1/4 B5:1/4 G5:1 |
          r:1/2 F5:1/4 G5:1/4 B5:1/2 G5:1/2 E5:1/2 D5:1/2 r:1 |
          A5:1/2 G5:1/2 F5:1/2 E5:1/2 F5:1 C5:1 |
          B4:1/2 D5:1/2 E5:3"""
BELLS = """E5:2 G5:1 A5:1 | B5:3 A5:1 | G5:2 D5:1 E5:1 | B4:4 |
           C5:2 A4:1 C5:1 | E5:3 F5:1 | D5:2 E5:1 F5:1 | E5:4"""


def build():
    s = Song('moonwake-drift', 'Moonwake Drift', bpm=140, key=4, mode='phrygian', genre='phonk',
             energy=.6, period='night', textures=['bells', 'bass', 'drums', 'pads'], swing=.53, swing_unit=.25,
             seed=21, space=dict(seconds=3.0, predelay=.03, damp=.45, bright=6000), delay_beats=1.5)
    A = progression('Em7 | Em7 | Fmaj7#11 | Fmaj7#11 | G6 | G6 | Fmaj7 | Em7')
    B = progression('Am9 | Am9 | G6 | G6 | Fmaj7 | Fmaj7 | Dm9 | Em7')
    # Form (bars): intro 8 | A 16 | B 16 | break 8 | A' 16 | outro 8
    for name, b0, n in (('intro', 0, 8), ('riff', 8, 16), ('bell theme', 24, 16), ('break', 40, 8),
                        ('riff return', 48, 16), ('outro', 64, 8)):
        s.section(name, b0, n)
    s.length_beats = 72 * 4
    full = at(A, 0) + at(A, 8) + at(A, 16) + at(B, 24) + at(B, 32) + at(A, 40) + at(A, 48) + at(A, 56) + at(A, 64)

    pad = parts.pad(full, 'B2', 'D5', 4, vel=.55)
    s.notes('pad', ('surge', 'Ghost Pad'), pad, level=-27, reverb=.18, duck=.3,
            chain=lambda a, s: fx.eq(a, hp=180, lp=7000, peaks=[(450, -2, .8)]))
    s.notes('air', ('surge', 'Distant'), parts.pad(at(B, 24) + at(B, 32) + at(A, 40), 'E4', 'E5', 3, vel=.5),
            level=-29, reverb=.25, chain=lambda a, s: fx.eq(a, hp=400, lp=9000))

    riff = []
    for b in (0, 8, 16, 48, 56, 64):
        riff += melody(RIFF, b * 4, vel=.8)
    cowbell_track(s, riff, level=-21, reverb=.12, delay=.1,
                  chain=lambda a, s: fx.eq(fx.width(fx.chorus(a, rate=.3, depth=.1, mix=.2), 1.3), hp=350, lp=8000))
    bells = melody(BELLS, 24 * 4, vel=.75) + melody(BELLS, 32 * 4, vel=.8) + melody(BELLS, 56 * 4, octave_shift=1, vel=.5)
    s.notes('bells', ('surge', 'Fantasy Bell'), bells, level=-23, reverb=.2, delay=.12,
            chain=lambda a, s: fx.eq(a, hp=300, lp=9000))

    def bassbars(prog_names, pats):
        return list(zip(prog_names, pats))
    a_roots = ['E1', 'E1', 'F1', 'F1', 'G1', 'G1', 'F1', 'E1']
    b_roots = ['A1', 'A1', 'G1', 'G1', 'F1', 'F1', 'D1', 'E1']
    a_pats = ['a', 'b', 'a', 'f', 'a', 'b', 'a', 'c']
    bl = []
    for b in (8, 16, 48, 56):
        bl += line808(list(zip(a_roots, a_pats)), b)
    for b in (24, 32):
        bl += line808(list(zip(b_roots, ['h', 'f', 'h', 'b', 'h', 'f', 'h', 'c'])), b)
    bl += line808(list(zip(a_roots, ['h'] * 8)), 40, vel=.75)
    bl += line808([('E1', 'h'), ('E1', 'h')], 64, vel=.7)
    s.notes('808', ('808', dict(drive=2.4, click=.3, decay=1.6)), bl, level=-19, humanize_ms=0, swing=False,
            chain=lambda a, s: fx.eq(a, hp=28, lp=4000))

    kit = drums.acoustic_kit('mid')
    kit['_opts'] = {'kick808': dict(tune=52, decay=.2, punch=3.)}
    hits = []
    for b0 in (8, 16, 48, 56):
        for b in range(8):
            kick = 'x.....x...x.....' if b % 2 == 0 else 'x.....x.x.......'
            hits += drums.loop({'kick808': kick, 'clap808': '........x.......', 'clap': '........x.......'}, 1, b0 + b)
        hits += memphis_hats(8, b0, roll='trip' if b0 % 16 == 8 else 'thirty', open_step=14)
        hits += drums.loop({'cowbell808': '..............x.'}, 1, b0 + 7)
    for b0 in (24, 32):        # bell theme: lighter kit, hats in 8ths
        for b in range(8):
            hits += drums.loop({'kick808': 'x.........x.....', 'clap808': '........x.......', 'clap': '........x.......'}, 1, b0 + b)
        hits += memphis_hats(8, b0, base='x.o.x.o.x.o.x.o.', roll='trip')
    hits += memphis_hats(8, 40, base='x...o...x...o...', roll=None)
    hits += memphis_hats(4, 64, base='x.o.x.o.x.o.x.o.', roll=None)
    hits += [(64 * 4, 'kick808', .8), (64 * 4 + 2, 'clap808', .5)]
    s.drums('drums', kit, hits, level=-20, humanize_ms=2, swing=True,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=13000, peaks=[(4000, -1.5, 1)]), -16, 2.5, 6, 80, 1))

    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 600), (s.sec(7.5 * 4, False), 2200), (s.sec(8 * 4, False), 16000),
                                                            (s.sec(66 * 4, False), 16000), (s.sec(72 * 4, False) + 2, 900)])
    s.master_chain = lambda a, s: fx.tape(a, wow=.0009, flutter=.0002, drive=1.15)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
