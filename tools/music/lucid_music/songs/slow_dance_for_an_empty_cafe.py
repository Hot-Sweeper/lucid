"""Slow Dance for an Empty Café: jazz ballad, Db major, 68 BPM.

Vibraphone sings the tune over rootless grand-piano voicings, upright bass in
half notes and a whisper of ride cymbal. Form: intro 4 | A 8 | A' 8 | bridge 8 |
A' 8 | outro 4 (borrowed Gbm6 before the final Dbmaj9).
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody, voice, Note
from lucid_music.styles.jazz import at, comp_cells

INTRO = 'Gbmaj9 | Fm9 | Ebm9 | Ab7sus4 Ab7b9'
A = 'Dbmaj9 | Bbm9 | Ebm9 | Ab13 | Fm9 | Bb7b9 | Ebm9 | Ab7sus4 Ab7b9'
A2 = 'Dbmaj9 | Bbm9 | Ebm9 | Ab13 | Fm9 | Bb7b9 | Ebm9 Ab7b9 | Dbmaj9'
B = 'Gbmaj9 | Fm9 Bb7b9 | Ebm9 | Ab13 | Gbmaj9 | Gm7b5 C7b9 | Fm9 Bb13 | Ebm9 Ab7b9'
OUTRO = 'Gbmaj9 | Gbm6 | Dbmaj9 | Dbmaj9'

MEL_A = """r:1 F5:1 Ab5:1 C6:1 | Db6:2 C6:1 Bb5:1 | Gb5:3 F5:1 | F5:2 Eb5:1 C5:1 |
           r:1 Ab5:1 C6:1 Eb6:1 | D6:2 B5:1 Ab5:1 | Gb5:2 Bb5:1 Db6:1 | Db6:1 Bb5:1 C6:1 A5:1 |"""
MEL_A2 = """r:1/2 Eb5:1/2 F5:1 Ab5:1 C6:1 | Db6:3/2 Eb6:1/2 Db6:1 Bb5:1 | Gb5:2 F5:1 Eb5:1 | F5:3/2 Gb5:1/2 F5:1 C5:1 |
            Eb5:1 F5:1 Ab5:1 C6:1 | B5:1 Ab5:1 F5:1 D5:1 | Bb5:1 Gb5:1 Eb5:1 C5:1 | Db5:3 r:1 |"""
MEL_B = """r:1 Bb4:1 Db5:1 F5:1 | Eb5:2 D5:1 B4:1 | Db5:1 Eb5:1 Gb5:1 Bb5:1 | Ab5:2 F5:1 Eb5:1 |
           Db6:2 Bb5:1 F5:1 | F5:1 Db5:1 E5:1 Db5:1 | C5:1 Eb5:1 G5:1 D5:1 | Gb5:2 C5:1 A4:1 |"""
MEL_OUT = "r:2 Db6:1 Bb5:1 | A5:2 Gb5:2 | F5:6 r:2 |"


def harmony():
    p = progression
    return at(p(INTRO), 0) + at(p(A), 4) + at(p(A2), 12) + at(p(B), 20) + at(p(A2), 28) + at(p(OUTRO), 36)


def lead_notes():
    return melody(' '.join([MEL_A, MEL_A2, MEL_B, MEL_A2]), 16, vel=.74) + melody(MEL_OUT, 36 * 4, vel=.62)


def build():
    s = Song('slow-dance-for-an-empty-cafe', 'Slow Dance for an Empty Café', bpm=68, key=1, mode='major',
             genre='jazz', energy=.22, period='night', textures=['mallets', 'piano', 'bass', 'drums'],
             swing=.58, swing_unit=.5, seed=34, space=dict(seconds=2.8, predelay=.03, damp=.5, bright=6000))
    s.section('intro', 0, 4); s.section('A', 4, 8); s.section("A'", 12, 8)
    s.section('bridge', 20, 8); s.section("A'", 28, 8); s.section('outro', 36, 4)
    s.length_beats = 40 * 4
    prog = harmony()

    cells = [[(0, 1.9, .9), (2, 1.9, .72)], [(0, 1.4, .9), (1.5, .45, .55, True), (2, 1.9, .75)],
             [(0, 3.9, .88)], [(0, 1.9, .9), (2, 1.4, .72), (3.5, .45, .55, True)]]
    order = [0, 1, 0, 3, 0, 1, 3, 0]
    comp = comp_cells(prog[:-2], cells, lo='Db3', hi='F4', n=4, vel=.42, order=order, spread=.035)
    # the last two Dbmaj9 bars ring under the outro melody
    comp += [Note(38 * 4 + i * .05, 7.5, p, .4) for i, p in enumerate(voice(prog[-1][2], 'Db3', 'F4', 4))]
    pedal = [(b * 4 + h, b * 4 + h + 1.95) for b in range(38) for h in (0, 2)] + [(38 * 4, 40 * 4)]
    s.notes('piano', sampler.grand(), comp, level=-25, reverb=.22, humanize_ms=10, pedal=pedal,
            chain=lambda a, s: fx.eq(a, hp=110, lp=7000, peaks=[(320, -2, .9)]))

    s.notes('vibraphone', sampler.vibraphone(), lead_notes(), level=-21, reverb=.3, delay=.07, humanize_ms=12,
            chain=lambda a, s: fx.eq(a, hp=220, lp=9000))

    bl = parts.bass([c for c in prog if 4 * 4 <= c[0] < 38 * 4], [(0, 1.85, 'R', 1), (2, 1.85, '5', .78)],
                    lo='Eb1', hi='Db2', vel=.78)
    bl += [Note(38 * 4, 7, 25, .7)]                   # low Db under the ending
    s.notes('upright bass', sampler.upright_bass(), bl, level=-21, humanize_ms=10,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=32, lp=2500, peaks=[(95, 1.5, .9)]), -20, 2.5, 15, 160))

    kit = drums.acoustic_kit('mid')
    kit['k'].gain_db -= 10
    hits = []
    for b in range(4, 38):
        hits += drums.loop({'ride': 'o...o.g.o...o.g.', 'p': '....g.......g...'}, 1, b)
        if (b - 4) % 8 == 7:
            hits += drums.grid('..........g...g.', 'g', b * 4)
    hits += [(38 * 4, 'bell', .3)]
    s.drums('kit', kit, hits, level=-30, reverb=.12, humanize_ms=7,
            chain=lambda a, s: fx.eq(a, hp=60, lp=10000, peaks=[(4500, -3, 1)]))

    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
