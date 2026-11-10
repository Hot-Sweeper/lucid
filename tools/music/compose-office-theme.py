"""Original Lucid score, 'Little Lights', and soft room air. No external samples.

Rebuild with Python + numpy + scipy and ffmpeg on PATH. The app only ships the
encoded assets, never a runtime synthesizer or a dependency on these tools.
"""
from pathlib import Path
import argparse
import json
import subprocess
import tempfile
import wave

import numpy as np
from scipy.signal import butter, sosfilt

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--only', choices=['both', 'theme', 'ambience'], default='both',
                    help='Export just room ambience without replacing the original song.')
args = parser.parse_args()

RATE = 44100
BPM = 78
BEAT = 60 / BPM
BARS = 64
LENGTH = round(BARS * 4 * BEAT * RATE)
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src/assets/audio'
rng = np.random.default_rng(271828)
song = np.zeros((LENGTH, 2), dtype=np.float32)


def place(samples, beat, level, pan=0, echo=True):
    """Wrap tails into the head so the final turnaround rejoins the first chord."""
    start = round(beat * BEAT * RATE)
    stereo = samples[:, None] * np.array([np.sqrt((1-pan)/2), np.sqrt((1+pan)/2)]) * level
    for delay, gain in ([(0, 1), (.24, .13), (.47, .075), (.73, .035)] if echo else [(0, 1)]):
        at = (start + round(delay * RATE)) % LENGTH
        end = min(LENGTH-at, len(samples))
        song[at:at+end] += stereo[:end] * gain
        if end < len(samples):
            song[:len(samples)-end] += stereo[end:] * gain


def instrument(midi, seconds, kind):
    if kind == 'bell': seconds = 5.2
    t = np.arange(round(seconds * RATE)) / RATE
    hz = 440 * 2 ** ((midi-69)/12)
    phase = 2*np.pi*hz*t
    if kind == 'keys':
        # Soft tine piano: the transient opens then settles into a warm fundamental.
        body = np.sin(phase + 1.05*np.exp(-t*5)*np.sin(phase*2))
        body += .19*np.sin(phase*2)*np.exp(-t*2.8) + .045*np.sin(phase*3)*np.exp(-t*5)
        envelope = (1-np.exp(-t*100))*np.exp(-t/1.25)
    elif kind == 'bell':
        body = np.sin(phase) + .23*np.sin(phase*2)*np.exp(-t*2.7) + .10*np.sin(phase*3.99)*np.exp(-t*5)
        envelope = (1-np.exp(-t*150))*np.exp(-t/1.1)
        # The melody gate sets phrasing, not the lifetime of a struck bell.
        # Keep the attack, then settle the ring before a quiet final taper.
        envelope *= np.exp(-.65*np.maximum(0,t-.3))
    elif kind == 'bass':
        body = np.sin(phase) + .23*np.sin(phase*2)*np.exp(-t*2) + .07*np.sin(phase*3)*np.exp(-t*4)
        envelope = (1-np.exp(-t*65))*np.exp(-t/1.1)
    else:
        body = .55*np.sin(phase) + .22*np.sin(phase*1.0015) + .12*np.sin(phase*2)
        envelope = np.sin(np.pi*t/seconds)**1.7
    remaining = np.clip((seconds-t)/(.45 if kind=='bell' else .12),0,1)
    release = np.sin(remaining*np.pi/2)**2 if kind=='bell' else remaining
    return (body*envelope*release).astype(np.float32)


# Dmaj9, A/C#, Bm9, A6, Gmaj9, D/F#, Em9, A13sus -> A.
chords = [[62,66,69,73,76], [61,64,69,71,76], [59,62,66,69,73], [57,61,64,66,71],
          [55,59,62,66,69], [54,57,62,64,69], [52,55,59,62,66], [57,62,64,66,71]]
basses = [38,37,35,33,31,30,40,33]
# A short singable question (F# A B A E), then an answering downward phrase.
melody = [
    [(0,78,1), (1.5,81,.5), (2,83,.75), (3,81,.65)],
    [(.5,76,1.6), (3,73,.6)],
    [(0,78,.8), (1.5,81,.5), (2,78,1.4)],
    [(.5,76,.8), (2,73,.7), (3,71,.7)],
    [(0,74,.8), (1.5,78,.5), (2,81,1.4)],
    [(0,78,.8), (1.5,76,.7), (3,74,.7)],
    [(.5,76,.8), (2,78,.6), (3,74,.7)],
    [(0,73,1.5), (2.5,71,.5), (3.5,73,.4)],
]
for bar in range(BARS):
    phrase, index = divmod(bar, 8)
    chord = chords[index]
    # Four distinct arrangements, with an airy middle and a gentle homecoming.
    sparse = phrase in (3, 4)
    for i, note in enumerate(chord):
        place(instrument(note, 3.6, 'keys'), bar*4+i*.035, .072 if sparse else .09, (i-2)*.16)
    if not sparse:
        for i in (1, 3):
            place(instrument(chord[i], 1.8, 'keys'), bar*4+2.55+(i-1)*.14, .038, -.26)
    for note in chord[1:4]:
        place(instrument(note, BEAT*5, 'pad'), bar*4-.4, .022, .15)
    place(instrument(basses[index], 2.1, 'bass'), bar*4, .16, 0, False)
    if phrase not in (0, 3):
        place(instrument(basses[index]+(7 if index % 2 else 12), 1.1, 'bass'), bar*4+2.65, .07, 0, False)
    # The hook rests for entire phrases instead of repeating on every bar.
    if phrase in (0, 1, 5, 7):
        for beat, note, duration in melody[index]:
            variation = -12 if phrase == 5 else 0
            place(instrument(note+variation, duration*BEAT+1.1, 'bell' if phrase != 5 else 'keys'),
                  bar*4+beat, .105 if phrase != 7 else .095, .12)
    elif phrase in (2, 6):
        for beat, offset in [(0, 4), (1.6, 2), (3, 3)]:
            place(instrument(chord[offset]+12, 1.8, 'keys'), bar*4+beat, .075, -.12)
    elif index % 2 == 0:
        place(instrument(chord[4]+12, 3, 'bell'), bar*4+1, .045, .28)
    if phrase not in (0, 3, 4):
        for beat in (0, 2):
            t = np.arange(round(.23*RATE))/RATE
            kick = np.sin(2*np.pi*(48*t+2.4*(1-np.exp(-t*24))))*np.exp(-t*23)*(1-np.exp(-t*400))
            place(kick, bar*4+beat, .09, 0, False)
        for beat in (1, 3):
            noise = rng.normal(0, 1, round(.15*RATE))
            brush = sosfilt(butter(2, [700, 4100], btype='bandpass', fs=RATE, output='sos'), noise)
            t = np.arange(len(noise))/RATE
            place(brush*np.exp(-t*32)*(1-np.exp(-t*200)), bar*4+beat+.035, .032, -.3, False)
        for beat in (.6, 1.65, 2.6, 3.65):
            noise = rng.normal(0, 1, round(.055*RATE))
            hat = sosfilt(butter(2, [2500, 6500], btype='bandpass', fs=RATE, output='sos'), noise)
            place(hat*np.hanning(len(hat)), bar*4+beat, .009, .3, False)

# Diffuse room reflections, circular so the loop keeps its space at the join.
dry = song.copy()
for delay, level in [(.083,.09), (.131,.07), (.197,.055), (.311,.045), (.433,.035), (.619,.025), (.887,.016)]:
    song += np.roll(dry[:, ::-1], round(delay*RATE), axis=0)*level
song = sosfilt(butter(2, 7400, fs=RATE, output='sos'), song, axis=0).astype(np.float32)
song *= .70 / np.max(np.abs(song))

# Quiet, nonliteral room air. No invented conversations, notifications or weather.
air_length = RATE*48
air = np.zeros((air_length, 2), dtype=np.float32)
t = np.arange(air_length)/RATE
for channel in range(2):
    raw = rng.normal(0, 1, air_length+RATE*2)
    # Keep a low, steady room tone rather than the broad hiss and noticeable
    # swells of rain or wind. Playback calibration controls its quiet level.
    soft = sosfilt(butter(2, [100, 650], btype='bandpass', fs=RATE, output='sos'), raw)[RATE*2:]
    air[:, channel] = soft*(.7+.025*np.sin(2*np.pi*t/24+channel))
# Equal-power wrap crossfade removes the noise boundary.
fade = RATE*2
weight = np.linspace(0, np.pi/2, fade)
air[:fade] = air[:fade]*np.sin(weight[:,None]) + air[-fade:]*np.cos(weight[:,None])
air = air[:-fade]
air *= .20 / np.max(np.abs(air))


def export(name, samples):
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='lucid-score-') as tmp:
        wav = Path(tmp)/'master.wav'
        with wave.open(str(wav), 'wb') as writer:
            writer.setnchannels(2)
            writer.setsampwidth(2)
            writer.setframerate(RATE)
            writer.writeframes((np.clip(samples,-1,1)*32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),
                        '-c:a','libopus','-b:a','128k','-vbr','constrained','-application','audio',str(OUT/f'{name}.opus')], check=True)
    return {'seconds': len(samples)/RATE, 'peakDbFS': float(20*np.log10(np.max(np.abs(samples)))),
            'rmsDbFS': float(20*np.log10(np.sqrt(np.mean(samples**2))))}


metrics = {}
if args.only in ('both', 'theme'): metrics['theme'] = export('little-lights', song)
if args.only in ('both', 'ambience'): metrics['ambience'] = export('room-air', air)
print(json.dumps(metrics, indent=2))
