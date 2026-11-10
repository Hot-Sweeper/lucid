"""Indigo Stairwell: late-night modal cool jazz, D dorian, 110 BPM, swung 8ths.

Sixteen bars of D dorian, eight up a half step in Eb dorian, eight back home.
The piano comps in stacked fourths that plane a scale step down and back; the
vibraphone and the grand trade the head and then trade four-bar solos.
Form: intro 8 | A vibes 8 | A piano 8 | B vibes (Eb) 8 | A both 8 |
      trading fours 16 | B 8 | A 8 | outro 4.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody, offset, Note
from lucid_music.styles.jazz import at

THEME = """A4:1/2 D5:1/2 E5:1 r:1/2 F5:1/2 E5:1/2 D5:1/2 | C5:1/2 B4:3/2 r:2 |
           C5:1/2 F5:1/2 G5:1 r:1/2 A5:1/2 G5:1/2 F5:1/2 | E5:2 r:2 |
           D5:1/2 E5:1/2 F5:1/2 A5:1/2 C6:1 B5:1/2 A5:1/2 | G5:1 E5:1 r:1/2 D5:1/2 E5:1/2 G5:1/2 |
           A5:3/2 G5:1/2 E5:1 C5:1/2 D5:1/2 | D5:2 r:2"""
THEME_PIANO = """A4:1/2 D5:1/2 E5:1 r:1/2 F5:1/2 G5:1/2 A5:1/2 | C6:1/2 B5:3/2 r:2 |
                 C5:1/2 F5:1/2 G5:1 r:1/2 A5:1/2 B5:1/2 C6:1/2 | D6:1 C6:1/2 A5:1/2 E5:2 |
                 D5:1/2 E5:1/2 F5:1/2 A5:1/2 C6:1 B5:1/2 A5:1/2 | G5:1 E5:1 r:1/2 D5:1/2 E5:1/2 G5:1/2 |
                 A5:1 C6:1/2 B5:1/2 G5:1 E5:1/2 F5:1/2 | D5:2 r:2"""
TRADES = [
    ('piano', """r:1/2 A4:1/2 C5:1/2 E5:1/2 G5:1/2 A5:1/2 B5:1/2 C6:1/2 | D6:1 C6:1/2 A5:1/2 G5:1/2 E5:1/2 F5:1/2 D5:1/2 |
                 E5:1/2 G5:1/2 F5:1/2 E5:1/2 D5:1/2 C5:1/2 B4:1/2 A4:1/2 | D5:2 r:2"""),
    ('vibes', """r:1 F5:1/2 G5:1/2 A5:1 C6:1 | B5:1/2 A5:1/2 G5:1 E5:1 r:1 |
                 r:1/2 D5:1/2 E5:1/2 G5:1/2 A5:1/2 B5:1/2 A5:1/2 G5:1/2 | E5:3 r:1"""),
    ('piano', """C5:1/2 D5:1/2 F5:1/2 A5:1/2 C6:1/2 E6:1/2 D6:1/2 B5:1/2 | C6:1/2 A5:1/2 G5:1/2 E5:1/2 D5:1 r:1 |
                 r:1/2 G5:1/2 F5:1/2 E5:1/2 F5:1/2 A5:1/2 C6:1/2 B5:1/2 | A5:2 r:2"""),
    ('vibes', """A5:1 G5:1/2 E5:1/2 D5:1 C5:1/2 D5:1/2 | E5:2 r:1/2 G5:1/2 A5:1/2 B5:1/2 |
                 C6:1 B5:1/2 G5:1/2 A5:1 E5:1 | D5:3 r:1"""),
]
OUTRO = "A4:1/2 D5:1/2 E5:3 | r:4 | A4:1/2 D5:1/2 E5:1 G5:1/2 E5:1/2 D5:1 | D5:4"

# Quartal shapes over D (D3 = 50): E A D G B, and a scale step lower D G C F A.
HIGH, LOW = [52, 57, 62, 67, 71], [50, 55, 60, 65, 69]
CELLS = [[(0, 1.3, 'H', .8), (2.5, .4, 'L', .65), (3, .9, 'H', .72)],
         [(1.5, .45, 'L', .6), (2, 1.8, 'H', .78)]]


def tonal_center(bar):
    return 1 if 24 <= bar < 32 or 56 <= bar < 64 else 0      # Eb dorian bridges


def harmony():
    bars = []
    for b in range(76):
        bars.append('Ebm11' if tonal_center(b) else 'Dm11')
    return progression(' | '.join(bars))


def quartal(first_bar, last_bar, vel=.5):
    out = []
    for b in range(first_bar, last_bar):
        k = tonal_center(b)
        for off, dur, which, vm in CELLS[b % 2]:
            shape = HIGH if which == 'H' else LOW
            for i, p in enumerate(shape):
                out.append(Note(b * 4 + off + i * .012, dur, p + k, vel * vm))
    return out


def build():
    s = Song('indigo-stairwell', 'Indigo Stairwell', bpm=110, key=2, mode='dorian', genre='jazz',
             energy=.42, period='night', textures=['mallets', 'piano', 'bass', 'drums'],
             swing=.62, swing_unit=.5, seed=53, space=dict(seconds=2.3, predelay=.025, damp=.5, bright=6000))
    for name, start, bars in [('intro', 0, 8), ('A vibes', 8, 8), ('A piano', 16, 8), ('B vibes', 24, 8),
                              ('A together', 32, 8), ('trading fours', 40, 16), ('B', 56, 8), ('A', 64, 8),
                              ('outro', 72, 4)]:
        s.section(name, start, bars)
    s.length_beats = 76 * 4
    prog = harmony()

    theme = lambda bar, semis=0, vel=.8: offset(melody(THEME, bar * 4, vel=vel), semis=semis)
    vibes = theme(8) + theme(24, 1) + theme(32) + theme(56, 1) + theme(64) + melody(OUTRO, 72 * 4, vel=.62)
    piano = melody(THEME_PIANO, 16 * 4, vel=.8)
    for i, (who, line) in enumerate(TRADES):
        notes = melody(line, (40 + 4 * i) * 4, vel=.78)
        (vibes if who == 'vibes' else piano).extend(notes)
    # The grand shadows the vibes an octave down in the last A of each chorus.
    shadow = offset(theme(32, vel=.55), semis=-12) + offset(theme(64, vel=.55), semis=-12)

    s.notes('vibes', sampler.vibraphone(), vibes, level=-21, reverb=.2, delay=.05, humanize_ms=8,
            chain=lambda a, s: fx.eq(a, hp=220, lp=9000))
    s.notes('piano lead', sampler.grand(), piano, level=-21, reverb=.14, humanize_ms=9,
            chain=lambda a, s: fx.eq(a, hp=180, lp=9000, peaks=[(3000, -1.5, 1)]))
    s.notes('piano shadow', sampler.grand(), shadow, level=-27, reverb=.14, humanize_ms=9,
            chain=lambda a, s: fx.eq(a, hp=160, lp=6000))

    comp = quartal(0, 75, vel=.5)
    comp = [n.shifted(vel=.8) if 40 * 4 <= n.t < 56 * 4 else n for n in comp]   # make room for solos
    comp += [Note(75 * 4 + i * .04, 6, p, .45) for i, p in enumerate(HIGH)]
    s.notes('piano comp', sampler.grand(), comp, level=-27, reverb=.13, humanize_ms=8,
            chain=lambda a, s: fx.eq(a, hp=140, lp=7000, peaks=[(350, -2, .9)]))

    # Intro: an original two-bar bass call, answered by the fourths. Then walking.
    call = "D2:1/2 F2:1/2 G2:1/2 A2:1 C3:1/2 B2:1/2 A2:1/2 | D2:2 r:2"
    bass = []
    for b in range(0, 8, 2):
        bass += melody(call, b * 4, vel=.82)
    bass += parts.walking(prog[8:72], lo='E1', hi='C3', vel=.8, seed=19)
    bass += melody("D2:2 A1:2 | D2:4 | D2:2 A1:2 | D1:6", 72 * 4, vel=.72)
    s.notes('upright bass', sampler.upright_bass(), bass, level=-20, humanize_ms=6,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=3200, peaks=[(100, 1.5, .9)]), -20, 2.5, 12, 140))

    kit = drums.acoustic_kit('mid')
    kit['s'].gain_db -= 13
    kit['k'].gain_db -= 8
    hits = []
    for b in range(4, 75):
        if b < 8:
            hits += drums.loop({'ride': 'o...o.g.o...o.g.', 'p': '....g.......g...'}, 1, b)
            continue
        hits += drums.loop({'ride': 'x...x.o.x...x.o.', 'p': '....x.......x...'}, 1, b)
        trading = 40 <= b < 56
        if b % 8 == 7:                                             # phrase-end fill
            hits += drums.grid('......g...g.o.g.', 's', b * 4)
            hits += drums.grid('..............g.', 'k', b * 4)
        elif trading and b % 2:
            hits += drums.grid('..g.......g...g.', 's', b * 4)
        elif b % 4 == 2:
            hits += drums.grid('..........g.....', 's', b * 4)
    hits += [(75 * 4, 'bell', .4), (75 * 4, 'k', .3)]
    s.drums('kit', kit, hits, level=-25.5, reverb=.08, humanize_ms=5, late={'ride': -.004},
            chain=lambda a, s: fx.eq(a, hp=45, lp=11000, peaks=[(4000, -2, 1)]))

    s.master_chain = lambda a, s: fx.automate(a, [(0, -8), (s.sec(6 * 4, False), 0), (s.sec(72 * 4, False), 0),
                                                  (s.sec(75 * 4, False), -9), (s.sec(78 * 4, False), -14)])
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
