"""Multisampled instruments rendered offline from real recordings.

Libraries live in ~/.cache/lucid-audio-authoring/libs (fetched by
scripts/fetch-music-libraries.py). Only rendered MP3s ship with Lucid.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
import math
import os
import re
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from .theory import midi

SR = 44100
LIBS = Path(os.environ.get('LUCID_MUSIC_LIBS', Path.home() / '.cache/lucid-audio-authoring/libs'))


@lru_cache(maxsize=4096)
def load(path: str) -> np.ndarray:
    data, rate = sf.read(path, dtype='float32', always_2d=True)
    if data.shape[1] == 1:
        data = np.repeat(data, 2, axis=1)
    data = data[:, :2]
    if rate != SR:
        g = math.gcd(rate, SR)
        data = resample_poly(data, SR // g, rate // g, axis=0).astype(np.float32)
    return np.ascontiguousarray(data)


def pitch_shift(sample: np.ndarray, ratio: float, frames: int) -> np.ndarray:
    """Read the sample at `ratio` speed (cubic Hermite interpolation)."""
    if abs(ratio - 1) < 1e-4:
        out = sample[:frames]
        return out if len(out) == frames else np.pad(out, ((0, frames - len(out)), (0, 0)))
    pos = np.arange(frames, dtype=np.float64) * ratio
    pos = pos[pos < len(sample) - 3]
    i = pos.astype(np.int64)
    f = (pos - i)[:, None].astype(np.float32)
    xm1 = sample[np.maximum(i - 1, 0)]
    x0, x1, x2 = sample[i], sample[i + 1], sample[i + 2]
    c1 = .5 * (x1 - xm1)
    c2 = xm1 - 2.5 * x0 + 2 * x1 - .5 * x2
    c3 = .5 * (x2 - xm1) + 1.5 * (x0 - x1)
    out = ((c3 * f + c2) * f + c1) * f + x0
    if len(out) < frames:
        out = np.pad(out, ((0, frames - len(out)), (0, 0)))
    return out


@dataclass
class Region:
    path: str
    lokey: int
    hikey: int
    center: int
    lovel: int = 1
    hivel: int = 127
    tune: float = 0.       # cents
    gain_db: float = 0.
    release: float | None = None
    seq: int = 1           # round robin position (1-based)
    seq_len: int = 1


@dataclass
class MultiSampler:
    """Chromatic sampled instrument. `veltrack` 0..1: how much velocity changes
    level on top of the recorded dynamic layers."""
    name: str
    regions: list
    release: float = .35
    veltrack: float = .55
    gain_db: float = 0.
    max_seconds: float = 12.
    attack: float = .002
    _rr: dict = field(default_factory=dict)

    def pick(self, p: int, v: float):
        vel = max(1, min(127, round(v * 127)))
        cands = [r for r in self.regions if r.lokey <= p <= r.hikey and r.lovel <= vel <= r.hivel]
        if not cands:
            cands = [r for r in self.regions if r.lokey <= p <= r.hikey]
        if not cands:
            cands = sorted(self.regions, key=lambda r: min(abs(p - r.lokey), abs(p - r.hikey)))[:1]
            if not cands:
                raise ValueError(f'{self.name}: no regions')
        if len(cands) > 1 and any(r.seq_len > 1 for r in cands):
            key = (cands[0].lokey, cands[0].lovel)
            n = self._rr.get(key, 0)
            self._rr[key] = n + 1
            seq_len = max(r.seq_len for r in cands)
            want = n % seq_len + 1
            cands = [r for r in cands if r.seq == want] or cands
        return cands[0]

    def render(self, events, frames: int, pedal=None, seed=0):
        """events: [(start_sec, dur_sec, pitch, vel)] -> stereo buffer."""
        out = np.zeros((frames, 2), np.float32)
        pedal = sorted(pedal or [])
        for start, dur, p, v in sorted(events):
            r = self.pick(p, v)
            sample = load(r.path)
            end = start + dur
            for a, b in pedal:     # held by the sustain pedal
                if a <= end < b:
                    end = b
            rel = r.release if r.release is not None else self.release
            hold = max(.01, end - start)
            length = min(hold + rel, self.max_seconds)
            n = int(length * SR)
            ratio = 2 ** ((p - r.center + r.tune / 100) / 12)
            seg = pitch_shift(sample, ratio, n)
            env = np.ones(n, np.float32)
            a = min(n, max(1, int(self.attack * SR)))
            env[:a] = np.linspace(0, 1, a, dtype=np.float32)
            h = min(n, int(hold * SR))
            if h < n:
                t = np.arange(n - h, dtype=np.float32) / SR
                env[h:] *= np.exp(-t * (6.9 / max(rel, .02)))
            vel_db = self.veltrack * 40 * math.log10(max(v, .05))
            g = 10 ** ((vel_db + r.gain_db + self.gain_db) / 20)
            seg = seg * (env * g)[:, None]
            s = int(start * SR)
            if s >= frames:
                continue
            m = min(n, frames - s)
            out[s:s + m] += seg[:m]
        return out


# ---------------------------------------------------------------- SFZ import

def _parse_sfz(path: Path):
    text = path.read_text(errors='ignore')
    text = re.sub(r'//[^\n]*', '', text)
    defines = dict(re.findall(r'#define\s+(\$\w+)\s+(\S+)', text))
    text = re.sub(r'#define[^\n]*', '', text)
    for k in sorted(defines, key=len, reverse=True):
        text = text.replace(k, defines[k])
    order = ['control', 'global', 'master', 'group']
    scopes = {s: {} for s in order}
    regions, current = [], None

    def opcodes(chunk):
        # values may contain spaces (sample paths) up to the next opcode
        return dict((k, v.strip()) for k, v in re.findall(r'(\w+)=(.*?)(?=\s+\w+=|$)', ' '.join(chunk.split())))

    for tok in re.split(r'(<\w+>)', text):
        m = re.fullmatch(r'<(\w+)>', tok)
        if m:
            current = m[1]
            if current in scopes:
                for s in order[order.index(current):]:
                    scopes[s] = {}
            elif current == 'region':
                merged = {}
                for s in order:
                    merged.update(scopes[s])
                regions.append(merged)
            continue
        ops = opcodes(tok)
        if current in scopes:
            scopes[current].update(ops)
        elif current == 'region' and regions:
            regions[-1].update(ops)
    return regions


def _key(v):
    return int(v) if re.fullmatch(r'-?\d+', v) else midi(v.replace('#', '#'))


def from_sfz(path: Path, name=None, skip_triggers=('release',), **kw):
    regions = []
    for op in _parse_sfz(path):
        if 'sample' not in op or op.get('trigger') in skip_triggers:
            continue
        if any(k.startswith(('locc', 'hicc', 'sw_')) for k in op):
            continue
        sample = path.parent / op.get('default_path', '') / op['sample'].replace('\\', '/')
        if not sample.is_file():
            continue
        if 'key' in op:
            lo = hi = c = _key(op['key'])
        else:
            lo, hi = _key(op.get('lokey', '0')), _key(op.get('hikey', '127'))
            c = _key(op.get('pitch_keycenter', op.get('lokey', '60')))
        regions.append(Region(str(sample), lo, hi, c, int(op.get('lovel', 1)), int(op.get('hivel', 127)),
                              float(op.get('tune', 0)) + 100 * float(op.get('transpose', 0)) * 0,
                              float(op.get('volume', 0)),
                              float(op['ampeg_release']) if 'ampeg_release' in op else None,
                              int(op.get('seq_position', 1)), int(op.get('seq_length', 1))))
    if not regions:
        raise FileNotFoundError(f'No usable regions in {path}')
    return MultiSampler(name or path.stem, regions, **kw)


def _ranges(centers):
    """Split the keyboard between sorted sample centres."""
    centers = sorted(set(centers))
    out = {}
    for i, c in enumerate(centers):
        lo = 0 if i == 0 else (centers[i - 1] + c) // 2 + 1
        hi = 127 if i == len(centers) - 1 else (c + centers[i + 1]) // 2
        out[c] = (lo, hi)
    return out


def _vel_split(layers):
    layers = sorted(layers)
    n = len(layers)
    return {L: (1 + round(126 * i / n), round(127 * (i + 1) / n)) for i, L in enumerate(layers)}


# ------------------------------------------------------------- instruments

def rhodes(**kw):
    return from_sfz(LIBS / 'rhodes/jRhodes3d-st-no-xfade.sfz', 'rhodes', release=.45, veltrack=.35, **kw)


def wurlitzer(**kw):
    return from_sfz(LIBS / 'epianos/Wurlitzer EP200/Wurlitzer EP200.sfz', 'wurlitzer', release=.3, veltrack=.45, **kw)


def cp80(**kw):
    return from_sfz(LIBS / 'epianos/CP80/CP80.sfz', 'cp80', release=.4, veltrack=.45, **kw)


def grand(**kw):
    """Salamander Grand Piano V3 (Alexander Holm, CC-BY 3.0), five velocity layers."""
    files = list((LIBS / 'salamander/Samples').glob('*v*.flac'))
    parsed = []
    for f in files:
        m = re.fullmatch(r'([A-G]#?)(\d)v(\d+)\.flac', f.name)
        if m:
            parsed.append((midi(m[1] + m[2]), int(m[3]), str(f)))
    ranges = _ranges([p for p, _, _ in parsed])
    vel = _vel_split({L for _, L, _ in parsed})
    regs = [Region(path, *ranges[p], p, *vel[L]) for p, L, path in parsed]
    return MultiSampler('grand', regs, release=.5, veltrack=.4, max_seconds=14, **kw)


def upright_bass(style='finger', **kw):
    """Karoryfer Sneakybass (CC0): pizzicato double bass with 4 round robins."""
    root = LIBS / 'sneakybass/Samples' / style
    parsed = []
    for f in root.glob('*.wav'):
        m = re.fullmatch(r'sneakybass_([a-g]b?)(\d)_\w+?_rr(\d)\.wav', f.name)
        if m:
            parsed.append((midi(m[1][0].upper() + m[1][1:] + m[2]) - 12, int(m[3]), str(f)))  # files are named by written pitch
    ranges = _ranges([p for p, _, _ in parsed])
    n = max(rr for _, rr, _ in parsed)
    regs = [Region(path, *ranges[p], p, seq=rr, seq_len=n) for p, rr, path in parsed]
    return MultiSampler('upright-bass', regs, release=.12, veltrack=.7, **kw)


def vcsl_pitched(folder, name, release=.6, veltrack=.6, include='', octave=0, **kw):
    """Generic VCSL chromatic mallet/pluck folder (file names carry note + layer)."""
    root = LIBS / 'vcsl' / folder
    parsed = []
    for f in list(root.rglob('*.wav')) + list(root.rglob('*.flac')):
        stem = f.stem
        if include and not re.search(include, str(f)):
            continue
        m = re.search(r'(?<![A-Za-z])([A-G])([#b]|s|Sharp)?(\d)(?!\d)', stem)
        if not m:
            continue
        acc = {'s': '#', 'Sharp': '#'}.get(m[2] or '', m[2] or '')
        layer = re.search(r'(?:_v|vl|_L|_)(\d+)(?:_|$)', stem[m.end():])
        rr = re.search(r'rr(\d+)', stem)
        parsed.append((midi(m[1] + acc + m[3]) + 12 * octave, int(layer[1]) if layer else 1, int(rr[1]) if rr else 1, str(f)))
    if not parsed:
        raise FileNotFoundError(root)
    ranges = _ranges([p for p, *_ in parsed])
    vel = _vel_split({L for _, L, _, _ in parsed})
    n = max(rr for _, _, rr, _ in parsed)
    regs = [Region(path, *ranges[p], p, *vel[L], seq=rr, seq_len=n) for p, L, rr, path in parsed]
    return MultiSampler(name, regs, release=release, veltrack=veltrack, **kw)


def vibraphone(**kw):
    # VCSL names the vibraphone an octave below its sounding pitch (measured).
    return vcsl_pitched('Idiophones/Struck Idiophones/Vibraphone', 'vibraphone', release=1.2,
                        include='Soft Mallets|Hard Mallets', octave=1, **kw)




def harp(**kw):
    return vcsl_pitched('Chordophones/Composite Chordophones/Concert Harp', 'harp', release=1.5, **kw)
