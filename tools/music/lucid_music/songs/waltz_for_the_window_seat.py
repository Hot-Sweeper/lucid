"""Waltz for the Window Seat: minor jazz waltz, G minor, 160 BPM in 3/4.

Rhodes sings the head, the grand comps on beats 2 and 3 (and pushes into the
changes), the upright walks three to the bar, and the ride plays the waltz
pattern with the skip note. The tune grows from a rising 5-7-9 arpeggio on
Gm9 that returns on Bbmaj9 and closes every 16-bar phrase.
Form: intro 8 | A 16 | A2 16 | B 16 | A2 16 | piano solo 16 | B 16 | A2 16 | outro 8.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody, voice, Note
from lucid_music.styles.jazz import at, comp_cells

BPB = 3
INTRO = 'Gm9 | Gm9 | Ebmaj7#11 | Ebmaj7#11 | Am7b5 | D7b9 | Gm9 | D7alt'
A = ('Gm9 | Gm9 | Cm9 | Cm9 | Am7b5 | D7b9 | Gm9 | Gm9 | '
     'Ebmaj9 | Ebmaj9 | Am7b5 | D7b9 | Bbmaj9 | Ebmaj7#11 | Am7b5 | D7b9')
A2 = ('Gm9 | Gm9 | Cm9 | Cm9 | Am7b5 | D7b9 | Gm9 | Gm9 | '
      'Ebmaj9 | Ebmaj9 | Am7b5 | D7b9 | Am7b5 | D7b9 | Gm9 | Gm9')
B = ('Cm9 | F13 | Bbmaj9 | Ebmaj9 | Am7b5 | D7b9 | Gm9 | G7b9 | '
     'Cm9 | F13 | Bbmaj9 | Ebmaj7#11 | Am7b5 | D7b9 | Gm9 | D7alt')
OUTRO = 'Gm9 | Gm9 | Ebmaj7#11 | Ebmaj7#11 | Gm9 | Gm9 | Ebmaj7#11 | Gm9'

HEAD_FRONT = """D5:1 F5:1 A5:1 | G5:2 F5:1 | Eb5:3 | r:1 D5:1 Eb5:1 |
                C5:1 Eb5:1 G5:1 | F#5:2 Eb5:1 | D5:3 | r:1 Bb4:1 C5:1 |
                D5:1 F5:1 G5:1 | Bb5:2 G5:1 | A5:1 G5:1 Eb5:1 | F#5:2 C5:1 |"""
A_END = "D5:1 F5:1 A5:1 | G5:2 A5:1 | G5:1 Eb5:1 C5:1 | D5:1 Eb5:1 F#5:1 |"
A2_END = "Eb5:1 C5:1 A4:1 | F#4:1 A4:1 C5:1 | Bb4:2 A4:1 | G4:3 |"
BRIDGE = """G5:1 F5:1 Eb5:1 | D5:2 A4:1 | C5:1 D5:1 F5:1 | G5:3 |
            Eb5:1 G5:1 C6:1 | Bb5:2 A5:1 | G5:2 F5:1 | Ab5:1 F5:1 D5:1 |
            Eb5:1 G5:1 Bb5:1 | A5:2 D5:1 | C6:1 Bb5:1 A5:1 | G5:3 |
            Eb5:1 C5:1 A4:1 | F#4:1 A4:1 Eb5:1 | D5:3 | r:1 C5:1 Bb4:1 |"""
SOLO = """D5:1/2 F5:1/2 A5:1/2 Bb5:1/2 A5:1/2 F5:1/2 | G5:1 D5:1/2 Bb4:1/2 C5:1/2 Db5:1/2 |
          D5:1/2 Eb5:1/2 G5:1/2 Bb5:1/2 D6:1 | C6:1/2 Bb5:1/2 G5:1/2 Eb5:1/2 F5:1/2 F#5:1/2 |
          G5:1/2 Eb5:1/2 C5:1/2 A4:1/2 C5:1/2 Eb5:1/2 | F#5:1/2 A5:1/2 C6:1/2 Bb5:1/2 A5:1/2 Eb5:1/2 |
          D5:2 r:1 | r:1/2 G4:1/2 Bb4:1/2 D5:1/2 F5:1/2 A5:1/2 |
          G5:1/2 F5:1/2 D5:1/2 Bb4:1/2 G4:1/2 Bb4:1/2 | D5:1 F5:1/2 G5:1/2 Bb5:1 |
          A5:1/2 G5:1/2 Eb5:1/2 C5:1/2 A4:1/2 C5:1/2 | F#4:1/2 A4:1/2 C5:1/2 Eb5:1/2 D5:1/2 C5:1/2 |
          D5:1/2 F5:1/2 A5:1/2 C6:1/2 A5:1/2 F5:1/2 | G5:1 A5:1/2 G5:1/2 D5:1/2 Bb4:1/2 |
          C5:1/2 Eb5:1/2 G5:1/2 F5:1/2 Eb5:1/2 C5:1/2 | D5:1/2 Eb5:1/2 F#5:1/2 A5:1/2 C6:1/2 A5:1/2 |"""
OUTRO_MEL = """D5:1 F5:1 A5:1 | G5:2 F5:1 | Eb5:3 | r:3 |
               D5:1 F5:1 A5:1 | G5:2 A5:1 | G5:3 | D5:3 |"""

SEC = dict(intro=0, a1=8, a2=24, b1=40, a3=56, solo=72, b2=88, a4=104, outro=120)


def harmony():
    p = lambda t: progression(t, BPB)
    return (at(p(INTRO), 0, BPB) + at(p(A), 8, BPB) + at(p(A2), 24, BPB) + at(p(B), 40, BPB)
            + at(p(A2), 56, BPB) + at(p(A), 72, BPB) + at(p(B), 88, BPB) + at(p(A2), 104, BPB)
            + at(p(OUTRO), 120, BPB))


def head(start_bar, ending, vel=.8):
    return melody(HEAD_FRONT + ending, start_bar * BPB, vel=vel)


def build():
    s = Song('waltz-for-the-window-seat', 'Waltz for the Window Seat', bpm=160, key=7, mode='minor',
             genre='jazz', energy=.36, period='day', textures=['piano', 'bass', 'drums'], meter=3,
             swing=.63, swing_unit=.5, seed=37, space=dict(seconds=1.9, predelay=.02, damp=.55, bright=6200))
    for name, start, bars in [('intro', 0, 8), ('head A', 8, 16), ('head A2', 24, 16), ('bridge', 40, 16),
                              ('head A2', 56, 16), ('piano solo', 72, 16), ('bridge', 88, 16),
                              ('head out', 104, 16), ('outro', 120, 8)]:
        s.section(name, start, bars)
    s.length_beats = 128 * BPB
    prog = harmony()

    # Rhodes head (and the head out), a quiet fragment in the outro.
    lead = (head(8, A_END) + head(24, A2_END) + melody(BRIDGE, 40 * BPB, vel=.8) + head(56, A2_END)
            + melody(BRIDGE, 88 * BPB, vel=.82) + head(104, A2_END, vel=.82)
            + melody(OUTRO_MEL, 120 * BPB, vel=.62))
    s.notes('rhodes head', sampler.rhodes(), lead, level=-20, reverb=.15, delay=.04, humanize_ms=8,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=160, lp=8000, peaks=[(450, -1.5, .9)]), rate=.35, depth=.1, mix=.25))

    # Grand: a written 16-bar solo, the right hand of the trio.
    solo = melody(SOLO, 72 * BPB, vel=.74)
    s.notes('piano solo', sampler.grand(), solo, level=-22, reverb=.13, humanize_ms=9,
            chain=lambda a, s: fx.eq(a, hp=180, lp=9000, peaks=[(3000, -1.5, 1)]))

    # Comping: beats 2 and 3, with pushes into the changes. Lighter under the head.
    cells = [[(1, .85, .85), (2, .7, .72)],
             [(.5, .4, .65), (2, .9, .85)],
             [(1, 1.8, .9)],
             [(1, .6, .8), (2.5, .45, .75, True)]]
    order = [0, 1, 0, 3, 2, 1, 0, 3]
    intro = comp_cells(prog[:8], [[(0, 2.8, .9)]], lo='D3', hi='F4', n=4, vel=.42, spread=.03, bpb=BPB)
    body = comp_cells(prog[8:-1], cells, lo='D3', hi='F4', n=4, vel=.48, order=order, spread=.01, bpb=BPB)
    body = [n.shifted(vel=1.12) if SEC['solo'] * BPB <= n.t < SEC['b2'] * BPB else n for n in body]
    last = prog[-1]
    body += [Note(last[0] + i * .05, 6, p, .45) for i, p in enumerate(voice(last[2], 'D3', 'F4', 4))]
    s.notes('piano comp', sampler.grand(), intro + body, level=-28, reverb=.12, humanize_ms=8,
            chain=lambda a, s: fx.eq(a, hp=140, lp=7000, peaks=[(350, -2, .9)]))

    # Upright: dotted halves in the intro, walking three to the bar, then home.
    bass = [Note(c[0], 2.6, p, .7) for c in prog[:8]
            for p in [parts._place(c[2].bass, 31, 43)]]
    bass += parts.walking(prog[8:-8], lo='E1', hi='C3', vel=.8, seed=13)
    bass += [Note(c[0], 2.6, parts._place(c[2].bass, 31, 43), .66) for c in prog[-8:-1]]
    bass += [Note(last[0], 5.5, 31, .72)]                         # G1 under the final chord
    s.notes('upright bass', sampler.upright_bass(), bass, level=-20, humanize_ms=6,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=3200, peaks=[(100, 1.5, .9)]), -20, 2.5, 12, 140))

    # Ride waltz pattern (1, 2, skip, 3), hi-hat on 2 and 3, feathered kick, sparse snare comping.
    kit = drums.acoustic_kit('mid')
    kit['s'].gain_db -= 13
    kit['k'].gain_db -= 8
    hits = []
    for b in range(4, 127):
        soft = b < 8 or b >= 120
        ride = 'o.o.o.' if b < 8 else ('x.xox.' if b % 2 == 0 else 'x.x.xo')
        hits += drums.loop({'ride': ride, 'p': '..o.o.' if not soft else '..g.g.'}, 1, b, beats_per_bar=BPB, steps_per_beat=2)
        if soft:
            continue
        if (b - 8) % 16 == 15:                                     # phrase-end fill
            hits += drums.grid('..g.og', 's', b * BPB, steps_per_beat=2)
            hits += drums.grid('.....g', 'k', b * BPB, steps_per_beat=2)
        elif b % 4 == 1:
            hits += drums.grid('...g..', 's', b * BPB, steps_per_beat=2)
        elif b % 4 == 3:
            hits += drums.grid('g.....', 'k', b * BPB, steps_per_beat=2)
    hits += [(127 * BPB, 'bell', .4), (127 * BPB, 'k', .3)]
    s.drums('kit', kit, hits, level=-25.5, reverb=.08, humanize_ms=5, late={'ride': -.004},
            chain=lambda a, s: fx.eq(a, hp=45, lp=11000, peaks=[(4000, -2, 1)]))

    # Thin the last phrase for Lucid's crossfade: ease down over the outro.
    s.master_chain = lambda a, s: fx.automate(a, [(0, 0), (s.sec(122 * BPB, False), 0),
                                                  (s.sec(127 * BPB, False), -10), (s.sec(130 * BPB, False), -14)])
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
