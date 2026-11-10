"""Reservoir Moon: piano ambient, E-flat lydian colour, 62 BPM.

A sparse pedalled grand piano over a warm pad. Chords change every two bars;
the lydian II (F over an E-flat bass) gives the floating colour. The theme is
a three-note rising motif (G Bb F) that is sequenced, answered higher in B,
and comes back in octaves before a quiet coda.
"""
from lucid_music import sampler, fx, parts
from lucid_music.song import Song
from lucid_music.theory import melody, progression
from lucid_music.styles.ambient import chain, legato_pedal

A = 'Ebmaj9:8 | F/Eb:8 | Gm7:8 | Abmaj9:8'
B = 'Cm9:8 | Abmaj9:8 | Eb/G:8 | Bb9sus4:8'
B_END = 'Cm9:8 | Abmaj9:8 | Eb/G:8 | Bb9sus4:4 Bb7sus4:4'

THEME = """r:2 G5:1 Bb5:1 | F5:3 D5:1 | r:2 A5:1 C6:1 | G5:3 r:1 |
           r:2 Bb5:1 D6:1 | C6:2 Bb5:1 F5:1 | G5:3 Eb5:1 | F5:4"""
THEME_2 = """r:2 G5:1 Bb5:1 | F5:3 D5:1 | r:2 A5:1 C6:1 | G5:2 A5:1 C6:1 |
             D6:2 Bb5:1 D6:1 | F6:2 D6:1 Bb5:1 | G5:3 Eb5:1 | F5:4"""
ANSWER = """r:1 Eb6:1 D6:1 Bb5:1 | G5:2 r:1 C6:1 | Bb5:3 C6:1 | Eb6:2 r:2 |
            r:1 Bb5:1 G5:1 Eb5:1 | F5:2 G5:2 | Ab5:2 C6:1 Bb5:1 | Bb5:4"""
ANSWER_END = """r:1 Eb6:1 D6:1 Bb5:1 | G5:2 r:1 C6:1 | Bb5:3 C6:1 | Eb6:2 r:2 |
                r:1 Bb5:1 G5:1 Eb5:1 | F5:2 G5:2 | Ab5:2 C6:1 Bb5:1 | F5:2 Ab5:2"""
CODA = 'r:2 G5:1 Bb5:1 | F5:3 D5:1 | r:4 | r:2 G4:2'


def build():
    s = Song('reservoir-moon', 'Reservoir Moon', bpm=62, key=3, mode='lydian', genre='ambient',
             energy=.12, period='night', textures=['piano', 'pads'], swing=.5, seed=21,
             space=dict(seconds=5.5, predelay=.045, damp=.55, bright=5200), delay_beats=1.5)
    # intro 4 | A 8 | B 8 | A' 8 | B' 8 | coda 4  (40 bars)
    for name, bar, n in (('intro', 0, 4), ('theme', 4, 8), ('answer', 12, 8), ('theme in octaves', 20, 8),
                         ('answer', 28, 8), ('coda', 36, 4)):
        s.section(name, bar, n)
    s.length_beats = 40 * 4
    prog = chain(('Ebmaj9:8 | F/Eb:8', 0), (A, 4), (B, 12), (A, 20), (B_END, 28), ('Ebmaj9:8 | Ebmaj9:8', 36))
    s._prog = prog

    # Warm pad, voice-led, common tones tied. Narrowed so it stays mono-safe.
    pad = parts.pad(prog, 'Bb3', 'F5', 4, vel=.55, overlap=1.5)
    s.notes('pad', ('surge', 'Still'), pad, level=-24, reverb=.25, humanize_ms=0, vel_jitter=0,
            chain=lambda a, s: fx.width(fx.eq(a, hp=160, lp=5500, peaks=[(700, -2, .7)]), .8))

    # Piano left hand: a low open chord at each change, let ring under the pedal.
    lh = parts.comp(prog, [(0, 8.2, 1), (4.5, 3.7, .72)], lo='Eb2', hi='Bb3', n=3, vel=.34, spread=.08)
    # Right hand: theme, answer, theme in octaves (lower octave soft), answer, coda.
    rh = (melody(THEME, 4 * 4, vel=.62) + melody(ANSWER, 12 * 4, vel=.6)
          + melody(THEME_2, 20 * 4, vel=.64) + melody(THEME_2, 20 * 4, octave_shift=-1, vel=.38)
          + melody(ANSWER_END, 28 * 4, vel=.58) + melody(CODA, 36 * 4, vel=.5))
    piano = sampler.grand()
    pedal = legato_pedal(prog)
    s.notes('piano', piano, lh + rh, level=-21, reverb=.42, delay=.1, humanize_ms=12, pedal=pedal,
            chain=lambda a, s: fx.eq(a, hp=70, lp=6500, low_shelf=(250, -2), peaks=[(3000, -2.5, 1)]))

    # A breath of air: the pad and piano rise out of a low-passed intro and sink back.
    end = s.sec(40 * 4, False)
    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(
        a, [(0, 700), (s.sec(14, False), 9000), (end - 6, 9000), (end + 5, 1200)])
    s.master_chain = lambda a, s: fx.fade(a, fade_in=2.5)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
