"""Pale Halo: ethereal lunar phonk, F# minor, 130 BPM (half-time).

Wide pads and a slow vibraphone melody (doubled by a soft Surge bell an octave
up) carry the song; the pitched 808 cowbell only answers at phrase ends.
The B section lifts to the relative major before the theme returns.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.phonk import cowbell_track, memphis_hats, line808, at

THEME = """C#5:1/2 E5:1/2 F#5:1 E5:1/2 C#5:1/2 B4:1 | C#5:3 r:1 |
           D5:1/2 F#5:1/2 G#5:1 F#5:1/2 D5:1/2 C#5:1 | A4:3 r:1 |
           B4:1/2 D5:1/2 F#5:1 A5:1/2 F#5:1/2 E5:1 | C#5:2 D5:1 E5:1 |
           F#5:2 G#5:1 F#5:1 | E#5:3 r:1"""
LIFT = """E5:1/2 G#5:1/2 B5:1 C#6:1 B5:1 | A5:2 G#5:1 E5:1 |
          B4:1/2 E5:1/2 G#5:1 B5:1 G#5:1 | C#6:3 r:1 |
          F#5:1/2 A5:1/2 C#6:1 E6:1 C#6:1 | A5:2 F#5:1 E5:1 |
          D5:1 F#5:1 A5:1 C#6:1 | B5:2 G#5:2"""
ANSWER_A = 'r:2 C#6:1/4 C#6:1/4 E6:1/2 F#6:1'      # end of bar 4 (Dmaj7#11)
ANSWER_B = 'r:2 G#5:1/4 G#5:1/4 B5:1/2 C#6:1'      # end of bar 8 (C#7)


def build():
    s = Song('pale-halo', 'Pale Halo', bpm=130, key=6, mode='minor', genre='phonk', energy=.5, period='night',
             textures=['pads', 'mallets', 'bells', 'bass', 'drums'], swing=.52, swing_unit=.25, seed=33,
             space=dict(seconds=3.6, predelay=.04, damp=.4, bright=6500), delay_beats=1.5)
    A = progression('F#m9 | F#m9 | Dmaj7#11 | Dmaj7#11 | Bm9 | Bm9 | C#7sus4 | C#7')
    B = progression('Amaj9 | Amaj9 | E6 | E6 | Dmaj9 | Dmaj9 | Bm9 | C#7sus4')
    for name, b0, n in (('intro', 0, 8), ('theme', 8, 16), ('lift', 24, 16), ('break', 40, 8),
                        ('theme return', 48, 16), ('outro', 64, 8)):
        s.section(name, b0, n)
    s.length_beats = 72 * 4
    full = at(A, 0) + at(A, 8) + at(A, 16) + at(B, 24) + at(B, 32) + at(A, 40) + at(A, 48) + at(A, 56) + at(A, 64)

    s.notes('pad', ('surge', 'Still'), parts.pad(full, 'A2', 'C#5', 4, vel=.6), level=-26, reverb=.15, duck=.28,
            chain=lambda a, s: fx.eq(a, hp=150, lp=6500))
    s.notes('air', ('surge', 'Sunday'), parts.pad(full, 'E4', 'G#5', 3, vel=.5), level=-30, reverb=.3,
            chain=lambda a, s: fx.eq(fx.width(a, 1.2), hp=500, lp=10000))

    vib = melody(THEME, 0, vel=.55) + melody(THEME, 8 * 4) + melody(THEME, 16 * 4, vel=.82) \
        + melody(LIFT, 24 * 4) + melody(LIFT, 32 * 4, vel=.82) + melody(THEME, 48 * 4) + melody(THEME, 56 * 4, vel=.82) \
        + melody('C#5:1/2 E5:1/2 F#5:1 E5:1/2 C#5:1/2 B4:1 | C#5:4', 64 * 4, vel=.5)
    s.notes('vibes', sampler.vibraphone(), vib, level=-21, reverb=.22, delay=.14, humanize_ms=6,
            chain=lambda a, s: fx.eq(a, hp=220, lp=8000))
    halo = melody(THEME, 16 * 4, octave_shift=1, vel=.5) + melody(LIFT, 32 * 4, octave_shift=1, vel=.5) \
        + melody(THEME, 56 * 4, octave_shift=1, vel=.5)
    s.notes('halo bell', ('surge', 'Fantasy Bell'), halo, level=-28, reverb=.3,
            chain=lambda a, s: fx.eq(a, hp=600, lp=9000))

    cow = []
    for b0 in (8, 16, 48, 56, 40):
        cow += melody(ANSWER_A, (b0 + 3) * 4, octave_shift=-1, vel=.75) + melody(ANSWER_B, (b0 + 7) * 4, vel=.75)
    for b0 in (24, 32):
        cow += melody('r:2 B5:1/4 B5:1/4 C#6:1/2 E6:1', (b0 + 3) * 4, octave_shift=-1, vel=.7)
    cowbell_track(s, cow, level=-25, reverb=.2, delay=.2, chain=lambda a, s: fx.eq(a, hp=350, lp=7000))

    a_roots = ['F#1', 'F#1', 'D1', 'D1', 'B0', 'B0', 'C#1', 'C#1']
    b_roots = ['A1', 'A1', 'E1', 'E1', 'D1', 'D1', 'B0', 'C#1']
    bl = []
    for b in (8, 16, 48, 56):
        bl += line808(list(zip(a_roots, ['h', 'f', 'h', 'b', 'h', 'f', 'a', 'c'])), b)
    for b in (24, 32):
        bl += line808(list(zip(b_roots, ['h', 'b', 'h', 'f', 'h', 'b', 'h', 'c'])), b)
    bl += line808(list(zip(['F#1', 'F#1'], ['h', 'h'])), 64, vel=.7)
    s.notes('808', ('808', dict(drive=2.2, click=.25, decay=1.8)), bl, level=-19, humanize_ms=0, swing=False,
            chain=lambda a, s: fx.eq(a, hp=28, lp=3500))

    kit = drums.acoustic_kit('mid')
    kit['_opts'] = {'kick808': dict(tune=50, decay=.22, punch=2.6)}
    hits = []
    for b0 in (8, 16, 24, 32, 48, 56):
        for b in range(8):
            kick = 'x.........x.....' if b % 4 != 3 else 'x.........x..x..'
            hits += drums.loop({'kick808': kick, 'clap808': '........x.......', 'clap': '........x.......'}, 1, b0 + b)
        base = 'x.o.x.o.x.o.x.o.' if b0 in (8, 48) else 'xoxoxoxoxoxoxoxo'
        hits += memphis_hats(8, b0, base=base, roll='trip', open_step=14 if b0 in (24, 32) else None)
    hits += memphis_hats(8, 40, base='x.......o.......', roll=None)
    hits += [(64 * 4, 'kick808', .7)]
    hits += memphis_hats(4, 64, base='x...o...x...o...', roll=None)
    s.drums('drums', kit, hits, level=-21, humanize_ms=2,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=12000), -16, 2.5, 6, 80, 1))

    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 900), (s.sec(7.5 * 4, False), 3000), (s.sec(8 * 4, False), 16000),
                                                            (s.sec(66 * 4, False), 16000), (s.sec(72 * 4, False) + 2, 1000)])
    s.master_chain = lambda a, s: fx.tape(a, wow=.0008, flutter=.0002, drive=1.1)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
