"""Night Conservatory: chamber ambient for cello and piano, D major / B minor, 58 BPM.

A sampled cello sings an eight-bar elegy whose opening leap of a sixth is
sequenced a step lower; the piano answers in the relative minor while the
cello falls stepwise beneath it (D C# B A G F#), a lament bass. A short
interlude borrows G minor (iv) before the theme returns higher and the coda
lets the borrowed chord resolve home. Piano broken chords flow in eighths,
a warm string pad stays far underneath.
"""
from lucid_music import sampler, fx, parts
from lucid_music.song import Song
from lucid_music.theory import melody
from lucid_music.styles.ambient import chain, legato_pedal, cello, fit

INTRO = 'Dmaj9 | A/C# | Bm7 | Gmaj7'
A = 'Dmaj9 | A/C# | Bm7 | Gmaj7 | Em7 | D/F# | Gmaj7 | A7sus4:2 A:2'
B = 'Bm9 | Gmaj7 | D/F# | Em9 | Bm9 | Gmaj9 | Em7 | F#7sus4:2 F#7:2'
INTERLUDE = 'Gmaj7 | Gm6 | D/A | A7sus4'
CODA = 'Gmaj7 | Gm6 | Dmaj9 | Dmaj9'

THEME = """r:1 A3:1 F#4:2 | E4:3/2 D4:1/2 C#4:2 | D4:1 B3:1 F#3:2 | G3:1 A3:1 B3:2 |
           r:1 B3:1 G4:2 | F#4:3/2 E4:1/2 D4:2 | B3:1 D4:1 F#4:1 E4:1 | D4:2 C#4:2"""
THEME_HIGH = """r:1 A3:1 F#4:2 | E4:3/2 D4:1/2 C#4:2 | D4:1 B3:1 F#3:2 | G3:1 A3:1 B3:2 |
                r:1 B3:1 B4:2 | A4:3/2 G4:1/2 F#4:2 | G4:1 F#4:1 E4:1 D4:1 | E4:2 C#4:2"""
LAMENT = """D4:3 r:1 | B3:3 r:1 | A3:3 r:1 | G3:3 r:1 |
            F#3:3 r:1 | F#3:2 A3:1 r:1 | G3:3 r:1 | E3:2 C#4:2"""
PIANO_B = """r:1/2 F#5:1/2 C#6:1 B5:1 F#5:1 | D5:1 E5:1/2 F#5:1/2 B5:2 | A5:1 F#5:1 E5:1 D5:1 | E5:3 r:1 |
             r:1/2 F#5:1/2 C#6:1 D6:1 C#6:1 | B5:1 A5:1/2 G5:1/2 F#5:2 | G5:1 F#5:1 E5:1 B4:1 | B4:2 A#4:2"""
PIANO_INTERLUDE = 'r:1 B4:1 D5:1 F#5:1 | r:1 Bb4:1 D5:1 E5:1 | r:1 A4:1 D5:1 F#5:1 | E5:2 D5:2'
CELLO_CODA = 'B3:3 r:1 | Bb3:3 r:1 | A3:3 r:1 | r:4'
PIANO_CODA = 'r:4 | r:4 | r:2 F#5:1 A5:1 | E5:4'


def build():
    s = Song('night-conservatory', 'Night Conservatory', bpm=58, key=2, mode='major', genre='ambient',
             energy=.12, period='night', textures=['strings', 'piano', 'pads'], swing=.5, seed=58,
             space=dict(seconds=4.8, predelay=.04, damp=.6, bright=5000), delay_beats=1.5)
    # intro 4 | A 8 (cello) | B 8 (piano over lament) | interlude 4 | A' 8 (cello higher) | coda 4 = 36
    for name, bar, n in (('intro', 0, 4), ('cello theme', 4, 8), ('piano answer', 12, 8),
                         ('interlude', 20, 4), ('theme return', 24, 8), ('coda', 32, 4)):
        s.section(name, bar, n)
    s.length_beats = 36 * 4
    prog = chain((INTRO, 0), (A, 4), (B, 12), (INTERLUDE, 20), (A, 24), (CODA, 32))
    s._prog = prog

    # Piano left hand: flowing eighth-note broken chords; quarters under the cello theme.
    flow = (0, 1, 2, 3, 2, 1, 2, 1)
    lh = parts.arp(chain((INTRO, 0)), order=flow, step=.5, lo='D2', hi='E4', n=4, vel=.36,
                   accents=(1.15, .8, .9, .85, 1, .8, .9, .8))
    lh += parts.arp(chain((A, 4)), order=(0, 2, 3, 1), step=1, lo='D2', hi='E4', n=4, vel=.32)
    lh += parts.arp(chain((B, 12), (INTERLUDE, 20)), order=flow, step=.5, lo='D2', hi='E4', n=4, vel=.34,
                    accents=(1.15, .8, .9, .85, 1, .8, .9, .8))
    lh += parts.arp(chain((A, 24)), order=(0, 2, 3, 1), step=1, lo='D2', hi='E4', n=4, vel=.32)
    lh += parts.arp(chain(('Gmaj7 | Gm6', 32)), order=(0, 2, 3, 1), step=1, lo='D2', hi='E4', n=4, vel=.3)
    lh += parts.comp(chain(('Dmaj9:8', 34)), [(0, 7.5, 1)], lo='D2', hi='E4', n=4, vel=.3, spread=.18)
    rh = melody(PIANO_B, 12 * 4, vel=.6) + melody(PIANO_INTERLUDE, 20 * 4, vel=.5) + melody(PIANO_CODA, 32 * 4, vel=.48)
    pedal = legato_pedal(prog)
    s.notes('piano lh', sampler.grand(), lh, level=-25, reverb=.4, humanize_ms=10, pedal=pedal,
            chain=lambda a, s: fx.eq(a, hp=60, lp=5500, low_shelf=(220, -2.5), peaks=[(3000, -2, 1)]))
    s.notes('piano rh', sampler.grand(), rh, level=-22, reverb=.45, delay=.08, humanize_ms=12, pedal=pedal,
            chain=lambda a, s: fx.eq(a, hp=150, lp=7000, peaks=[(2800, -2, 1)]))

    # Cello: theme, lament line under the piano, theme higher, coda resolution.
    vc = (melody(THEME, 4 * 4, vel=.62) + melody(LAMENT, 12 * 4, vel=.45)
          + melody(THEME_HIGH, 24 * 4, vel=.66) + melody(CELLO_CODA, 32 * 4, vel=.48))
    s.notes('cello', cello(), vc, level=-21, reverb=.36, humanize_ms=14, vel_jitter=.04,
            chain=lambda a, s: fx.eq(a, hp=60, lp=7500, peaks=[(250, -1.5, .9), (2600, -1.5, 1.2)]))

    # Warm string pad far below the duet, entering after the intro.
    pad = parts.pad(chain((A, 4), (B, 12), (INTERLUDE, 20), (A, 24), (CODA, 32)), 'A2', 'D4', 3, vel=.5, overlap=1)
    s.notes('strings pad', ('surge', 'Juno-60 Strings'), pad, level=-30, reverb=.3, humanize_ms=0, vel_jitter=0,
            chain=lambda a, s: fx.width(fx.eq(fit(s)(a, s), hp=120, lp=2600), .8))

    end = s.sec(36 * 4, False)
    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(
        a, [(0, 1100), (s.sec(16, False), 9000), (end - 8, 9000), (end + 4, 1300)])
    s.master_chain = lambda a, s: fx.fade(a, fade_in=2.0)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
