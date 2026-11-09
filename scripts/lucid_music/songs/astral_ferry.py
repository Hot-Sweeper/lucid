"""Astral Ferry: spacious 'astral' lunar phonk, G# minor, 128 BPM (half-time feel).

Two-bar pad chords drift under a vibraphone hook (a falling D#-B-C# figure
that is answered higher the second time), with a quiet Fantasy Bell an octave
up on the return. A rolling 808 bounces between root, octave and fifth slides;
hats stay light and the cowbell only answers phrase ends. Long reverb tails
and a drumless middle keep the whole piece floating.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody, Note
from lucid_music.styles.phonk import cowbell_track, memphis_hats, line808, at

A = progression('G#m9 | G#m9 | Emaj7#11 | Emaj7#11 | C#m9 | C#m9 | Bmaj9 | D#7b9')
B = progression('Emaj9 | F#6 | D#m7 | G#m9 | C#m9 | Emaj9 | A#m7b5 | D#7b9')

HOOK = """D#6:3/2 B5:1/2 C#6:1/2 D#6:1/2 F#6:1 | A#5:3 r:1 |
          G#5:3/2 B5:1/2 D#6:1 A#5:1 | B5:3 r:1 |
          E6:3/2 D#6:1/2 C#6:1 G#5:1 | B5:2 D#6:1 E6:1 |
          F#6:3/2 D#6:1/2 C#6:1 A#5:1 | G5:2 A#5:1 C#6:1"""
ANSWER = """D#6:3/2 B5:1/2 C#6:1/2 D#6:1/2 F#6:1 | A#5:3 r:1 |
            G#5:3/2 B5:1/2 D#6:1 A#5:1 | B5:3 r:1 |
            E6:3/2 F#6:1/2 G#6:1 E6:1 | D#6:4 |
            C#6:3/2 D#6:1/2 F#6:1 A#5:1 | G5:1 E5:1 D#5:2"""
LIFT = """G#5:2 B5:1 D#6:1 | C#6:3 A#5:1 | A#5:2 F#5:1 A#5:1 | B5:3 r:1 |
          G#5:2 E5:1 G#5:1 | B5:3 D#6:1 | C#6:2 E6:1 C#6:1 | A#5:3 r:1"""


def build():
    s = Song('astral-ferry', 'Astral Ferry', bpm=128, key=8, mode='minor', genre='phonk',
             energy=.55, period='night', textures=['mallets', 'bells', 'pads', 'bass', 'drums'], swing=.54,
             swing_unit=.25, seed=43, space=dict(seconds=5.0, predelay=.04, damp=.5, bright=6000), delay_beats=1.5)
    # Form (bars): intro 8 | hook 16 | lift 16 | break 8 | hook return 16 | outro 8
    for name, b0, n in (('intro', 0, 8), ('hook', 8, 16), ('lift', 24, 16), ('break', 40, 8),
                        ('hook return', 48, 16), ('outro', 64, 8)):
        s.section(name, b0, n)
    s.length_beats = 72 * 4
    full = at(A, 0) + at(A, 8) + at(A, 16) + at(B, 24) + at(B, 32) + at(A, 40) + at(A, 48) + at(A, 56) + at(A, 64)
    s.full = full

    s.notes('pad', ('surge', 'Still'), parts.pad(full, 'B2', 'D#5', 4, vel=.58), level=-26, reverb=.2, duck=.28,
            chain=lambda a, s: fx.eq(fx.width(a, .85), hp=160, lp=7500, peaks=[(420, -2, .8)]))
    s.notes('air', ('surge', 'Distant'), parts.pad(at(B, 24) + at(B, 32) + at(A, 40), 'D#4', 'F#5', 3, vel=.5),
            level=-29, reverb=.3, chain=lambda a, s: fx.eq(fx.width(a, .8), hp=400, lp=9000))

    vib = sampler.vibraphone()
    hook = melody(HOOK, 8 * 4, vel=.8) + melody(ANSWER, 16 * 4, vel=.82) \
        + melody(HOOK, 48 * 4, vel=.82) + melody(ANSWER, 56 * 4, vel=.85)
    s.notes('vibes', vib, hook, level=-21, reverb=.3, delay=.14, humanize_ms=6,
            chain=lambda a, s: fx.eq(a, hp=220, lp=8000))
    halo = melody(HOOK, 48 * 4, octave_shift=1, vel=.6) + melody(ANSWER, 56 * 4, octave_shift=1, vel=.6)
    s.notes('bell', ('surge', 'Fantasy Bell'), halo, level=-27, reverb=.3, delay=.16,
            chain=lambda a, s: fx.eq(a, hp=500, lp=9500))
    # Intro and break: the first hook bars alone, as a distant call.
    call = melody(HOOK, 2 * 4, vel=.55)[:6] + melody(HOOK, 40 * 4, vel=.6)[:6]
    s.notes('vibes call', sampler.vibraphone(), call, level=-26, reverb=.45, delay=.25,
            chain=lambda a, s: fx.eq(a, hp=250, lp=6500))
    s.notes('lift lead', ('surge', 'Fairy'), melody(LIFT, 24 * 4, vel=.75) + melody(LIFT, 32 * 4, vel=.8),
            level=-22, reverb=.28, delay=.15, chain=lambda a, s: fx.eq(a, hp=250, lp=7000))

    # Cowbell: soft answers in the gaps of the hook (bars 2 and 4 of each phrase).
    cb = []
    for b0 in (8, 16, 48, 56):
        for gap, notes in ((1, ('D#5', 'F#5', 'D#5')), (3, ('D#5', 'F#5', 'B5')), (5, ('C#5', 'E5', 'G#5')),
                           (7, ('C#5', 'E5', 'G5'))):
            t = (b0 + gap) * 4 + 3
            from lucid_music.theory import midi
            cb += [Note(t + i * .25, .22, midi(n), .7 - .1 * i) for i, n in enumerate(notes)]
    cowbell_track(s, cb, level=-27, reverb=.2, delay=.12,
                  chain=lambda a, s: fx.eq(fx.width(a, 1.2), hp=400, lp=7500))

    a_roots = ['G#1', 'G#1', 'E1', 'E1', 'C#2', 'C#2', 'B1', 'D#2']
    b_roots = ['E1', 'F#1', 'D#2', 'G#1', 'C#2', 'E1', 'A#1', 'D#2']
    rolling = ['a', 'b', 'a', 'f', 'a', 'b', 'f', 'c']
    bl = []
    for b in (8, 16, 48, 56):
        bl += line808(list(zip(a_roots, rolling)), b)
    for b in (24, 32):
        bl += line808(list(zip(b_roots, ['a', 'f', 'a', 'b', 'a', 'f', 'a', 'c'])), b)
    bl += line808(list(zip(a_roots[::2], ['h'] * 4)), 40, vel=.7)
    bl += [n.shifted(4 * 4) for n in line808(list(zip(a_roots[::2], ['h'] * 4)), 40, vel=.7)]
    bl += line808([('G#1', 'h'), ('E1', 'h')], 64, vel=.68)
    s.notes('808', ('808', dict(drive=2.2, click=.3, decay=1.7)), bl, level=-19, humanize_ms=0, swing=False,
            chain=lambda a, s: fx.eq(a, hp=28, lp=4000, peaks=[(100, 1.5, 1)]))

    kit = drums.acoustic_kit('mid')
    kit['_opts'] = {'kick808': dict(tune=52, decay=.24, punch=3.)}
    hits = []
    for b0 in (8, 16, 48, 56):
        for b in range(8):
            kick = 'x.....x...x.....' if b % 4 != 3 else 'x.....x...x...x.'
            hits += drums.loop({'kick808': kick, 'clap808': '........x.......', 'clap': '........x.......'}, 1, b0 + b)
        hits += memphis_hats(8, b0, base='x.o.x.o.x.oox.o.', roll='trip', open_step=14)
        hits += [(b0 * 4, 'crash', .4)]
    for b0 in (24, 32):
        for b in range(8):
            hits += drums.loop({'kick808': 'x.........x.....', 'clap808': '........x.......'}, 1, b0 + b)
        hits += memphis_hats(8, b0, base='x...o...x...o.o.', roll='thirty')
    hits += memphis_hats(2, 46, base='x...x...x...x...', roll=None)
    hits += memphis_hats(4, 64, base='x...o...x...o...', roll=None)
    hits += [(64 * 4, 'kick808', .75), (64 * 4 + 2, 'clap808', .45)]
    s.drums('drums', kit, hits, level=-21, humanize_ms=2, swing=True, reverb=.04,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=12000, peaks=[(4000, -2, 1)]), -16, 2.5, 6, 80, 1))

    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 700), (s.sec(7.5 * 4, False), 2500), (s.sec(8 * 4, False), 16000),
                                                            (s.sec(66 * 4, False), 16000), (s.sec(72 * 4, False) + 3, 900)])
    s.master_chain = lambda a, s: fx.tape(a, wow=.0009, flutter=.0002, drive=1.12)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
