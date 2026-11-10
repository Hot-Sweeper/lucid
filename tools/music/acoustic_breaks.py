"""An original eight-bar drum performance made from pinned VCSL CC0 hits.

These are separately recorded acoustic percussion hits, not a vintage drumkit
loop or a copyrighted break. The concert bass drum is deliberately damped,
without a synthetic pitched kick layered over it. Recorded velocity layers and
alternate takes retain their relative amplitudes under a shared calibration.

Primary source and license: https://github.com/sgossner/VCSL
Phrase, sample-offset, retrigger, note-delay and mute-group implementation
references: https://tutorials.renoise.com/wiki/Sampler and
https://tutorials.renoise.com/wiki/Pattern_Effect_Commands .
"""
from pathlib import Path
import hashlib
import json
import warnings
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt


RATE = 44100
MANIFEST = Path(__file__).with_name('assets') / 'vcsl-drums.json'


class AcousticBreak:
    def __init__(self, sample_dir, bpm=164):
        self.beat = 60 / bpm
        self.manifest = json.loads(MANIFEST.read_text())
        self.samples = {}
        if not sample_dir:
            raise ValueError('Petal Breaks needs the pinned CC0 hits. Run tools/music/fetch-vcsl-drums.py --output-dir <directory>, then supply --sample-dir <directory>.')
        directory = Path(sample_dir)
        for entry in self.manifest['files']:
            path = directory / entry['file']
            data = path.read_bytes()
            if hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError(f'Unverified authoring sample: {path}')
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', wavfile.WavFileWarning)
                rate, pcm = wavfile.read(path)
            if rate != RATE or pcm.dtype != np.int16:
                raise ValueError(f'Expected the original 44.1 kHz 16-bit recording: {path}')
            audio = pcm.astype(np.float32) / 32768
            if audio.ndim == 1:
                audio = np.column_stack((audio, audio))
            self.samples[path.stem] = self._prepare(audio, path.stem)
        # Calibrate once per instrument/articulation, against its strongest
        # recorded layer. Do not turn every quiet stroke and alternate take
        # into the same full-peak hit before adding performance velocities.
        families = {
            'snare': ('snare_main_', ('snare_soft_', 'snare_medium_', 'snare_main_')),
            'bass': ('bass_main_', ('bass_soft_', 'bass_main_')),
            'closed hat': ('hat_main_', ('hat_soft_', 'hat_main_')),
            'open hat': ('hat_open_', ('hat_open_',)),
            'loose hat': ('hat_loose_', ('hat_loose_',)),
            'dry snare': ('snare_dry_', ('snare_dry_',)),
            'tom': ('tom_', ('tom_',)),
            'crash': ('crash_', ('crash_',)),
        }
        self.calibration = {}
        for family, (reference, prefixes) in families.items():
            peak = max(float(np.max(np.abs(audio))) for name, audio in self.samples.items() if name.startswith(reference))
            gain = .82 / max(1e-5, peak)
            for name in self.samples:
                if name.startswith(prefixes):
                    self.samples[name] *= gain
            self.calibration[family] = dict(referencePeak=peak, sharedGain=gain)
        self.source, self.cymbals, self.room_source, self.events = self._perform()

    @staticmethod
    def _prepare(audio, name):
        # Align the recorded attack, retaining a short lead before the onset.
        # The source files otherwise have 8-10 ms of variable leading silence.
        amplitude = np.max(np.abs(audio), axis=1)
        onset = np.flatnonzero(amplitude > amplitude.max() * .025)[0]
        audio = audio[max(0, onset - round(.0015 * RATE)):].copy()
        if name.startswith('bass'):
            duration, low, high = .40, 38, 2600
        elif name.startswith('snare'):
            duration, low, high = (.32 if 'soft' in name else .43), 115, 12600
        elif name.startswith('hat_open'):
            duration, low, high = .48, 900, 9800
        elif name.startswith('hat_loose'):
            duration, low, high = .24, 1000, 9800
        elif name.startswith('hat'):
            duration, low, high = .16, 1000, 9800
        elif name.startswith('tom'):
            duration, low, high = .4, 65, 9000
        else:
            duration, low, high = 1.1, 1100, 13000
        audio = audio[:round(duration * RATE)]
        audio = sosfilt(butter(2, [low, high], btype='bandpass', fs=RATE, output='sos'), audio, axis=0).astype(np.float32)
        if name.startswith('bass'):
            # A concert bass drum is not presented as a pedal kick. Its real
            # attack stays, while a short damping envelope controls its boom.
            t = np.arange(len(audio)) / RATE
            audio *= np.exp(-t / .12)[:, None]
        edge = min(round(.035 * RATE), len(audio) // 3)
        audio[-edge:] *= np.linspace(1, 0, edge, dtype=np.float32)[:, None]
        audio[:48] *= np.linspace(0, 1, 48, dtype=np.float32)[:, None]
        return audio

    def _velocity_layers(self, layers, velocity, take):
        """Blend recorded dynamics without independently boosting each layer.

        The recording supplies most of the soft-to-hard change. Scale only
        below/above the anchor range, avoiding a second full velocity envelope
        that would bury the already quiet ghost recording or jump at a switch.
        """
        if velocity <= layers[0][0]:
            return self.samples[f'{layers[0][1]}_{take}'] * (velocity/layers[0][0])**.8
        if velocity >= layers[-1][0]:
            return self.samples[f'{layers[-1][1]}_{take}'] * (velocity/layers[-1][0])**.8
        for (lower, first), (upper, second) in zip(layers, layers[1:]):
            if lower <= velocity < upper:
                weight = (velocity-lower)/(upper-lower)
                a, b = self.samples[f'{first}_{take}'], self.samples[f'{second}_{take}']
                audio = np.zeros((max(len(a),len(b)),2),dtype=np.float32)
                audio[:len(a)] += a * (1-weight)
                audio[:len(b)] += b * weight
                return audio
        raise ValueError(velocity)

    def hit(self, kind, velocity=1, alternate=0):
        take = alternate % 2 + 1
        if kind == 'snare':
            audio = self._velocity_layers([(.20,'snare_soft'),(.56,'snare_medium'),(.94,'snare_main')],velocity,take)
            level = .225
        elif kind == 'kick':
            audio = self._velocity_layers([(.50,'bass_soft'),(.95,'bass_main')],velocity,take)
            level = .23
        elif kind == 'hat':
            audio = self._velocity_layers([(.46,'hat_soft'),(.67,'hat_main')],velocity,take)
            level = .0355
        elif kind in ('loose', 'open'):
            audio, level = self.samples[f'hat_{kind}_{take}'], .047 * velocity
        elif kind == 'tom':
            audio, level = self.samples[f'tom_{take}'], .105 * velocity
        elif kind == 'dry':
            audio, level = self.samples[f'snare_dry_{take}'], .12 * velocity
        elif kind == 'crash':
            audio, level = self.samples['crash_short'], .025 * velocity
        else:
            raise ValueError(kind)
        audio = audio * level
        if kind == 'kick':
            # The real drum body provides the attack and decay. The score's
            # separate melodic sub already supplies its sustained low end.
            mono = audio.mean(axis=1)
            return np.column_stack((mono,mono)).astype(np.float32)
        # The lower kit stays centered. Cymbals have a restrained natural width.
        mid = audio.mean(axis=1)
        side = (audio[:, 0] - audio[:, 1]) * (.20 if kind in ('kick', 'snare', 'dry') else .4)
        return np.column_stack((mid + side, mid - side)).astype(np.float32)

    def _perform(self):
        rng = np.random.default_rng(410)
        kicks = [
            [(0,1),(1.5,.8),(2.75,.88)],
            [(0,.96),(.75,.55),(2.5,.90),(3.5,.59)],
            [(0,1),(1.75,.76),(2.5,.86)],
            [(0,.96),(.75,.62),(2.25,.82),(3.5,.51)],
            [(0,1),(1.5,.82),(2.75,.91),(3.75,.48)],
            [(0,.95),(2,.65),(2.5,.90)],
            [(0,1),(.75,.59),(1.5,.71),(2.75,.88)],
            [(0,.98),(2.5,.80)],
        ]
        ghosts = [
            [(.75,.19),(2.5,.24),(3.75,.23)],
            [(.5,.18),(1.75,.28),(2.875,.21),(3.75,.31)],
            [(.875,.22),(1.5,.18),(2.75,.30)],
            [(.75,.21),(2.625,.25),(3.5,.39),(3.75,.26)],
            [(.75,.20),(1.75,.26),(2.75,.31),(3.875,.19)],
            [(.5,.17),(1.75,.30),(2.75,.24)],
            [(.875,.24),(1.625,.22),(2.75,.29),(3.75,.27)],
            [(.75,.20),(2.75,.32),(3.5,.47),(3.75,.29)],
        ]
        events = []
        def event(kind, at, velocity, bar, late=0):
            # Deterministic performance offsets are small enough to preserve
            # drum phrasing, rather than replacing structure with randomness.
            jitter = rng.uniform(-.002, .002) if at else 0
            events.append(dict(kind=kind, beat=bar*4+at+(late+jitter)/self.beat,
                               velocity=velocity, alternate=len(events)))
        for bar in range(8):
            for at, velocity in kicks[bar]:
                event('kick', at, velocity, bar)
            event('snare', 1, .91 + (bar % 3) * .025, bar, .003)
            event('snare', 3, 1 if bar % 2 else .96, bar, .0045)
            for at, velocity in ghosts[bar]:
                event('snare', at, velocity, bar, .0015)
            for eighth in range(8):
                if bar in (3, 7) and eighth == 7:
                    continue
                position = eighth * .5 + (.022 if eighth % 2 else 0)
                kind = 'open' if (bar, eighth) in {(0,3),(2,7),(4,3),(6,5)} else 'loose' if (bar+eighth)%7==3 else 'hat'
                event(kind, position, .46 if eighth % 2 == 0 else .67, bar, -.001)
            if bar in (3,7):
                event('dry', 3.25, .47, bar)
                event('tom', 3.625, .64, bar)
            if bar == 4:
                event('crash', 0, .8, bar)
        events.sort(key=lambda item: item['beat'])
        source = np.zeros((round((32*self.beat+.8)*RATE),2), dtype=np.float32)
        cymbals = np.zeros_like(source)
        room_source = np.zeros_like(source)
        for index, item in enumerate(events):
            audio = self.hit(item['kind'], item['velocity'], item['alternate'])
            if item['kind'] in ('open', 'loose'):
                following = next((later for later in events[index+1:] if later['kind'] in ('hat','loose','open')), None)
                if following:
                    choke = round((following['beat'] - item['beat']) * self.beat * RATE)
                    audio = audio[:min(len(audio), choke + round(.006*RATE))].copy()
                    edge = min(round(.006*RATE), len(audio))
                    audio[-edge:] *= np.linspace(1,0,edge)[:, None]
            start = max(0, round(item['beat'] * self.beat * RATE))
            end = min(len(source), start+len(audio))
            source[start:end] += audio[:end-start]
            if item['kind'] in ('hat','loose','open','crash'):
                cymbals[start:end] += audio[:end-start]
            if item['kind'] in ('snare','dry','tom'):
                room_source[start:end] += audio[:end-start]
        return source, cymbals, room_source, events

    def fragment(self, source_beat, beats, *, reverse=False, speed=1, cymbals=1, stem='full'):
        """Cut performed phrases, retaining intra-phrase velocity and timing."""
        from scipy.signal import resample_poly
        from fractions import Fraction
        start = round(source_beat * self.beat * RATE)
        length = round(beats * self.beat * RATE)
        overlap = round(.003*RATE)
        if stem not in ('full','room'):
            raise ValueError(stem)
        source = self.room_source if stem == 'room' else self.source
        audio = source[start:start+length+overlap].copy()
        if cymbals != 1 and stem == 'full':
            audio += self.cymbals[start:start+length+overlap] * (cymbals-1)
        if reverse:
            audio = audio[::-1].copy()
        if speed != 1:
            ratio = Fraction(1/speed).limit_denominator(32)
            audio = resample_poly(audio, ratio.numerator, ratio.denominator, axis=0).astype(np.float32)
        edge = min(round(.0025*RATE), len(audio)//4)
        audio[:edge] *= np.linspace(0,1,edge)[:,None]
        audio[-edge:] *= np.linspace(1,0,edge)[:,None]
        return audio
