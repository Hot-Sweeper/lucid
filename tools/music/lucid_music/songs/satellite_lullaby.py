"""Satellite Lullaby: slow lunar phonk, B minor, 70 BPM.

A Rhodes melody over deep sliding 808, 16th hats with 32nd rolls, wide claps
and soft pads. The B section lifts to D major; vibraphone doubles the theme
an octave up on its return and a pitched 808 cowbell answers phrase ends.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.phonk import cowbell_track, memphis_hats, line808, at

A_PROG = 'Bm9 | Gmaj9 | Em9 | F#7b9 | Bm9 | Gmaj7#11 | Em9 | F#7sus4 F#7b9'
B_PROG = 'Dmaj9 | A6 | Gmaj9 | F#m7 | Em9 | Dmaj7 | Gmaj7#11 | F#7sus4 F#7b9'
THEME = """r:1/2 F#4:1/2 B4:1/2 C#5:1/2 D5:1 C#5:1/2 B4:1/2 | A4:1 F#4:2 r:1 |
           r:1/2 E4:1/2 G4:1/2 A4:1/2 B4:1 A4:1/2 G4:1/2 | F#4:1 E4:1/2 G4:1/2 A#4:2 |
           r:1/2 F#5:1/2 D5:1/2 C#5:1/2 D5:1 F#5:1/2 A5:1/2 | B5:1 A5:1/2 F#5:1/2 C#5:2 |
           D5:1/2 E5:1/2 F#5:1 G5:1 B4:1 | C#5:1 B4:1 A#4:2"""
LIFT = """A4:1/2 D5:1/2 E5:1 F#5:1 E5:1 | C#5:2 r:1 E5:1 |
          D5:1/2 G5:1/2 A5:1 B5:1 A5:1 | C#5:3 r:1 |
          B4:1/2 E5:1/2 F#5:1 G5:1 F#5:1 | E5:1 D5:1 C#5:1 A4:1 |
          B4:1 C#5:1 F#5:2 | E5:1 C#5:1 A#4:2"""
ANSWER = 'r:2 A#5:1/4 A#5:1/4 C#6:1/2 E6:1'


def build():
    s = Song('satellite-lullaby', 'Satellite Lullaby', bpm=70, key=11, mode='minor', genre='phonk', energy=.48,
             period='night', textures=['piano', 'mallets', 'bass', 'drums', 'pads'], swing=.54, swing_unit=.25, seed=55,
             space=dict(seconds=3.2, predelay=.035, damp=.45, bright=6000), delay_beats=.75)
    A, B = progression(A_PROG), progression(B_PROG)
    form = [('intro', 0, 4, A), ('theme', 4, 8, A), ('lift', 12, 8, B), ('break', 20, 4, A),
            ('theme return', 24, 8, A), ('outro', 32, 6, A)]
    full = []
    for name, b0, n, P in form:
        s.section(name, b0, n)
        full += [x for x in at(P, b0) if x[0] < (b0 + n) * 4]
    s.length_beats = 38 * 4

    s.notes('pad', ('surge', 'Still'), parts.pad(full, 'A2', 'D5', 4, vel=.6), level=-26, reverb=.15, duck=.25,
            chain=lambda a, s: fx.eq(a, hp=150, lp=6000))
    s.notes('air', ('surge', 'Sunday'), parts.pad(full[4:], 'D4', 'F#5', 3, vel=.45), level=-31, reverb=.3,
            chain=lambda a, s: fx.eq(fx.width(a, 1.15), hp=500, lp=9500))

    intro = melody('r:1/2 F#4:1/2 B4:1/2 C#5:1/2 D5:1 C#5:1/2 B4:1/2 | A4:1 F#4:2 r:1 | r:4 | r:2 A#4:2', 0, vel=.5)
    lead = intro + melody(THEME, 4 * 4, vel=.78) + melody(LIFT, 12 * 4, vel=.78) + melody(THEME, 24 * 4, vel=.82) \
        + melody('r:1/2 F#4:1/2 B4:1/2 C#5:1/2 D5:1 C#5:1/2 B4:1/2 | A4:1 F#4:3 | r:4 | B3:4', 32 * 4, vel=.55)
    s.notes('rhodes', sampler.rhodes(), lead, level=-20, reverb=.24, delay=.12, humanize_ms=8,
            pedal=[(b * 4, b * 4 + 3.95) for b in range(38)],
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=110, lp=7000, peaks=[(350, -2, .8)]), rate=.35, depth=.12, mix=.3))
    comp = parts.comp([x for x in full if 4 * 4 <= x[0] < 32 * 4], [(0, 1.6, 1), (2.5, 1.2, .7)], lo='F#2', hi='C#4',
                      n=4, vel=.38, rootless=True, spread=.015)
    s.notes('rhodes comp', sampler.rhodes(), comp, level=-27, reverb=.15, duck=.2, humanize_ms=8,
            chain=lambda a, s: fx.eq(a, hp=150, lp=4500))
    vib = melody(THEME, 24 * 4, octave_shift=1, vel=.45)
    s.notes('vibes', sampler.vibraphone(), vib, level=-27, reverb=.3, delay=.15,
            chain=lambda a, s: fx.eq(a, hp=400, lp=8000))
    cow = []
    for b0 in (4, 24):
        cow += melody(ANSWER, (b0 + 3) * 4, octave_shift=-1, vel=.7) + melody(ANSWER, (b0 + 7) * 4, octave_shift=-1, vel=.75)
    cowbell_track(s, cow, level=-25, reverb=.2, delay=.25, chain=lambda a, s: fx.eq(a, hp=350, lp=7000))

    a_roots = ['B0', 'G1', 'E1', 'F#1', 'B0', 'G1', 'E1', 'F#1']
    b_roots = ['D1', 'A0', 'G1', 'F#1', 'E1', 'D1', 'G1', 'F#1']
    bl = line808(list(zip(a_roots, ['f', 'h', 'b', 'c', 'f', 'h', 'b', 'c'])), 4) \
        + line808(list(zip(b_roots, ['h', 'b', 'h', 'c', 'h', 'b', 'h', 'c'])), 12) \
        + line808(list(zip(a_roots, ['f', 'h', 'b', 'c', 'f', 'h', 'b', 'c'])), 24) \
        + line808([('B0', 'h'), ('B0', 'h')], 32, vel=.7)
    s.notes('808', ('808', dict(drive=2.3, click=.3, decay=2.2)), bl, level=-19, humanize_ms=0, swing=False,
            chain=lambda a, s: fx.eq(a, hp=26, lp=3500))

    kit = drums.acoustic_kit('mid')
    kit['_opts'] = {'kick808': dict(tune=48, decay=.25, punch=2.8)}
    hits = []
    for b0 in (4, 12, 24):
        for b in range(8):
            kick = 'x.......x.x.....' if b % 2 == 0 else 'x.........x...x.'
            hits += drums.loop({'kick808': kick, 'clap808': '....x.......x...', 'clap': '....x.......x...'}, 1, b0 + b)
        hits += memphis_hats(8, b0, base='x.o.x.o.x.o.xoxo' if b0 != 12 else 'x.x.x.x.x.x.x.x.', roll_every=2,
                             roll='thirty', open_step=14 if b0 == 12 else None)
    hits += memphis_hats(4, 20, base='x.......x.......', roll=None)
    hits += [(32 * 4, 'kick808', .7)] + memphis_hats(2, 32, base='x...o...x...o...', roll=None)
    s.drums('drums', kit, hits, level=-21, humanize_ms=2,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=12000), -16, 2.5, 6, 90, 1))

    s.bus_chain['music'] = lambda a, s: fx.automate(
        fx.filter_sweep(a, [(0, 800), (s.sec(3.5 * 4, False), 2500), (s.sec(4 * 4, False), 16000),
                            (s.sec(33 * 4, False), 16000), (s.sec(38 * 4, False) + 2, 900)]),
        [(0, -8), (s.sec(3 * 4, False), -4), (s.sec(4 * 4, False), 0)])
    s.master_chain = lambda a, s: fx.tape(a, wow=.0012, flutter=.0002, drive=1.15)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
