"""Jazz comping helpers: rhythm cells per bar, pushed anticipations, fills."""
from __future__ import annotations
from lucid_music.theory import Note, voice


def at(prog, bar, bpb=4):
    return [(s + bar * bpb, l, c) for s, l, c in prog]


def span_index(prog, beat):
    for i, (s, l, c) in enumerate(prog):
        if s <= beat + 1e-6 < s + l:
            return i
    return None


def comp_cells(prog, cells, lo='C3', hi='E4', n=4, vel=.55, rootless=True, spread=0., bpb=4, order=None):
    """cells: list of one-bar rhythms [(offset, dur, vel_mult, push)]; push=True
    voices the *next* chord (anticipation into a change). Bar b uses
    cells[order[b % len(order)]] (or cells[b % len(cells)])."""
    if not prog:
        return []
    voicings, prev = [], None
    for s, l, c in prog:
        prev = voice(c, lo, hi, n, prev, rootless=rootless)
        voicings.append(prev)
    first_bar = int(prog[0][0] // bpb)
    last = prog[-1][0] + prog[-1][1]
    out = []
    b = first_bar
    k = 0
    while b * bpb < last - 1e-6:
        idx = (order[k % len(order)] if order else k % len(cells))
        for cell in cells[idx]:
            off, dur, vm = cell[:3]
            push = len(cell) > 3 and cell[3]
            t = b * bpb + off
            i = span_index(prog, t)
            if i is None:
                continue
            if push and i + 1 < len(prog) and prog[i + 1][0] - t <= .5 + 1e-6:
                i += 1
                end = prog[i][0] + prog[i][1]
            else:
                end = prog[i][0] + prog[i][1]
            d = min(dur, end - t)
            for j, p in enumerate(voicings[i]):
                out.append(Note(t + j * spread, d, p, min(1, vel * vm)))
        b += 1
        k += 1
    return drop_clashing_fifths(out, prog)


def drop_clashing_fifths(notes, prog):
    """theory.voice() pads thin rootless chords with a perfect fifth. On chords
    that already hold a b5/#11 or #5/b13 (m7b5, dim, 7#11, 7b13, 7alt, aug)
    that fifth rubs a semitone away, so remove it from comping voicings."""
    from lucid_music.theory import chord_at
    out = []
    for n in notes:
        c = chord_at(prog, n.t + 1e-6)
        ints = {i % 12 for i in c.intervals}
        if 7 not in ints and (6 in ints or 8 in ints) and n.p % 12 == (c.root + 7) % 12:
            continue
        out.append(n)
    return out
