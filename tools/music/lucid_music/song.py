"""Song: arrangement, performance timing, mixing and export."""
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
import json
import subprocess
import numpy as np

from . import fx, synth, drums as drumlib
from .sampler import SR, MultiSampler
from .theory import Note


@dataclass
class Track:
    name: str
    kind: str                     # 'notes' | 'drums' | 'audio'
    source: object                # instrument / kit / buffer
    items: list                   # notes or hits
    gain_db: float = 0.
    pan: float = 0.
    chain: object = None          # callable(audio, song) -> audio
    reverb: float = 0.
    delay: float = 0.
    duck: float = 0.              # sidechain depth from kicks
    bus: str = 'music'
    humanize_ms: float = 6.
    vel_jitter: float = .05
    pedal: list | None = None     # [(start_beat, end_beat)]
    late: dict = field(default_factory=dict)   # per-piece push/pull in seconds
    swing: bool = True
    legato: bool = False
    level: float | None = None    # target active RMS (dBFS) before gain_db


class Song:
    def __init__(self, id, title, *, bpm, key, mode, genre, energy, period, textures,
                 meter=4, swing=.5, swing_unit=.25, seed=1, space=None, delay_beats=.75):
        self.id, self.title, self.bpm, self.key, self.mode = id, title, bpm, key, mode
        self.genre, self.energy, self.period, self.textures, self.meter = genre, energy, period, list(textures), meter
        self.swing, self.swing_unit = swing, swing_unit
        self.rng = np.random.default_rng(seed)
        self.seed = seed
        self.space = dict(seconds=2.4, predelay=.025, damp=.5, bright=6500) | (space or {})
        self.delay_beats = delay_beats
        self.tracks: list[Track] = []
        self.length_beats = None
        self.bus_chain = {}
        self.master_chain = None
        self.master_opts = {}
        self.sections = []

    # ------------------------------------------------------------ timing
    @property
    def spb(self):
        return 60 / self.bpm

    def warp(self, beat):
        """Swing as a time warp inside each pair of `swing_unit` steps."""
        if self.swing == .5:
            return beat
        pair = self.swing_unit * 2
        base = np.floor(beat / pair) * pair
        p = beat - base
        half = pair / 2
        s = self.swing * pair
        return base + (p * s / half if p < half else s + (p - half) * (pair - s) / half)

    def sec(self, beat, swing=True):
        return (self.warp(beat) if swing else beat) * self.spb

    def bar(self, n):
        return n * self.meter

    def section(self, name, start_bar, bars):
        self.sections.append(dict(name=name, startBar=start_bar, bars=bars))

    # ------------------------------------------------------------ tracks
    def notes(self, name, instrument, notes, **kw):
        t = Track(name, 'notes', instrument, list(notes), **kw)
        self.tracks.append(t)
        return t

    def drums(self, name, kit, hits, **kw):
        kw.setdefault('bus', 'drums')
        kw.setdefault('humanize_ms', 4)
        t = Track(name, 'drums', kit, list(hits), **kw)
        self.tracks.append(t)
        return t

    def audio(self, name, fn, **kw):
        """fn(frames, song) -> stereo buffer."""
        t = Track(name, 'audio', fn, [], **kw)
        self.tracks.append(t)
        return t

    # ------------------------------------------------------------ render
    def _events(self, t: Track):
        evs = []
        for n in t.items:
            jitter = self.rng.normal(0, t.humanize_ms / 1000) if t.humanize_ms else 0
            s = self.sec(n.t, t.swing) + jitter
            e = self.sec(n.t + n.d, t.swing) + jitter
            v = float(np.clip(n.v * (1 + self.rng.normal(0, t.vel_jitter)), .05, 1))
            evs.append((max(0., s), max(.02, e - s), n.p, v))
        return evs

    def kick_times(self):
        times = []
        for t in self.tracks:
            if t.kind == 'drums':
                times += [self.sec(b, t.swing) + t.late.get(p, 0) for b, p, v in t.items if p in ('k', 'kick808')]
            if t.name.startswith('808'):
                pass
        return sorted(times)

    def render_track(self, t: Track, frames):
        if t.kind == 'notes':
            evs = self._events(t)
            src = t.source
            if isinstance(src, MultiSampler):
                pedal = [(self.sec(a), self.sec(b)) for a, b in (t.pedal or [])]
                out = src.render(evs, frames, pedal=pedal)
            elif isinstance(src, tuple) and src[0] == 'surge':
                out = synth.render(src[1], evs, frames, params=src[2] if len(src) > 2 else None, legato=t.legato)
            elif isinstance(src, tuple) and src[0] == '808':
                out = synth.sub808(evs, frames, **(src[1] if len(src) > 1 else {}))
            else:
                raise TypeError(f'{t.name}: unknown instrument')
        elif t.kind == 'drums':
            hits = []
            analog = {}
            for b, p, v in t.items:
                jitter = self.rng.normal(0, t.humanize_ms / 1000) if t.humanize_ms else 0
                s = max(0., self.sec(b, t.swing) + t.late.get(p, 0) + jitter)
                v = float(np.clip(v * (1 + self.rng.normal(0, t.vel_jitter)), .05, 1))
                if isinstance(t.source, dict) and p in t.source:
                    hits.append((s, p, v))
                else:
                    analog.setdefault(p, []).append((s, v))
            out = drumlib.render_hits(t.source, hits, frames) if hits else np.zeros((frames, 2), np.float32)
            voices = {'kick808': drumlib.kick808, 'snare909': drumlib.snare909, 'clap808': drumlib.clap808,
                      'hat808': drumlib.hat808, 'ohat808': lambda h, f: drumlib.hat808(h, f, open_=True),
                      'cowbell808': lambda h, f: synth.cowbell808([(s, 0, v) for s, v in h], f)}
            for p, hs in analog.items():
                opts = t.source.get('_opts', {}).get(p, {}) if isinstance(t.source, dict) else {}
                if p == 'kick808' and opts:
                    out += drumlib.kick808(hs, frames, **opts)
                elif p in voices:
                    out += voices[p](hs, frames)
                else:
                    raise KeyError(f'{t.name}: no drum piece {p!r}')
        else:
            out = t.source(frames, self)
        if t.level is not None:
            out = fx.level(out, t.level)
        if t.chain:
            out = t.chain(out, self)
        if t.pan:
            out = fx.pan(out, t.pan)
        return out * 10 ** (t.gain_db / 20)

    def render(self, out_dir: Path, stems=False, preview=None):
        assert self.length_beats, 'set song.length_beats'
        tail = self.space['seconds'] + 1.0
        frames = int((self.sec(self.length_beats, False) + tail) * SR)
        if preview:
            frames = min(frames, int(preview * SR))
        buses = {}
        rev_send = np.zeros((frames, 2), np.float32)
        del_send = np.zeros((frames, 2), np.float32)
        kicks = self.kick_times()
        report = []
        for t in self.tracks:
            a = self.render_track(t, frames)
            if t.duck and kicks:
                a = fx.sidechain(a, kicks, depth=t.duck)
            rev_send += a * t.reverb
            del_send += a * t.delay
            buses[t.bus] = buses.get(t.bus, 0) + a
            report.append(dict(track=t.name, kind=t.kind, items=len(t.items),
                               peak=round(float(np.abs(a).max()), 4), rms=round(float(np.sqrt((a ** 2).mean())), 5)))
        mix = np.zeros((frames, 2), np.float32)
        for name, a in buses.items():
            if name in self.bus_chain:
                a = self.bus_chain[name](a, self)
            mix += a
        if np.abs(del_send).max() > 0:
            d = fx.delay(del_send, self.delay_beats * self.spb, feedback=.38, mix=1.)
            rev_send += d * .35
            mix += d
        if np.abs(rev_send).max() > 0:
            ir = fx.impulse(**self.space, seed=self.seed)
            mix += fx.reverb(fx.eq(rev_send, hp=220, lp=9000), ir)
        if self.master_chain:
            mix = self.master_chain(mix, self)
        mix = fx.master(mix, **self.master_opts)
        mix = self._trim_tail(mix)
        out_dir.mkdir(parents=True, exist_ok=True)
        wav = out_dir / f'{self.id}.wav'
        import soundfile as sf
        sf.write(wav, mix, SR, subtype='PCM_24')
        return wav, report, mix

    def _trim_tail(self, mix):
        level = np.abs(mix).max(axis=1)
        active = np.flatnonzero(level > 10 ** (-58 / 20))
        end = min(len(mix), active[-1] + int(.25 * SR))
        mix = mix[:end].copy()
        n = min(len(mix), int(.6 * SR))
        mix[-n:] *= np.linspace(1, 0, n)[:, None] ** 2
        start = active[0]
        if start > int(.2 * SR):
            mix = mix[start - int(.05 * SR):]
        return mix

    def encode(self, wav: Path, out: Path):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-c:a', 'libopus', '-b:a', '128k', '-vbr', 'constrained',
                        '-application', 'audio', str(out)], check=True)

    def catalog_row(self):
        return dict(id=self.id, title=self.title, period=self.period, bpm=self.bpm, genre=self.genre,
                    energy=self.energy, key=self.key, mode=self.mode, meter=self.meter, textures=self.textures,
                    sections=self.sections)
