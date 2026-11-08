"""Four authored chamber/fantasy scores for Lucid. Original scores and textures.

Offline authoring uses numpy, scipy and ffmpeg. Physical/additive instrument
models provide the original pads and bells. Acoustic parts are rendered with
FluidSynth and the explicitly supplied MIT-licensed FluidR3 GM SoundFont.
No commercial factory content is used. The SoundFont is an authoring dependency,
not bundled with the app. Pass --soundfont or set FLUID_SOUNDFONT.
Each piece has separate A/B themes, a development, countermelody and cadence.
The rendered MP3s are streamed by Lucid; none of this synthesis runs in the app.
"""
from pathlib import Path
from functools import lru_cache
import argparse
import json
import os
import re
import hashlib
import struct
import subprocess
import tempfile
import wave
import numpy as np
from scipy.signal import butter, sosfilt
from music_production import process_stem

RATE = 44100
OUT = Path(__file__).resolve().parents[1] / 'src/assets/audio'
SOUNDFONT = None
SOUNDFONT_HASH = None
GM = {'lute':24,'harp':46,'pizz':45,'basspluck':45,'recorder':74,'clarinet':71,'viola':41,'cello':42,'strings':48,'feltpiano':0}


def filt(sound, frequency, high=False):
    return sosfilt(butter(2, frequency, fs=RATE, btype='highpass' if high else 'lowpass', output='sos'), sound).astype(np.float32)


@lru_cache(maxsize=64)
def instrument(pitch, seconds, kind):
    """Original electronic textures; acoustic notes use the licensed renderer."""
    t=np.arange(round(seconds*RATE),dtype=np.float64)/RATE
    hz=440*2**((pitch-69)/12);phase=2*np.pi*hz*t
    body=np.zeros(len(t),dtype=np.float64)
    if kind=='celesta':
        ratios,levels,decays=[1,2.002,3.98,5.43,7.03],[1,.23,.16,.07,.025],[.55,1.1,2.5,4.2,6]
        for ratio,level,decay in zip(ratios,levels,decays):
            if hz*ratio<17000:body+=level*np.sin(phase*ratio)*np.exp(-t*decay)
        env=1-np.exp(-t*240)
    elif kind=='auralpad':
        for h,level in [(1,.56),(2,.22),(3,.12),(5,.042)]:
            body+=level*np.sin(phase*h+.4*np.sin(t*(.21+h*.017)+h))
            body+=level*.34*np.sin(phase*h*1.0014+.24*np.sin(t*.33+h))
        env=np.sin(np.pi*t/seconds)**1.05
        env*=.88+.12*np.sin(t*.71+pitch*.17)
        body=filt(body,3100)
    else:raise ValueError(kind)
    body*=1/(1+.16*np.sqrt(np.mean(body**2)))
    env*=np.clip((seconds-t)/.045,0,1)
    return (body*env).astype(np.float32)


class Score:
    def __init__(self,bpm,meter,sections,seed,tail=7):
        self.bpm,self.meter,self.beat=bpm,meter,60/bpm
        self.rng=np.random.default_rng(seed)
        self.sections=[]; bar=0
        for name,bars in sections:
            self.sections.append(dict(name=name,bar=bar,bars=bars,start=bar*meter*self.beat,end=(bar+bars)*meter*self.beat))
            bar+=bars
        self.bars=bar;self.frames=round((bar*meter*self.beat+tail)*RATE)
        self.song=np.zeros((self.frames,2),dtype=np.float32)
        self.events=[]
    def put(self,samples,beat,level,pan=0,echo=0,human=True):
        timing=self.rng.uniform(-.011,.011) if human else 0
        gain=level*self.rng.uniform(.94,1.05) if human else level
        stereo=samples[:,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)],dtype=np.float32)*gain
        for delay,weight in ([(0,1),(.62*self.beat,echo),(1.37*self.beat,echo*.38)] if echo else [(0,1)]):
            at=round((beat*self.beat+timing+delay)*RATE); trim=max(0,-at);at=max(0,at)
            n=min(len(stereo)-trim,self.frames-at)
            if n>0:self.song[at:at+n]+=stereo[trim:trim+n]*weight
    def note(self,pitch,at,beats,kind,level,pan=0,echo=0):
        seconds=round(beats*self.beat+.22,2)
        if kind not in GM:
            self.put(instrument(pitch,seconds,kind),at,level,pan,echo)
        self.events.append(dict(at=max(0,round(at*self.beat+self.rng.uniform(-.009,.009),4)),pitch=pitch,
                               instrument=kind,level=level*self.rng.uniform(.94,1.05),seconds=seconds,pan=pan))
    def each(self):
        for sec in self.sections:
            for i in range(sec['bars']):yield sec['name'],i,sec['bar']+i
    def melody(self,theme,index,at,kind,level,pan=0,octave=0,echo=0):
        for pos,pitch,held in theme[index%len(theme)]:self.note(pitch+octave,at+pos,held,kind,level,pan,echo)
    def finish(self,room,cutoff=10500):
        # The sampled ensemble has its own filtered room send. Original bells,
        # pads and hand percussion retain their authored envelopes and echoes.
        acoustic=render_soundfont(self.events,self.frames,self.bpm,self.meter)
        self.song += process_stem(acoustic,RATE,role='chamber',room='chamber',send=.10)
        self.song=sosfilt(butter(2,25,fs=RATE,btype='highpass',output='sos'),self.song,axis=0).astype(np.float32)
        self.song=sosfilt(butter(2,cutoff,fs=RATE,output='sos'),self.song,axis=0).astype(np.float32)
        self.song=np.tanh(self.song*1.08)/1.08
        self.song*=.100/np.sqrt(np.mean(self.song**2))
        # Only the loudest isolated transients meet this soft ceiling.
        self.song=.70*np.tanh(self.song/.70)
        self.song*=min(1,.68/np.max(np.abs(self.song)))
        fade=round(.7*RATE)
        self.song[:fade]*=np.linspace(0,1,fade,dtype=np.float32)[:,None]
        self.song[-3*RATE:]*=np.linspace(1,0,3*RATE,dtype=np.float32)[:,None]
        # Keep the natural releases, then trim dead padding. Audio below -66dBFS
        # for an entire 10ms window is not a meaningful tail at office levels.
        window=RATE//100
        levels=np.sqrt(np.mean(self.song[:len(self.song)//window*window].reshape(-1,window,2).astype(np.float64)**2,axis=(1,2)))
        active=np.flatnonzero(levels>10**(-66/20))
        if len(active):self.song=self.song[:min(len(self.song),(active[-1]+1)*window+round(.25*RATE))]
        self.song[-min(len(self.song),RATE//4):]*=np.linspace(1,0,min(len(self.song),RATE//4),dtype=np.float32)[:,None]
        instrument.cache_clear()
        return self.song


def vlq(value):
    value=int(value);out=[value&127];value>>=7
    while value:out.insert(0,128|(value&127));value>>=7
    return bytes(out)


def render_soundfont(events,frames,bpm=80,meter=4):
    """Offline MIT FluidR3 instrument rendering; no SoundFont shipped in Lucid."""
    kinds=sorted({e['instrument'] for e in events if e['instrument'] in GM})
    channel={kind:i if i<9 else i+1 for i,kind in enumerate(kinds)}
    # MIDI ticks represent seconds at 120BPM, avoiding roundoff across meters.
    queue=[(0,0,b'\xff\x51\x03\x07\xa1\x20')]
    volumes={'lute':84,'harp':82,'pizz':76,'basspluck':85,'recorder':78,'clarinet':80,'viola':72,'cello':74,'strings':55,'feltpiano':82}
    for kind,ch in channel.items():
        subset=[e for e in events if e['instrument']==kind]
        pan=np.mean([e['pan'] for e in subset])
        queue += [(0,0,bytes([0xc0|ch,GM[kind]])),(0,0,bytes([0xb0|ch,7,volumes[kind]])),
                  (0,0,bytes([0xb0|ch,10,int(np.clip(64+pan*50,0,127))])),(0,0,bytes([0xb0|ch,91,0]))]
    # Breath and bow expression follows musical phrases rather than a constant
    # MIDI fader. Keys and plucked articulations keep their transient dynamics.
    phrase_seconds=8*meter*60/bpm
    for kind,ch in channel.items():
        if kind not in ('strings','viola','cello','recorder','clarinet'):continue
        subset=sorted((e for e in events if e['instrument']==kind),key=lambda e:e['at'])
        spans=[]
        for event in subset:
            start,end=event['at'],event['at']+max(.1,event['seconds']-.14)
            if spans and start<=spans[-1][1]+.35:spans[-1][1]=max(spans[-1][1],end)
            else:spans.append([start,end])
        for start,end in spans:
            duration=max(.25,end-start)
            for at in np.arange(start,end+.05,.12):
                local=(at-start)/duration
                # Long textures breathe over eight bars; a short reed phrase
                # grows through its middle and releases into a real breath gap.
                phase=(at-start)/phrase_seconds if duration>phrase_seconds else local
                shape=np.sin(np.pi*(phase%1))**.7
                expression=int(np.clip(75+30*shape,65,110))
                queue.append((round(at*960),0,bytes([0xb0|ch,11,expression])))
            queue.append((round((end+.04)*960),0,bytes([0xb0|ch,11,75])))
    for e in events:
        if e['instrument'] not in channel:continue
        ch=channel[e['instrument']]
        velocity=int(np.clip((58 if e['instrument']=='feltpiano' else 70)*(e['level']/.10)**.68,18,118))
        start=round(e['at']*960)
        held=e['seconds']-.14
        # Sustain is expressive but excludes the synthetic release allowance.
        queue += [(start,2,bytes([0x90|ch,e['pitch'],velocity])),
                  (round((e['at']+held)*960),1,bytes([0x80|ch,e['pitch'],0]))]
    queue.sort(key=lambda x:(x[0],x[1]));track=bytearray();last=0
    for tick,_,data in queue:track+=vlq(tick-last)+data;last=tick
    track+=b'\x00\xff\x2f\x00'
    midi=b'MThd'+struct.pack('>IHHH',6,0,1,480)+b'MTrk'+struct.pack('>I',len(track))+track
    with tempfile.TemporaryDirectory(prefix='lucid-chamber-') as directory:
        source=Path(directory)/'score.mid';source.write_bytes(midi)
        target=Path(directory)/'instruments.wav'
        subprocess.run(['fluidsynth','-ni','-a','file','-F',str(target),'-T','wav','-r',str(RATE),
                        '-g','.38','-R','0','-C','0',str(SOUNDFONT),str(source)],check=True,capture_output=True)
        raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(target),'-f','f32le','-'])
        rendered=np.frombuffer(raw,dtype='<f4').reshape(-1,2)
        result=np.zeros((frames,2),dtype=np.float32)
        result[:min(frames,len(rendered))]=rendered[:frames]
        # The score's acoustic layers and original electronic beds remain on
        # similar scales before whole-score mastering preserves dynamics.
        return result*.95


# The glass question leaves two beats of room before its answering phrase.
GLASS_A=[[(0,76,1.2),(2,83,.7),(3,78,.7)],[(.5,79,1.4),(3,74,.6)],
         [(0,78,1),(1.5,81,.5),(3,76,.7)],[(.5,74,1.2),(2.5,73,.8)],
         [(0,76,.7),(1.5,79,.5),(2.5,83,1.1)],[(0,85,1.4),(2,83,.7),(3,81,.6)],
         [(.5,79,1.3),(2.5,78,.8)],[(0,76,2.1),(3,71,.6)]]
GLASS_B=[[(0,81,1),(2,78,1.3)],[(.5,76,.7),(2,74,1.4)],[(0,73,1.2),(2,76,1.4)],
         [(.5,78,1),(2.5,81,1)],[(0,83,1.5),(2.5,85,1)],[(0,81,1.4),(2,79,.7)],
         [(.5,78,1.3),(2.5,74,.8)],[(0,76,2.7)]]


def glass_observatory():
    s=Score(72,4,[('a distant light',4),('glass question',8),('orbiting answer',8),('eclipse',8),('stars emerge',8),('the observatory opens',12),('last reflection',4)],34001)
    harmony=[[52,59,66,69],[49,57,64,71],[50,57,64,69],[47,54,64,66],
             [52,59,62,66],[45,57,61,64],[50,57,64,69],[47,54,61,66]]
    for sec,i,b in s.each():
        at=b*4;chord=harmony[i%8]
        hush=sec in ('a distant light','eclipse','last reflection')
        for k,n in enumerate(chord[1:]):s.note(n,at-.15+k*.05,5.2,'auralpad',.038 if hush else .053,(k-1)*.38)
        if i%2==0:s.note(chord[0]-12,at,6,'cello',.029 if hush else .043,-.12)
        if sec in ('glass question','the observatory opens'):
            s.melody(GLASS_A,i,at,'celesta',.096 if sec=='glass question' else .11,.19,echo=.17)
        elif sec=='orbiting answer':s.melody(GLASS_B,i,at,'harp',.12,-.21,echo=.13)
        elif sec=='stars emerge':
            s.melody(GLASS_B,i,at,'recorder',.045,.1,octave=-12)
            if i%2==0:s.note(chord[-1]+12,at+2,2.3,'celesta',.055,-.24,echo=.18)
        elif i%2==0:s.note(chord[2]+12,at+1.5,2.7,'celesta',.05,.25,echo=.22)
        if sec=='the observatory opens':
            # A descending inner voice answers the high glass motif.
            s.note([67,66,64,62,61,64,66,59][i%8],at+.5,2.3,'viola',.037,-.25)
            if i>=8:s.note(chord[1]+12,at+2.5,1,'harp',.07,-.3)
    for n in [40,59,64,66,71]:s.note(n,(s.bars-1)*4,6,'auralpad',.048,(n%3-1)*.25)
    return s,s.finish([(.079,.10),(.139,.09),(.227,.07),(.383,.055),(.617,.04),(1.037,.03),(1.419,.02)])


BRIAR_A=[[(0,74,.7),(1,77,.4),(1.5,79,.4),(2,81,.6)],[(0,79,1.2),(1.5,77,.4),(2,76,.6)],
         [(0,74,.7),(1,76,.4),(1.5,77,.4),(2,79,.6)],[(0,81,1.5),(2,79,.6)],
         [(0,77,.7),(1,79,.4),(1.5,81,.4),(2,83,.6)],[(0,81,.7),(1,79,.6),(2,77,.6)],
         [(0,76,.7),(1,74,.6),(2,72,.6)],[(0,74,2.2)]]
BRIAR_B=[[(0,69,.6),(1,74,.6),(2,77,.6)],[(0,79,.9),(1.5,77,.4),(2,74,.6)],
         [(0,76,.6),(1,79,.6),(2,83,.6)],[(0,81,1.8),(2,79,.5)],
         [(0,77,.6),(1,74,.6),(2,72,.6)],[(0,74,.8),(1.5,76,.4),(2,77,.6)],
         [(0,76,.6),(1,72,.6),(2,69,.6)],[(0,74,2.2)]]


def briar_lanterns():
    s=Score(90,3,[('the stone gate',4),('lantern procession',16),('courtyard dance',16),('mist on the path',8),('the other road',16),('lanterns return',16),('the gate closes',8)],34019,tail=6)
    roots=[50,50,48,55,53,55,48,50]
    voicings=[[57,62,65],[57,62,67],[55,60,64],[55,62,65],[53,60,65],[55,59,62],[55,60,64],[57,62,65]]
    rng=np.random.default_rng(14159)
    t=np.arange(round(.25*RATE))/RATE
    hand=np.sin(2*np.pi*(110*t+1.1*(1-np.exp(-35*t))))*np.exp(-t*25)
    hand+=filt(rng.normal(0,1,len(t)),2600)*np.exp(-t*50)*.13
    tap=filt(rng.normal(0,1,round(.09*RATE)),4200)*np.exp(-np.arange(round(.09*RATE))/RATE*55)
    for sec,i,b in s.each():
        at=b*3;root=roots[i%8];chord=voicings[i%8];hush=sec in ('the stone gate','mist on the path','the gate closes')
        # Open fifth pedal and modal broken strings, with no jazz chord bed.
        if i%2==0:
            s.note(38,at,5.4,'strings',.025,-.35)
            s.note(57,at+.1,5,'strings',.019,.32)
        pattern=[(0,root),(1,chord[0]),(1.5,chord[1]),(2,chord[2]),(2.5,chord[1])]
        for pos,n in pattern:s.note(n,at+pos,.8 if pos==0 else .46,'lute',.145 if not hush else .105,(-1 if pos%1 else 1)*.23)
        if sec in ('lantern procession','lanterns return'):
            s.melody(BRIAR_A,i,at,'recorder',.068,.12)
        elif sec in ('courtyard dance','the other road'):
            s.melody(BRIAR_B,i,at,'harp',.15,-.14)
            if i%4 in (1,3):s.note(chord[1]+12,at+1.5,.7,'recorder',.04,.28)
        elif i%4==2:s.note(chord[-1]+12,at+1,1.6,'recorder',.042,.1)
        if not hush:
            s.put(hand,at,.13,-.05)
            s.put(tap,at+1,.055,.24);s.put(tap,at+2,.038,-.19)
            if i%8==7:s.put(tap,at+2.5,.045,.2)
        if sec=='lanterns return' and i>=8:
            s.note([62,65,64,62,60,59,60,62][i%8],at+.25,2,'viola',.043,-.25)
    # A Picardy third appears only in the last cadence, not throughout the mode.
    for n in [38,50,57,62,66]:s.note(n,(s.bars-1)*3,4.5,'harp',.12,(n%3-1)*.25)
    return s,s.finish([(.061,.09),(.117,.065),(.193,.045),(.317,.035),(.509,.025)],9500)


CASE_A=[[(0,74,.35),(.5,75,.3),(1,74,.55),(2,69,.5)],[(.5,70,.4),(1.25,73,.35),(2,74,.6)],
        [(0,77,.7),(1,76,.4),(1.5,74,.4),(2.25,72,.5)],[(0,73,.7),(1.5,69,.45),(2.25,68,.5)],
        [(0,74,.4),(.5,75,.3),(1,74,.55),(2,81,.55)],[(0,79,.7),(1,77,.4),(2,76,.6)],
        [(.5,74,.55),(1.5,73,.4),(2.25,70,.5)],[(0,69,1),(1.5,73,.35),(2.25,74,.5)]]
CASE_B=[[(0,65,.8),(1.5,69,.4),(2.25,72,.5)],[(0,70,1),(1.5,67,.4),(2.25,65,.5)],
        [(0,64,.7),(1,67,.4),(2,70,.6)],[(0,73,1.6),(2.25,72,.4)],
        [(0,74,.7),(1,77,.4),(2,79,.6)],[(0,76,1),(1.5,73,.4),(2.25,70,.5)],
        [(0,69,.7),(1,68,.4),(2,67,.6)],[(0,66,.6),(1,64,.5),(2,62,.8)]]


def copper_casebook():
    s=Score(96,3,[('the case opens',4),('the question',16),('footsteps in fog',16),('a deduction',12),('the false lead',8),('the reveal',16),('one last clue',12),('case closed',4)],34031)
    roots=[50,46,55,45,50,43,52,45]
    chords=[[62,65,69],[58,62,65],[58,62,67],[57,61,64],[62,65,69],[58,62,67],[58,62,64],[57,61,67]]
    for sec,i,b in s.each():
        at=b*3;root=roots[i%8];chord=chords[i%8];hush=sec in ('the case opens','the false lead','case closed')
        s.note(root-12,at,.8,'basspluck',.11 if hush else .19,-.05)
        for pos,n in [(1,chord[0]),(1.5,chord[1]),(2,chord[2])]:
            s.note(n,at+pos,.35,'pizz',.12 if not hush else .075,(-1 if pos==1 else 1)*.25)
        if not hush and i%2==1:s.note(root-13,at+2.65,.25,'pizz',.08,-.15)
        if sec in ('the question','the reveal'):
            s.melody(CASE_A,i,at,'clarinet',.084,.13)
        elif sec in ('footsteps in fog','one last clue'):
            s.melody(CASE_B,i,at,'viola',.082,-.18)
        elif sec=='a deduction':
            s.melody(CASE_B,i,at,'feltpiano',.17,.08,octave=12 if i>=8 else 0)
        elif i%2==1:s.note(chord[1]+12,at+1,.8,'clarinet',.045,.15)
        if sec in ('footsteps in fog','the reveal') and i%4 in (0,2):
            for n in chord[:2]:s.note(n-12,at+.2,2.5,'strings',.026,-.27)
        if sec=='the reveal' and i>=8:
            # A chromatic inner countermelody resolves against the reed phrase.
            s.note([65,64,62,61,62,60,58,57][i%8],at+.35,1.9,'cello',.043,-.3)
        if sec=='the false lead':
            for n in [57,60,63,66] if i<4 else [57,61,64,67]:s.note(n,at+.15,2.4,'strings',.025,(n%3-1)*.3)
    for n in [38,50,57,62,65]:s.note(n,(s.bars-1)*3,4,'feltpiano',.11,(n%3-1)*.2)
    return s,s.finish([(.043,.075),(.089,.055),(.149,.04),(.241,.025),(.397,.015)],10500)


POST_A=[[(0,72,1.1),(1.5,75,.5),(2.5,79,1)],[(.5,77,1.1),(2,75,.7),(3,72,.7)],
        [(0,70,1),(1.5,72,.5),(2.5,75,1)],[(0,74,1.6),(2.5,70,1)],
        [(0,72,.9),(1.5,75,.5),(2.5,80,1)],[(.5,79,1.1),(2,77,.7),(3,75,.7)],
        [(0,74,1),(1.5,72,.5),(2.5,70,.9)],[(0,72,2.5)]]
POST_B=[[(0,68,1),(1.5,72,.5),(2.5,75,1)],[(.5,73,1.2),(2.5,72,1)],
        [(0,70,.9),(1.5,68,.5),(2.5,65,1)],[(.5,67,1),(2,70,1.3)],
        [(0,72,1),(1.5,75,.5),(2.5,77,1)],[(0,76,1.2),(2,73,.7),(3,70,.7)],
        [(0,72,1.1),(1.5,70,.5),(2.5,67,1)],[(0,68,2.7)]]


def postcards_home():
    s=Score(78,4,[('the porch light',4),('the first letter',8),('a familiar refrain',8),('a faded photograph',8),('remembering',8),('homeward',12),('the last postcard',4)],34057)
    # Abmaj9, Fm9, Dbmaj9, Eb6; Db minor colors the central photograph.
    roots=[44,41,49,51,44,46,49,51]
    chords=[[56,60,63,67],[53,56,60,63],[53,56,61,65],[55,58,63,67],[56,60,63,68],[53,58,61,65],[53,56,61,65],[55,58,61,67]]
    for sec,i,b in s.each():
        at=b*4;root=roots[i%8];chord=chords[i%8]
        hush=sec in ('the porch light','a faded photograph','the last postcard')
        if sec=='a faded photograph':
            chord=([53,56,61,65] if i<4 else [52,56,61,64]);root=49
        s.note(root,at,2.8,'feltpiano',.135 if hush else .17,-.15)
        for k,n in enumerate(chord):s.note(n,at+.06*k,2.9,'feltpiano',.072 if hush else .085,(k-1.5)*.15)
        if not hush:
            for pos,k in [(1.6,1),(2.6,3),(3.35,2)]:s.note(chord[k],at+pos,.7,'feltpiano',.055,-.23)
        if sec in ('the first letter','a familiar refrain','homeward'):
            s.melody(POST_A,i,at,'feltpiano',.125 if sec!='homeward' else .14,.12)
        elif sec=='remembering':s.melody(POST_B,i,at,'cello',.070,-.2,octave=-12)
        elif i%2==0:s.note(chord[-1]+12,at+1.5,1.7,'feltpiano',.07,.2)
        if sec in ('a familiar refrain','homeward'):
            s.note([60,58,56,55,56,58,61,58][i%8],at+.3,3.1,'cello',.045,-.25)
            if sec=='homeward' and i>=4:
                for n in chord[1:3]:s.note(n,at-.08,4.6,'strings',.024,.23)
        if sec=='a faded photograph':s.note(68 if i<4 else 64,at+.7,3.4,'strings',.026,.25)
    for n in [44,56,60,63,68]:s.note(n,(s.bars-1)*4,6,'feltpiano',.105,(n%3-1)*.2)
    song=s.finish([(.067,.09),(.127,.065),(.211,.045),(.347,.03),(.557,.018)],9400)
    return s,song


PIECES=[
    dict(id='the-glass-observatory',title='The Glass Observatory',genre='mystical',bpm=72,meter=4,key=4,mode='dorian',energy=.18,period='night',textures=['pads','bells','bowed-strings','harp'],render=glass_observatory),
    dict(id='briar-lanterns',title='Briar Lanterns',genre='medieval',bpm=90,meter=3,key=2,mode='dorian',energy=.34,period='morning',textures=['lute','woodwind','drone','hand-percussion'],render=briar_lanterns),
    dict(id='the-copper-casebook',title='The Copper Casebook',genre='noir',bpm=96,meter=3,key=2,mode='minor',energy=.44,period='evening',textures=['pizzicato','reed','bowed-strings','piano'],render=copper_casebook),
    dict(id='postcards-from-home',title='Postcards from Home',genre='nostalgic',bpm=78,meter=4,key=8,mode='major',energy=.25,period='evening',textures=['felt-piano','cello','soft-strings'],render=postcards_home),
]


def measure(samples):
    rms=float(np.sqrt(np.mean(samples.astype(np.float64)**2)))
    peak=float(np.max(np.abs(samples)))
    a=samples[::10].astype(np.float64)
    corr=float(np.corrcoef(a[:,0],a[:,1])[0,1])
    mid=(samples[:,0]+samples[:,1])*.5
    mono_rms=float(np.sqrt(np.mean(mid.astype(np.float64)**2)))
    return dict(seconds=len(samples)/RATE,peakDbFS=20*np.log10(max(peak,1e-12)),rmsDbFS=20*np.log10(max(rms,1e-12)),
                stereoCorrelation=corr,monoFoldDownDb=20*np.log10(max(mono_rms,1e-12)/max(rms,1e-12)),dc=float(np.max(np.abs(np.mean(samples,axis=0)))))


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--only');parser.add_argument('--soundfont',default=os.environ.get('FLUID_SOUNDFONT'));args=parser.parse_args()
    global SOUNDFONT,SOUNDFONT_HASH
    if not args.soundfont or not Path(args.soundfont).is_file():parser.error('Pass --soundfont /path/to/FluidR3_GM.sf2 (MIT) or set FLUID_SOUNDFONT.')
    SOUNDFONT=Path(args.soundfont)
    with SOUNDFONT.open('rb') as stream:SOUNDFONT_HASH=hashlib.file_digest(stream,'sha256').hexdigest()
    selected=[p for p in PIECES if not args.only or p['id']==args.only]
    if not selected:parser.error('Unknown story id')
    prior=[]
    metric_file=OUT/'story-metrics.json'
    if metric_file.exists():prior=json.loads(metric_file.read_text())
    replace={p['id'] for p in selected};rows=[r for r in prior if r['id'] not in replace]
    OUT.mkdir(parents=True,exist_ok=True)
    for p in selected:
        score,song=p['render']()
        row={k:v for k,v in p.items() if k!='render'};row.update(measure(song))
        row['sections']=[]
        for sec in score.sections:
            start=round(sec['start']*RATE);end=round(sec['end']*RATE)
            level=float(20*np.log10(max(1e-12,np.sqrt(np.mean(song[start:end].astype(np.float64)**2)))))
            row['sections'].append({**sec,'rmsDbFS':level})
        row['noteEvents']=len(score.events)
        row['acousticRenderer']='FluidSynth with MIT FluidR3 GM 3.1; authored articulations and CC11 breath/bow phrases'
        row['productionChain']='Pedalboard 0.9.26 chamber stem EQ, centered low end, filtered parallel room send'
        row['expression']='Per-instrument MIDI CC11 phrase envelopes for sustained reeds and bowed strings; individual key/pluck velocities'
        row['soundfontSha256']=SOUNDFONT_HASH
        row['soundfontPrograms']={kind:GM[kind] for kind in sorted({e['instrument'] for e in score.events if e['instrument'] in GM})}
        with tempfile.TemporaryDirectory(prefix='lucid-story-') as tmp:
            wav=Path(tmp)/'master.wav'
            with wave.open(str(wav),'wb') as w:
                w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE)
                w.writeframes((np.clip(song,-1,1)*32767).astype('<i2').tobytes())
            mp3=OUT/f"{p['id']}.mp3"
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','192k',
                            '-metadata',f"title={p['title']}",'-metadata','artist=Lucid',str(mp3)],check=True)
            decoded=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(mp3),'-f','f32le','-']),dtype='<f4').reshape(-1,2)
            assert np.isfinite(decoded).all() and np.abs(decoded).max()<.9
            row['decoded']=measure(decoded)
            hop=RATE//100
            windows=decoded[:len(decoded)//hop*hop].reshape(-1,hop,2)
            short_rms=np.sqrt(np.mean(windows.astype(np.float64)**2,axis=(1,2)))
            active=np.flatnonzero(short_rms>10**(-66/20))
            row['decoded']['trailingQuietSeconds']=round(len(decoded)/RATE-(active[-1]+1)*hop/RATE,4)
            row['sectionDynamicRangeDb']=max(sec['rmsDbFS'] for sec in row['sections'])-min(sec['rmsDbFS'] for sec in row['sections'])
            row['tailPaddingSeconds']=.25
            levels=np.sqrt(np.mean(decoded[:len(decoded)//RATE*RATE].reshape(-1,RATE,2).astype(np.float64)**2,axis=(1,2)))
            assert not (levels[4:-6]<.0001).any(), 'Unexpected silent body second'
            loud=subprocess.run(['ffmpeg','-hide_banner','-i',str(mp3),'-af','ebur128=peak=true','-f','null','-'],capture_output=True,text=True,check=True).stderr
            summary=loud[loud.rfind('Summary:'):]
            row['loudnessSummary']=summary.strip()
            integrated=re.search(r'I:\s*([-+0-9.]+) LUFS',summary)
            true_peak=re.search(r'Peak:\s*([-+0-9.]+) dBFS',summary)
            row['decoded']['integratedLufs']=float(integrated.group(1)) if integrated else None
            row['decoded']['truePeakDbFS']=float(true_peak.group(1)) if true_peak else None
        rows.append(row)
        print(json.dumps({k:v for k,v in row.items() if k not in ('sections','loudnessSummary')}),flush=True)
        metric_file.write_text(json.dumps(rows,indent=2)+'\n')

if __name__=='__main__':main()
