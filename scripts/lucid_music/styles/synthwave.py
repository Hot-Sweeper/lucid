"""Shared synthwave building blocks: drum grooves per section, gated snare bus,
pumping bass figures and a few mix chains. Melodies stay in the song files.
"""
from lucid_music import drums, fx, parts
from lucid_music.theory import Note

# 16-step one-bar grooves. Snare-family pieces ('s', 'clap808') are routed to a
# separate gated-reverb track by split_snares().
GROOVES = {
    'four':   {'k': 'x...x...x...x...', 's': '....x.......x...', 'clap808': '....x.......x...',
               'h': 'x.o.x.o.x.o.x.oo'},
    'four_open': {'k': 'x...x...x...x...', 's': '....x.......x...', 'clap808': '....x.......x...',
                  'h': 'x.o.x.o.x.o.x.o.', 'o': '..x...x...x...x.'},
    'drive':  {'k': 'x.......x.x.....', 's': '....x.......x...', 'clap808': '....x.......x...',
               'h': 'x.o.x.o.x.o.x.oo'},
    'half':   {'k': 'x.........x.....', 's': '........x.......', 'clap808': '........x.......',
               'h': 'x...o...x...o...'},
    'kick':   {'k': 'x...x...x...x...'},
    'pulse':  {'k': 'x...x...x...x...', 'h': '..o...o...o...o.'},
}
FILLS = {
    'snare':  {'s': '....x.......xoxX', 'clap808': '....x...........'},
    'roll':   {'s': '....x...oxoxxxXX'},
    'lift':   {'s': '........oooxxxXX'},
}


def bar_hits(kind, bar, fill=None, crash=False, drop_kick_end=False):
    g = dict(GROOVES[kind])
    if fill:
        f = FILLS[fill]
        for piece, pat in f.items():
            g[piece] = pat
        if drop_kick_end and 'k' in g:
            g['k'] = g['k'][:12] + '....'
    hits = drums.loop(g, 1, bar)
    if crash:
        hits.append((bar * 4, 'crash', .75))
    return hits


def section(kind, start, bars, fill='snare', crash=True, every=8):
    hits = []
    for b in range(bars):
        f = fill if fill and (b % every == every - 1 or b == bars - 1) else None
        hits += bar_hits(kind, start + b, f, crash=crash and b == 0)
    return hits


def split_snares(hits):
    snare = [h for h in hits if h[1] in ('s', 'clap808')]
    rest = [h for h in hits if h[1] not in ('s', 'clap808')]
    return rest, snare


def kit(mic='mid', tune=49., decay=.32, punch=2.8):
    k = drums.acoustic_kit(mic)
    k['_opts'] = {'kick808': dict(tune=tune, decay=decay, punch=punch)}
    return k


def layer_808(hits, amount=.6):
    """Add an 808 body under every real kick."""
    return hits + [(b, 'kick808', v * amount) for b, p, v in hits if p == 'k']


def at(prog, bar, beats=4):
    return [(s + bar * beats, ln, c) for s, ln, c in prog]


def pump_bass(prog, lo='E2', hi='D#3', vel=.82, octave_steps=(3, 7), gate=.42):
    """Straight 8th roots with octave pops: the outrun engine."""
    pat = [(i * .5, gate, '8' if i in octave_steps else 'R', 1. if i % 2 == 0 else .78) for i in range(8)]
    return parts.bass(prog, pat, lo, hi, vel)


def drums_chain(a, s):
    return fx.comp(fx.eq(a, hp=35, peaks=[(60, 2.5, 1.1), (400, -2, 1), (4500, 1.5, .8)]), -16, 3, 6, 90, 1.5)


def snare_chain(a, s, mix=.75, gate=.26):
    return fx.gated_reverb(fx.eq(a, hp=140, peaks=[(220, 2, 1), (5000, 2, .9)]), gate=gate, mix=mix)


def lead_chain(a, s, lp=9000):
    return fx.eq(a, hp=220, lp=lp, peaks=[(2600, 1.5, .9), (500, -2, 1)])


def pad_chain(a, s, wide=1.):
    a = fx.eq(a, hp=180, lp=9000, peaks=[(350, -2.5, .8)])
    return fx.width(a, wide) if wide != 1 else a


def bass_chain(a, s):
    return fx.comp(fx.eq(a, hp=32, lp=5000, peaks=[(250, -2, 1)]), -18, 3, 10, 120)


def arp_chain(a, s):
    return fx.eq(a, hp=350, lp=11000, peaks=[(800, -1.5, 1)])


def sweep(points_bars, s):
    """Music-bus low-pass automation from [(bar, hz)]."""
    return lambda a, song: fx.filter_sweep(a, [(song.sec(b * 4, False), hz) for b, hz in points_bars])


def notes_in(notes, start_beat, end_beat):
    return [n for n in notes if start_beat <= n.t < end_beat]


def arp(prog, order=(0, 1, 2, 3, 2, 1), step=.5, lo='C4', hi='C6', n=4, vel=.55, gate=.9, accents=None):
    """parts.arp that tolerates chords with fewer tones than n (triads)."""
    from lucid_music.theory import voice
    out, prev = [], None
    for st, length, c in prog:
        v = voice(c, lo, hi, n, prev)
        prev = v
        k, t, m = 0, 0., len(v)
        while t < length - 1e-6:
            idx = order[k % len(order)]
            p = v[idx % m] + 12 * (idx // m)
            a = accents[k % len(accents)] if accents else 1
            out.append(Note(st + t, step * gate, p, min(1, vel * a)))
            k += 1
            t += step
    return out


def outro_fade(seconds=7., floor_db=-36):
    """Master volume ride into the final downbeat so the song dissolves for the
    crossfade instead of being cut by the tail trim."""
    def chain(a, s):
        end = s.sec(s.length_beats, False)
        return fx.automate(a, [(0, 0), (end - seconds, 0), (end, floor_db * .6), (end + 1.5, floor_db), (end + 30, floor_db)])
    return chain
