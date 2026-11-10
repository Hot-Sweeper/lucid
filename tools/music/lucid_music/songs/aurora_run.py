"""Aurora Run: uplifting melodic lunar phonk, G minor, 135 BPM (half-time feel).

A bright bell hook over i-VI-III-VII, doubled underneath by a soft lead, with
a pitched 808 cowbell counter-riff that follows every chord. Punchy kick808 and
clap on 3, Memphis hats with rolls, a bouncing gliding 808. The B section lifts
to the relative major colours with a slower bell tune; a drumless break lets
the hook return an octave higher.
"""
from lucid_music import drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody, Note, midi
from lucid_music.styles.phonk import cowbell_track, memphis_hats, line808, at

A = progression('Gm9 | Ebmaj9 | Bbmaj7 | F6 | Gm9 | Ebmaj9 | Cm9 | D7sus4:2 D7b9:2')
B = progression('Ebmaj9 | F6 | Dm7 | Gm9 | Cm9 | Ebmaj9 | Am7b5 | D7b9')

HOOK = """D6:1/2 Bb5:1/2 C6:1/4 D6:3/4 F6:1/2 D6:1/2 C6:1/2 Bb5:1/2 |
          G6:1 F6:1/2 D6:1/2 Eb6:1 D6:1/2 Bb5:1/2 |
          D6:1/2 C6:1/2 D6:1/2 F6:1/2 A5:1 Bb5:1 |
          C6:2 A5:1/2 C6:1/2 D6:1 |
          D6:1/2 Bb5:1/2 C6:1/4 D6:3/4 F6:1/2 D6:1/2 C6:1/2 Bb5:1/2 |
          G6:1 F6:1/2 D6:1/2 Bb6:1 G6:1/2 F6:1/2 |
          G6:1/2 F6:1/2 Eb6:1/2 D6:1/2 Eb6:1 C6:1 |
          D6:1 C6:1/2 A5:1/2 F#5:1 A5:1"""
LIFT = """Bb5:2 G5:1 F5:1 | A5:3 C6:1 | F5:2 A5:1 C6:1 | D6:3 r:1 |
          Eb6:2 D6:1 C6:1 | Bb5:2 G5:1 Bb5:1 | C6:2 A5:1 G5:1 | F#5:2 A5:1 C6:1"""

# Cowbell counter-riff: a 3-3-2 syncopated figure re-voiced on each chord.
RIFF_STEPS = (0, 3, 6, 8, 11, 13)
RIFF_NOTES = {'Gm9': 'D5 D5 F5 D5 G5 D5', 'Ebmaj9': 'D5 D5 G5 D5 Bb5 G5', 'Bbmaj7': 'D5 D5 F5 D5 A5 F5',
              'F6': 'C5 C5 F5 C5 A5 F5', 'Cm9': 'D5 D5 G5 D5 Bb5 G5', 'Dm7': 'D5 D5 F5 D5 A5 F5',
              'Am7b5': 'C5 C5 Eb5 C5 G5 Eb5', 'D7b9': 'D5 D5 F#5 D5 A5 C6'}
RIFF_D_SPLIT = 'D5 D5 A5 D5 F#5 C6'          # D7sus4 -> D7b9 bar


def riff(prog, bar0, vel=.75):
    out = []
    bars = {}
    for st, ln, c in prog:
        bars.setdefault(int(st // 4), []).append(c.symbol)
    for b, syms in sorted(bars.items()):
        names = RIFF_D_SPLIT if syms[0] == 'D7sus4' else RIFF_NOTES[syms[0]]
        for k, (step, n) in enumerate(zip(RIFF_STEPS, names.split())):
            accent = 1. if k in (0, 3) else .78
            out.append(Note((bar0 + b) * 4 + step / 4, .3, midi(n), vel * accent))
    return out


def build():
    s = Song('aurora-run', 'Aurora Run', bpm=135, key=7, mode='minor', genre='phonk',
             energy=.64, period='evening', textures=['bells', 'synth', 'bass', 'drums', 'pads'], swing=.53,
             swing_unit=.25, seed=37, space=dict(seconds=3.2, predelay=.03, damp=.45, bright=6500), delay_beats=.75)
    # Form (bars): intro 8 | hook 16 | lift 16 | break 8 | hook 8va 16 | outro 8
    for name, b0, n in (('intro', 0, 8), ('hook', 8, 16), ('lift', 24, 16), ('break', 40, 8),
                        ('hook return', 48, 16), ('outro', 64, 8)):
        s.section(name, b0, n)
    s.length_beats = 72 * 4
    full = at(A, 0) + at(A, 8) + at(A, 16) + at(B, 24) + at(B, 32) + at(A, 40) + at(A, 48) + at(A, 56) + at(A, 64)
    s.full = full

    s.notes('pad', ('surge', 'Ghost Pad'), parts.pad(full, 'Bb2', 'D5', 4, vel=.55), level=-27, reverb=.16, duck=.32,
            chain=lambda a, s: fx.eq(fx.width(a, .8), hp=170, lp=7500, peaks=[(450, -2, .8)]))
    s.notes('lift pad', ('surge', 'Still'), parts.pad(at(B, 24) + at(B, 32) + at(A, 40), 'D4', 'F5', 3, vel=.5),
            level=-29, reverb=.25, chain=lambda a, s: fx.eq(fx.width(a, .8), hp=350, lp=9000))

    hook = melody(HOOK, 8 * 4) + melody(HOOK, 16 * 4) + melody(HOOK, 48 * 4) + melody(HOOK, 56 * 4, octave_shift=1, vel=.72)
    s.notes('bell hook', ('surge', 'Bell 2'), hook, level=-20, reverb=.16, delay=.12,
            chain=lambda a, s: fx.eq(a, hp=320, lp=10000, peaks=[(2800, -1.5, 1)]))
    body = melody(HOOK, 16 * 4, octave_shift=-1, vel=.7) + melody(HOOK, 48 * 4, octave_shift=-1, vel=.7) \
        + melody(HOOK, 56 * 4, vel=.7)
    s.notes('hook body', ('surge', 'Fairy'), body, level=-26, reverb=.14,
            chain=lambda a, s: fx.eq(a, hp=250, lp=6000))
    lift = melody(LIFT, 24 * 4, vel=.8) + melody(LIFT, 32 * 4, vel=.82)
    s.notes('lift bell', ('surge', 'Fantasy Bell'), lift, level=-22, reverb=.24, delay=.14,
            chain=lambda a, s: fx.eq(a, hp=300, lp=9000))
    # Break: the hook's first phrase alone, far away, as a call back.
    s.notes('break bell', ('surge', 'Fantasy Bell'), melody(HOOK, 44 * 4, vel=.55)[:14], level=-27, reverb=.35, delay=.2,
            chain=lambda a, s: fx.eq(a, hp=400, lp=7000))

    cb = riff(A, 4, vel=.55)[:24] + riff(A, 8) + riff(A, 16) + riff(A, 48) + riff(A, 56) + riff(A, 64, vel=.55)[:24]
    cb += riff(B, 32, vel=.6)
    cowbell_track(s, cb, level=-23, reverb=.1, delay=.08,
                  chain=lambda a, s: fx.eq(fx.width(fx.chorus(a, rate=.3, depth=.1, mix=.2), 1.25), hp=380, lp=8000))

    a_roots = ['G1', 'Eb1', 'Bb1', 'F1', 'G1', 'Eb1', 'C2', 'D2']
    b_roots = ['Eb1', 'F1', 'D2', 'G1', 'C2', 'Eb1', 'A1', 'D2']
    bl = []
    for b in (8, 16, 48, 56):
        bl += line808(list(zip(a_roots, ['a', 'b', 'a', 'f', 'a', 'b', 'a', 'c'])), b)
    for b in (24, 32):
        bl += line808(list(zip(b_roots, ['a', 'h', 'a', 'f', 'a', 'h', 'a', 'c'])), b)
    bl += line808(list(zip(a_roots, ['h'] * 8)), 40, vel=.72)
    bl += line808([('G1', 'h'), ('Eb1', 'h')], 64, vel=.7)
    s.notes('808', ('808', dict(drive=2.4, click=.32, decay=1.5)), bl, level=-19, humanize_ms=0, swing=False,
            chain=lambda a, s: fx.eq(a, hp=28, lp=4200, peaks=[(110, 1.5, 1)]))

    kit = drums.acoustic_kit('mid')
    kit['_opts'] = {'kick808': dict(tune=50, decay=.22, punch=3.2)}
    hits = []
    for b0 in (8, 16, 48, 56):
        for b in range(8):
            kick = 'x.....x...x.....' if b % 2 == 0 else 'x.....x.x.....x.'
            hits += drums.loop({'kick808': kick, 'clap808': '........x.......', 'clap': '........x.......'}, 1, b0 + b)
        hits += memphis_hats(8, b0, roll='trip' if b0 in (8, 48) else 'thirty', open_step=14)
        hits += drums.loop({'cowbell808': '..............x.'}, 1, b0 + 7)
        hits += [(b0 * 4, 'crash', .5)]
    for b0 in (24, 32):        # lift: lighter kit, half-time hats
        for b in range(8):
            hits += drums.loop({'kick808': 'x.........x.....', 'clap808': '........x.......', 'clap': '........x.......'}, 1, b0 + b)
        hits += memphis_hats(8, b0, base='x.o.x.o.x.o.x.o.', roll='trip')
    hits += memphis_hats(3, 44, base='x...o...x...o...', roll=None)      # break: hats creep back in
    hits += memphis_hats(1, 47, base='x.x.x.x.xxxxxxxx', roll=None)
    hits += memphis_hats(4, 64, base='x.o.x.o.x.o.x.o.', roll=None)
    hits += [(64 * 4, 'kick808', .8), (64 * 4 + 2, 'clap808', .5)]
    s.drums('drums', kit, hits, level=-20, humanize_ms=2, swing=True,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=13000, peaks=[(4000, -1.5, 1)]), -16, 2.5, 6, 80, 1))

    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 650), (s.sec(7.5 * 4, False), 2400), (s.sec(8 * 4, False), 16000),
                                                            (s.sec(66 * 4, False), 16000), (s.sec(72 * 4, False) + 2, 900)])
    s.master_chain = lambda a, s: fx.tape(a, wow=.0008, flutter=.0002, drive=1.15)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
