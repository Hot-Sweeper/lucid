"""Mixing tools: EQ, space, tape/vinyl character, sidechain and mastering."""
from __future__ import annotations
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt, sosfiltfilt
from pedalboard import (Pedalboard, HighpassFilter, LowpassFilter, PeakFilter, LowShelfFilter,
                        HighShelfFilter, Compressor, Chorus, Limiter, Gain, Phaser)
import pyloudnorm

from .sampler import SR


def run(audio, *plugins):
    board = Pedalboard(list(plugins))
    return np.ascontiguousarray(board(audio.T.astype(np.float32), SR, reset=True).T)


def eq(audio, hp=None, lp=None, low_shelf=None, high_shelf=None, peaks=()):
    chain = []
    if hp:
        chain.append(HighpassFilter(hp))
    if lp:
        chain.append(LowpassFilter(lp))
    if low_shelf:
        chain.append(LowShelfFilter(*low_shelf))
    if high_shelf:
        chain.append(HighShelfFilter(*high_shelf))
    for f, g, q in peaks:
        chain.append(PeakFilter(f, g, q))
    return run(audio, *chain) if chain else audio


def lp4(audio, cutoff):
    """Steep, phase-true low-pass (used for lo-fi band limiting)."""
    sos = butter(4, cutoff, 'lowpass', fs=SR, output='sos')
    return sosfiltfilt(sos, audio, axis=0).astype(np.float32)


def comp(audio, threshold=-18, ratio=3, attack=10, release=120, makeup=0):
    out = run(audio, Compressor(threshold, ratio, attack, release))
    return out * 10 ** (makeup / 20)


def chorus(audio, rate=.6, depth=.18, mix=.35, delay=7):
    return run(audio, Chorus(rate_hz=rate, depth=depth, centre_delay_ms=delay, feedback=0, mix=mix))


def phaser(audio, rate=.15, depth=.5, mix=.3):
    return run(audio, Phaser(rate_hz=rate, depth=depth, mix=mix))


def width(audio, amount=1.2):
    mid = (audio[:, 0] + audio[:, 1]) * .5
    side = (audio[:, 0] - audio[:, 1]) * .5 * amount
    return np.column_stack([mid + side, mid - side]).astype(np.float32)


def mono_below(audio, hz=150):
    sos = butter(2, hz, 'highpass', fs=SR, output='sos')
    mid = (audio[:, 0] + audio[:, 1]) * .5
    side = sosfilt(sos, (audio[:, 0] - audio[:, 1]) * .5)
    return np.column_stack([mid + side, mid - side]).astype(np.float32)


def pan(audio, p):
    """Constant-power pan of a (mostly mono) part; p in -1..1."""
    a = (p + 1) * np.pi / 4
    m = audio.mean(axis=1)
    side = (audio[:, 0] - audio[:, 1]) * .5
    return np.column_stack([m * np.cos(a) * 1.414 + side, m * np.sin(a) * 1.414 - side]).astype(np.float32)


# ------------------------------------------------------------- space

def impulse(seconds=2.2, predelay=.02, damp=.55, bright=7000, seed=1, early=True):
    """Smooth stereo reverb tail: decorrelated noise with frequency-dependent
    decay (highs die faster), optional sparse early reflections."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros((n + int(predelay * SR), 2), np.float32)
    bands = [(0, 400, 1.0), (400, 2500, .85), (2500, 7000, .6 - .3 * damp), (7000, 16000, .35 - .25 * damp)]
    for ch in range(2):
        tail = np.zeros(n)
        for lo, hi, life in bands:
            noise = rng.standard_normal(n)
            if lo == 0:
                sos = butter(2, hi, 'lowpass', fs=SR, output='sos')
            else:
                sos = butter(2, [lo, min(hi, SR / 2 - 100)], 'bandpass', fs=SR, output='sos')
            band = sosfilt(sos, noise)
            tail += band * np.exp(-t * 6.9 / max(.05, seconds * life))
        tail *= np.minimum(1, t / .012)       # soft onset of the diffuse field
        if early:
            for k in range(8):
                pos = int(rng.uniform(.004, .045) * SR)
                tail[pos] += rng.uniform(-.6, .6) * (1 - k / 10)
        sos = butter(1, bright, 'lowpass', fs=SR, output='sos')
        tail = sosfilt(sos, tail)
        out[int(predelay * SR):, ch] = tail
    out /= np.sqrt((out ** 2).sum() / 2)
    return out


def reverb(audio, ir, mix=1.):
    wet = np.column_stack([fftconvolve(audio[:, 0], ir[:, 0])[:len(audio)],
                           fftconvolve(audio[:, 1], ir[:, 1])[:len(audio)]]).astype(np.float32)
    return wet * mix


def delay(audio, seconds, feedback=.35, mix=.25, ping_pong=True, hp=300, lp=4500, repeats=8):
    """Filtered echoes; each repeat darker. Ping-pong alternates sides."""
    out = np.zeros_like(audio)
    step = int(seconds * SR)
    sos = butter(1, [hp, lp], 'bandpass', fs=SR, output='sos')
    x = sosfilt(sos, audio.mean(axis=1)).astype(np.float32)
    g = 1.
    for k in range(1, repeats + 1):
        g *= feedback if k > 1 else 1
        if k * step >= len(audio) or g < .01:
            break
        x = sosfilt(sos, x).astype(np.float32) if k > 1 else x
        side = (k % 2) if ping_pong else None
        seg = x[:len(audio) - k * step] * g
        if side is None:
            out[k * step:, 0] += seg
            out[k * step:, 1] += seg
        else:
            out[k * step:, side] += seg
            out[k * step:, 1 - side] += seg * .35
    return out * mix


# ------------------------------------------------------------- character

def sidechain(audio, times, depth=.5, release=.18, attack=.004):
    """Duck under kick hits (seconds) with a smooth curve, not a gate."""
    n = len(audio)
    g = np.ones(n, np.float32)
    for s in times:
        i = int(s * SR)
        if i >= n:
            continue
        m = min(n - i, int(release * 5 * SR))
        t = np.arange(m) / SR
        a = int(attack * SR)
        curve = 1 - depth * np.exp(-t / release)
        if a and i - a >= 0:
            g[i - a:i] = np.minimum(g[i - a:i], np.linspace(1, 1 - depth, a))
        g[i:i + m] = np.minimum(g[i:i + m], curve)
    return audio * g[:, None]


def tape(audio, wow=.0016, flutter=.00025, drive=1.4, seed=2, hiss=0.):
    """Wow/flutter through a modulated delay line, soft saturation, gentle top roll-off."""
    n = len(audio)
    rng = np.random.default_rng(seed)
    t = np.arange(n) / SR
    drift = np.cumsum(rng.standard_normal(n // 4410 + 2)) * .15
    drift = np.interp(t, np.arange(len(drift)) * .1, drift)
    mod = wow * np.sin(2 * np.pi * .55 * t + 1.3) + .6 * wow * np.sin(2 * np.pi * .21 * t) \
        + flutter * np.sin(2 * np.pi * 7.3 * t) + wow * .25 * np.tanh(drift)
    pos = np.arange(n) - (mod + wow * 2) * SR
    pos = np.clip(pos, 0, n - 1)
    out = np.column_stack([np.interp(pos, np.arange(n), audio[:, c]) for c in range(2)])
    out = np.tanh(drive * out) / np.tanh(drive)
    out = eq(out.astype(np.float32), lp=12500, high_shelf=(6000, -2.0), low_shelf=(120, 1.0))
    if hiss:
        noise = rng.standard_normal((n, 2)).astype(np.float32)
        out += eq(noise, hp=3000, lp=11000) * hiss
    return out.astype(np.float32)


def vinyl(frames, level=.012, seed=4, rumble=.004):
    """Crackle (sparse filtered impulses) and soft rumble."""
    rng = np.random.default_rng(seed)
    out = np.zeros((frames, 2), np.float32)
    count = int(frames / SR * 9)
    pos = rng.integers(0, frames - 200, count)
    amps = rng.pareto(2.5, count) * .25
    for p, a in zip(pos, amps):
        L = rng.integers(8, 60)
        click = rng.standard_normal(L) * np.exp(-np.arange(L) / (L / 4)) * min(a, 1.5)
        ch = rng.random()
        out[p:p + L, 0] += click * (1 if ch < .7 else .4)
        out[p:p + L, 1] += click * (1 if ch > .3 else .4)
    out = eq(out, hp=900, lp=9000) * level * 6
    rum = rng.standard_normal(frames).astype(np.float32)
    rum = sosfilt(butter(2, [30, 120], 'bandpass', fs=SR, output='sos'), rum).astype(np.float32)
    out += np.column_stack([rum, rum]) * rumble
    return out


def downsample(audio, rate=26000, bits=None):
    """Old-sampler band limiting (resample down and back)."""
    from scipy.signal import resample_poly
    from math import gcd
    g = gcd(rate, SR)
    low = resample_poly(audio, rate // g, SR // g, axis=0)
    if bits:
        q = 2 ** (bits - 1)
        low = np.round(low * q) / q
    return resample_poly(low, SR // g, rate // g, axis=0)[:len(audio)].astype(np.float32)


def filter_sweep(audio, points, kind='lowpass'):
    """Automate a filter: points [(sec, hz)], linear in log-frequency. Blocks of 256."""
    n = len(audio)
    secs = np.array([p[0] for p in points])
    hz = np.log(np.array([p[1] for p in points]))
    out = np.empty_like(audio)
    block = 256
    zi = None
    for i in range(0, n, block):
        f = float(np.exp(np.interp(i / SR, secs, hz)))
        f = min(max(f, 20), SR / 2 - 200)
        sos = butter(2, f, kind, fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2, 2))
        seg = audio[i:i + block]
        y = np.empty_like(seg)
        for c in range(2):
            y[:, c], zi[:, :, c] = sosfilt(sos, seg[:, c], zi=zi[:, :, c])
        out[i:i + block] = y
    return out


def fade(audio, fade_in=0., fade_out=0., curve=2.):
    out = audio.copy()
    if fade_in:
        n = int(fade_in * SR)
        out[:n] *= (np.linspace(0, 1, n) ** curve)[:, None]
    if fade_out:
        n = int(fade_out * SR)
        out[-n:] *= (np.linspace(1, 0, n) ** curve)[:, None]
    return out


def automate(audio, points):
    """Volume automation: points [(sec, gain_db)]."""
    t = np.arange(len(audio)) / SR
    g = 10 ** (np.interp(t, [p[0] for p in points], [p[1] for p in points]) / 20)
    return audio * g[:, None].astype(np.float32)


# ------------------------------------------------------------- master

def loudness(audio):
    return pyloudnorm.Meter(SR).integrated_loudness(audio.astype(np.float64))


def true_peak_db(audio):
    from scipy.signal import resample_poly
    up = resample_poly(audio, 4, 1, axis=0)
    return 20 * np.log10(np.abs(up).max() + 1e-12)


def limit(audio, ceiling_db=-3.4, lookahead=.004, release=.09):
    """Look-ahead peak limiter without makeup gain."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    c = 10 ** (ceiling_db / 20)
    peak = np.abs(audio).max(axis=1)
    want = np.minimum(1, c / np.maximum(peak, 1e-9))
    la = max(1, int(lookahead * SR))
    g = minimum_filter1d(want, size=2 * la + 1)
    # release: let gain recover smoothly (one-pole, upward only)
    coef = np.exp(-1 / (release * SR))
    out = np.empty_like(g)
    cur = 1.
    for i in range(0, len(g), 64):          # block-wise for speed
        blk = g[i:i + 64]
        m = blk.min()
        cur = m if m < cur else cur * coef ** 64 + m * (1 - coef ** 64)
        out[i:i + 64] = np.minimum(blk, cur)
    out = uniform_filter1d(out, size=la)
    return (audio * out[:, None]).astype(np.float32)


def level(audio, target_db):
    """Scale to a target RMS measured over the active (non-silent) part."""
    m = audio.mean(axis=1)
    hop = SR // 10
    w = np.array([np.sqrt(np.mean(m[i:i + hop] ** 2)) for i in range(0, len(m) - hop, hop)] or [0])
    if w.max() <= 0:
        return audio
    active = w[w > w.max() * 10 ** (-30 / 20)]
    rms = np.sqrt(np.mean(active ** 2))
    return audio * (10 ** (target_db / 20) / rms)


def master(audio, target_lufs=-17.5, ceiling_db=-3.4, glue=True, low_cut=28, air=0.):
    x = eq(audio, hp=low_cut, high_shelf=(9000, air) if air else None)
    if glue:
        x = comp(x, threshold=-14, ratio=1.8, attack=25, release=180)
    x = mono_below(x, 120)
    for _ in range(3):
        x = x * 10 ** ((target_lufs - loudness(x)) / 20)
        x = limit(x, ceiling_db - .3)
    tp = true_peak_db(x)
    if tp > ceiling_db:
        x = x * 10 ** ((ceiling_db - tp - .05) / 20)
    return x.astype(np.float32)


def gated_reverb(audio, gate=.28, seconds=1.4, mix=.8, seed=9):
    """80s gated room: dense short tail that is cut off abruptly after `gate` s,
    retriggered by each hit (envelope follows the dry signal)."""
    ir = impulse(seconds, predelay=.004, damp=.2, bright=9000, seed=seed, early=True)
    n = int(gate * SR)
    shape = np.ones(len(ir), np.float32)
    shape[n:] = 0
    shape[max(0, n - int(.02 * SR)):n] = np.linspace(1, 0, min(n, int(.02 * SR)))
    ir = ir * shape[:, None]
    ir /= np.sqrt((ir ** 2).sum() / 2)
    return audio + reverb(audio, ir) * mix
