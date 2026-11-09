"""Surge XT rendering with real factory/third-party patches, plus small DSP voices.

Surge XT (GPL-3.0) is an offline authoring tool; its patches ship with Surge
(resources/data/patches_*). A patch is injected through the VST3 state, which
Surge stores as its own 'sub3' patch chunk inside JUCE's base64 wrapper.
"""
from __future__ import annotations
from functools import lru_cache
from pathlib import Path
import os
import re
import struct
import numpy as np
from pedalboard import load_plugin

from .sampler import SR, LIBS

PLUGIN = Path(os.environ.get('SURGE_VST3', Path.home() / '.cache/lucid-audio-authoring/surge-portable/usr/lib/vst3/Surge XT.vst3'))
PATCHES = LIBS / 'surge-patches/resources/data'
_JUCE64 = '.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+'


def _juce_b64(data: bytes) -> str:
    out, bits = [], len(data) * 8
    as_int = int.from_bytes(data, 'little')
    for pos in range(0, bits, 6):
        out.append(_JUCE64[(as_int >> pos) & 63])
    return f'{len(data)}.' + ''.join(out)


@lru_cache(maxsize=1)
def _template():
    plugin = load_plugin(str(PLUGIN))
    raw = plugin.raw_state
    xml = raw[8:].rstrip(b'\0').decode('utf-8')
    return xml


def find_patch(name: str) -> Path:
    """'Pads/Warm Pad' or a unique substring of a patch path."""
    hits = [p for p in PATCHES.rglob('*.fxp') if name.lower() in str(p.relative_to(PATCHES)).lower()]
    exact = [p for p in hits if p.stem.lower() == name.split('/')[-1].lower()]
    hits = exact or hits
    if not hits:
        raise FileNotFoundError(f'No Surge patch matching {name!r}')
    return sorted(hits, key=lambda p: len(str(p)))[0]


def instrument(patch: str, **params):
    plugin = load_plugin(str(PLUGIN))
    fxp = find_patch(patch).read_bytes()
    chunk = fxp[fxp.index(b'sub3'):]
    xml = re.sub(r'<IComponent>[^<]*</IComponent>', f'<IComponent>{_juce_b64(chunk)}</IComponent>', _template())
    body = xml.encode('utf-8') + b'\0'
    plugin.raw_state = b'VC2!' + struct.pack('<I', len(body)) + body
    for k, v in params.items():
        setattr(plugin, k, v)
    return plugin


def render(patch, events, frames, gain=1., params=None, legato=False):
    """events [(start_sec, dur_sec, pitch, vel)] -> stereo float32 (frames, 2)."""
    plugin = instrument(patch, **(params or {}))
    pre = .25          # Surge applies a loaded patch on the first audio block
    duration = frames / SR + pre
    msgs = []
    evs = sorted(events)
    if legato:      # overlap consecutive notes slightly for portamento patches
        evs = [(s, (evs[i + 1][0] - s + .02) if i + 1 < len(evs) and evs[i + 1][0] - (s + d) < .03 else d, p, v)
               for i, (s, d, p, v) in enumerate(evs)]
    for s, d, p, v in evs:
        if s >= duration:
            continue
        vel = max(1, min(127, round(v * 127)))
        msgs.append((bytes([0x90, p, vel]), max(0., s) + pre))
        msgs.append((bytes([0x80, p, 0]), min(duration - .002, s + pre + max(.01, d))))
    msgs.sort(key=lambda m: (m[1], m[0][0] == 0x90))
    out = plugin(msgs, duration=duration, sample_rate=SR, num_channels=2, buffer_size=1024, reset=True)
    out = np.ascontiguousarray(out.T[int(pre * SR):int(pre * SR) + frames], dtype=np.float32) * gain
    if not np.isfinite(out).all():
        raise RuntimeError(f'{patch}: non-finite output')
    return out


def list_patches(term=''):
    return sorted(str(p.relative_to(PATCHES)) for p in PATCHES.rglob('*.fxp') if term.lower() in str(p).lower())


# ----------------------------------------------------------- DSP voices

def sub808(events, frames, glide=.06, drive=1.6, decay=1.4, click=.25):
    """Tuned 808 bass: sine with a short pitch drop, smooth glides between
    overlapping notes, gentle saturation. events [(s, d, pitch, vel)]."""
    out = np.zeros(frames, np.float32)
    evs = sorted(events)
    for i, (s, d, p, v) in enumerate(evs):
        start = int(s * SR)
        if start >= frames:
            continue
        n = min(frames - start, int((d + .12) * SR))
        t = np.arange(n) / SR
        f_target = 440 * 2 ** ((p - 69) / 12)
        prev = evs[i - 1] if i else None
        if prev and prev[0] + prev[1] > s - .005 and prev[2] != p:
            f0 = 440 * 2 ** ((prev[2] - 69) / 12)
            f = f_target + (f0 - f_target) * np.exp(-t / glide)
        else:
            f = f_target * (1 + 1.2 * np.exp(-t / .012))   # punch: brief pitch drop
        phase = 2 * np.pi * np.cumsum(f) / SR
        env = np.exp(-t / decay) * np.minimum(1, t / .002)
        hold = int(d * SR)
        if hold < n:
            env[hold:] *= np.exp(-np.arange(n - hold) / SR / .045)
        x = np.sin(phase) * env + click * np.sin(phase * 2) * np.exp(-t / .01)
        x = np.tanh(drive * x) / np.tanh(drive)
        out[start:start + n] += (v * x).astype(np.float32)
    return np.column_stack([out, out])


def cowbell808(hits, frames, decay=.18):
    """TR-808 cowbell circuit model: two square waves (540/800 Hz) through a
    band-pass, with a fast and a slow decay. hits [(s, pitch_offset_semis, vel)]."""
    from scipy.signal import butter, sosfilt
    out = np.zeros(frames, np.float32)
    sos = butter(2, [450, 2600], 'bandpass', fs=SR, output='sos')
    for s, semis, v in hits:
        start = int(s * SR)
        n = min(frames - start, int(.7 * SR))
        if n <= 0:
            continue
        t = np.arange(n) / SR
        k = 2 ** (semis / 12)
        x = np.sign(np.sin(2 * np.pi * 540 * k * t)) + .85 * np.sign(np.sin(2 * np.pi * 800 * k * t))
        env = .65 * np.exp(-t / .012) + .35 * np.exp(-t / decay)
        y = sosfilt(sos, x * env) * v * .4
        out[start:start + n] += y.astype(np.float32)
    return np.column_stack([out, out])
