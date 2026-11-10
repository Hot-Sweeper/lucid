"""Rain on the Tram: lo-fi hip hop, F major, 78 BPM, swung 16ths.

Rhodes comping, a felt-soft grand piano melody, pizzicato upright bass and a
dusty boom-bap kit. The A theme is an 8-bar question/answer; the bridge moves
to Db for a vibraphone interlude before the theme returns an octave higher.
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody, offset


def build():
    s = Song('rain-on-the-tram', 'Rain on the Tram', bpm=78, key=5, mode='major', genre='lofi',
             energy=.3, period='day', textures=['piano', 'bass', 'drums'], swing=.58, swing_unit=.25,
             seed=11, space=dict(seconds=2.2, predelay=.03, damp=.6, bright=5200), delay_beats=.75)

    A = progression('Bbmaj9 | Am9 | Gm9 C13 | Fmaj9 | Bbmaj9 | A7b9 | Dm9 | Gm9 C7b9')
    B = progression('Dbmaj9 | C7#9 | Fm9 | Bb13 | Ebmaj9 | Am7b5 D7b9 | Gm9 | C9sus4 C7b9')
    theme = """r:1 F5:1/2 A5:1/2 G5:3/4 F5:1/4 D5:1 | r:1/2 C5:1/2 E5:1 G5:1/2 E5:3/2 |
               F5:1/2 D5:1/2 Bb4:1 A4:1 G4:1 | G4:1/2 A4:7/2 |
               r:1 F5:1/2 A5:1/2 C6:3/4 A5:1/4 G5:1 | F5:1 E5:1/2 C#5:1/2 E5:2 |
               D5:1/2 E5:1/2 F5:1 A5:3/2 G5:1/2 | F5:1 D5:1 Db5:1 Bb4:1"""
    answer = """r:1 D5:1/2 F5:1/2 A5:1 G5:1/2 F5:1/2 | E5:3/2 G5:1/2 E5:1 C5:1 |
                D5:1/2 F5:1/2 A5:1 G5:1 E5:1 | F5:4 |
                r:1/2 A5:1/2 C6:1/2 A5:1/2 G5:1 F5:1 | E5:1/2 F5:1/2 E5:1/2 C#5:1/2 A4:2 |
                D5:1 F5:1/2 A5:1/2 C6:1 A5:1 | G5:1 F5:1/2 E5:1/2 Db5:1 C5:1"""
    bridge = """r:1/2 F5:1/2 Ab5:1/2 C6:1/2 Bb5:2 | r:1/2 G5:1/2 E5:1/2 Eb5:1/2 Bb4:2 |
                r:1/2 Ab4:1/2 C5:1/2 Eb5:1/2 G5:1 F5:1 | D5:1 Ab5:3 |
                r:1/2 G5:1/2 Bb5:1/2 D6:1/2 C6:2 | C6:1 A5:1/2 Eb5:1/2 F#5:1 C5:1 |
                D5:1/2 F5:1/2 Bb5:1 A5:1 F5:1 | G5:2 E5:1 Db5:1"""

    # Form: intro 4 | A 8 | A' 8 | bridge 8 | A'' 8 (8va) | outro 4
    bars = dict(intro=0, a1=4, a2=12, b=20, a3=28, outro=36)
    s.section('intro', 0, 4); s.section('theme', 4, 8); s.section('answer', 12, 8)
    s.section('bridge', 20, 8); s.section('theme return', 28, 8); s.section('outro', 36, 4)
    s.length_beats = 40 * 4

    def at(prog, bar):
        return [(st + bar * 4, ln, c) for st, ln, c in prog]

    intro_prog = at(progression('Bbmaj9 | Am9 | Gm9 C13 | Fmaj9'), 0)
    outro_prog = at(progression('Bbmaj9 | Am9 | Gm9 | Fmaj9'), 36)
    full = intro_prog + at(A, 4) + at(A, 12) + at(B, 20) + at(A, 28) + outro_prog

    # Rhodes: chord on 1, anticipated push on the 'and' of 2, quiet answer on 4.
    rh = parts.comp(full, [(0, 1.4, 1), (1.75, .9, .72), (3.5, .45, .5)], lo='A2', hi='E4', n=4,
                    vel=.5, rootless=True, spread=.012)
    s.notes('rhodes', sampler.rhodes(), rh, level=-23, reverb=.16, duck=.22, humanize_ms=7,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=120, lp=7000, peaks=[(400, -2, .8)]), rate=.4, depth=.12, mix=.3))

    # Felt-soft grand: theme, answer, theme 8va over the return.
    lead = melody(theme, 4 * 4) + melody(answer, 12 * 4) + melody(theme, 28 * 4, octave_shift=0, vel=.82) \
        + melody('r:1 F5:1/2 A5:1/2 G5:3/4 F5:1/4 D5:1 | r:1/2 C5:1/2 E5:1 G5:1/2 E5:3/2 | r:4 | A4:4', 36 * 4, vel=.6)
    lead_pedal = [(b * 4, b * 4 + 3.9) for b in range(4, 40)]
    s.notes('piano lead', sampler.grand(), lead, level=-22, reverb=.24, delay=.06, humanize_ms=9, pedal=lead_pedal,
            chain=lambda a, s: fx.eq(a, hp=180, lp=4200, peaks=[(2500, -2, 1)], low_shelf=(300, -2)))

    # Bridge melody on soft vibraphone, doubled an octave lower by the piano, quietly.
    vib = melody(bridge, 20 * 4, vel=.7)
    s.notes('vibes', sampler.vibraphone(), vib, level=-22, reverb=.3, delay=.12, humanize_ms=8,
            chain=lambda a, s: fx.eq(a, hp=250, lp=6500))

    # Upright bass: root on 1, fifth on the 'and' of 3, chromatic approach on 4-and.
    bass_pat = [(0, 1.6, 'R', 1), (2.5, .9, '5', .78), (3.5, .45, 'A', .7)]
    bl = parts.bass(at(A, 4) + at(A, 12) + at(B, 20) + at(A, 28), bass_pat, lo='E1', hi='D2', vel=.85)
    bl += parts.bass(outro_prog[:2], [(0, 3.5, 'R', .8)], lo='E1', hi='D2')
    s.notes('upright bass', sampler.upright_bass(), bl, level=-20, humanize_ms=8, duck=.18,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=2800, peaks=[(110, 2, .9)]), -20, 3, 15, 150))

    kit = drums.acoustic_kit('lofi')
    groove = {'k': 'x.........x..o..', 's': '....x.......x...', 'g': '.......g.g....g.',
              'h': 'x.o.x.o.x.ooxo.o'}
    groove_b = {'k': 'x......x..x.....', 's': '....x.......x..g', 'g': '..g....g.g......',
                'h': 'x.o.xoo.x.o.x.oo'}
    hits = []
    for section, start in (('a1', 4), ('a2', 12), ('a3', 28)):
        for b in range(8):
            g = groove if b % 4 != 3 else groove_b
            if section == 'a1' and b == 0:
                g = dict(g, h='..o.x.o.x.o.x.o.')
            hits += drums.loop(g, 1, start + b)
        hits += drums.grid('......o.o.oog.o.', 'g', (start + 7) * 4)   # snare pickup into the next phrase
    for b in range(8):                         # bridge: rim clicks, sparse kick, ride
        hits += drums.loop({'k': 'x.........x.....', 'x': '....x.......x...', 'ride': 'x...x.o.x...x.o.'}, 1, 20 + b)
    hits += [(36 * 4, 'k', .7), (36 * 4, 'ride', .5)]
    s.drums('kit', kit, hits, level=-21, late={'s': .014, 'g': .01}, reverb=.05,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=40, lp=9000, peaks=[(60, 2, 1.2), (3500, -2, 1)]), -18, 3.5, 8, 90, 2))

    s.audio('vinyl', lambda n, s: fx.vinyl(n, level=.01, seed=3), gain_db=-9)
    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 900), (s.sec(15.5, False), 900), (s.sec(16, False), 14000),
                                                            (s.sec(36 * 4, False), 14000), (s.sec(40 * 4, False) + 2, 1400)])
    s.master_chain = lambda a, s: fx.tape(fx.downsample(a, 30000), wow=.0018, drive=1.3, hiss=.0012)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
