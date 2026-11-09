"""Last Set at Marlowe's: medium-swing piano trio, Bb major, 126 BPM.

32-bar AABA head on the Salamander grand with rootless left-hand comping,
walking upright bass, ride cymbal with the skip note and 2-and-4 hi-hat.
Form: intro 4 | head AABA 32 | piano solo over AA 16 | head out B A 16 | tag 4.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.jazz import at, comp_cells

A1 = 'Bbmaj9 G7b9 | Cm9 F13 | Dm9 Db9 | Cm9 F13 | Bbmaj9 Bb13 | Ebmaj9 Ab13 | Dm9 G7b9 | Cm9 F7b9'
A2 = 'Bbmaj9 G7b9 | Cm9 F13 | Dm9 Db9 | Cm9 F13 | Bbmaj9 Bb13 | Ebmaj9 Ab13 | Cm9 F13 | Bb6'
B = 'Fm9 | Bb13 | Ebmaj9 | Ebmaj9 | Am7b5 | D7b9 | Gm9 C13 | Cm9 F13'
INTRO = 'Cm9 F13 | Dm9 G7b9 | Cm9 F13 | Gb7#11 F7b9'
TAG = 'Cm9 F13 | Dm9 G7b9 | Cm9 F7b9 | Bbmaj9'

HEAD_A = """F5:1/2 D5:1/2 r:1/2 Bb4:1/2 D5:1 B4:1 | C5:1/2 Eb5:1/2 G5:1/2 Bb5:1/2> A5:1 F5:1 |
            r:1/2 A4:1/2 C5:1/2 D5:1/2 F5:1 Eb5:1/2 F5:1/2 | Eb5:1 D5:1/2 C5:1/2 A4:1 r:1 |
            F5:1/2 D5:1/2 r:1/2 Bb4:1/2 D5:1 Ab5:1> | G5:3/2 Bb5:1/2 Gb5:1 Eb5:1 |"""
A1_END = "F5:1/2 E5:1/2 F5:1/2 A5:1/2 Ab5:1> F5:1 | Eb5:1 D5:1/2 C5:1/2 A4:2 |"
A2_END = "C5:1/2 Eb5:1/2 G5:1/2 Bb5:1/2> A5:1 F5:1/2 Eb5:1/2 | D5:3 r:1 |"
BRIDGE = """r:1/2 C5:1/2 Eb5:1/2 F5:1/2 Ab5:1> G5:1 | F5:1/2 D5:1/2 Ab4:1 r:2 |
            r:1/2 Bb4:1/2 D5:1/2 F5:1/2 G5:1 F5:1/2 Eb5:1/2 | D5:3 r:1 |
            r:1/2 Eb5:1/2 G5:1/2 A5:1/2 C6:1> G5:1 | F#5:1/2 A5:1/2 Eb5:1 C5:1 r:1 |
            Bb4:1/2 D5:1/2 F5:1/2 A5:1/2 G5:1 E5:1 | Eb5:1 D5:1/2 C5:1/2 A4:1 C5:1 |"""
SOLO = """r:1/2 F4:1/2 G4:1/2 A4:1/2 B4:1/2 D5:1/2 F5:1/2 Ab5:1/2> | G5:1/2 Eb5:1/2 C5:1/2 Bb4:1/2 A4:1/2 C5:1/2 Eb5:1/2 Gb5:1/2 |
          F5:1 E5:1/2 D5:1/2 Eb5:1/2 F5:1/2 Ab5:1/2 B5:1/2> | Bb5:1/2 G5:1/2 Eb5:1/2 C5:1/2 A4:1 r:1 |
          r:1 D5:1/2 F5:1/2 Ab5:1/2> F5:1/2 D5:1/2 Bb4:1/2 | G4:1/2 Bb4:1/2 D5:1/2 F5:1/2 Eb5:1/2 C5:1/2 Gb4:1/2 Ab4:1/2 |
          A4:1/2 C5:1/2 E5:1/2 D5:1/2 F5:1/2 Ab5:1/2> B4:1/2 D5:1/2 | C5:1 Eb5:1/2 D5:1/2 A4:1/2 F4:1/2 r:1 |
          D6:1/2> C6:1/2 Bb5:1/2 A5:1/2 Ab5:1 G5:1 | r:1/2 G5:1/2 Eb5:1/2 C5:1/2 A4:1/2 C5:1/2 Eb5:1/2 F5:1/2 |
          E5:1/2 F5:1/2 A5:1/2 C6:1/2 B5:1/2> Ab5:1/2 F5:1/2 Eb5:1/2 | D5:1/2 C5:1/2 Bb4:1/2 G4:1/2 A4:1 C5:1 |
          D5:1/2 F5:1/2 A5:1/2 Bb5:1/2 Ab5:1> F5:1/2 D5:1/2 | Eb5:1/2 G5:1/2 Bb5:1/2 D6:1/2 C6:1/2> Bb5:1/2 Gb5:1/2 Eb5:1/2 |
          D5:1/2 Eb5:1/2 G5:1/2 Bb5:1/2 A5:1/2> F5:1/2 Eb5:1/2 C5:1/2 | D5:2 r:2 |"""
INTRO_MEL = "r:4 | r:4 | r:2 F5:1/2 D5:1/2 C5:1/2 A4:1/2 | Bb4:1 C5:1/2 Bb4:1/2 A4:1 C5:1 |"
TAG_MEL = """C5:1/2 Eb5:1/2 G5:1/2 Bb5:1/2 A5:1 F5:1 | F5:1/2 E5:1/2 F5:1/2 A5:1/2 Ab5:1 F5:1 |
             Eb5:1 D5:1/2 C5:1/2 A4:1 C5:1 | D5:7 |"""


def harmony():
    p = progression
    return (at(p(INTRO), 0) + at(p(A1), 4) + at(p(A2), 12) + at(p(B), 20) + at(p(A2), 28)
            + at(p(A1), 36) + at(p(A2), 44) + at(p(B), 52) + at(p(A2), 60) + at(p(TAG), 68))


def lead_notes():
    head = ' '.join([HEAD_A, A1_END, HEAD_A, A2_END, BRIDGE, HEAD_A, A2_END])
    return (melody(INTRO_MEL, 0, vel=.62) + melody(head, 4 * 4, vel=.8) + melody(SOLO, 36 * 4, vel=.76)
            + melody(' '.join([BRIDGE, HEAD_A, A2_END]), 52 * 4, vel=.8) + melody(TAG_MEL, 68 * 4, vel=.7))


def build():
    s = Song('last-set-at-marlowes', "Last Set at Marlowe's", bpm=126, key=10, mode='major', genre='jazz',
             energy=.4, period='evening', textures=['piano', 'bass', 'drums'], swing=.64, swing_unit=.5,
             seed=21, space=dict(seconds=1.8, predelay=.02, damp=.55, bright=6000))
    s.section('intro', 0, 4); s.section('head', 4, 32); s.section('piano solo', 36, 16)
    s.section('head out', 52, 16); s.section('tag', 68, 4)
    s.length_beats = 73 * 4
    prog = harmony()

    cells = [[(0, .6, 1), (1.5, .45, .8, True)],
             [(.5, .4, .85), (2.5, .45, .8), (3.5, .4, .75, True)],
             [(1, .5, .85), (2.5, 1.1, .9)],
             [(0, 1.4, .95), (3.5, .45, .8, True)]]
    order = [0, 1, 2, 3, 0, 2, 1, 3]
    sustained = [[(0, 1.9, .9), (2, 1.9, .85)]]
    comp = comp_cells(prog[:8], sustained, lo='D3', hi='F4', n=4, vel=.42, spread=.02)
    comp += comp_cells(prog[8:-1], cells, lo='D3', hi='F4', n=4, vel=.5, order=order, spread=.01)
    comp = [n for n in comp if not (36 * 4 <= n.t < 52 * 4)] + \
        [n.shifted(vel=.85) for n in comp if 36 * 4 <= n.t < 52 * 4]
    from lucid_music.theory import voice, Note
    last = prog[-1]
    comp += [Note(last[0] + i * .03, 7, p, .5) for i, p in enumerate(voice(last[2], 'D3', 'F4', 4))]
    s.notes('piano comp', sampler.grand(), comp, level=-26, reverb=.12, humanize_ms=8,
            chain=lambda a, s: fx.eq(a, hp=140, lp=7500, peaks=[(350, -2, .9)]))

    s.notes('piano lead', sampler.grand(), lead_notes(), level=-21, reverb=.14, humanize_ms=9,
            chain=lambda a, s: fx.eq(a, hp=180, lp=9000, peaks=[(3000, -1.5, 1)]))

    walk = parts.walking(prog[4:-1] if False else [c for c in prog if c[0] >= 1 * 4 and c[0] < 71 * 4],
                         lo='E1', hi='C3', vel=.82, seed=5)
    walk += [Note(71 * 4, 6, 34, .75)]              # Bb1 under the last chord
    s.notes('upright bass', sampler.upright_bass(), walk, level=-20, humanize_ms=6,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=3200, peaks=[(100, 1.5, .9)]), -20, 2.5, 12, 140))

    kit = drums.acoustic_kit('mid')
    kit['s'].gain_db -= 13          # jazz comping: snare sits under the ride
    kit['k'].gain_db -= 8
    ride = {'ride': 'x...x.o.x...x.o.', 'p': '....x.......x...'}
    snare_cells = ['................', '..........g.....', '......g.......g.', '........g...g...']
    hits = []
    for b in range(1, 71):
        if b < 2:
            hits += drums.loop({'ride': 'o...o.g.o...o.g.'}, 1, b)
            continue
        hits += drums.loop(ride, 1, b)
        phrase_end = (b - 4) % 8 == 7 and b >= 4
        if phrase_end:
            hits += drums.grid('......g...g.o.g.', 's', b * 4)
            hits += drums.grid('..............g.', 'k', b * 4)
        else:
            hits += drums.grid(snare_cells[(b * 3) % 4], 's', b * 4)
    hits += [(71 * 4, 'bell', .45), (71 * 4, 'k', .35)]
    s.drums('kit', kit, hits, level=-25.5, reverb=.08, humanize_ms=5, late={'ride': -.004},
            chain=lambda a, s: fx.eq(a, hp=45, lp=11000, peaks=[(4000, -2, 1)]))

    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
