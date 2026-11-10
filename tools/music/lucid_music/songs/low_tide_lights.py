"""Low Tide Lights: drifting pulse ambient, A major, 80 BPM.

A soft eighth-note pluck arpeggio carries the harmony while pads swell
underneath. The vibraphone sings a slow C#-E-B motif. In the middle a very
quiet heartbeat (soft kick and shaker) joins and a sine lead shadows the
theme an octave down; then the pulse thins out and the arpeggio drifts away.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import melody
from lucid_music.styles.ambient import chain

A = 'Amaj9 | C#m7 | F#m9 | Dmaj7#11 | Amaj9 | C#m7 | Bm9 | E9sus4'
B = 'Dmaj9 | C#m7 | Bm9 | Amaj9 | Dmaj9 | C#m7 | F#m9 | E9sus4'

THEME = """r:1 C#6:1 E6:2 | B5:3 r:1 | r:1 A5:1 C#6:2 | G#5:3 r:1 |
           r:1 C#6:1 E6:1 G#6:1 | F#6:2 E6:2 | D6:2 C#6:1 B5:1 | A5:4"""
ANSWER = """r:1 F#5:1 A5:1 C#6:1 | B5:2 G#5:2 | r:1 D6:1 C#6:1 B5:1 | C#6:4 |
            r:1 A5:1 E6:1 D6:1 | C#6:2 B5:2 | A5:2 G#5:1 F#5:1 | E5:4"""


def build():
    s = Song('low-tide-lights', 'Low Tide Lights', bpm=80, key=9, mode='major', genre='ambient',
             energy=.2, period='evening', textures=['synth', 'bells', 'pads', 'drums'], swing=.5, seed=59,
             space=dict(seconds=4.5, predelay=.03, damp=.5, bright=6000), delay_beats=.75)
    # intro 4 | A 8 | B 8 (pulse) | A 8 (pulse + shadow) | B 8 | A half 4 | outro 4  (44 bars)
    for name, bar, n in (('intro', 0, 4), ('theme', 4, 8), ('answer with pulse', 12, 8),
                         ('theme with pulse', 20, 8), ('answer, pulse fades', 28, 8), ('theme fragment', 36, 4),
                         ('outro', 40, 4)):
        s.section(name, bar, n)
    s.length_beats = 44 * 4
    prog = chain(('Amaj9 | C#m7 | F#m9 | E9sus4', 0), (A, 4), (B, 12), (A, 20), (B, 28),
                 ('Amaj9 | C#m7 | F#m9 | Dmaj7#11', 36), ('Amaj9 | Dmaj7#11 | Amaj9 | Amaj9', 40))
    s._prog = prog
    end = s.sec(44 * 4, False)

    # Pluck arpeggio, eighths, accent pattern 3+3+2 so it gently rolls instead of ticking.
    arp = parts.arp(prog, order=(0, 2, 1, 3, 2, 1, 3, 2), step=.5, lo='E4', hi='E5', n=4, vel=.5, gate=.8,
                    accents=(1, .65, .7, .95, .65, .7, .9, .65))
    s.notes('pluck', ('surge', 'Nice Pluck 2'), arp, level=-26, reverb=.25, delay=.1, humanize_ms=3,
            chain=lambda a, s: fx.eq(a, hp=250, lp=6000, peaks=[(3500, -2, 1)]))

    # Pad swells: voice-led, louder in the middle.
    pad = parts.pad(prog, 'C#4', 'G#5', 4, vel=.5, overlap=1.5)
    s.notes('pad', ('surge', 'PPG Dreams'), pad, level=-27, reverb=.25, humanize_ms=0, vel_jitter=0,
            chain=lambda a, s: fx.automate(fx.width(fx.eq(a, hp=200, lp=5000), .85),
                                           [(0, -8), (s.sec(48, False), -4), (s.sec(80, False), 0),
                                            (s.sec(140, False), 0), (s.sec(160, False), -5), (end, -14)]))

    # Vibraphone theme.
    vib = (melody(THEME, 4 * 4, vel=.62) + melody(ANSWER, 12 * 4, vel=.6) + melody(THEME, 20 * 4, vel=.64)
           + melody(ANSWER, 28 * 4, vel=.58) + melody('r:1 C#6:1 E6:2 | B5:3 r:1 | r:1 A5:1 C#6:2 | G#5:4', 36 * 4, vel=.52)
           + melody('r:4 | r:1 C#6:1 E6:2 | A5:4 | r:4', 40 * 4, vel=.45))
    s.notes('vibes', sampler.vibraphone(), vib, level=-21, reverb=.4, delay=.12, humanize_ms=8,
            chain=lambda a, s: fx.eq(a, hp=250, lp=7500))

    # Sine lead shadowing the returning theme an octave below.
    shadow = melody(THEME, 20 * 4, octave_shift=-1, vel=.55)
    s.notes('shadow lead', ('surge', 'Sine Lead'), shadow, level=-28, reverb=.35, delay=.15, humanize_ms=5,
            chain=lambda a, s: fx.eq(a, hp=200, lp=3000))

    # Soft bass: one note per bar under the pulse sections.
    pulse_prog = [c for c in prog if 12 * 4 <= c[0] < 36 * 4]
    bl = parts.bass(pulse_prog, [(0, 2.8, 'R', 1), (3, .9, '5', .7)], lo='E1', hi='D2', vel=.5)
    s.notes('bass', sampler.upright_bass(), bl, level=-25, duck=.15, humanize_ms=6,
            chain=lambda a, s: fx.eq(a, hp=35, lp=1500))

    # Heartbeat: lub-dub soft kick and an eighth shaker, bars 12 to 36 only.
    kit = drums.acoustic_kit('mid')
    hits = []
    for b in range(12, 36):
        last = b in (19, 27)
        hits += drums.loop({'k': 'x..o............', 'shaker': 'o.g.o.g.o.g.o.g.' if not last else 'o.g.o.g.o.g.o.oo'}, 1, b)
    hits = [(t, p, v * (.75 if 28 * 4 <= t else 1)) for t, p, v in hits]
    s.drums('heartbeat', kit, hits, level=-27, reverb=.12,
            chain=lambda a, s: fx.automate(fx.eq(a, hp=40, lp=7000),
                                           [(0, -6), (s.sec(48, False), -6), (s.sec(80, False), 0),
                                            (s.sec(112, False), 0), (s.sec(144, False), -8)]))

    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(
        a, [(0, 800), (s.sec(15, False), 10000), (end - 8, 10000), (end + 5, 1200)])
    s.master_chain = lambda a, s: fx.fade(a, fade_in=2.0)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
