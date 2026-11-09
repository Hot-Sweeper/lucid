"""Magenta Coastline: dreamwave / chillwave, D major, 96 BPM.

PPG pad bed, a VHS-tape pluck arpeggio, warm 'Butter' lead. The verse borrows
G minor 6 (iv) for a wistful turn; the chorus hook rides IV-V-iii-vi. The
bridge slips to Bb and C (bVI, bVII) in half time before the last chorus.
"""
from lucid_music import fx, parts
from lucid_music.song import Song
from lucid_music.theory import progression, melody
from lucid_music.styles import synthwave as sw


def build():
    s = Song('magenta-coastline', 'Magenta Coastline', bpm=96, key=2, mode='major', genre='synthwave',
             energy=.55, period='evening', textures=['synth', 'pads', 'plucked', 'bass', 'drums'], swing=.5,
             seed=47, space=dict(seconds=3.0, predelay=.035, damp=.45, bright=7000), delay_beats=.75)

    VERSE = progression('Dmaj9 | F#m7 | Gmaj9 | Gm6 | Dmaj9 | F#m7 | Em9 | A13')
    CHORUS = progression('Gmaj9 | A6 | F#m7 | Bm7 | Em9 | A13 | Dmaj9 | Dmaj9')
    BRIDGE = progression('Bbmaj9 | C6 | Dmaj9 | Dmaj9 | Bbmaj9 | C6 | Em9 | A13sus4:2 A13:2')
    INTRO = progression('Dmaj9 | F#m7 | Gmaj9 | Gm6')

    verse = """r:1 F#5:1/2 E5:1/2 F#5:1 A5:1 | A5:1 E5:1/2 C#5:1/2 E5:2 |
               r:1 D5:1/2 E5:1/2 F#5:1 A5:1 | G5:1 Bb4:1 D5:2 |
               r:1 F#5:1/2 E5:1/2 F#5:1 A5:1 | B5:1 A5:1/2 F#5:1/2 E5:2 |
               G5:1 F#5:1/2 E5:1/2 D5:1 B4:1 | C#5:2 E5:1 F#5:1"""
    hook = """B5:3/4 A5:3/4 F#5:1/2 A5:2 | r:1/2 E5:1/2 A5:1/2 C#6:1 B5:1/2 A5:1 |
              C#6:3/4 B5:3/4 A5:1/2 C#6:2 | r:1/2 D6:1/2 C#6:1/2 B5:1 A5:1/2 F#5:1 |
              G5:3/4 F#5:3/4 E5:1/2 B5:2 | r:1/2 A5:1/2 C#6:1/2 E6:1 D6:1/2 C#6:1 |
              D6:1 C#6:1/2 A5:1/2 F#5:2 | E5:1 F#5:1 A5:2"""
    bridge = """D6:2 C6:1 A5:1 | G5:2 E5:2 | F#5:3 E5:1 | A5:4 |
                F6:2 D6:1 C6:1 | E6:2 G5:2 | F#5:2 G5:1 B5:1 | D6:2 C#6:2"""

    form = [('intro', 0, 8), ('verse', 8, 8), ('chorus', 16, 8), ('interlude', 24, 4), ('verse', 28, 8),
            ('chorus', 36, 8), ('bridge', 44, 8), ('chorus', 52, 8), ('outro', 60, 8)]
    for name, b, n in form:
        s.section(name, b, n)
    s.length_beats = 68 * 4

    harmony = (sw.at(INTRO, 0) + sw.at(INTRO, 4) + sw.at(VERSE, 8) + sw.at(CHORUS, 16) + sw.at(INTRO, 24)
               + sw.at(VERSE, 28) + sw.at(CHORUS, 36) + sw.at(BRIDGE, 44) + sw.at(CHORUS, 52)
               + sw.at(INTRO, 60) + sw.at(INTRO, 64))
    s.harmony = harmony

    lead = (melody(verse, 8 * 4, vel=.7) + melody(hook, 16 * 4, vel=.8) + melody(verse, 28 * 4, vel=.72)
            + melody(hook, 36 * 4, vel=.82) + melody(hook, 52 * 4, vel=.84))
    s.notes('lead', ('surge', 'Butter'), lead, level=-21, reverb=.2, delay=.16, humanize_ms=4,
            chain=lambda a, s: sw.lead_chain(a, s, lp=8000))
    # Last chorus: a soft octave shadow on the hook
    s.notes('hook 8va', ('surge', 'Sine Lead'), melody(hook, 52 * 4, octave_shift=1, vel=.55), level=-28,
            reverb=.3, delay=.2, humanize_ms=4, chain=lambda a, s: fx.eq(a, hp=600, lp=9000))
    s.notes('bridge lead', ('surge', 'Sine Lead'), melody(bridge, 44 * 4, vel=.7), level=-22, reverb=.32,
            delay=.25, humanize_ms=4, chain=lambda a, s: fx.eq(a, hp=250, lp=8000))

    s.notes('pad', ('surge', 'PPG Dreams'), parts.pad(harmony, 'A3', 'E5', 4, .6), level=-26, duck=.3,
            reverb=.15, chain=lambda a, s: sw.pad_chain(a, s, .9))
    strings = [c for c in harmony if 16 * 4 <= c[0] < 24 * 4 or 36 * 4 <= c[0] < 44 * 4 or 52 * 4 <= c[0] < 60 * 4]
    s.notes('strings', ('surge', 'Juno-60 Strings'), parts.pad(strings, 'D4', 'A5', 3, .55), level=-29,
            duck=.25, reverb=.2, chain=lambda a, s: fx.eq(a, hp=350, lp=8000))

    # Pluck arpeggio in 8ths; rests in the first half of each verse for space
    arp_prog = [c for c in harmony if not (8 * 4 <= c[0] < 12 * 4 or 28 * 4 <= c[0] < 32 * 4)]
    arp = sw.arp(arp_prog, order=(0, 2, 1, 3, 2, 4, 3, 1), step=.5, lo='A3', hi='E5', n=4, vel=.55, gate=.7,
                 accents=(1, .75, .85, .75))
    s.notes('pluck', ('surge', 'VHS Soundtrack'), arp, level=-26, duck=.2, delay=.08, reverb=.1, humanize_ms=2,
            chain=sw.arp_chain)

    bass_pat = [(0, 1.4, 'R', 1), (1.5, .45, 'R', .78), (2.5, .9, '5', .85), (3.5, .45, '8', .72)]
    groove = [c for c in harmony if 8 * 4 <= c[0] < 44 * 4 or 52 * 4 <= c[0] < 64 * 4]
    bass = parts.bass(groove, bass_pat, 'D2', 'C#3')
    bass += parts.bass(sw.at(BRIDGE, 44), [(0, 3.8, 'R', .8)], 'D2', 'C#3')
    s.notes('bass', ('surge', 'Bass 2'), bass, level=-21, duck=.25, humanize_ms=3, chain=sw.bass_chain)

    hits = sw.section('pulse', 4, 4, fill=None, crash=False)
    hits += sw.section('drive', 8, 8)
    hits += sw.section('four_open', 16, 8)
    hits += sw.section('pulse', 24, 4, fill='lift', crash=False, every=4)
    hits += sw.section('drive', 28, 8)
    hits += sw.section('four_open', 36, 8)
    hits += sw.section('half', 44, 8, fill='lift')
    hits += sw.section('four_open', 52, 8)
    hits += sw.section('pulse', 60, 4, fill=None, crash=True)
    shaker = []
    for a, b in ((16, 24), (36, 44), (52, 60)):
        shaker += [(beat, 'shaker', v) for beat, p, v in
                   __import__('lucid_music.drums', fromlist=['loop']).loop({'shaker': 'xoooxoooxoooxooo'}, b - a, a)]
    hits = sw.layer_808(hits, .45) + shaker
    rest, snare = sw.split_snares(hits)
    kit = sw.kit('mid', tune=52, decay=.28)
    ride = lambda a, s: fx.automate(a, [(0, -10), (s.sec(16, False), -10), (s.sec(32 - .5, False), -1),
                                        (s.sec(60 * 4, False), -1), (s.sec(64 * 4, False), -7)])
    s.drums('drums', kit, rest, level=-22.5, chain=lambda a, s: ride(sw.drums_chain(a, s), s), humanize_ms=3)
    s.drums('snare', kit, snare, level=-27, chain=lambda a, s: sw.snare_chain(a, s, mix=.6, gate=.3),
            humanize_ms=3, reverb=.08)

    s.bus_chain['music'] = sw.sweep([(0, 700), (7.5, 3000), (8, 16000), (62, 16000), (68, 900), (70, 600)], s)
    s.master_chain = sw.outro_fade()
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
