"""Last Light Promenade: sunset synthwave anthem, C major, 104 BPM, lifting to D.

Verse vi-IV-I-V, rising pre-chorus, a big hook over IV-V-iii-vi. Pumping
Jupiter-8 chords and a Hasselhoff pluck drive the chorus. The bridge turns
through Bbmaj7 to A7sus4-A7, and the last chorus lifts a whole step into D.
"""
from lucid_music import fx, parts, drums
from lucid_music.song import Song
from lucid_music.theory import progression, melody, offset
from lucid_music.styles import synthwave as sw


def build():
    s = Song('last-light-promenade', 'Last Light Promenade', bpm=104, key=0, mode='major', genre='synthwave',
             energy=.65, period='evening', textures=['synth', 'pads', 'plucked', 'bass', 'drums'], swing=.5,
             seed=59, space=dict(seconds=2.8, predelay=.03, damp=.4, bright=7500), delay_beats=.75)

    VERSE = progression('Am | Fmaj7 | Cmaj7 | G | Am | Fmaj7 | Cmaj7 | G')
    PRE = progression('Dm7 | Em7 | Fmaj7 | G')
    CHORUS = progression('Fmaj7 | G6 | Em7 | Am7 | Dm7 | G | C | C')
    BRIDGE = progression('Am7 | Fmaj7 | Cmaj7 | G | Am7 | Fmaj7 | Bbmaj7 | A7sus4:2 A7:2')
    CHORUS_D = progression('Gmaj7 | A6 | F#m7 | Bm7 | Em7 | A | D | D')
    INTRO = progression('Fmaj7 | G6 | Em7 | Am7')
    OUTRO = progression('Gmaj7 | A6 | F#m7 | Bm7 | Gmaj7 | A6 | D | D')

    verse = """r:1/2 A4:1/2 C5:1/2 E5:1 D5:1/2 C5:1 | A4:1 C5:1/2 F5:1/2 E5:2 |
               r:1/2 G4:1/2 C5:1/2 E5:1 D5:1/2 C5:1 | D5:3/2 B4:1/2 G4:2 |
               r:1/2 A4:1/2 C5:1/2 E5:1 G5:1/2 E5:1 | A5:1 G5:1/2 F5:1/2 E5:2 |
               r:1/2 E5:1/2 G5:1/2 C6:1 B5:1/2 G5:1 | A5:1 G5:1 D5:2"""
    pre = """F5:1/2 E5:1/2 D5:1 A5:1 F5:1 | G5:1/2 E5:1/2 B4:1 D5:1 E5:1 |
             A5:1/2 G5:1/2 F5:1 C6:1 A5:1 | B5:1 C6:1/2 D6:1/2 D6:2"""
    hook = """r:1/2 C6:1/2 E6:1 D6:1/2 C6:1/2 A5:1 | B5:3/2 D6:1/2 E6:2 |
              r:1/2 B5:1/2 D6:1 B5:1/2 A5:1/2 G5:1 | A5:3/2 C6:1/2 E6:2 |
              r:1/2 A5:1/2 D6:1 C6:1/2 A5:1/2 F5:1 | G5:1 A5:1/2 B5:1/2 D6:2 |
              E6:3/2 D6:1/2 C6:2 | G5:1 A5:1/2 G5:1/2 E5:2"""
    bridge = """E5:2 G5:2 | A5:3 G5:1 | G5:2 E5:2 | D5:4 |
                C6:2 G5:1 A5:1 | A5:2 C6:2 | D6:2 A5:2 | D6:2 C#6:2"""

    form = [('intro', 0, 8), ('verse', 8, 8), ('pre-chorus', 16, 4), ('chorus', 20, 8), ('interlude', 28, 4),
            ('verse', 32, 8), ('pre-chorus', 40, 4), ('chorus', 44, 8), ('bridge', 52, 8),
            ('chorus (lift to D)', 60, 8), ('outro', 68, 8)]
    for name, b, n in form:
        s.section(name, b, n)
    s.length_beats = 76 * 4

    harmony = (sw.at(INTRO, 0) + sw.at(INTRO, 4) + sw.at(VERSE, 8) + sw.at(PRE, 16) + sw.at(CHORUS, 20)
               + sw.at(INTRO, 28) + sw.at(VERSE, 32) + sw.at(PRE, 40) + sw.at(CHORUS, 44) + sw.at(BRIDGE, 52)
               + sw.at(CHORUS_D, 60) + sw.at(OUTRO, 68))
    s.harmony = harmony
    chorus_spans = ((20, 28), (44, 52), (60, 68))

    lead = (melody(verse, 8 * 4, vel=.72) + melody(pre, 16 * 4, vel=.78) + melody(hook, 20 * 4, vel=.85)
            + melody(verse, 32 * 4, vel=.74) + melody(pre, 40 * 4, vel=.8) + melody(hook, 44 * 4, vel=.86)
            + offset(melody(hook, 60 * 4, vel=.88), semis=2))
    s.lead_notes = lead
    s.notes('lead', ('surge', 'Classic Lead 2'), lead, level=-20.5, reverb=.16, delay=.15, humanize_ms=3,
            chain=lambda a, s: sw.lead_chain(a, s, lp=8500))
    s.notes('lead 8va', ('surge', 'Sine Lead'), offset(melody(hook, 60 * 4, octave_shift=1, vel=.55), semis=2),
            level=-27, reverb=.25, delay=.2, humanize_ms=3, chain=lambda a, s: fx.eq(a, hp=600, lp=9000))
    s.notes('bridge bell', ('surge', 'Bell 1'), melody(bridge, 52 * 4, vel=.7), level=-22, reverb=.3, delay=.22,
            humanize_ms=3, chain=lambda a, s: fx.eq(a, hp=300, lp=9000))

    s.notes('pad', ('surge', 'Super Jupiter'), parts.pad(harmony, 'A3', 'E5', 4, .6), level=-26.5, duck=.35,
            reverb=.12, chain=lambda a, s: sw.pad_chain(a, s))
    stab_prog = [c for c in harmony if any(a * 4 <= c[0] < b * 4 for a, b in chorus_spans)]
    stabs = parts.comp(stab_prog, [(i * .5, .32, 1. if i % 2 == 0 else .72) for i in range(8)],
                       lo='C4', hi='G5', n=4, vel=.6)
    s.notes('poly stabs', ('surge', 'Jupiter-8'), stabs, level=-27, duck=.3, reverb=.1, humanize_ms=1,
            chain=lambda a, s: fx.eq(a, hp=300, lp=8500, peaks=[(600, -2, 1)]))

    arp_prog = [c for c in harmony if 4 * 4 <= c[0] < 8 * 4 or 16 * 4 <= c[0] < 32 * 4 or 40 * 4 <= c[0] < 72 * 4]
    arp = sw.arp(arp_prog, order=(0, 2, 1, 3, 2, 4, 3, 5), step=.25, lo='E4', hi='C6', n=4, vel=.5, gate=.55,
                 accents=(1, .65, .8, .65))
    s.notes('pluck arp', ('surge', 'Hasselhoff'), arp, level=-28, duck=.2, delay=.08, reverb=.08, humanize_ms=0,
            chain=lambda a, s: fx.eq(a, hp=400, lp=7500, peaks=[(3000, -2, .8)]))

    pump = [c for c in harmony if 8 * 4 <= c[0] < 52 * 4 or 60 * 4 <= c[0] < 72 * 4]
    bass = sw.pump_bass(pump, lo='E2', hi='D#3')
    bass += parts.bass(sw.at(BRIDGE, 52), [(0, 1.8, 'R', .85), (2, 1.6, 'R', .7), (3.5, .45, '5', .7)], 'E2', 'D#3')
    s.notes('bass', ('surge', 'Lord Sawtooth'), bass, level=-21.5, duck=.3, humanize_ms=2,
            chain=lambda a, s: sw.bass_chain(fx.eq(a, lp=3500), s))

    hits = sw.section('pulse', 4, 4, fill='lift', crash=False, every=4)
    hits += sw.section('drive', 8, 8)
    hits += sw.section('drive', 16, 4, fill='roll', every=4)
    hits += sw.section('four_open', 20, 8)
    hits += sw.section('pulse', 28, 4, fill='lift', crash=False, every=4)
    hits += sw.section('drive', 32, 8)
    hits += sw.section('drive', 40, 4, fill='roll', every=4)
    hits += sw.section('four_open', 44, 8)
    hits += sw.section('half', 52, 7, fill=None)
    hits += sw.bar_hits('half', 59, fill='roll')
    hits += sw.section('four_open', 60, 8)
    hits += sw.section('pulse', 68, 4, fill=None, crash=True)
    for a, b in chorus_spans:
        hits += [(beat, 'tamb', v * .8) for beat, p, v in drums.loop({'tamb': '....x.......x...'}, b - a, a)]
    hits = sw.layer_808(hits, .55)
    rest, snare = sw.split_snares(hits)
    kit = sw.kit('mid', tune=50, decay=.3)
    ride = lambda a, s: fx.automate(a, [(0, -9), (s.sec(16, False), -9), (s.sec(32 - .5, False), 0),
                                        (s.sec(68 * 4, False), 0), (s.sec(72 * 4, False), -6)])
    s.drums('drums', kit, rest, level=-22, chain=lambda a, s: ride(sw.drums_chain(a, s), s), humanize_ms=2)
    s.drums('snare', kit, snare, level=-25.5, chain=sw.snare_chain, humanize_ms=2, reverb=.06)

    s.bus_chain['music'] = sw.sweep([(0, 600), (7.5, 2800), (8, 16000), (70, 16000), (76, 900), (78, 600)], s)
    s.master_chain = sw.outro_fade()
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
