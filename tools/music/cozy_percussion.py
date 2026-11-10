"""Recorded quiet percussion for Lucid's older office arrangements.

Uses the pinned CC0 VCSL cache, with family-relative dynamics and alternate
takes. No swept oscillator kick or generated noise drum is used. Individual
hits retain their recorded attack; only excess ring is smoothly damped. Kick
stays dry and mono. Short room and phrase-end echoes belong to upper percussion.
"""
from pathlib import Path
from functools import lru_cache
import hashlib
import json
import os
import subprocess
import numpy as np
from scipy.signal import butter, sosfilt
from music_production import process_stem, room_send

RATE = 44100
MANIFEST = Path(__file__).with_name('assets')/'vcsl-drums.json'
FAMILIES = {
    'kick': ['bass_'+layer+'_'+str(take) for layer in ('soft','main') for take in (1,2)],
    'snare': ['snare_'+layer+'_'+str(take) for layer in ('soft','medium','main') for take in (1,2)],
    'hat': ['hat_'+layer+'_'+str(take) for layer in ('soft','main') for take in (1,2)],
}


def filtered(audio, low=None, high=None):
    cutoff, kind = ([low,high],'bandpass') if low and high else (low or high,'highpass' if low else 'lowpass')
    return sosfilt(butter(2,cutoff,fs=RATE,btype=kind,output='sos'),audio,axis=0).astype(np.float32)


@lru_cache(maxsize=48)
def recorded(directory,name):
    entries={Path(e['file']).stem:e for e in json.loads(MANIFEST.read_text())['files']}
    path=Path(directory)/(name+'.wav');entry=entries[name]
    if hashlib.sha256(path.read_bytes()).hexdigest()!=entry['sha256']:
        raise ValueError('Sample differs from verified CC0 source: '+name)
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ac','1','-ar',str(RATE),'-f','f32le','-'])
    audio=np.frombuffer(raw,dtype='<f4').copy()
    audio-=float(audio.mean())
    return audio


class CozyPercussion:
    def __init__(self,frames,seed,sample_dir=None):
        self.directory=str(Path(sample_dir or os.environ.get('LUCID_VCSL_DRUMS','/tmp/lucid-vcsl-drums')).resolve())
        self.frames=frames;self.rng=np.random.default_rng(seed)
        self.stems={role:np.zeros((frames,2),np.float32) for role in (*FAMILIES,'throws')}
        self.counts={role:0 for role in FAMILIES};self.used=set();self.cache={}
        # One reference per instrument, not one unit peak per sample. A soft
        # stroke therefore stays softer than a hard stroke of the same drum.
        self.references={role:max(float(np.max(np.abs(recorded(self.directory,name)))) for name in names)
                         for role,names in FAMILIES.items()}

    def sample(self,role,layer,take):
        name={'kick':'bass','snare':'snare','hat':'hat'}[role]+'_'+layer+'_'+str(take)
        self.used.add(name)
        if name in self.cache:return self.cache[name]
        audio=recorded(self.directory,name).copy()/self.references[role]
        peak=float(np.abs(audio).max());active=np.flatnonzero(np.abs(audio)>max(.00015,peak*.015))
        if len(active):audio=audio[max(0,int(active[0]) - 44):]
        seconds,begin,decay={'kick':(.32,.055,.065),'snare':(.34,.075,.11),'hat':(.15,.018,.043)}[role]
        audio=audio[:round(seconds*RATE)]
        t=np.arange(len(audio))/RATE
        audio*=np.exp(-np.maximum(0,t-begin)/decay)
        audio*=np.minimum(1,t/.0007)
        fade=min(len(audio),round(.025*RATE));audio[-fade:]*=np.linspace(1,0,fade)
        if role=='kick':audio=filtered(audio,low=30,high=3100)
        elif role=='snare':audio=filtered(audio,low=180,high=6600)
        else:audio=filtered(audio,low=2300,high=7500)
        self.cache[name]=audio
        return audio

    def hit(self,role,seconds,gain,*,accent=False,pan=None,throw=False):
        count=self.counts[role];self.counts[role]+=1
        layer='medium' if role=='snare' and accent else 'soft'
        audio=self.sample(role,layer,1+count%2)
        gain*=float(self.rng.uniform(.95,1.05))
        pan=0 if role=='kick' else (-.12 if role=='snare' else .28) if pan is None else pan
        stereo=audio[:,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)],np.float32)*gain
        start=max(0,round((seconds+float(self.rng.uniform(-.003,.003)))*RATE));n=min(len(stereo),self.frames-start)
        if n>0:
            self.stems[role][start:start+n]+=stereo[:n]
            if throw:self.stems['throws'][start:start+n]+=stereo[:n]

    def mix(self,beat):
        kick=process_stem(self.stems['kick'],RATE,'bass')
        upper=process_stem(self.stems['snare']+self.stems['hat'],RATE,'drums')
        # A filtered return, separated from the dry path and delayed12ms, keeps
        # the original head/metal articulation while suggesting a small room.
        space_input=filtered(self.stems['snare']+self.stems['hat']*.25,low=440,high=5300)
        wet=room_send(space_input,RATE,'small',send=.10)-space_input
        predelay=round(.012*RATE);room=np.zeros_like(wet);room[predelay:]=wet[:-predelay]
        throws=filtered(self.stems['throws'],low=760,high=4300)
        echoes=np.zeros_like(throws)
        for beats,level,flip in [(.5,.11,True),(1,.046,False),(1.5,.018,True)]:
            shift=round(beats*beat*RATE)
            echoes[shift:]+=throws[:-shift,::-1]*level if flip else throws[:-shift]*level
        result=kick+upper+room+echoes
        assert np.isfinite(result).all() and np.array_equal(kick[:,0],kick[:,1])
        return result

    def provenance(self):
        manifest=json.loads(MANIFEST.read_text())
        return dict(revision=2,source='Recorded VCSL acoustic hits, no generated drum oscillators/noise',
                    license=manifest['license'],repository=manifest['repository'],commit=manifest['commit'],
                    files=[entry for entry in manifest['files'] if Path(entry['file']).stem in self.used],
                    dynamicCalibration='One peak reference per drum family, retaining source velocity and alternate-take differences',
                    kick='Damped recorded soft bass drum, centered and dry, no imposed pitch sweep',
                    space='12ms-predelayed filtered short upper-percussion room and selected phrase-end half-beat echoes',
                    hitCounts=self.counts,auditionPerformed=False)
