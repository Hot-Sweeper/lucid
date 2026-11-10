"""Sunday Corduroy: neo-soul jazz-hop, Eb major, 90 BPM, swung 16ths.

Lush extended Rhodes chords with pushed anticipations, upright bass, a dusty
head-nod kit. Vibes and a high Rhodes trade 2-bar call and response in the
verses, then sing the hook together in octaves.
Form: intro 4 | verse 8 | verse (roles swapped) 8 | hook 8 | break 4 | verse 8 |
hook 8 | outro 4 (+ ring).
"""
from lucid_music import sampler, drums, fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody, voice, Note
from lucid_music.styles.jazz import at, comp_cells

INTRO = 'Abmaj9 | Gm9 C7b9 | Fm9 | Bb13sus4 Bb13'
VERSE = 'Abmaj9 | Gm9 C7b9 | Fm9 | Bb13sus4 Bb13 | Ebmaj9 | Dbmaj9 | Cm11 | Fm9 Bb13'
HOOK = 'Gbmaj9 | Fm11 | Ebmaj9 | Abmaj9 | Dbmaj9 | Cm9 | Fm9 | Bb13sus4 Bb7b9'
BREAK = 'Gbmaj9 | Fm11 | Ebmaj9 | Bb13sus4 Bb13'
OUTRO = 'Abmaj9 | Gm9 C7b9 | Fm9 Bb13sus4 | Ebmaj9 | Ebmaj9'

CALL1 = "r:1/2 Eb5:1/4 F5:1/4 G5:1 Eb5:1/2 C5:1/2 Bb4:1 | G5:1/2 F5:1/2 D5:1 E5:1 r:1 |"
ANS1 = "r:1 Ab5:1/4 G5:1/4 F5:1/2 C5:1 Eb5:1 | F5:1/2 Eb5:1/2 C5:1 D5:1/2 F5:1/2 Ab5:1 |"
CALL2 = "r:1/2 Bb4:1/4 C5:1/4 D5:1 Bb4:1/2 G4:1/2 F4:1 | F5:1/2 Eb5:1/2 C5:1 Ab4:1 r:1 |"
ANS2 = "r:1 G5:1/4 F5:1/4 Eb5:1/2 Bb4:1 C5:1 | Ab5:1/2 G5:1/2 F5:1 D5:1/2 C5:1/2 Bb4:1 |"
HOOK_MEL = """Bb5:3/2 Ab5:1/2 F5:1 Db5:1 | Eb5:2 r:1/2 F5:1/2 G5:1/2 Ab5:1/2 | G5:3/2 F5:1/2 D5:1 Bb4:1 |
              C5:2 r:1/2 Eb5:1/2 G5:1/2 Bb5:1/2 | C6:3/2 Ab5:1/2 F5:1 Eb5:1 | D5:2 r:1/2 Eb5:1/2 G5:1/2 Bb5:1/2 |
              Ab5:3/2 G5:1/2 F5:1 C5:1 | Eb5:1 C5:1 D5:1 B4:1 |"""
BREAK_MEL = "Bb5:3/2 Ab5:1/2 F5:2 | r:4 | G5:3/2 F5:1/2 D5:2 | r:4 |"
OUT_MEL = "r:1/2 Eb5:1/4 F5:1/4 G5:1 Eb5:1/2 C5:1/2 Bb4:1 | G5:1/2 F5:1/2 D5:1 E5:1 r:1 | r:4 | G5:6 r:2 |"


def harmony():
    p = progression
    return (at(p(INTRO), 0) + at(p(VERSE), 4) + at(p(VERSE), 12) + at(p(HOOK), 20) + at(p(BREAK), 28)
            + at(p(VERSE), 32) + at(p(HOOK), 40) + at(p(OUTRO), 48))


def verse(start_bar, first, second):
    """first plays the calls, second the answers."""
    a, b = [], []
    a += melody(CALL1, start_bar * 4, vel=.76); b += melody(ANS1, (start_bar + 2) * 4, vel=.74)
    a += melody(CALL2, (start_bar + 4) * 4, vel=.76); b += melody(ANS2, (start_bar + 6) * 4, vel=.74)
    first += a
    second += b


def leads():
    vib, rh = [], []
    verse(4, vib, rh)
    verse(12, rh, vib)
    vib += melody(HOOK_MEL, 20 * 4, vel=.78); rh += melody(HOOK_MEL, 20 * 4, octave_shift=-1, vel=.62)
    vib += melody(BREAK_MEL, 28 * 4, vel=.6)
    verse(32, vib, rh)
    vib += melody(HOOK_MEL, 40 * 4, vel=.8); rh += melody(HOOK_MEL, 40 * 4, octave_shift=-1, vel=.66)
    vib += melody(OUT_MEL, 48 * 4, vel=.62)
    return vib, rh


def build():
    s = Song('sunday-corduroy', 'Sunday Corduroy', bpm=90, key=3, mode='major', genre='jazz', energy=.38,
             period='evening', textures=['piano', 'mallets', 'bass', 'drums'], swing=.6, swing_unit=.25,
             seed=58, space=dict(seconds=2.2, predelay=.03, damp=.6, bright=5500), delay_beats=.75)
    s.section('intro', 0, 4); s.section('verse', 4, 8); s.section('verse (traded)', 12, 8)
    s.section('hook', 20, 8); s.section('break', 28, 4); s.section('verse', 32, 8)
    s.section('hook', 40, 8); s.section('outro', 48, 5)
    s.length_beats = 53 * 4
    prog = harmony()

    cells = [[(0, 1.9, .95), (2, 1.4, .85), (3.75, .25, .6, True)],
             [(0, 1.4, .95), (1.75, .25, .6, True), (2, 1.9, .85)],
             [(0, 3.4, .95), (3.5, .45, .65, True)],
             [(0, 1.9, .95), (2.5, 1.4, .8)]]
    order = [0, 1, 2, 3]
    comp = comp_cells(prog[:-1], cells, lo='Bb2', hi='G4', n=5, vel=.5, rootless=True, order=order, spread=.012)
    comp += [Note(prog[-1][0] + i * .02, 6, p, .48) for i, p in enumerate(voice(prog[-1][2], 'Bb2', 'G4', 5))]
    s.notes('rhodes chords', sampler.rhodes(), comp, level=-24, reverb=.14, duck=.2, humanize_ms=7,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=110, lp=6800, peaks=[(400, -2, .9)]), rate=.35, depth=.14, mix=.3))

    vib, rh = leads()
    s.notes('vibes', sampler.vibraphone(), vib, level=-21.5, reverb=.22, delay=.08, humanize_ms=9,
            chain=lambda a, s: fx.eq(a, hp=230, lp=8500))
    s.notes('rhodes lead', sampler.rhodes(), rh, level=-22, reverb=.16, delay=.06, humanize_ms=9,
            chain=lambda a, s: fx.eq(a, hp=180, lp=7500))

    pat = [(0, 1.4, 'R', 1), (1.75, .25, 'R', .6), (2.5, .9, '5', .75), (3.5, .45, 'A', .65)]
    in_break = lambda c: 28 * 4 <= c[0] < 32 * 4
    bl = parts.bass([c for c in prog if 4 * 4 <= c[0] < 51 * 4 and not in_break(c)], pat, lo='Eb1', hi='Eb2', vel=.82)
    bl += parts.bass([c for c in prog if in_break(c)], [(0, 3.8, 'R', .7)], lo='Eb1', hi='Eb2')
    bl += [Note(51 * 4, 6, 27, .7)]
    s.notes('upright bass', sampler.upright_bass(), bl, level=-19.5, humanize_ms=8, duck=.15,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=35, lp=2600, peaks=[(90, 2, .9)]), -20, 3, 12, 140))

    kit = drums.acoustic_kit('lofi')
    groove = {'k': 'x......x..x.....', 's': '....x.......x...', 'g': '..g....g.g....g.', 'h': 'x.oxx.o.x.oxx.o.'}
    groove4 = dict(groove, k='x......x..x..x..')
    fill = dict(groove, s='....x...g.g.xgxg', g='................')
    hits = []
    for b in range(4, 50):
        if 28 <= b < 32:                                  # break: hats and rim only
            hits += drums.loop({'h': 'x...o...x...o...', 'x': '....o.......o...'}, 1, b)
            continue
        phrase = (b - 4) % 8
        g = fill if phrase == 7 else groove4 if phrase == 3 else groove
        hits += drums.loop(g, 1, b)
    hits += [(50 * 4, 'k', .6), (50 * 4, 'ride', .4)]
    s.drums('kit', kit, hits, level=-20.5, late={'s': .018, 'g': .012}, reverb=.05,
            chain=lambda a, s: fx.comp(fx.eq(a, hp=40, lp=9000, peaks=[(60, 2, 1.2), (3500, -2, 1)]), -18, 3, 8, 90, 1.5))

    s.audio('vinyl', lambda n, s: fx.vinyl(n, level=.008, seed=7), gain_db=-11)
    end = s.sec(53 * 4, False)
    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(a, [(0, 1000), (s.sec(14, False), 1000), (s.sec(16, False), 15000),
                                                            (s.sec(48 * 4, False), 15000), (end + 2, 1500)])
    s.master_chain = lambda a, s: fx.tape(a, wow=.0011, drive=1.2)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
