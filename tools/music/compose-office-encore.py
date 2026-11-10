"""Five original Lucid encore instrumentals, with recorded CC0 percussion.

Offline: Python + numpy/scipy/Pedalboard, FFmpeg and the pinned VCSL drum cache.
Each score has a hand-written eight-bar
hook, its own harmony/groove/timbres, a bridge, a quiet middle and a final reprise.
Only these five Opus files and their metrics are replaced when this script runs.
"""
from pathlib import Path
import argparse
from functools import lru_cache
import json
import subprocess
import tempfile
import wave
import numpy as np
from scipy.signal import butter, sosfilt
from cozy_percussion import CozyPercussion

RATE = 44100
OUT = Path(__file__).resolve().parents[2] / 'src/assets/audio'
# MIDI offsets: chords are close voicings above the tonic, hooks one octave up.
# Hook events are (beat, pitch offset, held beats), including intentional rests.
PIECES = [
    dict(id='pocket-sunrise', title='Pocket Sunrise', period='morning', bpm=104,
         tonic=60, meter=4, tone='marimba', groove='bossa',
         chords=[[0,4,7,11,14],[9,12,16,19,23],[5,9,12,16,19],[7,11,14,16,21],
                 [4,7,11,14,19],[9,12,16,19,23],[2,5,9,12,16],[7,11,14,17,21]],
         hook=[[(0,16,.5),(.75,19,.5),(1.5,24,1),(3,23,.5)],
               [(0,19,1),(1.5,16,.5),(2.5,12,1)],
               [(.5,17,.5),(1.25,21,.5),(2,24,1),(3.5,21,.4)],
               [(0,19,1.5),(2,14,.5),(3,16,.6)],
               [(0,16,.5),(.75,19,.5),(1.5,23,1),(3,26,.5)],
               [(0,24,1),(1.5,23,.5),(2.5,19,1)],
               [(.5,21,.5),(1.25,17,.5),(2,14,.75),(3,16,.6)],
               [(0,14,1),(1.5,11,.5),(2.5,12,1)]]),
    dict(id='cloud-arcade', title='Cloud Arcade', period='day', bpm=110,
         tonic=62, meter=4, tone='ribbon', groove='electro',
         chords=[[0,4,7,14],[7,11,14,21],[9,12,16,23],[5,9,12,19],
                 [0,4,7,16],[4,7,11,19],[5,9,12,21],[7,11,14,17]],
         hook=[[(0,19,.5),(.75,19,.35),(1.5,24,.6),(2.5,23,.4),(3.25,19,.5)],
               [(.5,14,.5),(1.5,16,.5),(2.5,19,1)],
               [(0,24,.5),(.75,23,.35),(1.5,19,.6),(2.5,16,1)],
               [(.5,17,.5),(1.5,21,.5),(2.5,19,.5),(3.5,17,.3)],
               [(0,19,.5),(.75,19,.35),(1.5,24,.6),(2.5,28,1)],
               [(0,26,.75),(1.5,23,.5),(2.5,19,1)],
               [(0,21,.5),(1,19,.5),(2,17,.5),(3,16,.5)],
               [(.5,14,.75),(2,11,.5),(3,12,.7)]]),
    dict(id='velvet-elevator', title='Velvet Elevator', period='evening', bpm=86,
         tonic=65, meter=4, tone='tines', groove='swing',
         chords=[[0,4,7,11,14],[9,12,16,19,23],[2,5,9,12,16],[7,11,14,17,20],
                 [5,9,12,16,19],[5,8,12,15,19],[0,4,7,11,14],[7,11,14,17,21]],
         hook=[[(.0,16,.65),(1.67,19,.3),(2,23,1.1),(3.67,21,.25)],
               [(.67,19,.6),(2,16,.9),(3.33,12,.4)],
               [(0,14,.6),(1,17,.55),(2.67,21,.7)],
               [(.67,20,.4),(1.33,19,.4),(2,17,.6),(3,14,.6)],
               [(0,21,1),(1.67,19,.3),(2,17,1)],
               [(.67,20,.6),(2,19,.6),(3.33,15,.4)],
               [(0,16,.6),(1.67,19,.3),(2,14,.8)],
               [(.67,11,.6),(2,12,1.5)]]),
    dict(id='lantern-carousel', title='Lantern Carousel', period='night', bpm=78,
         tonic=69, meter=3, tone='musicbox', groove='waltz',
         chords=[[0,3,7,14],[5,9,12,19],[10,14,17,21],[3,7,10,17],
                 [8,12,15,19],[5,8,12,19],[7,11,14,20],[0,3,7,14]],
         hook=[[(0,19,.7),(1,24,.4),(1.5,22,.4),(2,19,.6)],
               [(0,21,1.2),(1.5,19,.4),(2,16,.6)],
               [(0,17,.7),(1,22,.4),(1.5,21,.4),(2,17,.6)],
               [(0,19,1.5),(2,15,.6)],
               [(0,20,.7),(1,24,.4),(1.5,27,.4),(2,24,.6)],
               [(0,20,.8),(1.5,19,.4),(2,17,.6)],
               [(0,14,.6),(1,11,.6),(2,14,.6)],
               [(0,15,1),(1.5,14,.4),(2,12,.7)]]),
    dict(id='the-last-constellation', title='The Last Constellation', period='night', bpm=72,
         tonic=63, meter=4, tone='aurora', groove='halftime',
         chords=[[0,4,7,11,14],[7,11,14,18,21],[9,12,16,19,23],[5,9,12,16,19],
                 [2,5,9,12,16],[4,7,11,14,19],[5,9,12,16,19],[7,11,14,16,21]],
         hook=[[(0,23,1.5),(2,19,.7),(3,16,.7)],
               [(.5,18,1.5),(2.5,14,1)],
               [(0,16,1),(1.5,19,.5),(2.5,24,1)],
               [(0,21,2),(3,19,.7)],
               [(.5,17,1),(2,21,1.3)],
               [(0,23,1),(1.5,19,.5),(3,16,.7)],
               [(0,17,1),(1.5,16,.5),(2.5,14,1)],
               [(0,11,1.5),(2,12,1.7)]]),
]

@lru_cache(maxsize=128)
def instrument(pitch, seconds, kind):
    if kind == 'musicbox': seconds = 5.5
    t = np.arange(round(seconds*RATE), dtype=np.float64)/RATE
    ph = 2*np.pi*440*2**((pitch-69)/12)*t
    if kind == 'bass':
        body = np.sin(ph)+.20*np.sin(2*ph)*np.exp(-3*t)
        env = (1-np.exp(-80*t))*np.exp(-t/1.0)
    elif kind == 'pad':
        body = .5*np.sin(ph)+.25*np.sin(ph*1.0018)+.12*np.sin(ph*2.0007)
        env = np.sin(np.pi*t/seconds)**1.5
    elif kind == 'marimba':
        body = np.sin(ph)+.32*np.sin(ph*3.99)*np.exp(-8*t)+.08*np.sin(ph*9.98)*np.exp(-15*t)
        env = (1-np.exp(-220*t))*np.exp(-t/.65)
    elif kind == 'ribbon':
        # Soft band-limited triangle harmonics, a little vibrato after the attack.
        vib = ph+.014*np.sin(2*np.pi*5*t)*(1-np.exp(-4*t))
        body = np.sin(vib)-.10*np.sin(3*vib)+.025*np.sin(5*vib)
        env = (1-np.exp(-55*t))*np.exp(-t/1.1)
    elif kind == 'tines':
        body = np.sin(ph+1.2*np.exp(-4*t)*np.sin(2*ph))+.12*np.sin(ph*3)*np.exp(-5*t)
        env = (1-np.exp(-140*t))*np.exp(-t/1.6)
    elif kind == 'musicbox':
        body = np.sin(ph)+.20*np.sin(ph*2.002)*np.exp(-3*t)+.12*np.sin(ph*4.01)*np.exp(-6*t)
        env = (1-np.exp(-190*t))*np.exp(-t/1.4)
        env *= np.exp(-.72*np.maximum(0,t-.3))
    elif kind == 'aurora':
        body = np.sin(ph+.3*np.sin(2*ph)*np.exp(-2*t))+.12*np.sin(ph*2.001)
        env = (1-np.exp(-18*t))*np.exp(-t/2.1)
    else:  # softly plucked accompaniment
        body = np.sin(ph)+.22*np.sin(2*ph)*np.exp(-6*t)+.10*np.sin(3*ph)*np.exp(-10*t)
        env = (1-np.exp(-160*t))*np.exp(-t/.55)
    remaining=np.clip((seconds-t)/(.45 if kind=='musicbox' else .18),0,1)
    taper=np.sin(remaining*np.pi/2)**2 if kind=='musicbox' else remaining
    return (body*env*taper).astype(np.float32)


def render(p, seed, sample_dir=None):
    rng = np.random.default_rng(seed)
    beat, meter = 60/p['bpm'], p['meter']
    # One intro, two statements, contrasting bridge, breakdown, full reprise, coda.
    sections = [('intro',4),('a',8),('a2',8),('bridge',8),('quiet',8),('return',8),('final',8),('outro',4)]
    frames = round((sum(n for _,n in sections)*meter*beat+5)*RATE)
    song = np.zeros((frames,2),dtype=np.float32)
    percussion = CozyPercussion(frames,seed+709,sample_dir)

    def place(samples, at, gain, pan=0, echoes=False):
        stereo = samples[:,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)],dtype=np.float32)*gain
        for delay, level in ([(0,1),(beat*.75,.15),(beat*1.5,.065)] if echoes else [(0,1)]):
            start = round((at*beat+delay)*RATE)
            if start < 0 or start >= frames: continue
            n = min(len(samples),frames-start)
            song[start:start+n] += stereo[:n]*level

    def play(pitch, held, kind, at, gain, pan=0, echoes=False):
        place(instrument(pitch,round(held*beat+.65,3),kind),at,gain,pan,echoes)

    bar = 0
    for section,count in sections:
        for index in range(count):
            ci = index%8
            # Bridge reverses the harmonic journey; it has its own answering line.
            if section == 'bridge': ci = [4,5,2,3,6,1,4,7][index%8]
            chord = [p['tonic']-12+n for n in p['chords'][ci]]
            at = bar*meter
            thin = section in ('intro','quiet','outro')
            night = p['groove'] in ('halftime','waltz')
            # Rolled chord voicings and a mid-register pulse, not a constant wall.
            for k,n in enumerate(chord):
                play(n,2.8,'tines',at+.035*k,.046 if thin else .062,(k-2)*.17)
            for n in chord[1:4]:
                play(n,meter*1.15,'pad',at,.022 if night else .012,-.12)
            root = chord[0]-12
            play(root,1.5,'bass',at,.15 if not thin else .10)
            if not thin:
                bass_step = 2.5 if meter==4 else 2
                play(root+7,.65,'bass',at+bass_step,.08)
                if p['groove']=='swing':
                    play(root+12,.65,'bass',at+1,.06)
                    play(root+11,.55,'bass',at+3,.045)
                arp = {'bossa':[.75,1.5,2.75,3.5], 'electro':[.5,1.5,2.5,3.5],
                       'swing':[1.67,3.67], 'waltz':[1,1.5,2,2.5], 'halftime':[1.5,3]}[p['groove']]
                for k,pos in enumerate(arp):
                    play(chord[1+k%(len(chord)-1)]+12,.5,'pluck',at+pos,.034,(-1)**k*.36)
            if section in ('a','a2','return','final'):
                for pos,pitch,held in p['hook'][index%8]:
                    # Reprise begins in a warmer register, then the hook blooms.
                    octave = -12 if section=='return' and index<4 else 0
                    play(p['tonic']+pitch+octave,held,p['tone'],at+pos,.105,.12,True)
                    if section=='final' and index in (2,4,6):
                        play(p['tonic']+pitch-12,held,'tines',at+pos+.08,.025,-.25)
            elif section=='bridge':
                # Each chord sings an arch, with room for a quiet answering pluck.
                pattern = [(0,2,1),(1.5,3,.6),(2.5,1,.9)] if meter==4 else [(0,2,1),(1.5,1,.8)]
                for pos,k,held in pattern:
                    play(chord[k]+12,held,'tines' if p['tone']!='tines' else 'marimba',at+pos,.075,-.16,True)
            elif index%2==0:
                play(chord[-1]+12,1.8,p['tone'],at+1,.043,.24,True)
            if not thin:
                hits = [0,2] if p['groove'] in ('electro','bossa') else [0]
                for pos in hits: percussion.hit('kick',(at+pos)*beat,.18 if not night else .075)
                for pos in ([1,3] if meter==4 else [1,2]):
                    if p['groove']=='halftime' and pos==1: continue
                    percussion.hit('snare',(at+pos+.025)*beat,.070 if not night else .034,
                                   accent=pos==1 and not night,throw=index%8==7 and pos==3)
                if not night:
                    for pos in np.arange(.5,meter,.5):
                        swing = .16 if p['groove']=='swing' and pos%1 else 0
                        percussion.hit('hat',(at+float(pos)+swing)*beat,.046 if pos%1 else .035)
                if not night and index%4==3:
                    percussion.hit('snare',(at+meter-.24)*beat,.029)
            bar += 1
    # A real tonic cadence, then space for its natural release.
    end = (bar-1)*meter
    for pitch in (p['tonic']-12,p['tonic']-5,p['tonic']+3 if p['groove']=='waltz' else p['tonic']+4,p['tonic']+12):
        play(pitch,4,'tines',end,.06,.05,True)
    dry = song.copy()
    for delay,gain in [(.073,.09),(.137,.07),(.211,.05),(.337,.04),(.509,.025),(.733,.015)]:
        shift = round(delay*RATE)
        song[shift:] += dry[:-shift,::-1]*gain
    del dry
    song = sosfilt(butter(2,6900 if night else 7800,fs=RATE,output='sos'),song,axis=0).astype(np.float32)
    # Soft saturation tames piano transients before matching the library's RMS.
    song = np.tanh(song*1.25)/1.25
    song += percussion.mix(beat)
    song *= .102/np.sqrt(np.mean(song**2))
    if np.max(np.abs(song))>.70: song *= .70/np.max(np.abs(song))
    fade = round(1.6*RATE)
    song[:fade] *= np.linspace(0,1,fade,dtype=np.float32)[:,None]
    song[-2*RATE:] *= np.linspace(1,0,2*RATE,dtype=np.float32)[:,None]
    instrument.cache_clear()
    return song,percussion.provenance()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',nargs='+',choices=[p['id'] for p in PIECES])
    parser.add_argument('--sample-dir',type=Path)
    args=parser.parse_args()
    old = json.loads((OUT/'soundtrack-metrics.json').read_text())
    ids = {p['id'] for p in PIECES}
    metrics = {row['id']:row for row in old}
    for i,p in enumerate(PIECES):
        if args.only and p['id'] not in args.only:continue
        song,percussion = render(p,8675309+i*137,args.sample_dir)
        with tempfile.TemporaryDirectory(prefix='lucid-encore-') as tmp:
            wav = Path(tmp)/'master.wav'
            with wave.open(str(wav),'wb') as w:
                w.setnchannels(2); w.setsampwidth(2); w.setframerate(RATE)
                w.writeframes((np.clip(song,-1,1)*32767).astype('<i2').tobytes())
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),
                            '-c:a','libopus','-b:a','128k','-vbr','constrained','-application','audio','-metadata',f"title={p['title']}",
                            '-metadata','artist=Lucid',str(OUT/f"{p['id']}.opus")],check=True)
        row = {k:p[k] for k in ('id','title','period','bpm','meter')}
        row.update(seconds=len(song)/RATE,peakDbFS=float(20*np.log10(np.max(np.abs(song)))),
                   rmsDbFS=float(20*np.log10(np.sqrt(np.mean(song**2)))))
        row['percussion']=percussion
        if p['tone']=='musicbox':
            row['bellArticulation']='Independent5.5s music-box strikes, natural overlapping decay, quiet450ms terminal taper; original note placement retained'
        metrics[p['id']]=row
        print(json.dumps(row),flush=True)
    (OUT/'soundtrack-metrics.json').write_text(json.dumps(list(metrics.values()),indent=2)+'\n')

if __name__=='__main__': main()
