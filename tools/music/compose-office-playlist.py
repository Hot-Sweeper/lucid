"""Eight original Lucid instrumentals, with recorded CC0 percussion.

Requires numpy, scipy, Pedalboard, FFmpeg and the pinned VCSL drum cache. Each piece has
its own harmony, melodic phrases, meter/tempo and five-part arrangement.
Existing Little Lights and room air are deliberately left intact.
"""
from pathlib import Path
import argparse
import json
import subprocess
import tempfile
import wave
import numpy as np
from scipy.signal import butter, sosfilt
from cozy_percussion import CozyPercussion

RATE = 44100
OUT = Path(__file__).resolve().parents[2] / 'src/assets/audio'
# Chords and hooks are MIDI offsets from the named tonic. None are pitch-shifted
# exports of Little Lights. Hooks answer themselves over eight separate bars.
PIECES = [
    dict(id='window-garden', title='Window Garden', period='morning', bpm=88, tonic=60, meter=4,
         chords=[[0,4,7,11,14],[5,9,12,16,19],[2,5,9,12,16],[7,11,14,17,21],
                 [4,7,11,14,19],[9,12,16,19,23],[5,9,12,14,19],[7,11,14,16,21]],
         hook=[[12,16,19,None],[21,None,19,16],[17,16,14,None],[11,None,14,19],
               [16,19,23,21],[19,None,16,12],[14,17,21,19],[16,14,11,None]], tone='mallet'),
    dict(id='first-coffee', title='First Coffee', period='morning', bpm=96, tonic=65, meter=3,
         chords=[[0,4,7,11,14],[9,12,16,19,23],[2,5,9,12,16],[7,11,14,17,21],
                 [5,9,12,16,19],[4,7,11,14,17],[2,5,9,12,16],[7,11,14,16,21]],
         hook=[[16,19,24],[23,None,19],[17,21,26],[23,19,None],
               [21,19,17],[16,None,14],[17,16,14],[11,14,None]], tone='keys'),
    dict(id='paper-kites', title='Paper Kites', period='day', bpm=102, tonic=67, meter=4,
         chords=[[0,4,7,11,14],[7,11,14,16,21],[9,12,16,19,23],[5,9,12,16,19],
                 [0,4,7,11,16],[4,7,11,14,19],[2,5,9,12,16],[7,11,14,17,21]],
         hook=[[19,None,16,14],[16,19,21,None],[24,23,19,16],[17,None,14,12],
               [16,14,12,7],[11,14,19,None],[17,14,9,12],[11,None,14,19]], tone='pluck'),
    dict(id='peach-parade', title='Peach Parade', period='day', bpm=92, tonic=62, meter=4,
         chords=[[0,4,7,9,14],[5,9,12,14,19],[7,11,14,16,21],[0,4,7,11,16],
                 [9,12,16,19,23],[4,7,11,14,19],[5,9,12,16,19],[7,11,14,17,21]],
         hook=[[12,14,None,16],[17,21,19,None],[23,21,19,14],[16,None,12,7],
               [12,16,19,None],[14,None,11,7],[9,12,17,16],[14,11,7,None]], tone='mallet'),
    dict(id='apricot-hour', title='Apricot Hour', period='evening', bpm=76, tonic=63, meter=4,
         chords=[[0,4,7,11,14],[2,5,9,12,16],[7,11,14,17,21],[0,4,7,11,14],
                 [5,9,12,16,19],[5,8,12,15,19],[4,7,11,14,19],[7,11,14,17,20]],
         hook=[[19,16,None,14],[17,None,21,19],[17,14,11,None],[12,None,16,19],
               [21,19,17,None],[20,19,15,None],[16,14,11,7],[14,17,11,None]], tone='keys'),
    dict(id='tram-home', title='Tram Home', period='evening', bpm=82, tonic=57, meter=3,
         chords=[[0,3,7,10,14],[5,9,12,16,19],[10,14,17,21,24],[7,10,14,17,21],
                 [8,12,15,19,22],[5,8,12,15,19],[2,5,8,12,15],[7,11,14,17,20]],
         hook=[[19,None,15],[16,21,19],[17,None,14],[10,14,17],
               [20,19,15],[17,None,12],[14,12,8],[11,None,14]], tone='pluck'),
    dict(id='moonlit-desks', title='Moonlit Desks', period='night', bpm=64, tonic=59, meter=4,
         chords=[[0,3,7,10,14],[8,12,15,19,22],[3,7,10,14,17],[10,14,17,21,24],
                 [5,8,12,15,19],[0,3,7,10,17],[8,12,15,19,22],[7,11,14,17,20]],
         hook=[[19,None,None,22],[24,None,19,None],[17,14,None,None],[21,None,17,14],
               [20,None,15,None],[19,15,None,14],[15,None,12,None],[11,None,14,None]], tone='glass'),
    dict(id='sleepy-satellites', title='Sleepy Satellites', period='night', bpm=68, tonic=64, meter=4,
         chords=[[0,4,7,11,14],[9,12,16,19,23],[5,9,12,16,19],[0,4,7,11,16],
                 [2,5,9,12,16],[5,9,12,16,19],[4,7,11,14,19],[7,11,14,16,21]],
         hook=[[16,None,23,None],[24,None,19,16],[21,None,None,17],[19,16,None,None],
               [17,None,14,None],[16,14,None,None],[11,None,14,19],[16,None,14,None]], tone='glass'),
]


def render(piece, seed, sample_dir=None):
    rng = np.random.default_rng(seed)
    beat = 60 / piece['bpm']
    # Waltzes get an extra phrase so they remain full pieces, not short loops.
    bars = 48 if piece['meter'] == 3 else 40
    length = round((bars * piece['meter'] * beat + 4) * RATE)
    song = np.zeros((length, 2), dtype=np.float32)
    percussion = CozyPercussion(length,seed+709,sample_dir) if piece['period']!='night' else None

    def place(samples, at, gain, pan=0, echo=True):
        stereo = samples[:, None] * np.array([np.sqrt((1-pan)/2), np.sqrt((1+pan)/2)]) * gain
        for delay, level in ([(0,1), (.19,.10), (.39,.05)] if echo else [(0,1)]):
            start = round((at * beat + delay) * RATE)
            if start < 0 or start >= length:
                continue
            count = min(len(samples), length-start)
            song[start:start+count] += stereo[:count] * level

    def note(midi, seconds, kind):
        if kind == 'glass': seconds = 5.5
        t = np.arange(round(seconds*RATE)) / RATE
        phase = 2*np.pi*440*2**((midi-69)/12)*t
        if kind == 'bass':
            body = np.sin(phase)+.12*np.sin(phase*2)
            env = (1-np.exp(-t*50))*np.exp(-t/1.05)
        elif kind == 'pad':
            body = .55*np.sin(phase)+.25*np.sin(phase*1.0013)+.12*np.sin(phase*2)
            env = np.sin(np.pi*t/seconds)**1.6
        elif kind == 'keys':
            body = np.sin(phase+.85*np.exp(-t*4)*np.sin(phase*2))+.14*np.sin(phase*2)*np.exp(-t*3)
            env = (1-np.exp(-t*110))*np.exp(-t/1.25)
        elif kind == 'pluck':
            body = np.sin(phase)+.22*np.sin(phase*2)*np.exp(-t*5)+.12*np.sin(phase*3)*np.exp(-t*9)
            env = (1-np.exp(-t*180))*np.exp(-t/.65)
        elif kind == 'glass':
            body = np.sin(phase)+.13*np.sin(phase*2.003)*np.exp(-t*2)
            env = (1-np.exp(-t*55))*np.exp(-t/1.6)
            env *= np.exp(-.78*np.maximum(0,t-.32))
        else:
            body = np.sin(phase)+.25*np.sin(phase*3.99)*np.exp(-t*7)
            env = (1-np.exp(-t*150))*np.exp(-t/.9)
        remaining=np.clip((seconds-t)/(.45 if kind=='glass' else .16),0,1)
        taper=np.sin(remaining*np.pi/2)**2 if kind=='glass' else remaining
        return (body*env*taper).astype(np.float32)

    for bar in range(bars):
        part = bar // 8
        index = bar % 8
        chord = [piece['tonic'] + n - 12 for n in piece['chords'][index]]
        at = bar * piece['meter']
        night = piece['period'] == 'night'
        sparse = part == 2 or part == 0 and index < 4
        for i, pitch in enumerate(chord):
            place(note(pitch, 3.5, 'keys'), at+i*.045, .065 if sparse else .09, (i-2)*.17)
        for pitch in chord[1:4]:
            place(note(pitch, beat*piece['meter']*1.3, 'pad'), at, .022 if night else .014, -.1)
        place(note(chord[0]-12, beat*1.8, 'bass'), at, .12, 0, False)
        if not sparse:
            place(note(chord[0]-5, beat, 'bass'), at+piece['meter']-.7, .055, 0, False)
        # Hook, answering counter-melody, quiet interlude, return, and final rest.
        if part != 2 and not (part == bars//8-1 and index >= 6):
            for slot, pitch in enumerate(piece['hook'][index]):
                if pitch is None:
                    continue
                answer = part == 3
                place(note(piece['tonic']+pitch-(12 if answer else 0), beat*1.6+1, piece['tone'] if not answer else 'keys'),
                      at+slot+(0.12 if piece['period']=='evening' and slot%2 else 0), .085 if night else .105, .16)
        elif index%2 == 0:
            place(note(chord[-1]+12, 3.6, 'glass'), at+1, .04, .3)
        if part != 0 and not sparse and not night:
            for hit in ([0] if piece['meter']==3 else [0,2]):
                percussion.hit('kick',(at+hit)*beat,.19 if hit==0 else .16)
            for hit in range(1,piece['meter']):
                percussion.hit('snare',(at+hit+.04)*beat,.065,accent=hit==1,throw=index==7 and hit==piece['meter']-1)
            if index%4==3:
                percussion.hit('snare',(at+piece['meter']-.22)*beat,.032)
    dry = song.copy()
    for delay, gain in [(.083,.08),(.139,.06),(.227,.045),(.379,.03),(.617,.018)]:
        shift = round(delay*RATE)
        song[shift:] += dry[:-shift,::-1]*gain
    song = sosfilt(butter(2,6500 if piece['period']=='night' else 7400,fs=RATE,output='sos'),song,axis=0).astype(np.float32)
    if percussion: song += percussion.mix(beat)
    # Match Little Lights' average level; no louder surprises between pieces.
    song *= min(.68/np.max(np.abs(song)), .1016/np.sqrt(np.mean(song**2)))
    fade = round(1.4*RATE)
    song[:fade] *= np.linspace(0,1,fade)[:,None]
    song[-fade:] *= np.linspace(1,0,fade)[:,None]
    return song, percussion.provenance() if percussion else None


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',nargs='+',choices=[p['id'] for p in PIECES])
    parser.add_argument('--sample-dir',type=Path)
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    metrics_file=OUT/'soundtrack-metrics.json'
    old=json.loads(metrics_file.read_text()) if metrics_file.exists() else []
    metrics={row['id']:row for row in old}
    for i,piece in enumerate(PIECES):
        if args.only and piece['id'] not in args.only: continue
        song,percussion=render(piece,314159+i*101,args.sample_dir)
        with tempfile.TemporaryDirectory(prefix='lucid-song-') as tmp:
            wav=Path(tmp)/'master.wav'
            with wave.open(str(wav),'wb') as writer:
                writer.setnchannels(2);writer.setsampwidth(2);writer.setframerate(RATE)
                writer.writeframes((np.clip(song,-1,1)*32767).astype('<i2').tobytes())
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-c:a','libopus','-b:a','128k','-vbr','constrained','-application','audio',str(OUT/f"{piece['id']}.opus")],check=True)
        row={k:piece[k] for k in ['id','title','period','bpm','meter']}
        row.update(seconds=len(song)/RATE,peakDbFS=float(20*np.log10(np.max(np.abs(song)))),rmsDbFS=float(20*np.log10(np.sqrt(np.mean(song**2)))))
        if percussion:row['percussion']=percussion
        if piece['tone']=='glass':
            row['bellArticulation']='Independent5.5s glass strikes, natural overlapping decay, quiet450ms terminal taper; original note placement retained'
        metrics[piece['id']]=row;print(json.dumps(row),flush=True)
    metrics_file.write_text(json.dumps(list(metrics.values()),indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':
    main()
