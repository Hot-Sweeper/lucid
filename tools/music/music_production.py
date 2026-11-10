"""Offline stem production using Pedalboard's native JUCE processors.

Authoring dependency: pedalboard==0.9.26, numpy. The application ships encoded
music only, never these processors or a new runtime dependency. Inputs and
outputs use Lucid's (frames, 2) float32 layout. Process distinct stems before the
existing final level/headroom pass; do not apply every effect to the master.

Primary references:
https://spotify.github.io/pedalboard/reference/pedalboard.html
https://github.com/spotify/pedalboard (GPL-3.0 authoring tool)

Reverb here is algorithmic. An optional explicitly supplied room IR may be used
for convolution; the caller must retain the source/permission of that IR. No
unidentified or synthetic IR is presented as a measured physical room.
"""
from pathlib import Path
from typing import Literal
import numpy as np
from pedalboard import (
    Pedalboard, HighpassFilter, LowpassFilter, PeakFilter, LowShelfFilter,
    HighShelfFilter, Reverb, Chorus, Compressor, Convolution, Distortion,
)

Role = Literal['drums', 'bass', 'keys', 'lead', 'pads', 'chamber']
Room = Literal['none', 'small', 'chamber', 'bloom']


def _audio(audio):
    data = np.asarray(audio, dtype=np.float32)
    if data.ndim != 2 or data.shape[1] != 2 or not len(data):
        raise ValueError('Expected nonempty (frames, 2) stereo audio.')
    if not np.isfinite(data).all():
        raise ValueError('Audio contains non-finite samples.')
    return np.ascontiguousarray(data.T)


def _run(board, channels, rate):
    # A fresh processing owner per stem prevents the previous song's delay or
    # reverb from leaking into the next authoring invocation.
    result = board(channels, rate, buffer_size=8192, reset=True)
    if result.shape != channels.shape or not np.isfinite(result).all():
        raise RuntimeError('The stem processor changed shape or produced invalid audio.')
    return result


def center_low_end(audio, sample_rate=44100, cutoff_hz=160):
    """Keep shared bass energy centered, while preserving upper stereo motion."""
    channels = _audio(audio)
    mid = (channels[0] + channels[1]) * .5
    side = (channels[0] - channels[1]) * .5
    upper_side = _run(Pedalboard([HighpassFilter(cutoff_hz)]), side[None, :], sample_rate)[0]
    return np.ascontiguousarray(np.column_stack((mid + upper_side, mid - upper_side)), dtype=np.float32)


def room_send(audio, sample_rate=44100, room: Room='chamber', send=.12,
              impulse_response: str | Path | None=None):
    """Filtered parallel ambience, preserving the original direct transient.

    Allocate the musical release tail before calling. This function deliberately
    keeps the score's frame count rather than silently lengthening its duration.
    The dry signal is never compressed, chorused or filtered by this send.
    """
    channels = _audio(audio)
    if room not in ('none', 'small', 'chamber', 'bloom'):
        raise ValueError('Choose none, small, chamber or bloom.')
    if not 0 <= send <= .35:
        raise ValueError('Space send must be between 0 and .35.')
    if room == 'none' or not send:
        return channels.T.copy()
    if impulse_response is not None:
        ir = Path(impulse_response)
        if not ir.is_file():
            raise FileNotFoundError(ir)
        verb = Convolution(str(ir), mix=1)
    else:
        size, damp, width = {'small':(.20,.73,.75), 'chamber':(.36,.68,.9), 'bloom':(.73,.58,1)}[room]
        verb = Reverb(room_size=size, damping=damp, wet_level=1, dry_level=0, width=width)
    # Bright or muddy tails must not compete with the lead or bass. This is
    # applied to the return only, not indiscriminately to the composition.
    wet = _run(Pedalboard([HighpassFilter(190), verb, LowpassFilter(6200)]), channels, sample_rate)
    return np.ascontiguousarray((channels + wet * send).T, dtype=np.float32)


def process_stem(audio, sample_rate=44100, role: Role='keys', *,
                 room: Room='none', send=.1, chorus=False, drive_db=0,
                 impulse_response: str | Path | None=None):
    """Role-specific corrective EQ with explicit, restrained optional character.

    There is no per-stem normalization or automatic loudness increase. Saturation
    is an explicit broad-band soft clip, not a claim to emulate a tape machine.
    Drums stay rhythmically intact; bass is mono. Pads can have slow modulation,
    and chamber/keys can use a quiet filtered space return.
    """
    if sample_rate < 22050:
        raise ValueError('Use at least 22050 Hz for this authoring chain.')
    if not 0 <= drive_db <= 6:
        raise ValueError('Drive must be between 0 and 6 dB.')
    channels = _audio(audio)
    chains = {
        'drums': [HighpassFilter(27), Compressor(threshold_db=-16, ratio=1.35, attack_ms=18, release_ms=85)],
        'bass': [HighpassFilter(25), LowpassFilter(6500)],
        'keys': [HighpassFilter(85), PeakFilter(330, gain_db=-1.2, q=.8)],
        'lead': [HighpassFilter(130), HighShelfFilter(6500, gain_db=-1.0)],
        'pads': [HighpassFilter(145), LowShelfFilter(300, gain_db=-1.4), LowpassFilter(9000)],
        'chamber': [HighpassFilter(70), PeakFilter(380, gain_db=-.8, q=.8)],
    }
    if role not in chains:
        raise ValueError(f'Unknown stem role: {role}')
    chain = chains[role]
    if chorus:
        if role not in ('pads', 'keys'):
            raise ValueError('Use slow chorus only on pads or keys, never the drum/bass bus.')
        chain.append(Chorus(rate_hz=.17, depth=.08, centre_delay_ms=9, feedback=.015, mix=.07))
    if drive_db:
        chain.extend([Distortion(drive_db=drive_db)])
    produced = _run(Pedalboard(chain), channels, sample_rate).T
    if role == 'bass':
        mono = produced.mean(axis=1)
        produced = np.column_stack((mono, mono)).astype(np.float32)
    else:
        produced = center_low_end(produced, sample_rate)
    return room_send(produced, sample_rate, room, send, impulse_response)


def smoke_check():
    """Signal/lifecycle checks only; this does not establish listening quality."""
    rate = 44100
    t = np.arange(rate * 2) / rate
    source = np.column_stack((.1*np.sin(2*np.pi*220*t), .1*np.sin(2*np.pi*220*t+.08))).astype(np.float32)
    source[rate:] = 0
    for role in ('drums', 'bass', 'keys', 'lead', 'pads', 'chamber'):
        first = process_stem(source, rate, role, room='small' if role in ('keys', 'chamber') else 'none')
        second = process_stem(source, rate, role, room='small' if role in ('keys', 'chamber') else 'none')
        assert first.shape == source.shape and np.isfinite(first).all()
        assert np.array_equal(first, second), 'Repeated renders must not retain an old effect tail.'
        assert np.max(np.abs(first)) < .5
        if role == 'bass':
            assert np.array_equal(first[:, 0], first[:, 1])
    dry = room_send(source, rate, 'none')
    assert np.array_equal(dry, source), 'Bypassing the send must preserve direct audio.'
    wet = room_send(source, rate, 'chamber', send=.12)
    assert np.sqrt(np.mean(wet[rate:rate+rate//2]**2)) > 1e-6, 'Space has a real decaying tail.'
    print('PASS: Pedalboard 0.9.26 stem processing, finite shape-preserving stereo, deterministic reset, mono bass, real room tail, exact send bypass. No subjective listening claim.')


if __name__ == '__main__':
    smoke_check()
