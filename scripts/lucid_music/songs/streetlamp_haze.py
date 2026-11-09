"""Streetlamp Haze: night lo-fi, E dorian, 86 BPM, swung 16ths.

A Wurlitzer sings an 8-bar tune over the dorian i-IV sway (Em9 - A13), turns
through Cmaj9 - Bm7 - Am9 to a borrowed B7#9, and answers itself higher the
second time. The bridge lifts to G major colours with the tune on harp; on the
return the harp rolls quiet answers under the Wurlitzer. Muted upright bass and
a dusty kit keep it walking.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.lofi import at, intro_outro_filter

A = progression('Em9 | A13 | Em9 | A13 | Cmaj9 | Bm7 | Am9 | B7#9')
B = progression('Gmaj9 | F#m7 | Em9 | Dmaj9 | Cmaj7#11 | Bm9 | Am9 D13 | Cmaj9 B7#9')
INTRO = progression('Em9 | A13 | Em9 | A13')
OUTRO = progression('Cmaj9 | Bm7 | Am9 | Em9')

THEME = """r:1/2 B4:1/2 D5:1/2 E5:1 F#5:1/2 E5:1 | C#5:1/2 B4:1/2 A4:1 r:1/2 F#5:1/2 E5:1 |
           r:1/2 B4:1/2 D5:1/2 E5:1 G5:1/2 F#5:1 | E5:1/2 C#5:1/2 B4:2 r:1 |
           r:1/2 G5:1/2 B5:1/2 D6:1 B5:1/2 G5:1 | F#5:1/2 A5:1/2 F#5:1/2 D5:1/2 B4:2 |
           C5:1/2 E5:1/2 G5:1 B5:1 A5:1 | A5:1 F#5:1/2 D#5:1/2 B4:2"""
ANSWER = """r:1/2 E5:1/2 F#5:1/2 G5:1 B5:1/2 A5:1/2 G5:1/2 | F#5:3/2 E5:1/2 C#5:2 |
            r:1/2 B4:1/2 D5:1/2 E5:1 F#5:1/2 G5:1/2 A5:1/2 | B5:3/2 A5:1/2 F#5:1 E5:1 |
            r:1 E5:1/2 G5:1/2 B5:3/4 A5:1/4 G5:1 | F#5:1 D5:1/2 E5:1/2 F#5:2 |
            E5:1/2 G5:1/2 A5:1/2 B5:1/2 C6:1 B5:1 | A5:1 F#5:1/2 D#5:1/2 B4:1 r:1"""
BRIDGE = """r:1/2 D5:1/2 F#5:1/2 A5:1/2 B5:2 | A5:1/2 F#5:1/2 E5:1 C#5:2 |
            r:1/2 B4:1/2 E5:1/2 G5:1/2 F#5:2 | E5:1/2 F#5:1/2 A5:1 C#5:2 |
            B4:1/2 E5:1/2 F#5:1 G5:2 | F#5:1 D5:1/2 C#5:1/2 B4:2 |
            C5:1/2 E5:1/2 B5:1 A5:1/2 F#5:1/2 B5:1 | G5:1 E5:1 D#5:1 F#5:1"""
TAG = 'r:1/2 B4:1/2 D5:1/2 E5:1 G5:1/2 E5:1 | D5:1/2 B4:1/2 F#4:1 r:2 | r:1/2 C5:1/2 B4:1/2 A4:1/2 G4:2 | B4:4'


def build():
    s = Song('streetlamp-haze', 'Streetlamp Haze', bpm=86, key=4, mode='dorian', genre='lofi',
             energy=.33, period='night', textures=['piano', 'plucked', 'bass', 'drums'], swing=.57,
             swing_unit=.25, seed=23, space=dict(seconds=2.6, predelay=.035, damp=.62, bright=5000),
             delay_beats=.75)
    s.section('intro', 0, 4); s.section('theme', 4, 8); s.section('answer', 12, 8)
    s.section('bridge', 20, 8); s.section('theme + harp', 28, 8); s.section('answer', 36, 8)
    s.section('outro', 44, 4)
    s.length_beats = 48 * 4

    groove_prog = at(A, 4) + at(A, 12) + at(B, 20) + at(A, 28) + at(A, 36)
    full = at(INTRO, 0) + groove_prog + at(OUTRO, 44)

    # Wurlitzer comping, low and rootless: long chord on 1, push on the 'and' of 3.
    chords = parts.comp(full, [(0, 1.7, 1), (2.5, 1.2, .72), (3.75, .25, .45)], lo='G2', hi='D4', n=4,
                        vel=.55, rootless=True, spread=.01)
    s.notes('wurli chords', sampler.wurlitzer(), chords, level=-25, reverb=.14, duck=.2, humanize_ms=7,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=140, lp=6000, peaks=[(350, -2.5, .8)]),
                                         rate=4.8, depth=.08, mix=.22))

    lead = melody(THEME, 4 * 4) + melody(ANSWER, 12 * 4) + melody(THEME, 28 * 4, vel=.8) \
        + melody(ANSWER, 36 * 4, vel=.82) + melody(TAG, 44 * 4, vel=.62)
    s.notes('wurli lead', sampler.wurlitzer(), lead, level=-21, reverb=.2, delay=.08, humanize_ms=8,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=220, lp=6500, peaks=[(1800, 1.5, .9)]),
                                         rate=5.2, depth=.1, mix=.3))

    # Harp: the bridge tune, rolled answers under the returning theme, intro shimmer.
    s.notes('harp tune', sampler.harp(), melody(BRIDGE, 20 * 4, vel=.8), level=-22, reverb=.3, delay=.1,
            humanize_ms=6, chain=lambda a, s: fx.eq(a, hp=250, lp=8000))
    counter = parts.comp(at(A, 28) + at(A, 36), [(2.5, 1.5, 1)], lo='B4', hi='B5', n=3, vel=.5, spread=.25)
    counter += parts.comp(at(INTRO, 0) + at(OUTRO, 44), [(0, 3, 1)], lo='E4', hi='E5', n=4, vel=.42, spread=.33)
    s.notes('harp rolls', sampler.harp(), counter, level=-27, reverb=.34, humanize_ms=6,
            chain=lambda a, s: fx.eq(a, hp=300, lp=7500))

    # Soft pad only under the bridge and the edges.
    pad_prog = at(INTRO, 0) + at(B, 20) + at(OUTRO, 44)
    s.notes('pad', ('surge', 'MKS-70 Warm Pad'), parts.pad(pad_prog, 'B2', 'E4', 4, .5), level=-30,
            reverb=.2, duck=.25, humanize_ms=0, chain=lambda a, s: fx.eq(a, hp=180, lp=4500))

    # Palm-muted upright: short, bouncing notes with a chromatic lead-in.
    bass_pat = [(0, .9, 'R', 1), (1.5, .4, 'R', .55), (2.5, .8, '5', .8), (3.5, .4, 'A', .7)]
    bl = parts.bass(groove_prog, bass_pat, lo='E1', hi='D2', vel=.88)
    bl += parts.bass(at(OUTRO, 44)[:3], [(0, 2.5, 'R', .75)], lo='E1', hi='D2')
    s.notes('muted bass', sampler.upright_bass(style='mute'), bl, level=-19, humanize_ms=7, duck=.15,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=2500, peaks=[(90, 2, .9)]), -20, 3, 12, 140))

    kit = drums.acoustic_kit('lofi')
    groove = {'k': 'x......x..x.....', 's': '....x.......x...', 'g': '..g....g.g....g.',
              'h': 'x.o.x.oox.o.x.o.'}
    turn = {'k': 'x......x..x..x..', 's': '....x.......x.gg', 'g': '..g.......g.....',
            'h': 'x.o.x.o.x.o.x...', 'o': '..............x.'}
    hits = []
    for start in (4, 12, 28, 36):
        for b in range(8):
            g = turn if b == 7 else groove
            if b == 0 and start in (4, 28):
                g = dict(g, h='..o.x.o.x.o.x.o.')
            hits += drums.loop(g, 1, start + b)
    for b in range(8):      # bridge: cross-stick, lighter hats, kick on 1 and 3-and
        hits += drums.loop({'k': 'x.........x.....', 'x': '....x.......x...', 'h': 'o...o.o.o...o.o.'}, 1, 20 + b)
    hits += drums.grid('..........g.g.gg', 'g', 27 * 4)
    hits += [(44 * 4, 'k', .7)]
    s.drums('kit', kit, hits, level=-21, late={'s': .016, 'g': .012, 'x': .012}, reverb=.05,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=40, lp=8000, peaks=[(65, 2, 1.2), (3500, -2.5, 1)]),
                                       -18, 3.5, 8, 90, 2))

    s.audio('vinyl', lambda n, s: fx.vinyl(n, level=.01, seed=7), gain_db=-9)
    s.bus_chain['music'] = intro_outro_filter(s, 4, 44, 48, closed=1000)
    s.master_chain = lambda a, s: fx.tape(fx.downsample(fx.automate(a, [(0, -12), (s.sec(8, False), 0), (s.sec(46 * 4, False), 0), (s.sec(48 * 4, False) + 2, -14)]), 30000),
                                          wow=.002, drive=1.35, hiss=.0012, seed=5)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s


def check():
    """Melody/harmony clash report for review."""
    out = {}
    out['theme'] = parts.clashes(melody(THEME), A, strong_only=False)
    out['answer'] = parts.clashes(melody(ANSWER), A, strong_only=False)
    out['bridge'] = parts.clashes(melody(BRIDGE), B, strong_only=False)
    out['tag'] = parts.clashes(melody(TAG), OUTRO, strong_only=False)
    return out
