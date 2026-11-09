"""Lunar phonk helpers: pitched TR-808 cowbell, Memphis hats, gliding 808 lines."""
from __future__ import annotations
import numpy as np
from scipy.signal import butter, sosfilt

from lucid_music.sampler import SR
from lucid_music.theory import Note, midi
from lucid_music import drums


def _square(f, t, top=9000.):
    """Band-limited square (odd harmonics below `top`), avoids aliasing."""
    x = np.zeros_like(t)
    k = 1
    while k * f < top:
        x += np.sin(2 * np.pi * k * f * t) / k
        k += 2
    return x * (4 / np.pi)


def cowbell_notes(events, frames, decay=.17, ratio=1.4815, tone=1.0):
    """Pitched 808 cowbell: two band-limited squares (the 540/800 Hz ratio of the
    original circuit) per note, band-pass, short clang + body decay.
    events [(sec, dur, pitch, vel)]; the lower square carries the pitch."""
    out = np.zeros(frames, np.float32)
    for s, d, p, v in events:
        start = int(s * SR)
        if start >= frames:
            continue
        f = 440 * 2 ** ((p - 69) / 12)
        n = min(frames - start, int((min(d, .9) + .25) * SR))
        t = np.arange(n) / SR
        x = _square(f, t) + .8 * _square(f * ratio, t)
        env = .55 * np.exp(-t / .012) + .45 * np.exp(-t / decay)
        hold = int(d * SR)
        if hold < n:
            env[hold:] *= np.exp(-np.arange(n - hold) / SR / .035)
        sos = butter(2, [max(150, f * .7), min(SR / 2 - 500, f * 4.2 * tone)], 'bandpass', fs=SR, output='sos')
        y = sosfilt(sos, x * env) * v * .3
        out[start:start + n] += y.astype(np.float32)
    return np.column_stack([out, out])


def cowbell_track(song, notes, name='cowbell', swing=True, humanize_ms=3., **kw):
    """Add a pitched cowbell melody (theory.Note list) as an audio track,
    timed by the song's tempo/swing like any other part."""
    rng = np.random.default_rng(song.seed + 77)
    voice = kw.pop('voice', {})

    def render(frames, s):
        evs = []
        for n in notes:
            j = rng.normal(0, humanize_ms / 1000) if humanize_ms else 0
            st = s.sec(n.t, swing) + j
            evs.append((max(0., st), s.sec(n.t + n.d, swing) - s.sec(n.t, swing), n.p, n.v))
        return cowbell_notes(evs, frames, **voice)

    return song.audio(name, render, **kw)


def memphis_hats(bars, start_bar=0, base='xoxoxoxoxoxoxoxo', roll_every=4, roll='trip',
                 piece='hat808', open_piece='ohat808', open_step=None):
    """Steady 16th hats with accents; the last beat of every `roll_every` bars
    becomes a roll (16th triplets 'trip' or 32nds 'thirty')."""
    hits = []
    for b in range(bars):
        bar = start_bar + b
        rolled = roll and (b + 1) % roll_every == 0
        pat = base[:12] + '....' if rolled else base
        hits += drums.grid(pat, piece, bar * 4)
        if rolled:
            spb, n = (6, 6) if roll == 'trip' else (8, 8)
            vels = 'oooxxxxX'[-n:] if n == 8 else 'ooxxxX'
            hits += drums.grid(vels, piece, bar * 4 + 3, steps_per_beat=spb)
        if open_step is not None and not rolled and b % 2 == 1:
            hits = [h for h in hits if not (h[0] == bar * 4 + open_step / 4 and h[1] == piece)]
            hits.append((bar * 4 + open_step / 4, open_piece, .55))
    return hits


def line808(bars, start_bar=0, glide_every=2, vel=.95):
    """bars: list of (root_name, pattern_id). Patterns follow the kick:
    'a' = 1, 2-and, 3-and; 'b' = 1, 2-and with a slide up an octave on 4.
    Returns Note list; overlaps create glides in synth.sub808."""
    out = []
    for i, (root, pat) in enumerate(bars):
        r = midi(root)
        t = (start_bar + i) * 4
        if pat == 'a':
            out += [Note(t, 1.45, r, vel), Note(t + 1.5, .95, r, vel * .85), Note(t + 2.5, 1.45, r, vel * .9)]
        elif pat == 'b':
            out += [Note(t, 1.45, r, vel), Note(t + 1.5, 1.55, r, vel * .85), Note(t + 3.0, 1.0, r + 12, vel * .8)]
        elif pat == 'c':         # held note sliding down a fifth at the end
            out += [Note(t, 3.05, r, vel), Note(t + 3.0, 1.0, r - 5, vel * .8)]
        elif pat == 'h':         # one long note
            out += [Note(t, 3.9, r, vel)]
        elif pat == 'f':         # fifth slide: root, then glide to the fifth on 3-and
            out += [Note(t, 2.55, r, vel), Note(t + 2.5, 1.45, r + 7, vel * .85)]
    return out


def at(prog, bar):
    return [(st + bar * 4, ln, c) for st, ln, c in prog]
