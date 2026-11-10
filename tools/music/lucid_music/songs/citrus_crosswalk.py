"""Citrus Crosswalk: bouncy chillhop, D major, 90 BPM, swung 16ths.

A plucked synth plays an off-beat hook (rests on 1 and 3, a 16th pickup into
each figure) over IV-iii-ii-V turnarounds; the second ending detours through
B7b9 back to D6. The bridge moves to B minor with a vibraphone melody over a
conga groove, and on the return the vibes shadow the hook an octave down.
CP80 electric grand stabs, upright bass, real kit with shaker and congas.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.lofi import at, intro_outro_filter

A = progression('Gmaj7 | F#m7 | Em9 | A13 | Gmaj7 | F#m7 B7b9 | Em9 A13 | D6')
B = progression('Bm9 | E9 | Gmaj9 | F#7#9 | Bm9 | E9 | Gmaj9 | A13')
INTRO = progression('Gmaj7 | F#m7 | Em9 | A13')
OUTRO = progression('Gmaj7 | F#m7 | Em9 A13 | Dmaj9')

HOOK = 'r:1/2 D5:1/4 E5:1/4 F#5:1/2 A5:1/2 r:1/2 F#5:1/2 E5:1/2 D5:1/2'
THEME = HOOK + """ | E5:1/2 C#5:1/2 r:1/2 A4:1/2 C#5:1 E5:1 |
           r:1/2 D5:1/4 E5:1/4 G5:1/2 B5:1/2 r:1/2 A5:1/2 G5:1/2 F#5:1/2 | E5:1/2 F#5:1/2 r:1/2 C#5:1/2 E5:2 | """ + HOOK + """ |
           E5:1/2 C#5:1/2 A4:1 C5:1/2 B4:1/2 D#5:1 | G5:1/2 F#5:1/2 E5:1/2 B4:1/2 C#5:1 E5:1 | F#5:1/2 E5:1/2 D5:2 r:1"""
ANSWER = """r:1/2 D5:1/4 E5:1/4 F#5:1/2 A5:1/2 r:1/2 B5:1/2 A5:1/2 F#5:1/2 | A5:1/2 E5:1/2 r:1/2 C#5:1/2 E5:1 F#5:1 |
            r:1/2 G5:1/4 A5:1/4 B5:1/2 D6:1/2 r:1/2 B5:1/2 A5:1/2 G5:1/2 | F#5:1/2 E5:1/2 r:1/2 C#5:1/2 A4:2 | """ + HOOK + """ |
            E5:1/2 C#5:1/2 A4:1 D#5:1/2 F#5:1/2 A5:1 | G5:1 F#5:1/2 E5:1/2 C#5:1/2 E5:1/2 G5:1 | F#5:1/2 A5:1/2 D6:2 r:1"""
BRIDGE = """r:1/2 F#5:1/2 A5:1/2 C#6:1/2 B5:2 | B5:1 G#5:1/2 F#5:1/2 E5:2 |
            r:1/2 D5:1/2 F#5:1/2 A5:1/2 B5:2 | A5:1 F#5:1/2 E5:1/2 A#4:2 |
            B4:1/2 D5:1/2 F#5:1 A5:1 C#6:1 | B5:3/2 G#5:1/2 E5:1 D5:1 |
            F#5:1/2 G5:1/2 A5:1 B5:1/2 A5:1/2 F#5:1 | E5:1 G5:1 F#5:1 C#5:1"""
TAG = HOOK + ' | E5:1/2 C#5:1/2 r:1/2 A4:1/2 C#5:1 E5:1 | r:4 | F#5:4'


def build():
    s = Song('citrus-crosswalk', 'Citrus Crosswalk', bpm=90, key=2, mode='major', genre='lofi',
             energy=.38, period='day', textures=['piano', 'synth', 'mallets', 'bass', 'drums'], swing=.57,
             swing_unit=.25, seed=47, space=dict(seconds=2.0, predelay=.025, damp=.5, bright=6500),
             delay_beats=.75)
    s.section('intro', 0, 4); s.section('hook', 4, 8); s.section('answer', 12, 8)
    s.section('bridge', 20, 8); s.section('hook + vibes', 28, 8); s.section('answer', 36, 8)
    s.section('outro', 44, 4)
    s.length_beats = 49 * 4

    groove_prog = at(A, 4) + at(A, 12) + at(B, 20) + at(A, 28) + at(A, 36)
    full = at(INTRO, 0) + groove_prog + at(OUTRO, 44)

    # CP80 stabs: syncopated, short, rootless; the bounce of the track.
    stabs = parts.comp(at(INTRO, 0) + groove_prog, [(0, .7, 1), (1.5, .4, .68), (2.25, .9, .85), (3.5, .4, .6)],
                       lo='A2', hi='E4', n=4, vel=.55, rootless=True, spread=.008)
    # Outro: the stabs relax into held chords so the song can crossfade out.
    stabs += parts.comp(at(OUTRO, 44)[:-1], [(0, 1.8, .85), (2.25, 1.6, .65)], lo='A2', hi='E4', n=4, vel=.5,
                        rootless=True, spread=.02)
    stabs += parts.comp([(47 * 4, 7, OUTRO[-1][2])], [(0, 7, .7)], lo='A2', hi='E4', n=4, vel=.5, rootless=True,
                        spread=.06)
    s.notes('cp80', sampler.cp80(), stabs, level=-25, reverb=.14, duck=.22, humanize_ms=6,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=140, lp=6500, peaks=[(380, -2.5, .8)]), rate=.7, depth=.1, mix=.25))

    lead = melody(THEME, 4 * 4) + melody(ANSWER, 12 * 4) + melody(THEME, 28 * 4, vel=.8) \
        + melody(ANSWER, 36 * 4, vel=.82) + melody(TAG, 44 * 4, vel=.62)
    s.notes('pluck', ('surge', 'Nice Pluck 4'), lead, level=-21, reverb=.12, delay=.13, humanize_ms=5,
            chain=lambda a, s: fx.eq(a, hp=250, lp=7000, peaks=[(3500, -2, 1)]))

    vibes = melody(BRIDGE, 20 * 4, vel=.78)
    s.notes('vibes tune', sampler.vibraphone(), vibes, level=-21, reverb=.26, delay=.1, humanize_ms=7,
            chain=lambda a, s: fx.eq(a, hp=250, lp=7500))
    shadow = melody(THEME, 28 * 4, octave_shift=-1, vel=.6)
    s.notes('vibes shadow', sampler.vibraphone(), shadow, level=-27, reverb=.22, humanize_ms=7,
            chain=lambda a, s: fx.eq(a, hp=200, lp=6000))

    bass_pat = [(0, .9, 'R', 1), (1.5, .4, '8', .62), (2.5, .9, '5', .8), (3.5, .45, 'A', .7)]
    bl = parts.bass(groove_prog, bass_pat, lo='E1', hi='D2', vel=.86)
    bl += parts.bass(at(OUTRO, 44), [(0, 1.8, 'R', .75), (2.25, 1.6, '5', .6)], lo='E1', hi='D2')
    s.notes('upright bass', sampler.upright_bass(), bl, level=-19, humanize_ms=7, duck=.15,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=2800, peaks=[(105, 2, .9)]), -20, 3, 12, 140))

    kit = drums.acoustic_kit('lofi')
    groove = {'k': 'x.....x...x..x..', 's': '....x.......x...', 'g': '..g....g......g.',
              'h': 'x.xox.xox.xox.xo'}
    turn = {'k': 'x.....x...x..x..', 's': '....x.......x.gx', 'g': '..g....g........',
            'h': 'x.xox.xox.xo....', 'o': '............x...'}
    hits, perc = [], []
    for start in (4, 12, 28, 36):
        for b in range(8):
            hits += drums.loop(turn if b == 7 else groove, 1, start + b)
    for b in range(8):
        hits += drums.loop({'k': 'x.........x.....', 'x': '....x.......x...', 'h': 'x.o.x.o.x.o.x.o.'}, 1, 20 + b)
    hits += [(44 * 4, 'k', .7)]
    perc += drums.loop({'conga': '..x...xo..x..x.o', 'shaker': 'xgogxgogxgogxgog'}, 40, 4)
    perc += drums.loop({'shaker': 'xgogxgogxgogxgog'}, 4, 0)
    s.drums('kit', kit, hits, level=-21, late={'s': .012, 'g': .01, 'x': .01}, reverb=.05,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=40, lp=9000, peaks=[(60, 2, 1.2), (3500, -2, 1)]),
                                       -18, 3.5, 8, 90, 2))
    s.drums('percussion', kit, perc, level=-30, humanize_ms=6, reverb=.1,
            chain=lambda a, s: fx.eq(a, hp=150, lp=9000))

    s.audio('vinyl', lambda n, s: fx.vinyl(n, level=.009, seed=21), gain_db=-10)
    s.bus_chain['music'] = intro_outro_filter(s, 4, 44, 49, closed=1100)
    s.master_chain = lambda a, s: fx.tape(fx.downsample(fx.automate(a, [(0, -12), (s.sec(8, False), 0)]), 32000),
                                          wow=.0014, drive=1.3, hiss=.001, seed=13)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s


def check():
    return dict(theme=parts.clashes(melody(THEME), A, strong_only=False),
                answer=parts.clashes(melody(ANSWER), A, strong_only=False),
                bridge=parts.clashes(melody(BRIDGE), B, strong_only=False),
                tag=parts.clashes(melody(TAG), OUTRO, strong_only=False))
