"""Breakbeats: play a written break on a real kit, then chop and resequence it.

A break is rendered to audio once (so every slice carries real drum resonance),
cut into 16th-note slices and re-ordered: stutters, reversed slices, pitched
slices and rolls, which is how breakcore and jungle edits are built.
"""
from __future__ import annotations
import numpy as np

from . import drums as drumlib
from .sampler import SR, pitch_shift

# Original two-bar breaks (16 steps per bar). k kick, s snare, g ghost, h hat, o open hat, ride.
BREAKS = {
    'think': {'k': 'x.x.......x.....|x.x.....x..x....', 's': '....x..g.g..x..g|....x..g.g..x.g.',
              'g': '.g.....g......g.|.g..........g...', 'h': 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x.xox.'},
    'roller': {'k': 'x.........x.....|..x.......x.....', 's': '....x.......x...|....x.......x..x',
               'g': '..g..g.g.g..g.g.|.g...g.g..g..g..', 'h': 'x.xxx.xxx.xxx.xx|x.xxx.xxx.xxx.xo'},
    'apache': {'k': 'x.....x...x.....|x.....x.x.......', 's': '....x.......x...|....x..g....x...',
               'g': '......g.......g.|..g.......g...g.', 'h': 'xoxoxoxoxoxoxoxo|xoxoxoxoxoxoxoxo'},
}


def render_break(kit, name_or_pattern, bpm, bars=2, swing=.5):
    pat = BREAKS[name_or_pattern] if isinstance(name_or_pattern, str) else name_or_pattern
    spb = 60 / bpm
    hits = []
    for piece, beat, v in [(p, b, v) for b, p, v in drumlib.loop(pat, bars)]:
        pos = beat
        if swing != .5 and (beat * 4) % 2 == 1:
            pos = beat + (swing - .5) * .5
        hits.append((pos * spb, piece, v))
    frames = int(bars * 4 * spb * SR) + int(.6 * SR)
    audio = drumlib.render_hits(kit, hits, frames)
    return audio, bars * 4 * spb


def chop(loop_audio, loop_seconds, sequence, bpm, start_beat=0., steps=16, bars_in_loop=2):
    """sequence: tokens per 16th, e.g. '0 1 2 3 4 4 4 7 r12 13 +14 -15 . 3'.
    N = play slice N, rN reversed, +N up 3 semis, -N down 3, 'N/2' half-length
    stutter repeated twice, '.' rest (silence), '~' let previous slice ring.
    Returns (offset_sec, audio) list to add into a song buffer."""
    n_slices = steps * bars_in_loop
    slice_len = loop_seconds / n_slices
    step_sec = 60 / bpm / 4
    L = int(slice_len * SR)
    pieces = []
    t = start_beat * 60 / bpm
    for tok in sequence.split():
        if tok in ('.', '~'):
            if tok == '.':
                pieces.append((t, None))
            t += step_sec
            continue
        rev = tok.startswith('r')
        semis = 3 if tok.startswith('+') else -3 if tok.startswith('-') else 0
        stutter = tok.endswith('/2')
        idx = int(tok.strip('r+-').replace('/2', '')) % n_slices
        seg = loop_audio[idx * L: idx * L + L].copy()
        if semis:
            seg = pitch_shift(seg, 2 ** (semis / 12), len(seg))
        if rev:
            seg = seg[::-1]
        out_len = int(step_sec * SR)
        if stutter:
            half = seg[:out_len // 2]
            seg = np.concatenate([half, half])
        seg = seg[:out_len] if len(seg) >= out_len else np.pad(seg, ((0, out_len - len(seg)), (0, 0)))
        fade = min(len(seg), 96)
        seg[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)[:, None]
        seg[:24] *= np.linspace(0, 1, min(24, len(seg)), dtype=np.float32)[:, None]
        pieces.append((t, seg))
        t += step_sec
    return [(o, s) for o, s in pieces if s is not None]


def place(pieces, frames):
    out = np.zeros((frames, 2), np.float32)
    for o, seg in pieces:
        i = int(o * SR)
        if i >= frames:
            continue
        m = min(len(seg), frames - i)
        out[i:i + m] += seg[:m]
    return out
