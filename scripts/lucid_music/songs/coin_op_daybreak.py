"""Coin-Op Daybreak: bright synth-pop synthwave, A major, 120 BPM.

An arcade-at-sunrise anthem. Verse over I-V/3-vi-IV with offbeat poly skanks,
a rising pre-chorus, and a hook over IV-V-iii-vi that leaps up to the sixth.
The bridge borrows bVI-bVII (F, G) for a sun-coming-up lift before the last
chorus, which is doubled an octave below.
"""
from lucid_music import fx, parts, drums
from lucid_music.song import Song
from lucid_music.theory import progression, melody, offset
from lucid_music.styles import synthwave as sw


def build():
    s = Song('coin-op-daybreak', 'Coin-Op Daybreak', bpm=120, key=9, mode='major', genre='synthwave',
             energy=.68, period='morning', textures=['synth', 'pads', 'plucked', 'bass', 'drums'], swing=.5,
             seed=71, space=dict(seconds=2.6, predelay=.03, damp=.4, bright=7800), delay_beats=.75)

    VERSE = progression('A | E/G# | F#m7 | Dmaj7 | A | E/G# | Dmaj7 | Esus4 E')
    PRE = progression('Bm7 | C#m7 | Dmaj7 | E')
    CHORUS = progression('Dmaj7 | E | C#m7 | F#m7 | Dmaj7 | E | A | A')
    BRIDGE = progression('Fmaj7 | G6 | Asus4 | A | F#m7 | Dmaj7 | Bm7 | Esus4 E')
    INTRO = progression('Dmaj7 | E | C#m7 | F#m7')

    verse = """r:1/2 E5:1/2 C#5:1/2 E5:1/2 F#5:1 E5:1 | B4:1/2 C#5:1/2 B4:1 G#4:2 |
               r:1/2 E5:1/2 C#5:1/2 E5:1/2 A5:1 F#5:1 | E5:3/2 D5:1/2 C#5:2 |
               r:1/2 E5:1/2 C#5:1/2 E5:1/2 F#5:1 E5:1 | B4:1/2 C#5:1/2 E5:1 G#5:2 |
               F#5:1 E5:1/2 D5:1/2 C#5:1 A4:1 | B4:2 G#4:1 B4:1"""
    pre = """D5:1/2 C#5:1/2 B4:1 F#5:1 D5:1 | E5:1/2 C#5:1/2 G#4:1 G#5:1 E5:1 |
             F#5:1/2 E5:1/2 D5:1 A5:1 F#5:1 | G#5:1 A5:1/2 B5:1/2 B5:2"""
    hook = """r:1/2 A5:1/2 A5:1/2 F#5:1/2 A5:1 C#6:1 | B5:1 G#5:1/2 E5:1/2 B5:2 |
              r:1/2 G#5:1/2 G#5:1/2 E5:1/2 G#5:1 B5:1 | A5:3/2 G#5:1/2 F#5:2 |
              r:1/2 A5:1/2 A5:1/2 F#5:1/2 A5:1 D6:1 | B5:1 C#6:1/2 B5:1/2 G#5:1 E6:1 |
              C#6:2 r:1/2 B5:1/2 A5:1 | A5:2 r:2"""
    bridge = """C5:1 E5:1 A5:2 | B4:1 D5:1 G5:2 | E5:1 D5:1 A4:2 | C#5:4 |
                C#5:1 E5:1 A5:2 | F#5:2 E5:1 C#5:1 | D5:1 F#5:1 B5:2 | A5:2 G#5:2"""
    teaser = """r:1/2 A5:1/2 A5:1/2 F#5:1/2 A5:1 C#6:1 | B5:1 G#5:1/2 E5:1/2 B5:2 |
                r:1/2 G#5:1/2 G#5:1/2 E5:1/2 G#5:1 B5:1 | A5:4"""

    form = [('intro', 0, 8), ('verse', 8, 8), ('pre-chorus', 16, 4), ('chorus', 20, 8), ('interlude', 28, 4),
            ('verse', 32, 8), ('pre-chorus', 40, 4), ('chorus', 48 - 4, 8), ('bridge', 52, 8),
            ('chorus', 60, 8), ('outro', 68, 8)]
    for name, b, n in form:
        s.section(name, b, n)
    s.length_beats = 76 * 4

    harmony = (sw.at(INTRO, 0) + sw.at(INTRO, 4) + sw.at(VERSE, 8) + sw.at(PRE, 16) + sw.at(CHORUS, 20)
               + sw.at(INTRO, 28) + sw.at(VERSE, 32) + sw.at(PRE, 40) + sw.at(CHORUS, 44) + sw.at(BRIDGE, 52)
               + sw.at(CHORUS, 60) + sw.at(INTRO, 68) + sw.at(INTRO, 72))
    s.harmony = harmony
    chorus_spans = ((20, 28), (44, 52), (60, 68))
    verse_spans = ((8, 20), (32, 44))

    lead = (melody(verse, 8 * 4, vel=.74) + melody(pre, 16 * 4, vel=.8) + melody(hook, 20 * 4, vel=.86)
            + melody(verse, 32 * 4, vel=.76) + melody(pre, 40 * 4, vel=.82) + melody(hook, 44 * 4, vel=.87)
            + melody(hook, 60 * 4, vel=.9))
    s.lead_notes = lead
    s.notes('lead', ('surge', 'Lera'), lead, level=-20.5, reverb=.15, delay=.14, humanize_ms=3,
            chain=lambda a, s: sw.lead_chain(a, s, lp=9000))
    # Last chorus: the same line on a patch that sounds an octave lower.
    s.notes('lead low double', ('surge', 'Simpler Times'), melody(hook, 60 * 4, vel=.7), level=-26,
            reverb=.12, humanize_ms=3, chain=lambda a, s: fx.eq(a, hp=180, lp=6000))
    s.notes('teaser', ('surge', 'Retrofit'), melody(teaser, 4 * 4, vel=.6), level=-24, reverb=.2, delay=.2,
            humanize_ms=2, chain=sw.arp_chain)
    s.notes('bridge pluck', ('surge', 'Retrofit'), melody(bridge, 52 * 4, vel=.72), level=-21.5, reverb=.25,
            delay=.22, humanize_ms=2, chain=sw.arp_chain)

    s.notes('pad', ('surge', 'Juno-60 Strings'), parts.pad(harmony, 'A3', 'E5', 4, .55), level=-27, duck=.3,
            reverb=.12, chain=lambda a, s: sw.pad_chain(a, s, .85))

    verse_prog = [c for c in harmony if any(a * 4 <= c[0] < b * 4 for a, b in verse_spans)]
    skank = parts.comp(verse_prog, [(.5, .3, 1), (1.5, .3, .78), (2.5, .3, 1), (3.5, .3, .78)],
                       lo='C#4', hi='A5', n=4, vel=.55)
    s.notes('offbeat stabs', ('surge', 'Smooth Stabs'), skank, level=-27, duck=.15, reverb=.1, humanize_ms=1,
            chain=lambda a, s: fx.eq(a, hp=350, lp=8000, peaks=[(700, -2, 1)]))
    chorus_prog = [c for c in harmony if any(a * 4 <= c[0] < b * 4 for a, b in chorus_spans)]
    pump = parts.comp(chorus_prog, [(i * .5, .34, 1. if i % 2 == 0 else .74) for i in range(8)],
                      lo='C#4', hi='A5', n=4, vel=.58)
    s.notes('poly pump', ('surge', 'Fast Poly'), pump, level=-27.5, duck=.3, reverb=.1, humanize_ms=1,
            chain=lambda a, s: fx.eq(a, hp=300, lp=8500, peaks=[(600, -2, 1)]))

    arp_prog = [c for c in harmony if 4 * 4 <= c[0] < 8 * 4 or any(a * 4 <= c[0] < b * 4 for a, b in chorus_spans)
                or 68 * 4 <= c[0] < 74 * 4]
    arp = sw.arp(arp_prog, order=(0, 1, 2, 3, 4, 3, 2, 1), step=.25, lo='E4', hi='C#6', n=4, vel=.5, gate=.5,
                 accents=(1, .62, .8, .62))
    s.notes('arp', ('surge', 'Retrofit'), arp, level=-29, duck=.2, delay=.06, reverb=.06, humanize_ms=0,
            chain=lambda a, s: fx.eq(a, hp=450, lp=8000, peaks=[(3000, -2, .8)]))

    # Bass 3 sounds an octave below the written note.
    pumped = [c for c in harmony if 8 * 4 <= c[0] < 52 * 4 or 60 * 4 <= c[0] < 68 * 4]
    bass = sw.pump_bass(pumped, lo='E2', hi='D#3')
    bass += parts.bass(sw.at(BRIDGE, 52), [(0, 1.8, 'R', .85), (2, 1.5, 'R', .72), (3.5, .45, '5', .7)], 'E2', 'D#3')
    bass += parts.bass(sw.at(INTRO, 68), [(0, 3.5, 'R', .75)], 'E2', 'D#3')
    s.notes('bass', ('surge', 'Bass 3'), bass, level=-21.5, duck=.3, humanize_ms=2,
            chain=lambda a, s: sw.bass_chain(fx.eq(a, lp=3800), s))

    hits = sw.section('pulse', 4, 4, fill='lift', crash=False, every=4)
    hits += sw.section('drive', 8, 8)
    hits += sw.section('drive', 16, 4, fill='roll', every=4)
    hits += sw.section('four_open', 20, 8)
    hits += sw.section('pulse', 28, 4, fill='lift', crash=False, every=4)
    hits += sw.section('drive', 32, 8)
    hits += sw.section('drive', 40, 4, fill='roll', every=4)
    hits += sw.section('four_open', 44, 8)
    hits += sw.section('half', 52, 7, fill=None)
    hits += sw.bar_hits('half', 59, fill='lift')
    hits += sw.section('four_open', 60, 8)
    hits += sw.section('pulse', 68, 4, fill=None, crash=True)
    for a, b in chorus_spans:
        hits += [(beat, 'tamb', v * .8) for beat, p, v in drums.loop({'tamb': '..x...x...x...x.'}, b - a, a)]
    hits = sw.layer_808(hits, .5)
    rest, snare = sw.split_snares(hits)
    kit = sw.kit('mid', tune=52, decay=.28)
    ride = lambda a, s: fx.automate(a, [(0, -9), (s.sec(16, False), -9), (s.sec(32 - .5, False), 0),
                                        (s.sec(52 * 4 - .5, False), 0), (s.sec(52 * 4, False), -3),
                                        (s.sec(60 * 4 - .5, False), -3), (s.sec(60 * 4, False), 0),
                                        (s.sec(68 * 4, False), 0), (s.sec(72 * 4, False), -6)])
    s.drums('drums', kit, rest, level=-23.5, chain=lambda a, s: ride(sw.drums_chain(a, s), s), humanize_ms=2)
    s.drums('snare', kit, snare, level=-27, chain=sw.snare_chain, humanize_ms=2, reverb=.06)

    s.bus_chain['music'] = sw.sweep([(0, 700), (7.5, 3000), (8, 16000), (70, 16000), (76, 900), (78, 600)], s)
    s.master_chain = sw.outro_fade()
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
