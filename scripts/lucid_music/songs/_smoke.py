from lucid_music import sampler, drums, fx, parts, breaks, synth
from lucid_music.song import Song
from lucid_music.theory import progression, melody

def build():
    s = Song('smoke', 'Smoke', bpm=100, key=9, mode='minor', genre='synthwave', energy=.6, period='night', textures=['synth'])
    P = progression('Am9 | Fmaj7 | Cmaj7 | G6')
    s.length_beats = 16
    s.notes('pad', ('surge', 'MKS-70 Warm Pad'), parts.pad(P, 'A3', 'E5', 4, .6), level=-24)
    s.notes('lead', ('surge', 'Classic Lead 1'), melody('E5:1 G5:1 A5:2 | C6:1 B5:1 A5:2 | G5:1 E5:1 D5:2 | E5:4'), level=-20, legato=True)
    s.notes('808', ('808',), parts.bass(P, [(0, 1.5, 'R', 1), (2, 1, '5', .8)], 'A1', 'G2'), level=-18)
    kit = drums.acoustic_kit('mid')
    kit['_opts'] = {}
    hits = drums.loop({'kick808': 'x.....x...x.....', 'clap808': '....x.......x...', 'hat808': 'x.x.x.x.x.x.x.xx',
                       'cowbell808': '..x.....x.....x.', 's': '....x.......x...', 'h': '..x...x...x...x.'}, 4)
    s.drums('drums', kit, hits, level=-20, chain=lambda a, s: fx.gated_reverb(a, mix=.4))
    def br(n, s):
        loop, secs = breaks.render_break(drums.acoustic_kit('mid'), 'think', s.bpm)
        return breaks.place(breaks.chop(loop, secs, '0 1 2 3 4 5 6 7 8 8/2 r9 +10 -11 . 13 14 ' * 8, s.bpm), n)
    s.audio('breaks', br, level=-24)
    return s
