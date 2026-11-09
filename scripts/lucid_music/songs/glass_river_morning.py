"""Glass River Morning: harp and vibraphone ambient, G major, 70 BPM.

Flowing harp arpeggios (eighths, rising and falling like water) under a
vibraphone theme built on a B-D-A motif. The B section moves to E minor and a
lydian C chord; the theme returns doubled by a soft glassy bell an octave up,
then the harp slows to quarter notes for the coda.
"""
from lucid_music import sampler, fx, parts
from lucid_music.song import Song
from lucid_music.theory import melody
from lucid_music.styles.ambient import chain

A = 'Gmaj9 | Em9 | Cmaj9 | D6/F# | Gmaj9 | Bm7 | Cmaj9 | Am9 D9sus4'
B = 'Em9 | Cmaj9 | Am9 | D9sus4 | Bm7 | Em9 | Cmaj7#11 | D9sus4'
B_END = 'Em9 | Cmaj9 | Am9 | D9sus4 | Bm7 | Em9 | Cmaj7#11 | Am9 D9sus4'

THEME = """r:1 B5:1 D6:1 A5:1 | G5:3 r:1 | r:1 E6:1 D6:1 B5:1 | A5:3 r:1 |
           r:1 B5:1 D6:1 F#6:1 | E6:2 D6:2 | B5:1 G5:1 E5:1 D5:1 | E5:2 D5:2"""
ANSWER = """r:2 G5:1 B5:1 | D6:3 r:1 | r:2 C6:1 E6:1 | D6:2 C6:1 A5:1 |
            r:1 F#5:1 A5:1 D6:1 | B5:3 r:1 | r:1 F#6:1 E6:1 B5:1 | C6:2 D6:2"""
ANSWER_END = """r:2 G5:1 B5:1 | D6:3 r:1 | r:2 C6:1 E6:1 | D6:2 C6:1 A5:1 |
                r:1 F#5:1 A5:1 D6:1 | B5:3 r:1 | r:1 F#6:1 E6:1 B5:1 | A5:2 A5:2"""
CODA = 'r:1 B5:1 D6:1 A5:1 | G5:4 | r:4 | r:4'


def build():
    s = Song('glass-river-morning', 'Glass River Morning', bpm=70, key=7, mode='major', genre='ambient',
             energy=.15, period='morning', textures=['plucked', 'bells', 'pads'], swing=.5, seed=33,
             space=dict(seconds=4.5, predelay=.035, damp=.45, bright=6500), delay_beats=.75)
    # intro 4 | A 8 | B 8 | A' 8 | B' 8 | coda 4 (40 bars)
    for name, bar, n in (('intro', 0, 4), ('theme', 4, 8), ('answer', 12, 8), ('theme with bells', 20, 8),
                         ('answer', 28, 8), ('coda', 36, 4)):
        s.section(name, bar, n)
    s.length_beats = 40 * 4
    prog = chain(('Gmaj9 | Em9 | Cmaj9 | D9sus4', 0), (A, 4), (B, 12), (A, 20), (B_END, 28), ('Gmaj9 | Gmaj9 | Gmaj9:8', 36))
    s._prog = prog

    # Harp: rising-falling eighths over two octaves, a low root on each bar.
    body = [c for c in prog if c[0] < 36 * 4]
    coda = [c for c in prog if c[0] >= 36 * 4]
    flow = parts.arp(body, order=(0, 1, 2, 3, 4, 5, 4, 3), step=.5, lo='G3', hi='D5', n=4, vel=.42,
                     gate=1.8, accents=(1, .7, .8, .75, .9, .7, .8, .7))
    flow += parts.arp(coda, order=(0, 1, 2, 3), step=1, lo='G3', hi='D5', n=4, vel=.36, gate=2.5)
    roots = parts.bass(prog, [(0, 3.8, 'R', 1)], lo='G1', hi='F#2', vel=.42)
    harp = sampler.harp()
    s.notes('harp', harp, flow + roots, level=-24, reverb=.3, humanize_ms=10, vel_jitter=.08,
            chain=lambda a, s: fx.eq(a, hp=55, lp=8000, low_shelf=(200, -1.5), peaks=[(2800, -1.5, 1)]))

    # Vibraphone theme (soft mallets), answer and return.
    vib = (melody(THEME, 4 * 4, vel=.62) + melody(ANSWER, 12 * 4, vel=.58)
           + melody(THEME, 20 * 4, vel=.64) + melody(ANSWER_END, 28 * 4, vel=.58) + melody(CODA, 36 * 4, vel=.5))
    s.notes('vibes', sampler.vibraphone(), vib, level=-21, reverb=.4, delay=.14, humanize_ms=9,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=220, lp=7500), rate=.25, depth=.1, mix=.2))

    # Glassy bell an octave above the returning theme, very quiet.
    bell = melody(THEME, 20 * 4, octave_shift=1, vel=.45)
    s.notes('bell', ('surge', 'Fantasy Bell'), bell, level=-30, reverb=.45, delay=.2, humanize_ms=6,
            chain=lambda a, s: fx.eq(a, hp=900, lp=7000))

    # Airy pad, only from the first answer on, swelling in.
    pad_prog = [c for c in prog if 12 * 4 <= c[0] < 36 * 4]
    s.notes('pad', ('surge', 'Verb Pad'), parts.pad(pad_prog, 'D4', 'A5', 4, vel=.5, overlap=1.5), level=-30,
            reverb=.2, humanize_ms=0, vel_jitter=0,
            chain=lambda a, s: fx.automate(fx.eq(a, hp=300, lp=4500), [(0, -40), (s.sec(48, False), -40),
                                                                     (s.sec(64, False), 0), (s.sec(140, False), 0),
                                                                     (s.sec(146, False), -40)]))

    end = s.sec(40 * 4, False)
    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(
        a, [(0, 1100), (s.sec(15, False), 10000), (end - 4, 10000), (end + 5, 2000)])
    s.master_chain = lambda a, s: fx.fade(a, fade_in=2.0)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
