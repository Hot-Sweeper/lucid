"""After the Last Train: night ambient, B dorian, 64 BPM.

Rolled Rhodes chords with chorus and long dotted echoes, a Juno string pad
and one soft upright-bass note per chord. The Rhodes also sings the tune in
its upper register: a rising F#-A-C# figure whose dorian G# gives the night
colour, borrowing G major 7 #11 for the turn. An interlude drops the tune and
lets the chords breathe before it returns an octave lower and closer.
"""
from lucid_music import sampler, fx, parts
from lucid_music.song import Song
from lucid_music.theory import melody
from lucid_music.styles.ambient import chain

A = 'Bm9:8 | E9:8 | Dmaj9:8 | Gmaj7#11:8'
B = 'Em9:8 | A13:8 | Dmaj9:4 Gmaj7#11:4 | F#m7:4 F#7sus4:2 F#7b9:2'

THEME = """r:1 F#5:1 A5:1 C#6:1 | B5:3 r:1 | r:1 G#5:1 B5:1 D6:1 | B5:3 r:1 |
           r:1 A5:1 C#6:1 E6:1 | D6:2 C#6:1 A5:1 | B5:2 F#5:2 | C#6:4"""
ANSWER = """r:1 B5:1 D6:1 F#6:1 | E6:3 r:1 | r:1 C#6:1 E6:1 F#6:1 | E6:2 C#6:1 B5:1 |
            A5:2 F#5:1 E5:1 | F#5:3 r:1 | r:1 E5:1 F#5:1 A5:1 | B5:2 A#5:2"""
CODA = 'r:1 F#5:1 A5:1 C#6:1 | B5:4 | r:4 | r:4'


def build():
    s = Song('after-the-last-train', 'After the Last Train', bpm=64, key=11, mode='dorian', genre='ambient',
             energy=.16, period='night', textures=['piano', 'pads', 'strings', 'bass'], swing=.5, seed=47,
             space=dict(seconds=5.0, predelay=.04, damp=.6, bright=5000), delay_beats=1.5)
    # intro 4 | A 8 | B 8 | interlude 8 | A' 8 | outro 4 (40 bars)
    for name, bar, n in (('intro', 0, 4), ('theme', 4, 8), ('answer', 12, 8), ('interlude', 20, 8),
                         ('theme, closer', 28, 8), ('outro', 36, 4)):
        s.section(name, bar, n)
    s.length_beats = 40 * 4
    prog = chain(('Bm9:8 | E9:8', 0), (A, 4), (B, 12), (A, 20), (A, 28), ('Bm9:8 | Gmaj7#11:4 Bm9:4', 36))
    s._prog = prog

    # Rhodes chords: rolled on the change, a softer answer halfway through.
    chords = parts.comp(prog, [(0, 3.8, 1), (4.5, 3.3, .66)], lo='A2', hi='E4', n=4, vel=.5, spread=.035)
    s.notes('rhodes chords', sampler.rhodes(), chords, level=-24, reverb=.3, delay=.12, humanize_ms=10,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=140, lp=5500, peaks=[(300, -3, .8)]), rate=.35, depth=.2, mix=.4))

    # Rhodes tune in the upper register (its own instrument so pedal/release stay independent).
    tune = (melody(THEME, 4 * 4, vel=.6) + melody(ANSWER, 12 * 4, vel=.58)
            + melody('r:4 | r:4 | r:4 | r:4 | r:1 A5:1 C#6:1 E6:1 | D6:4 | r:4 | r:4', 20 * 4, vel=.45)
            + melody(THEME, 28 * 4, octave_shift=-1, vel=.66) + melody(CODA, 36 * 4, vel=.5))
    s.notes('rhodes tune', sampler.rhodes(), tune, level=-21, reverb=.35, delay=.2, humanize_ms=12,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=200, lp=6500), rate=.3, depth=.15, mix=.3))

    # Juno strings pad, slow and wide, fading in after the intro.
    pad = parts.pad(prog, 'D4', 'A5', 4, vel=.5, overlap=1.5)
    end = s.sec(40 * 4, False)
    s.notes('strings pad', ('surge', 'Juno-60 Strings'), pad, level=-28, reverb=.25, humanize_ms=0, vel_jitter=0,
            chain=lambda a, s: fx.automate(fx.eq(a, hp=250, lp=5000), [(0, -30), (s.sec(16, False), 0),
                                                                    (end - 6, 0), (end, -30)]))

    # One soft upright note per chord, a fifth answering in the second bar.
    bl = parts.bass(prog, [(0, 3.6, 'R', 1), (4, 3.4, '5', .8)], lo='E1', hi='D2', vel=.5)
    s.notes('bass', sampler.upright_bass(), bl, level=-24, humanize_ms=10,
            chain=lambda a, s: fx.eq(a, hp=35, lp=1800))

    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(
        a, [(0, 900), (s.sec(14, False), 9000), (end - 6, 9000), (end + 5, 1300)])
    s.master_chain = lambda a, s: fx.tape(fx.fade(a, fade_in=2.0), wow=.0012, drive=1.1)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
