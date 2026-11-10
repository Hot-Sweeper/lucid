"""Idiomatic accompaniment built from a written chord progression.

Melodies are always hand-written in the song files. These helpers voice and
articulate the harmony (comping, pads, bass, arpeggios) the way a player would:
smooth voice leading, approach notes, rhythmic figures written per genre.
"""
from __future__ import annotations
import numpy as np

from .theory import Note, voice, midi, chord_at


def comp(prog, rhythm, lo='C3', hi='C5', n=4, vel=.6, rootless=False, start=0., spread=0.):
    """rhythm: [(offset, dur, vel_mult)] applied inside every chord span.
    `spread` rolls the chord (seconds-free: in beats) from bottom to top."""
    out, prev = [], None
    for s, length, c in prog:
        v = voice(c, lo, hi, n, prev, rootless=rootless)
        prev = v
        for off, dur, vm in rhythm:
            if off >= length - 1e-6:
                continue
            d = min(dur, length - off)
            for i, p in enumerate(v):
                out.append(Note(start + s + off + i * spread, d, p, min(1, vel * vm)))
    return out


def pad(prog, lo='C3', hi='C5', n=4, vel=.5, start=0., overlap=.05, rootless=False):
    out, prev = [], None
    for s, length, c in prog:
        v = voice(c, lo, hi, n, prev, rootless=rootless)
        # Tie common tones across chord changes (no re-attack).
        for p in v:
            held = [x for x in out if x.p == p and abs(x.t + x.d - (start + s + overlap)) < 1e-6]
            if held and prev and p in prev:
                held[0].d += length
            else:
                out.append(Note(start + s, length + overlap, p, vel))
        prev = v
    return out


def _degree(c, token, lo, hi, nxt=None, prev_pitch=None):
    lo_, hi_ = midi(lo), midi(hi)
    root = c.bass
    ints = [i % 12 for i in c.intervals]
    third = next((i for i in ints if i in (3, 4)), 4)
    fifth = next((i for i in ints if i in (6, 7, 8)), 7)
    sev = next((i for i in ints if i in (9, 10, 11)), 10)
    table = {'R': 0, '3': third, '5': fifth, '7': sev, '8': 12, 'b7': 10, '6': 9, '9': 2, '4': 5, '-5': fifth - 12}
    if token == 'A' and nxt is not None:       # chromatic approach to the next root
        target = _place(nxt.bass, lo_, hi_, prev_pitch)
        return target - 1 if (prev_pitch or target) < target else target + 1
    if token == 'F' and nxt is not None:       # fifth-below approach (dominant motion)
        target = _place(nxt.bass, lo_, hi_, prev_pitch)
        return target - 5 if target - 5 >= lo_ else target + 7
    pc = (root + table[token]) % 12
    p = _place(pc, lo_, hi_, prev_pitch)
    if token == '8':
        p = _place(root, lo_, hi_, prev_pitch) + 12
        if p > hi_ + 7:
            p -= 12
    if token == '-5':
        p = _place(root, lo_, hi_, prev_pitch) - (12 - fifth)
    return p


def _place(pc, lo, hi, near=None):
    cands = [p for p in range(lo, hi + 1) if p % 12 == pc]
    if not cands:
        cands = [p for p in range(lo - 12, hi + 13) if p % 12 == pc]
    if near is None:
        return cands[0]
    return min(cands, key=lambda p: abs(p - near))


def bass(prog, pattern, lo='E1', hi='G2', vel=.8, start=0.):
    """pattern: [(offset, dur, token, vel_mult)], tokens R 3 5 7 8 b7 6 9 4 -5,
    A (chromatic approach to next root), F (fifth approach)."""
    out, prev_pitch = [], None
    for i, (s, length, c) in enumerate(prog):
        nxt = prog[i + 1][2] if i + 1 < len(prog) else prog[0][2]
        for off, dur, tok, vm in pattern:
            if off >= length - 1e-6:
                continue
            p = _degree(c, tok, lo, hi, nxt, prev_pitch if tok != 'R' or prev_pitch is None else prev_pitch)
            if tok == 'R':
                p = _place(c.bass, midi(lo), midi(hi), None)
            out.append(Note(start + s + off, min(dur, length - off), p, min(1, vel * vm)))
            prev_pitch = p
    return out


def walking(prog, lo='E1', hi='C3', vel=.78, start=0., seed=7):
    """Jazz walking bass: root on the downbeat, chord/scale tones through the
    bar, a chromatic or scale approach into the next chord."""
    rng = np.random.default_rng(seed)
    lo_, hi_ = midi(lo), midi(hi)
    out, prev = [], None
    for i, (s, length, c) in enumerate(prog):
        nxt = prog[i + 1][2] if i + 1 < len(prog) else prog[0][2]
        beats = int(round(length))
        root = _place(c.bass, lo_, hi_, prev if prev is not None else lo_ + 5)
        target = _place(nxt.bass, lo_, hi_, root)
        line = [root]
        tones = sorted({(c.root + iv) % 12 for iv in c.intervals})
        for b in range(1, beats):
            if b == beats - 1:
                p = target + (-1 if rng.random() < .65 else 1)        # approach tone
                if rng.random() < .25:
                    p = target + (2 if target + 2 <= hi_ else -2)       # scale approach from above
            else:
                direction = 1 if target > line[-1] else -1
                cands = [q for q in range(line[-1] - 7, line[-1] + 8)
                         if q % 12 in tones and q != line[-1] and lo_ <= q <= hi_]
                cands.sort(key=lambda q: (np.sign(q - line[-1]) != direction, abs(q - line[-1])))
                p = cands[min(len(cands) - 1, int(rng.integers(0, 2)))] if cands else line[-1]
            line.append(int(np.clip(p, lo_ - 2, hi_ + 2)))
        for b, p in enumerate(line):
            accent = 1.0 if b == 0 else .86 + .06 * (b % 2)
            out.append(Note(start + s + b, .9, p, min(1, vel * accent)))
        prev = line[-1]
    return out


def arp(prog, order=(0, 1, 2, 3, 2, 1), step=.5, lo='C4', hi='C6', n=4, vel=.55, gate=.9, start=0.,
        accents=None):
    """Arpeggiate the voice-led chord. order indexes the voicing (bottom = 0);
    values >= n jump an octave up."""
    out, prev = [], None
    for s, length, c in prog:
        v = voice(c, lo, hi, n, prev)
        prev = v
        k, t = 0, 0.
        while t < length - 1e-6:
            idx = order[k % len(order)]
            p = v[idx % len(v)] + 12 * (idx // len(v))   # triads may voice fewer than n notes
            a = accents[k % len(accents)] if accents else 1
            out.append(Note(start + s + t, step * gate, p, min(1, vel * a)))
            k += 1
            t += step
    return out


def strum(prog, rhythm, lo='E3', hi='E5', n=5, vel=.6, start=0., spread=.03):
    """Guitar-like strum: rolled chords, alternating down/up direction."""
    out, prev = [], None
    for s, length, c in prog:
        v = voice(c, lo, hi, n, prev)
        prev = v
        for k, (off, dur, vm) in enumerate(rhythm):
            if off >= length - 1e-6:
                continue
            order = v if k % 2 == 0 else v[::-1]
            for i, p in enumerate(order):
                out.append(Note(start + s + off + i * spread, min(dur, length - off), p, min(1, vel * vm * (1 - .06 * i))))
    return out


def clashes(melody, prog, strong_only=True, beats_per_bar=4):
    """Melody notes that rub against the harmony on strong beats: a minor 2nd
    or minor 9th against a chord tone that is not itself a chosen extension.
    Returns [(beat, note, chord)] for review."""
    bad = []
    for n in melody:
        pos = n.t % beats_per_bar
        strong = abs(pos - round(pos)) < 1e-6 and int(round(pos)) % 2 == 0
        if strong_only and not strong and n.d < 1:
            continue
        c = chord_at(prog, n.t + 1e-6)
        pcs = set(c.pcs) | {c.bass}
        pc = n.p % 12
        if pc in pcs:
            continue
        if any((pc - q) % 12 in (1, 11) for q in pcs):
            bad.append((n.t, n.p, c.symbol))
    return bad
