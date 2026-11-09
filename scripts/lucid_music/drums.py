"""Drum kits from real multisampled recordings plus classic analog voices.

Virtuosity Drums (Versilian Studios + Karoryfer, CC0) offers a 'lofi' mic
perspective (dusty, compressed) and a 'mid' perspective (clean, roomy).
"""
from __future__ import annotations
from dataclasses import dataclass, field
import re
import numpy as np
from scipy.signal import butter, sosfilt

from .sampler import SR, LIBS, load

VIRT = LIBS / 'virtuosity/Samples'


@dataclass
class Piece:
    name: str
    layers: list                 # [[path, ...rr], ...] soft -> loud
    gain_db: float = 0.
    veltrack: float = .35        # extra level change inside a layer
    pan: float = 0.              # -1..1
    choke: str | None = None     # e.g. open hat choked by closed hat
    max_len: float = 3.
    _rr: dict = field(default_factory=dict)

    def sample(self, v):
        i = min(len(self.layers) - 1, int(v * len(self.layers)))
        rr = self.layers[i]
        n = self._rr.get(i, 0)
        self._rr[i] = n + 1
        return load(rr[n % len(rr)])


def _virt(mic, piece, artic, **kw):
    folder = VIRT / mic / piece
    by_layer = {}
    for f in sorted(folder.glob(f'{mic}_{piece}_{artic}_*.flac')):
        m = re.search(r'_vl(\d+)(?:_rr(\d+))?\.flac$', f.name)
        if m:
            by_layer.setdefault(int(m[1]), []).append(str(f))
    if not by_layer:
        raise FileNotFoundError(f'{folder}/{mic}_{piece}_{artic}')
    layers = [by_layer[k] for k in sorted(by_layer)]
    return Piece(f'{piece}-{artic}', layers, **kw)


def _perc(folder, pattern, **kw):
    files = sorted(str(f) for f in (VIRT / 'perc/close' / folder).glob(pattern))
    if not files:
        raise FileNotFoundError(folder)
    return Piece(folder, [files], **kw)


def acoustic_kit(mic='lofi'):
    """Real kit. Names used by patterns: k s g x r h o p ride bell crash."""
    kit = {
        'k': _virt(mic, 'kick', 'snoff', gain_db=0),
        's': _virt(mic, 'snare', 'center', gain_db=-2),
        'g': _virt(mic, 'snare', 'offcenter', gain_db=-6, veltrack=.6),    # ghost notes
        'x': _virt(mic, 'snare', 'crossstick', gain_db=-3),
        'r': _virt(mic, 'snare', 'rimshot', gain_db=-4),
        'h': _virt(mic, 'hh', 'closed', gain_db=-7, pan=.25, choke=None),
        'hh': _virt(mic, 'hh', 'half', gain_db=-8, pan=.25),
        'o': _virt(mic, 'hh', 'open', gain_db=-9, pan=.25, max_len=1.2),
        'p': _virt(mic, 'hh', 'pedal', gain_db=-10, pan=.25),
        'ride': _virt(mic, 'ride', 'ride', gain_db=-9, pan=-.3, max_len=2.5),
        'bell': _virt(mic, 'ride', 'bell', gain_db=-11, pan=-.3, max_len=2.5),
        'crash': _virt(mic, 'crash', 'crash', gain_db=-12, pan=.35, max_len=3.5) if (VIRT / mic / 'crash').is_dir() else None,
        'shaker': _perc('shaker', 'LShaker_Shake1*', gain_db=-14, pan=-.35),
        'tamb': _perc('tambourine', 'Tamb1_Shake*', gain_db=-16, pan=.4),
        'conga': _perc('conga', 'Conga_17_HitHM1*', gain_db=-10, pan=-.2),
        'cowbell': _perc('cowbell', '*', gain_db=-14, pan=.1),
    }
    try:
        kit['crash'] = _virt(mic, 'crash', 'crash', gain_db=-12, pan=.35, max_len=3.5)
    except FileNotFoundError:
        kit.pop('crash', None)
    claps = sorted(str(f) for f in (LIBS / 'vcsl/Idiophones/Struck Idiophones/Claps').glob('Clap_rr*.wav'))
    if claps:
        kit['clap'] = Piece('clap', [claps], gain_db=-6)
    return {k: v for k, v in kit.items() if v is not None}


def render_hits(kit, hits, frames):
    """hits [(sec, piece, vel)] -> stereo. Chokes: a closed hat cuts an open hat."""
    out = np.zeros((frames, 2), np.float32)
    last_open = None
    for sec, name, v in sorted(hits, key=lambda h: h[0]):
        piece = kit[name]
        x = piece.sample(v)
        n = min(len(x), int(piece.max_len * SR))
        s = int(sec * SR)
        if s >= frames:
            continue
        if name in ('h', 'p', 'hh') and last_open is not None:
            os_, on = last_open
            cut = s - os_
            if 0 < cut < on:      # 30 ms fade of the ringing open hat
                fade = min(on - cut, int(.03 * SR))
                seg = out[s:s + fade]
                seg *= np.linspace(1, .15, len(seg), dtype=np.float32)[:, None]
            last_open = None
        g = 10 ** ((piece.gain_db + piece.veltrack * 40 * np.log10(max(v, .05))) / 20)
        m = min(n, frames - s)
        seg = x[:m] * g
        if m > 64:
            seg[-64:] *= np.linspace(1, 0, 64, dtype=np.float32)[:, None]
        if piece.pan:
            seg = seg * np.array([min(1, 1 - piece.pan), min(1, 1 + piece.pan)], np.float32)
        out[s:s + m] += seg
        if name == 'o':
            last_open = (s, m)
    return out


# ----------------------------------------------------------- analog voices

def _env(n, tau):
    return np.exp(-np.arange(n) / SR / tau)


def kick808(hits, frames, tune=45., decay=.45, punch=2.5):
    out = np.zeros(frames, np.float32)
    for sec, v in hits:
        s = int(sec * SR)
        n = min(frames - s, int(decay * 4 * SR))
        if n <= 0:
            continue
        t = np.arange(n) / SR
        f = tune * (1 + punch * np.exp(-t / .025))
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(n, decay)
        x = np.tanh(1.8 * x) * v
        out[s:s + n] += x.astype(np.float32)
    return np.column_stack([out, out])


def snare909(hits, frames, tone=190., decay=.16, seed=3):
    rng = np.random.default_rng(seed)
    sos = butter(2, [1200, 9000], 'bandpass', fs=SR, output='sos')
    out = np.zeros(frames, np.float32)
    for sec, v in hits:
        s = int(sec * SR)
        n = min(frames - s, int(.6 * SR))
        if n <= 0:
            continue
        t = np.arange(n) / SR
        body = np.sin(2 * np.pi * tone * t * (1 + .5 * np.exp(-t / .01))) * _env(n, .05)
        noise = sosfilt(sos, rng.standard_normal(n)) * _env(n, decay)
        out[s:s + n] += ((.55 * body + .6 * noise) * v).astype(np.float32)
    return np.column_stack([out, out])


def clap808(hits, frames, seed=5):
    rng = np.random.default_rng(seed)
    sos = butter(2, [900, 5000], 'bandpass', fs=SR, output='sos')
    out = np.zeros(frames, np.float32)
    for sec, v in hits:
        s = int(sec * SR)
        n = min(frames - s, int(.5 * SR))
        if n <= 0:
            continue
        t = np.arange(n) / SR
        env = sum(np.exp(-np.maximum(t - o, 0) / .006) * (t >= o) for o in (0, .011, .022)) + .6 * np.exp(-np.maximum(t - .03, 0) / .11) * (t >= .03)
        x = sosfilt(sos, rng.standard_normal(n)) * env
        out[s:s + n] += (x * v * .5).astype(np.float32)
    return np.column_stack([out, out])


def hat808(hits, frames, open_=False):
    """Six detuned square oscillators -> band-pass -> high-pass (the TR-808 design)."""
    freqs = [205.3, 304.4, 369.6, 522.7, 540, 800]
    sos_bp = butter(2, [3000, 12000], 'bandpass', fs=SR, output='sos')
    sos_hp = butter(2, 7000, 'highpass', fs=SR, output='sos')
    out = np.zeros(frames, np.float32)
    dec = .32 if open_ else .045
    for sec, v in hits:
        s = int(sec * SR)
        n = min(frames - s, int(dec * 5 * SR))
        if n <= 0:
            continue
        t = np.arange(n) / SR
        x = sum(np.sign(np.sin(2 * np.pi * f * t + i)) for i, f in enumerate(freqs))
        x = sosfilt(sos_hp, sosfilt(sos_bp, x)) * _env(n, dec) * .12 * v
        out[s:s + n] += x.astype(np.float32)
    return np.column_stack([out * .9, out])


# ----------------------------------------------------------- patterns

VEL = {'X': 1., 'x': .8, 'o': .55, 'g': .3, '.': 0, '-': 0}


def grid(pattern: str, piece: str, start=0., steps_per_beat=4, accent=None):
    """'x..x..x.|..x.x...' -> [(beat, piece, vel)]. Bars may be separated by |."""
    hits, i = [], 0
    for ch in pattern.replace(' ', ''):
        if ch == '|':
            continue
        v = VEL.get(ch)
        if v is None:
            raise ValueError(f'Bad drum char {ch!r}')
        if v:
            hits.append((start + i / steps_per_beat, piece, v))
        i += 1
    return hits


def loop(patterns: dict, bars: int, start_bar=0, beats_per_bar=4, steps_per_beat=4):
    """Repeat {piece: one-bar (or multi-bar) pattern} for `bars` bars."""
    hits = []
    for piece, pat in patterns.items():
        steps = len(pat.replace(' ', '').replace('|', ''))
        span = steps / steps_per_beat
        reps = int(np.ceil(bars * beats_per_bar / span))
        for r in range(reps):
            for h in grid(pat, piece, start_bar * beats_per_bar + r * span, steps_per_beat):
                if h[0] < (start_bar + bars) * beats_per_bar:
                    hits.append(h)
    return hits
