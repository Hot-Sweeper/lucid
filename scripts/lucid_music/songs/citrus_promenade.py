"""Citrus Promenade: bossa nova, A minor, 132 BPM, straight 8ths felt in 2.

Rhodes comps the two-bar bossa rhythm with pushed anticipations, the upright
bass plays root/fifth with pickups, rim click clave and shaker carry the
groove. Vibes sing the A and B themes; the grand piano takes the last A.
Form: intro 8 | A 16 | B 16 | interlude 8 (call and answer) | A 16 | outro 8.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.jazz import at, comp_cells

VAMP = 'Am9 | D9 | Am9 | D9 | Am9 | D9 | Bm7b5 | E7b9'
A = 'Am9 | Am9 | Bm7b5 | E7b9 | Am9 | Am9 | Gm9 | C13 | Fmaj7#11 | Fmaj7#11 | Fm6 | Bb13 | Am9 | D9 | Bm7b5 | E7b9'
A_LAST = 'Am9 | Am9 | Bm7b5 | E7b9 | Am9 | Am9 | Gm9 | C13 | Fmaj7#11 | Fmaj7#11 | Fm6 | Bb13 | Am9 | D9 | Bm7b5 E7b9 | Am9'
B = 'Dm9 | G13 | Cmaj9 | Fmaj7#11 | Bm7b5 | E7b9 | Am9 | A7b9 | Dm9 | G13 | Em7 | A7b9 | Dm9 | Fm6 | Bm7b5 | E7b9'
OUTRO = 'Am9 | D9 | Am9 | D9 | Am9 | D9 | Am9 | Am9'

MEL_A_14 = """E5:3/2 D5:1/2 r:1/2 C5:1/2 B4:1 | A4:1 r:5/2 E5:1/2 | D5:3/2 C5:1/2 r:1/2 A4:1/2 F4:1 | G#4:1 r:5/2 E5:1/2 |
              E5:3/2 D5:1/2 r:1/2 C5:1/2 B4:1 | G4:1 A4:1/2 B4:1/2 C5:1 r:1/2 F5:1/2 | F5:3/2 E5:1/2 r:1/2 D5:1/2 Bb4:1 | A4:1 r:5/2 E5:1/2 |
              E5:2 B4:1 C5:1 | A4:3 r:1/2 Ab4:1/2 | Ab4:3/2 G4:1/2 r:1/2 F4:1/2 D5:1 | D5:1 r:5/2 C5:1/2 |
              C5:3/2 B4:1/2 r:1/2 A4:1/2 E5:1 | F#5:2 E5:1 C5:1 |"""
A_END = "D5:3/2 C5:1/2 r:1/2 A4:1/2 F4:1 | G#4:2 B4:1 D5:1 |"
A_LAST_END = "F5:1 D5:1 B4:1 G#4:1 | A4:4 |"
MEL_B = """r:1/2 A4:1/2 C5:1/2 E5:1/2 F5:2 | E5:3/2 D5:1/2 B4:2 | r:1/2 G4:1/2 B4:1/2 D5:1/2 E5:2 | B4:3/2 A4:1/2 E5:2 |
           r:1/2 F4:1/2 A4:1/2 C5:1/2 D5:2 | F5:3/2 E5:1/2 D5:1 G#4:1 | A4:2 C5:1 E5:1 | G5:2 Bb4:1 C#5:1 |
           D5:1 F5:1/2 A5:5/2 | G5:3/2 F5:1/2 E5:2 | D5:1 E5:1 G5:1 B5:1 | Bb5:2 G5:1 E5:1 |
           F5:2 E5:1 D5:1 | C5:2 Ab4:1 F4:1 | D5:2 F5:1 A5:1 | G#5:2 F5:1 D5:1 |"""
CALL = "E5:3/2 D5:1/2 r:1/2 C5:1/2 B4:1 | A4:2 r:2 |"
CALL2 = "E5:3/2 D5:1/2 r:1/2 C5:1/2 B4:1 | C5:1 D5:1 A4:2 |"
ANSWER = "r:1/2 E5:1/2 G5:1/2 B5:1/2 A5:1 E5:1 | F#5:4 |"
ANSWER2 = "r:1/2 D5:1/2 F5:1/2 A5:1/2 B5:1 F5:1 | E5:1 G#5:1 B5:2 |"
OUTRO_MEL = "E5:3/2 D5:1/2 r:1/2 C5:1/2 B4:1 | A4:4 | r:4 | r:4 | E5:3/2 D5:1/2 r:1/2 C5:1/2 B4:1 | A4:4 |"


def harmony():
    p = progression
    return (at(p(VAMP), 0) + at(p(A), 8) + at(p(B), 24) + at(p(VAMP), 40) + at(p(A_LAST), 48)
            + at(p(OUTRO), 64))


def vibes_notes():
    return (melody(' '.join([MEL_A_14, A_END, MEL_B]), 8 * 4, vel=.74)
            + melody(CALL, 40 * 4, vel=.7) + melody(CALL2, 44 * 4, vel=.7)
            + melody(OUTRO_MEL, 64 * 4, vel=.6))


def piano_notes():
    return (melody(ANSWER, 42 * 4, vel=.68) + melody(ANSWER2, 46 * 4, vel=.68)
            + melody(' '.join([MEL_A_14, A_LAST_END]), 48 * 4, vel=.76))


def build():
    s = Song('citrus-promenade', 'Citrus Promenade', bpm=132, key=9, mode='minor', genre='jazz', energy=.33,
             period='day', textures=['mallets', 'piano', 'bass', 'drums'], swing=.5, seed=47,
             space=dict(seconds=1.9, predelay=.02, damp=.55, bright=6500), delay_beats=1.5)
    s.section('intro', 0, 8); s.section('A', 8, 16); s.section('B', 24, 16)
    s.section('interlude', 40, 8); s.section('A (piano)', 48, 16); s.section('outro', 64, 8)
    s.length_beats = 72 * 4
    prog = harmony()

    cells = [[(0, .45, 1), (1.5, .9, .85), (3, .45, .8)],
             [(.5, .9, .8), (2, .45, .9), (3.5, .45, .75, True)]]
    comp = comp_cells(prog, cells, lo='C3', hi='E4', n=4, vel=.5, rootless=True, spread=.008)
    s.notes('rhodes', sampler.rhodes(), comp, level=-24, reverb=.12, duck=.0, humanize_ms=6,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=130, lp=7500, peaks=[(380, -2, .9)]), rate=.5, depth=.1, mix=.25))

    s.notes('vibraphone', sampler.vibraphone(), vibes_notes(), level=-21, reverb=.22, delay=.06, humanize_ms=8,
            chain=lambda a, s: fx.eq(a, hp=220, lp=9500))
    s.notes('piano', sampler.grand(), piano_notes(), level=-21.5, reverb=.18, humanize_ms=8,
            chain=lambda a, s: fx.eq(a, hp=170, lp=8500, peaks=[(2800, -1.5, 1)]))

    pat = [(0, 1.4, 'R', 1), (1.5, .45, 'R', .55), (2, 1.4, '5', .88), (3.5, .45, '5', .55)]
    bl = parts.bass([c for c in prog if 4 * 4 <= c[0] < 70 * 4], pat, lo='E1', hi='D2', vel=.8)
    s.notes('upright bass', sampler.upright_bass(), bl, level=-20, humanize_ms=6, swing=False,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=2800, peaks=[(100, 1.5, .9)]), -20, 2.5, 12, 140))

    kit = drums.acoustic_kit('mid')
    kit['k'].gain_db -= 6
    kit['x'].gain_db -= 3
    kit['shaker'].gain_db -= 3
    groove = {'x': 'x.....x.....x...|....x.....x.....', 'shaker': 'xgogxgogxgogxgog', 'k': 'o.....o.o.....o.'}
    hits = []
    for b in range(4, 68, 2):
        g = groove if b >= 8 else {'shaker': 'ogggogggogggoggg', 'x': groove['x']}
        hits += drums.loop(g, 2, b)
        if 24 <= b < 40 and b % 4 == 2:
            hits += drums.grid('......o.......o.', 'conga', (b + 1) * 4)
    for b in range(68, 70):
        hits += drums.loop({'shaker': 'ogggogggogggoggg'}, 1, b)
    s.drums('percussion', kit, hits, level=-26.5, reverb=.06, humanize_ms=4, swing=False,
            chain=lambda a, s: fx.eq(a, hp=50, lp=11000, peaks=[(5000, -2, 1)]))

    end = s.sec(72 * 4, False)
    s.bus_chain['drums'] = lambda a, s: fx.automate(a, [(0, -9), (s.sec(16, False), -9), (s.sec(32, False), 0),
                                                        (end - 9, 0), (end + 1, -14)])
    s.bus_chain['music'] = lambda a, s: fx.automate(a, [(0, -8), (s.sec(8, False), 0), (end - 9, 0), (end + 1, -14)])
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
