"""Chrome Horizon: outrun synthwave, F# minor, 114 BPM.

Pumping 8th-note bass, a 16th arpeggio, Super Jupiter pad and a Classic Lead
hook. Verse (i-VI-III-VII), climbing pre-chorus (iv-VI-VII), chorus hook over
VI-VII-i-III. A drum-light bridge moves to Bm-C#m-D-E before the last chorus,
where the hook is doubled an octave up.
"""
from lucid_music import fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles import synthwave as sw


def build():
    s = Song('chrome-horizon', 'Chrome Horizon', bpm=114, key=6, mode='minor', genre='synthwave',
             energy=.7, period='night', textures=['synth', 'bass', 'pads', 'drums'], swing=.5,
             seed=31, space=dict(seconds=2.6, predelay=.03, damp=.4, bright=7500), delay_beats=.75)

    VERSE = progression('F#m | Dmaj7 | Amaj7 | E | F#m | Dmaj7 | Amaj7 | E')
    PRE = progression('Bm | D | E | E')
    CHORUS = progression('Dmaj7 | E | F#m | A | Dmaj7 | E | C#m | F#m')
    BRIDGE = progression('Bm | C#m | D | E | Bm | C#m | D | E')

    verse = """r:1 C#5:1/2 E5:1/2 F#5:1 E5:1/2 C#5:1/2 | D5:3/2 C#5:1/2 A4:2 |
               r:1 C#5:1/2 E5:1/2 A5:1 G#5:1/2 E5:1/2 | F#5:1 E5:1 B4:2 |
               r:1 C#5:1/2 E5:1/2 F#5:1 A5:1/2 G#5:1/2 | F#5:3/2 E5:1/2 D5:2 |
               r:1 E5:1/2 F#5:1/2 E5:1 C#5:1 | B4:2 G#4:1 B4:1"""
    pre = """D5:1/2 F#5:1/2 B5:1 A5:1/2 F#5:1/2 D5:1 | E5:1/2 F#5:1/2 A5:1 F#5:1/2 E5:1/2 D5:1 |
             E5:1/2 G#5:1/2 B5:1 C#6:1 D6:1 | E6:2 r:2"""
    hook = """r:1/2 F#5:1/2 A5:1/2 C#6:1 B5:1/2 A5:1/2 B5:1/2 | B5:3/2 G#5:1/2 E5:2 |
              r:1/2 F#5:1/2 A5:1/2 C#6:1 E6:1/2 C#6:1/2 B5:1/2 | C#6:2 B5:1 A5:1 |
              r:1/2 F#5:1/2 A5:1/2 C#6:1 B5:1/2 A5:1/2 B5:1/2 | B5:1 D6:1/2 C#6:1/2 B5:1 G#5:1 |
              G#5:1 A5:1/2 B5:1/2 C#6:1 E6:1 | C#6:1 B5:1/2 A5:1/2 F#5:2"""
    bridge = """F#5:2 D5:2 | E5:2 G#5:2 | A5:3 F#5:1 | G#5:2 B5:2 |
                D6:2 B5:2 | C#6:2 E6:2 | F#6:2 E6:1 D6:1 | E6:2 B5:2"""

    # Form (bars): intro 8 | verse 8 | pre 4 | chorus 8 | interlude 4 | verse 8 | pre 4 |
    #              chorus 8 | bridge 8 | chorus 8 | outro 8
    form = [('intro', 0, 8), ('verse', 8, 8), ('pre-chorus', 16, 4), ('chorus', 20, 8), ('interlude', 28, 4),
            ('verse', 32, 8), ('pre-chorus', 40, 4), ('chorus', 44, 8), ('bridge', 52, 8), ('chorus', 60, 8),
            ('outro', 68, 8)]
    for name, b, n in form:
        s.section(name, b, n)
    s.length_beats = 76 * 4

    I = progression('F#m | Dmaj7 | Amaj7 | E')
    harmony = (sw.at(VERSE, 0) + sw.at(VERSE, 8) + sw.at(PRE, 16) + sw.at(CHORUS, 20) + sw.at(I, 28)
               + sw.at(VERSE, 32) + sw.at(PRE, 40) + sw.at(CHORUS, 44) + sw.at(BRIDGE, 52) + sw.at(CHORUS, 60)
               + sw.at(VERSE, 68))
    s.harmony = harmony

    # Lead
    lead = (melody(verse, 8 * 4, vel=.72) + melody(pre, 16 * 4, vel=.78) + melody(hook, 20 * 4, vel=.85)
            + melody(verse, 32 * 4, vel=.74) + melody(pre, 40 * 4, vel=.8) + melody(hook, 44 * 4, vel=.86)
            + melody(hook, 60 * 4, vel=.88))
    s.notes('lead', ('surge', 'Classic Lead 1'), lead, level=-20.5, reverb=.16, delay=.14, humanize_ms=3,
            chain=lambda a, s: sw.lead_chain(a, s, lp=8500))
    octave = melody(hook, 60 * 4, octave_shift=1, vel=.6)
    s.notes('lead 8va', ('surge', 'Sine Lead'), octave, level=-27, reverb=.25, delay=.2, humanize_ms=3,
            chain=lambda a, s: fx.eq(a, hp=500, lp=9000))
    s.notes('bridge lead', ('surge', 'Butter'), melody(bridge, 52 * 4, vel=.7), level=-22, reverb=.3, delay=.25,
            humanize_ms=3, chain=lambda a, s: sw.lead_chain(a, s))

    # Pads (whole song; the music-bus filter opens the intro)
    pad_prog = harmony
    s.notes('pad', ('surge', 'Super Jupiter'), parts.pad(pad_prog, 'A3', 'E5', 4, .62), level=-26, duck=.35,
            reverb=.12, chain=lambda a, s: sw.pad_chain(a, s))

    # 16th arpeggio: from bar 4 in the intro, out in verses' first halves for space
    arp_spans = [(4, 8), (16, 32), (40, 52), (52, 68), (68, 74)]
    arp_prog = [c for c in harmony if any(a * 4 <= c[0] < b * 4 for a, b in arp_spans)]
    arp = parts.arp(arp_prog, order=(0, 1, 2, 3, 4, 3, 2, 1), step=.25, lo='C#4', hi='A5', n=3, vel=.55,
                    gate=.6, accents=(1, .7, .8, .7))
    s.notes('arp', ('surge', 'Diamonds'), arp, level=-27, duck=.2, delay=.1, reverb=.08, humanize_ms=0,
            chain=sw.arp_chain)

    # Bass: pumping from the verse; long roots in the bridge
    pump = [c for c in harmony if 8 * 4 <= c[0] < 52 * 4 or 60 * 4 <= c[0] < 72 * 4]
    bass = sw.pump_bass(pump, lo='E2', hi='D#3')
    bass += parts.bass(sw.at(BRIDGE, 52), [(0, 1.8, 'R', .85), (2, 1.8, 'R', .7)], 'E2', 'D#3')
    bass += parts.bass(sw.at(progression('F#m'), 72), [(0, 3.8, 'R', .7)], 'E2', 'D#3')
    s.notes('bass', ('surge', 'Rubber Bass'), bass, level=-21.5, duck=.3, humanize_ms=2, chain=sw.bass_chain)

    # Drums
    hits = sw.section('pulse', 4, 4, fill='lift', crash=False, every=4)
    hits += sw.section('drive', 8, 8)
    hits += sw.section('drive', 16, 4, fill='roll', every=4)
    hits += sw.section('four_open', 20, 8)
    hits += sw.section('four', 28, 4, every=4)
    hits += sw.section('drive', 32, 8)
    hits += sw.section('drive', 40, 4, fill='roll', every=4)
    hits += sw.section('four_open', 44, 8)
    hits += sw.section('half', 52, 8, fill='lift', every=8)
    hits += sw.section('four_open', 60, 8)
    hits += sw.section('pulse', 68, 4, fill=None, crash=True)
    hits.append((72 * 4, 'crash', .5))
    hits = sw.layer_808(hits)
    rest, snare = sw.split_snares(hits)
    kit = sw.kit('mid')
    ride = lambda a, s: fx.automate(a, [(0, -9), (s.sec(4 * 4, False), -9), (s.sec(8 * 4 - .5, False), 0),
                                        (s.sec(68 * 4, False), 0), (s.sec(72 * 4, False), -5)])
    s.drums('drums', kit, rest, level=-23.5, chain=lambda a, s: ride(sw.drums_chain(a, s), s), humanize_ms=2)
    s.drums('snare', kit, snare, level=-26.5, chain=sw.snare_chain, humanize_ms=2, reverb=.06)

    s.bus_chain['music'] = sw.sweep([(0, 500), (7.5, 2500), (8, 16000), (70, 16000), (76, 900), (78, 600)], s)
    s.master_chain = sw.outro_fade()
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
