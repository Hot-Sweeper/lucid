"""Atmospheric breakcore helpers: written break edits per section.

A section plan is a list of (start_bar, bars, kind). Every two bars of a
section get one 32-step chop sequence of the rendered 2-bar break, so the
real kit resonance travels with each slice. Kinds:
  roll    steady break, light re-edit every other 2 bars, fill closing 8 bars
  smooth  steady rolling break (liquid), only a small fill closing 8 bars
  edit    busier jungle edits, stutter fill every 4 bars, big fill at the end
  half    half-time break, small fill closing 8 bars
  build   half-time that turns into a snare roll over its last 2 bars
  glitch  intricate edits (stutters, reversed/pitched slices, gaps), fill closing 8 bars
"""
from __future__ import annotations
import numpy as np

from .. import breaks, drums, fx

STRAIGHT = ' '.join(str(i) for i in range(32))
# Bar 2 borrows bar 1's kick/ghost slices: the classic jungle re-edit.
VARIANT = '0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 0 1 18 19 20 21 6 7 24 25 10 11 28 29 14 15'
VARIANT2 = '0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 2 3 20 21 22 23 8 9 26 27 28 29 12 13'
# Bar 2 ends with a snare stutter that resolves on the next downbeat.
FILL = '0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 28 28/2 28 28/2 20/2 20/2 r28 +28'
SMALL_FILL = '0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 28/2 28 r29'
BIG_FILL = ('0 1 2 3 4 5 6 7 12 12/2 12 12/2 4 4/2 r4 +4 '
            '20 20/2 20/2 20/2 28 28/2 28/2 28/2 +28/2 +28/2 +28/2 +28/2 r12 r13 . .')
STUTTER = '0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 20/2 20 r21 24 25 26 27 28 28/2 +28/2 +28/2'
ROLL = ('20 . . . 20 . . . 20 . 20 . 20 . 20 . '
        '20 20 20 20 20 20 20 20 20/2 20/2 20/2 20/2 +20/2 +20/2 +20/2 +20/2')

# Intricate second-half edits (Sxnctuary-style): displaced kicks, 32nd stutters,
# reversed and pitched ghost slices, and tiny silences that make the next hit land.
GLITCH_A = '0 1 2 3 4 4/2 6 7 8 9 r10 11 12 13 12/2 15 16 17 2 3 20 21 22 22/2 24 +25 26 27 28 28/2 r30 31'
GLITCH_B = '0 0/2 2 3 4 5 6 7 8 9 10 11 12 12/2 12/2 12/2 16 17 18 19 4 5 22 23 -24 25 26 27 28 29 +28/2 +28/2'
GLITCH_C = '0 1 r2 3 4 5 . 7 0 1 10 11 12 13 14 -15 16 17 18 . 20 21 20/2 23 24 25 26 27 28 r29 28/2 31'
GLITCH_FILL = ('0 1 2 3 4 4/2 4/2 4/2 8 9 10 11 12 12/2 +12/2 +12/2 '
               '20/2 20/2 20/2 20/2 28/2 28/2 +28/2 +28/2 r28 r29 r30 r31 . . 28 .')

HALF = {'k': 'x.........x.....|x.....x...x.....', 's': '........x.......|........x.....g.',
        'g': '...g......g.....|..g.......g..g..', 'h': 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x.xox.'}


def _sequences(kind, units):
    out = []
    for u in range(units):
        last = u == units - 1
        phrase_end = (u % 4) == 3
        if kind == 'smooth':
            seq = SMALL_FILL if phrase_end else STRAIGHT
        elif kind == 'roll':
            seq = FILL if phrase_end else (VARIANT if u % 2 else STRAIGHT)
        elif kind == 'edit':
            seq = BIG_FILL if last else STUTTER if u % 2 else (VARIANT2 if u % 4 == 2 else VARIANT)
        elif kind == 'half':
            seq = SMALL_FILL if phrase_end else STRAIGHT
        elif kind == 'build':
            seq = ROLL if last else STRAIGHT
        elif kind == 'glitch':
            seq = GLITCH_FILL if phrase_end or last else (GLITCH_A, GLITCH_B, GLITCH_C)[u % 4 % 3]
        else:
            raise ValueError(kind)
        out.append(seq)
    return out


def break_track(plan, pattern='think', mic='mid', swing=.5):
    """Return an audio function (frames, song) -> stereo for Song.audio()."""
    def render(frames, song):
        kit = drums.acoustic_kit(mic)
        loop, secs = breaks.render_break(kit, pattern, song.bpm, swing=swing)
        half, hsecs = breaks.render_break(drums.acoustic_kit(mic), HALF, song.bpm)
        pieces = []
        for start_bar, bars, kind in plan:
            src, s = (half, hsecs) if kind in ('half', 'build') else (loop, secs)
            for u, seq in enumerate(_sequences(kind, bars // 2)):
                if kind == 'build' and u == bars // 2 - 1:
                    src, s = loop, secs
                pieces += breaks.chop(src, s, seq, song.bpm, start_beat=(start_bar + 2 * u) * 4)
        return breaks.place(pieces, frames)
    return render


def break_chain(lp=11000, drive=1.15):
    """Glue for the break bus: tame boom and fizz, gentle compression, a little grit."""
    def chain(a, song):
        a = fx.eq(a, hp=35, lp=lp, peaks=[(70, 2.5, 1.0), (450, -2.5, .9), (5000, -1.5, .8)])
        a = fx.comp(a, -18, 3, 6, 90, 2)
        return (np.tanh(drive * a) / np.tanh(drive)).astype(np.float32)
    return chain


def at(prog, bar):
    return [(st + bar * 4, ln, c) for st, ln, c in prog]
