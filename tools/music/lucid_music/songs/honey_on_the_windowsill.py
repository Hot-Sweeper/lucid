"""Honey on the Windowsill: warm morning ambient, F lydian, 72 BPM.

Rhodes chords breathe two strikes per chord; a harp ripples eighth notes. The
bell motif falls a third and rises back (C A G / E G C), then repeats a step
higher over G/F, the lydian II chord whose B natural gives the light. The
Rhodes answers with a flowing line that leans on that B; the middle section
warms into borrowed Bb major and G minor colours before the bells return
with the Rhodes singing an octave below them.
"""
from lucid_music import sampler, fx, parts
from lucid_music.song import Song
from lucid_music.theory import melody
from lucid_music.styles.ambient import chain, fit

INTRO = 'Fmaj9:8 | G/F:8'
A = 'Fmaj9:8 | G/F:8 | Am9:8 | C/E:8'
A2 = 'Fmaj9:8 | G/F:8 | Dm9:8 | Gsus4:4 G:4'
B = 'Dm9:8 | Bbmaj9:8 | Am9:8 | Gm9:4 C9sus4:4'
CODA = 'G/F:8 | Fmaj9:8'

BELLS = """r:1 C6:1/2 A5:1/2 G5:2 | E5:1 G5:1 C6:2 | r:1 D6:1/2 B5:1/2 A5:2 | G5:1 B5:1 D6:2 |
           r:1 E6:1/2 C6:1/2 B5:2 | A5:1 B5:1 E5:2 | r:1 G5:1/2 E5:1/2 D5:2 | C5:4"""
RHODES_ANSWER = """A4:1 C5:1 E5:1 G5:1 | F5:3 r:1 | B4:1 D5:1 G5:1 A5:1 | G5:3 r:1 |
                   F5:1 E5:1 D5:1 A4:1 | C5:2 E5:2 | D5:2 C5:2 | B4:4"""
RHODES_B = """r:1 A5:1 F5:1 E5:1 | D5:2 A4:2 | r:1 D5:1 F5:1 A5:1 | C6:3 r:1 |
              B5:1 A5:1 G5:1 E5:1 | C5:2 E5:2 | D5:1 F5:1 Bb5:1 A5:1 | G5:2 F5:2"""
BELLS_B = 'r:4 | r:2 E6:1 D6:1 | r:4 | r:2 F6:1 D6:1 | r:4 | r:2 E6:1 B5:1 | r:4 | r:2 Bb5:1 G5:1'
BELLS_CODA = 'r:1 D6:1/2 B5:1/2 A5:2 | G5:4 | r:1 C6:1/2 A5:1/2 G5:2 | r:4'


def build():
    s = Song('honey-on-the-windowsill', 'Honey on the Windowsill', bpm=72, key=5, mode='lydian', genre='ambient',
             energy=.17, period='morning', textures=['piano', 'plucked', 'bells', 'pads'], swing=.5, seed=72,
             space=dict(seconds=4.2, predelay=.035, damp=.5, bright=6200), delay_beats=1.5)
    # intro 4 | bells A 8 | Rhodes answer 8 | warm middle 8 | bells + Rhodes 8 | coda 4 = 40
    for name, bar, n in (('intro', 0, 4), ('bell theme', 4, 8), ('rhodes answer', 12, 8),
                         ('warm middle', 20, 8), ('theme together', 28, 8), ('coda', 36, 4)):
        s.section(name, bar, n)
    s.length_beats = 40 * 4
    prog = chain((INTRO, 0), (A, 4), (A2, 12), (B, 20), (A, 28), (CODA, 36))
    s._prog = prog

    # Rhodes: two soft strikes per two-bar chord, slightly rolled; low root beneath.
    rh = parts.comp(prog, [(0, 3.8, 1), (4, 3.6, .78)], lo='F3', hi='E5', n=4, vel=.42, spread=.03)
    roots = parts.bass(prog, [(0, 7.4, 'R', 1)], lo='E2', hi='Eb3', vel=.34)
    s.notes('rhodes', sampler.rhodes(), rh + roots, level=-24, reverb=.3, delay=.1, humanize_ms=9,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=50, lp=6500, peaks=[(350, -2, .8)]), rate=.35, depth=.15, mix=.35))

    # Harp: rippling eighths through the whole piece, quarters in the coda.
    harp_prog = chain((INTRO, 0), (A, 4), (A2, 12), (B, 20), (A, 28))
    hp_notes = parts.arp(harp_prog, order=(0, 1, 2, 3, 4, 3, 2, 1), step=.5, lo='F3', hi='C5', n=4, vel=.36,
                         accents=(1.2, .8, .9, .85, 1, .85, .9, .8))
    hp_notes += parts.arp(chain((CODA, 36)), order=(0, 1, 2, 3), step=1, lo='F3', hi='C5', n=4, vel=.32)
    s.notes('harp', sampler.harp(), hp_notes, level=-25, gain_db=-3.5, reverb=.35, humanize_ms=8, pan=-.25,
            chain=lambda a, s: fx.eq(a, hp=140, lp=8000, peaks=[(3500, -2, 1)]))

    # Bells: the motif, sparse answers in the middle, motif again, coda echo.
    bells = (melody(BELLS, 4 * 4, vel=.6) + melody(BELLS_B, 20 * 4, vel=.45)
             + melody(BELLS, 28 * 4, vel=.62) + melody(BELLS_CODA, 36 * 4, vel=.45))
    s.notes('bells', ('surge', 'Fantasy Bell'), bells, level=-23, reverb=.3, delay=.14, humanize_ms=6, pan=.2,
            chain=lambda a, s: fx.eq(fit(s)(a, s), hp=300, lp=7500))

    # Rhodes lead: the answer, the warm middle tune, then shadowing the bells an octave lower.
    lead = (melody(RHODES_ANSWER, 12 * 4, vel=.6) + melody(RHODES_B, 20 * 4, vel=.62)
            + melody(BELLS, 28 * 4, octave_shift=-1, vel=.48))
    s.notes('rhodes lead', sampler.rhodes(), lead, level=-22, reverb=.32, delay=.12, humanize_ms=10,
            chain=lambda a, s: fx.chorus(fx.eq(a, hp=180, lp=7000), rate=.4, depth=.1, mix=.25))

    # Soft pad bed from the bell theme onward.
    pad = parts.pad(chain((A, 4), (A2, 12), (B, 20), (A, 28), (CODA, 36)), 'A3', 'E5', 4, vel=.5, overlap=1)
    s.notes('pad', ('surge', 'Sunday'), pad, level=-29, reverb=.2, humanize_ms=0, vel_jitter=0,
            chain=lambda a, s: fx.width(fx.eq(fit(s)(a, s), hp=200, lp=4500), .7))

    end = s.sec(40 * 4, False)
    s.bus_chain['music'] = lambda a, s: fx.filter_sweep(
        a, [(0, 900), (s.sec(16, False), 10000), (end - 7, 10000), (end + 4, 1400)])
    s.master_chain = lambda a, s: fx.fade(a, fade_in=2.0)
    s.master_opts = dict(target_lufs=-18, ceiling_db=-3.4)
    return s
