"""Moth Hour: piano phonk, C minor, 144 BPM (half-time).

A Memphis-style grand piano ostinato (broken chords over a repeated pedal
note) moves i - VI - iv - V; the pitched 808 cowbell answers at each phrase
end. The B section turns to the relative major with a bell melody.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles.phonk import cowbell_track, memphis_hats, line808, at

def _eighths(notes):
    return ' '.join(f'{n}:1/2' for n in notes.split())

RIFF = ' | '.join(_eighths(b) for b in [
    'C5 G4 Eb5 G4 D5 G4 Eb5 G4', 'C5 G4 Eb5 G4 F5 G4 Eb5 D5',
    'C5 Ab4 Eb5 Ab4 G5 Ab4 Eb5 Ab4', 'C5 Ab4 Eb5 Ab4 F5 Ab4 Eb5 C5',
    'Ab4 F4 C5 F4 Eb5 F4 C5 F4', 'Ab4 F4 C5 F4 G5 F4 Eb5 C5',
    'B4 G4 D5 G4 F5 G4 D5 G4', 'B4 G4 D5 G4 Ab5 G4 F5 D5'])
ANSWER_AB = 'r:2 Eb6:1/4 D6:1/4 C6:1/2 G5:1'
ANSWER_G = 'r:2 F6:1/4 Eb6:1/4 D6:1/2 B5:1'
BELLS = """G5:1 Bb5:1 D6:2 | C6:1 Bb5:1 G5:2 | F5:1 Ab5:1 C6:2 | Bb5:1 Ab5:1 F5:2 |
           Ab5:1 G5:1 F5:1 Eb5:1 | C5:2 Eb5:2 | Eb5:1 G5:1 C6:2 | C6:1 D6:1 B5:2"""
A_PROG = 'Cmadd9 | Cmadd9 | Abmaj7 | Abmaj7 | Fm9 | Fm9 | G7b9 | G7b9'
B_PROG = 'Ebmaj9 | Ebmaj9 | Dbmaj7 | Dbmaj7 | Fm9 | Fm9 | Abmaj7 | G7sus4 G7b9'


def build():
    s = Song('moth-hour', 'Moth Hour', bpm=144, key=0, mode='minor', genre='phonk', energy=.62, period='evening',
             textures=['piano', 'bells', 'bass', 'drums', 'pads'], swing=.52, swing_unit=.25, seed=44,
             space=dict(seconds=2.8, predelay=.025, damp=.5, bright=6000), delay_beats=1.5)
    A, B = progression(A_PROG), progression(B_PROG)
    form = [('intro', 0, 8, A), ('riff', 8, 16, A), ('bell theme', 24, 16, B), ('break', 40, 8, A),
            ('riff return', 48, 16, A), ('bells again', 64, 8, B), ('outro', 72, 8, A)]
    full = []
    for name, b0, n, P in form:
        s.section(name, b0, n)
        for k in range(0, n, 8):
            full += at(P, b0 + k)
    s.length_beats = 80 * 4

    piano = []
    for b0, vel in ((0, .55), (8, .72), (16, .78), (40, .62), (48, .74), (56, .8), (72, .55)):
        piano += melody(RIFF, b0 * 4, vel=vel)
    chords_b = parts.comp(at(B, 24) + at(B, 32) + at(B, 64), [(0, 3.8, 1)], lo='Eb3', hi='Eb5', n=4, vel=.45, spread=.03)
    s.notes('piano', sampler.grand(), piano + chords_b, level=-22, reverb=.2, delay=.05, humanize_ms=6,
            chain=lambda a, s: fx.eq(a, hp=120, lp=6500, peaks=[(250, -2.5, .8), (3200, -1.5, 1)]))

    s.notes('pad', ('surge', 'Ghost Pad'), parts.pad(full, 'G2', 'C5', 4, vel=.5), level=-29, reverb=.15, duck=.3,
            chain=lambda a, s: fx.eq(a, hp=200, lp=6000))

    bells = melody(BELLS, 24 * 4) + melody(BELLS, 32 * 4, vel=.85) + melody(BELLS, 56 * 4, octave_shift=1, vel=.45) \
        + melody(BELLS, 64 * 4, vel=.7)
    s.notes('bells', ('surge', 'Bell 1'), bells, level=-23, reverb=.25, delay=.15,
            chain=lambda a, s: fx.eq(a, hp=300, lp=9000))

    cow = []
    for b0 in (8, 16, 40, 48, 56):
        cow += melody(ANSWER_AB, (b0 + 3) * 4, octave_shift=-1, vel=.8) + melody(ANSWER_G, (b0 + 7) * 4, octave_shift=-1, vel=.8)
    cowbell_track(s, cow, level=-23, reverb=.15, delay=.18, chain=lambda a, s: fx.eq(a, hp=350, lp=7500))

    a_roots = ['C1', 'C1', 'Ab0', 'Ab0', 'F1', 'F1', 'G1', 'G1']
    b_roots = ['Eb1', 'Eb1', 'Db1', 'Db1', 'F1', 'F1', 'Ab0', 'G1']
    bl = []
    for b in (8, 16, 48, 56):
        bl += line808(list(zip(a_roots, ['a', 'b', 'a', 'f', 'a', 'b', 'a', 'c'])), b)
    for b in (24, 32, 64):
        bl += line808(list(zip(b_roots, ['h', 'b', 'h', 'f', 'h', 'b', 'h', 'c'])), b)
    s.notes('808', ('808', dict(drive=2.5, click=.3, decay=1.5)), bl, level=-19, humanize_ms=0, swing=False,
            chain=lambda a, s: fx.eq(a, hp=28, lp=3800))

    kit = drums.acoustic_kit('mid')
    kit['_opts'] = {'kick808': dict(tune=54, decay=.2, punch=3.)}
    hits = []
    for b0 in (8, 16, 48, 56):
        for b in range(8):
            kick = 'x.....x...x.....' if b % 2 == 0 else 'x.....x.x.....x.'
            hits += drums.loop({'kick808': kick, 'clap808': '........x.......', 'clap': '........x.......',
                                'cowbell808': '......x.........' if b % 4 == 1 else '................'}, 1, b0 + b)
        hits += memphis_hats(8, b0, roll='trip' if b0 in (8, 48) else 'thirty', open_step=14)
    for b0 in (24, 32, 64):
        for b in range(8):
            hits += drums.loop({'kick808': 'x.........x.....', 'clap808': '........x.......', 'clap': '........x.......'}, 1, b0 + b)
        hits += memphis_hats(8, b0, base='x.o.x.o.x.o.x.o.', roll='trip')
    hits += memphis_hats(8, 40, base='x.......x.......', roll=None)
    hits += [(72 * 4, 'kick808', .7)] + memphis_hats(4, 72, base='x...o...x...o...', roll=None)
    s.drums('drums', kit, hits, level=-20, humanize_ms=2,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=12500), -16, 2.5, 6, 80, 1))

    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 700), (s.sec(7.5 * 4, False), 2500), (s.sec(8 * 4, False), 16000),
                                                            (s.sec(74 * 4, False), 16000), (s.sec(80 * 4, False) + 2, 900)])
    s.master_chain = lambda a, s: fx.tape(a, wow=.0008, flutter=.0002, drive=1.15)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
