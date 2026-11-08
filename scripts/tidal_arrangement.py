"""Tidal Memory: sampled keys and brief sine breaths, with no sustained saw bed.

Offline authoring only. Requires numpy/scipy/Pedalboard, FluidSynth, FFmpeg and
MIT FluidR3 GM. The app streams only the resulting MP3. Set FLUID_SOUNDFONT or
pass --soundfont. No Surge/native analog patch is used for this arrangement.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import os
import re
import shutil
import struct
import subprocess
import tempfile
import wave
import numpy as np
from scipy.signal import butter, sosfilt
from pedalboard import Pedalboard, HighpassFilter, LowpassFilter, Reverb

RATE=44100
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'src/assets/audio'
CACHE=Path.home()/'.cache/lucid-audio-authoring'
FONT_HASH='74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0'
BPM=66
BEAT=60/BPM
PROGRAMS={'soft electric piano':4,'nylon answers':24,'celesta glints':8}


def filt(audio,low=None,high=None):
    cut,kind=([low,high],'bandpass') if low and high else (low or high,'highpass' if low else 'lowpass')
    return sosfilt(butter(2,cut,fs=RATE,btype=kind,output='sos'),audio,axis=0).astype(np.float32)


def vlq(number):
    number=int(number);out=[number&127];number>>=7
    while number:out.insert(0,128|(number&127));number>>=7
    return bytes(out)


def sampled(notes,frames,program,font,pan=0):
    queue=[(0,0,b'\xff\x51\x03\x07\xa1\x20'),(0,0,bytes([0xc0,program])),
           (0,0,bytes([0xb0,7,90])),(0,0,bytes([0xb0,10,round(64+pan*48)])),
           (0,0,bytes([0xb0,91,0])),(0,0,bytes([0xb0,93,0]))]
    for event in notes:
        start=round(event['beat']*BEAT*960);end=round((event['beat']*BEAT+event['heldSeconds'])*960)
        queue.extend([(max(0,start),2,bytes([0x90,event['pitch'],event['velocity']])),
                      (max(start+1,end),1,bytes([0x80,event['pitch'],0]))])
    queue.sort(key=lambda e:(e[0],e[1]));track=bytearray();previous=0
    for tick,_,message in queue:track+=vlq(tick-previous)+message;previous=tick
    track+=b'\x00\xff\x2f\x00'
    midi=b'MThd'+struct.pack('>IHHH',6,0,1,480)+b'MTrk'+struct.pack('>I',len(track))+track
    with tempfile.TemporaryDirectory(prefix='lucid-tidal-keys-') as temp:
        source=Path(temp)/'score.mid';source.write_bytes(midi);target=Path(temp)/'sampled.wav'
        subprocess.run(['fluidsynth','-ni','-a','file','-F',str(target),'-T','wav','-r',str(RATE),
                        '-g','.4','-R','0','-C','0',str(font),str(source)],capture_output=True,check=True)
        raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(target),'-ac','2','-ar',str(RATE),'-f','f32le','-'])
        decoded=np.frombuffer(raw,dtype='<f4').reshape(-1,2)
        result=np.zeros((frames,2),np.float32);n=min(len(result),len(decoded));result[:n]=decoded[:n]
        return result


def room_return(audio,send=.14):
    # Only the sampled close instruments feed this short, dark return. Sine
    # breaths remain dry, so an old pad cannot survive its written note ending.
    wet=Pedalboard([HighpassFilter(330),Reverb(room_size=.42,damping=.76,wet_level=1,dry_level=0,width=.82),
                   LowpassFilter(2900)])(audio.T,RATE,buffer_size=8192,reset=True).T
    n=round(.027*RATE);result=np.zeros_like(audio);result[n:]=wet[:-n]*send
    return result


def echoes(audio):
    source=filt(audio,low=480,high=2300);result=np.zeros_like(audio)
    for beats,level,flip in [(.75,.12,True),(1.5,.045,False)]:
        n=round(beats*BEAT*RATE);result[n:]+=source[:-n,::-1]*level if flip else source[:-n]*level
    return result


def sine_breath(pitch,seconds,level,pan):
    t=np.arange(round(seconds*RATE),dtype=np.float64)/RATE
    hz=440*2**((pitch-69)/12)
    # Only a fundamental and a very quiet second harmonic. No ramp oscillator,
    # pulse, detuned copies, resonant filter or unison beating is present.
    tone=np.sin(2*np.pi*hz*t)+.025*np.sin(4*np.pi*hz*t)
    attack=.85;release=1.35
    envelope=np.ones(len(t))
    a=t<attack;envelope[a]=.5-.5*np.cos(np.pi*t[a]/attack)
    r=t>seconds-release;envelope[r]=.5-.5*np.cos(np.pi*(seconds-t[r])/release)
    envelope[[0,-1]]=0
    return (tone*envelope*level)[:,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)])


def arrange(font):
    form=[('small ripples',4),('light on the water',8),('an answering current',8),
          ('open water',8),('a remembered shore',8),('tide withdrawing',8)]
    frames=round((sum(bars for _,bars in form)*4*BEAT+5)*RATE)
    events={name:[] for name in PROGRAMS};sections=[];pad_windows=[]
    pads=np.zeros((frames,2),np.float32)
    # One connected eight-bar melody, written across the changing bass rather
    # than derived from whichever chord happens to be playing. B-G#-F# is the
    # recurring falling cell. Its first answer rests on E, the second reaches
    # A# (the Lydian colour), and the consequent finally settles F# onto E.
    # Pitch range D#4-C#5 keeps the line close instead of scattering high bells.
    theme=[[(.5,71,.65),(1.5,68,1.10),(3,66,.60)],
           [(0,64,2.20),(3,66,.45)],
           [(.5,68,.65),(1.5,71,1.10),(3,70,.60)],
           [(0,68,1.70),(2.5,66,.85)],
           [(.5,73,.65),(1.5,71,1.10),(3,70,.60)],
           [(0,68,1.70),(2.5,66,.85)],
           [(.5,63,.65),(1.5,66,1.10),(3,68,.60)],
           [(0,66,.90),(1.5,64,2.00)]]
    # A second phrase develops the SAME falling rhythm in the lower register.
    # Longer endings and two completely empty second halves let it breathe.
    development=[[(.5,68,.65),(1.5,66,1.10),(3,63,.60)],
                 [(0,61,2.60)],
                 [(.5,66,.65),(1.5,68,1.10),(3,70,.60)],
                 [(0,71,2.60)],
                 [(.5,73,.65),(1.5,71,1.10),(3,70,.60)],
                 [(0,68,2.35)],
                 [(.5,66,.65),(1.5,63,1.10),(3,66,.60)],
                 [(0,64,2.75)]]
    # Bass and three close inner voices follow the phrase. Common tones stay
    # put; the descending E-D#-C#-B bass makes the first four bars one motion.
    # (symbol, bass, upper voices). No bass doubles a melody in its register.
    harmony=[('Emaj9',40,[56,59,63]),('Badd11/D#',39,[54,59,63]),
             ('C#m13',37,[56,59,63]),('G#m7/B',35,[54,56,59]),
             ('F#add9/A#',34,[54,56,61]),('C#m11/G#',32,[52,59,63]),
             ('B6add9/F#',42,[51,59,61]),('E6add9',40,[56,59,61])]
    alternate=[('C#m9',37,[52,59,63]),('C#m9/B',35,[52,56,63]),
               ('F#add9/A#',34,[54,56,61]),('Bmaj7',35,[54,58,63]),
               ('F#add9/A#',34,[54,56,61]),('G#m7',32,[54,59,63]),
               ('Badd9/F#',42,[51,59,61]),('Emaj9',40,[56,59,63])]
    # Accompaniment is a quiet two-voice exchange with a separate bass. It does
    # not roll the same five-note chord at every even bar beneath a second loop.
    comp=[[(.06,0,.95),(.22,2,1.10),(2.75,1,.65)],
          [(.18,1,.95),(2.10,0,.80)],
          [(.08,0,1.10),(.26,2,1.20),(2.85,1,.65)],
          [(.12,1,1.15),(2.80,2,.65)],
          [(.06,0,1.00),(.25,2,1.15),(2.60,1,.75)],
          [(.18,1,1.05),(2.10,0,.80)],
          [(.07,0,.95),(.24,2,1.05),(2.70,1,.70)],
          [(.12,0,1.35),(.28,2,1.45)]]
    def add(name,pitch,beat,held,velocity):
        events[name].append(dict(pitch=int(pitch),beat=max(0,float(beat)),heldSeconds=float(held),
                                 velocity=int(velocity),instrument=name))
    bar=0
    for section_index,(section,bars) in enumerate(form):
        start=bar*4*BEAT
        for local in range(bars):
            at=bar*4;cycle=local%8
            symbol,bass,voices=(alternate if section in ('an answering current','open water') else harmony)[cycle]
            quiet=section in ('small ripples','open water','tide withdrawing')
            # The opening and coda withhold alternate bass entries. In the open
            # water passage the accompaniment disappears for whole bars.
            if not (section=='open water' and local in (1,3,5,7)):
                if not (section in ('small ripples','tide withdrawing') and local%2):
                    add('soft electric piano',bass,at+.015,1.20,33 if quiet else 39)
                pattern=comp[cycle][:1] if quiet else comp[cycle]
                for pos,voice,held in pattern:
                    add('soft electric piano',voices[voice],at+pos,held,29 if quiet else 34)
            if section=='small ripples' and local in (0,2):
                # The first two notes of the later theme are heard in half time.
                add('nylon answers',71 if local==0 else 68,at+.65,1.75,43)
            elif section=='light on the water':
                for pos,pitch,held in theme[cycle]:
                    add('nylon answers',pitch,at+pos,held*BEAT,57 if pos==.5 else 53)
            elif section=='an answering current':
                for pos,pitch,held in development[cycle]:
                    add('soft electric piano',pitch,at+pos,held*BEAT,57 if pos==.5 else 53)
                # A single delayed E or B marks each four-bar phrase ending.
                if local in (3,7):add('celesta glints',71 if local==3 else 76,at+3.35,.95,31)
            elif section=='open water' and local in (0,2,4,6):
                # Augmentation of the falling cell, not an unrelated interlude.
                add('nylon answers',[71,68,66,64][local//2],at+.65,2.20,41)
            elif section=='a remembered shore':
                # Exact recognisable return, followed by a changed final answer.
                phrase=theme[cycle] if cycle<6 else development[cycle]
                for pos,pitch,held in phrase:
                    add('nylon answers',pitch,at+pos,held*BEAT,58 if pos==.5 else 54)
                if local in (1,5):add('celesta glints',76 if local==1 else 75,at+3.55,.90,29)
            elif section=='tide withdrawing' and local in (0,2,4,6):
                add('soft electric piano',[71,68,66,64][local//2],at+.65,1.85,43-local)
            # A short chord breath every two bars, with long *zero-pad* gaps.
            # The entire open-water passage is pad-free, as is the late coda.
            use_pad=(local%2==0 and section not in ('open water',))
            if section=='small ripples':use_pad=local==0
            if section=='an answering current':use_pad=local in (0,4)
            if section=='tide withdrawing':use_pad=local in (0,4)
            if use_pad:
                seconds=[2.65,3.10,2.85,3.20][cycle//2]
                placement=at+.15;first=round(placement*BEAT*RATE)
                pitches=voices
                for k,pitch in enumerate(pitches):
                    sound=sine_breath(pitch,seconds,.0095 if quiet else .012,[-.2,.2,0][k])
                    n=min(len(sound),frames-first);pads[first:first+n]+=sound[:n]
                pad_windows.append(dict(start=placement*BEAT,end=placement*BEAT+seconds,pitches=pitches))
            bar+=1
        sections.append(dict(name=section,start=start,end=bar*4*BEAT,
                             intent={'small ripples':'Two half-time nylon notes seed the falling motif',
                                     'light on the water':'One eight-bar nylon theme follows a descending bass and settles onto E',
                                     'an answering current':'The falling rhythm develops on piano over a related contrasting bass plan',
                                     'open water':'Pad-free augmentation of B-G#-F#-E with whole-bar rests',
                                     'a remembered shore':'The recognisable nylon theme returns with the developed final answer',
                                     'tide withdrawing':'The same cell slows into a quiet tonic close'}[section]))
    cadence=(bar-1)*4
    for k,pitch in enumerate([40,56,59,64]):add('soft electric piano',pitch,cadence+.08+k*.18,1.05,35-k)
    add('nylon answers',64,cadence+1.8,1.25,38)
    add('celesta glints',76,cadence+2.25,.95,28)
    mixed=pads.copy();parts={};raw_measures={}
    for name,program in PROGRAMS.items():
        print('Rendering actual sampled',name,len(events[name]),'notes',flush=True)
        audio=sampled(events[name],frames,program,font,{'soft electric piano':-.12,'nylon answers':.24,'celesta glints':-.18}[name])
        cutoff={'soft electric piano':2500,'nylon answers':3000,'celesta glints':1900}[name]
        audio=filt(audio,low=85 if name=='soft electric piano' else 170 if name=='nylon answers' else 430,high=cutoff)
        # Whole-instrument calibration preserves note velocities and section
        # dynamics. It does not normalize every individual note to unit peak.
        target={'soft electric piano':.120,'nylon answers':.105,'celesta glints':.025}[name]
        audio*=target/max(1e-9,float(np.abs(audio).max()))
        produced=audio+room_return(audio,.15 if name!='celesta glints' else .12)
        if name in ('nylon answers','celesta glints'):produced+=echoes(audio)
        mixed+=produced;parts[name]=dict(program=program,notes=len(events[name]),wholeStemPeakTarget=target,lowpassHz=cutoff)
        raw_measures[name]=dict(peak=float(np.abs(audio).max()),rms=float(np.sqrt(np.mean(audio**2))))
    mixed=filt(mixed,low=30)
    # Each breath must release completely rather than leaving another layer of
    # that chord underneath the next gesture. Inspect this separate source.
    # Measure20ms windows, so individual sine zero-crossings are not mistaken
    # for new phrases. The authored voice envelope still reaches exact zero.
    frame=round(.02*RATE);usable=len(pads)//frame*frame
    present=np.max(np.abs(pads[:usable].reshape(-1,frame,2)),axis=(1,2))>1e-7
    edges=np.flatnonzero(np.diff(np.r_[False,present,False]))
    spans=(edges[1::2]-edges[::2])*.02
    gaps=(edges[2::2]-edges[1:-1:2])*.02
    assert len(spans)==len(pad_windows) and max(spans)<3.24
    assert min(gaps)>3.5,'Pad breaths must leave clear gaps'
    tail=round(.06*RATE);mixed[:tail]*=np.linspace(0,1,tail)[:,None]
    # Keep the authored instrument and room release, only trimming confirmed
    # silence at the end. A short guard preserves a natural media boundary.
    audible=np.flatnonzero(np.any(np.abs(mixed)>10**(-70/20),axis=1))
    keep=min(frames,int(audible[-1]+round(.28*RATE)));mixed=mixed[:keep].copy()
    mixed[-round(.04*RATE):]*=np.linspace(1,0,round(.04*RATE))[:,None]
    return mixed,dict(id='tidal-memory',title='Tidal Memory',genre='ambient',bpm=BPM,key=4,mode='lydian',meter=4,energy=.12,
                      revision=6,textures=['brief sine pads','sampled electric piano','sampled nylon guitar','celesta bells','filtered reflections'],
                      sections=sections,sampledParts=parts,sourceLevels=raw_measures,
                      composition=dict(theme=theme,development=development,harmony=harmony,contrastingHarmony=alternate,
                                       motif='B-G#-F# with a recurring offbeat-long-short rhythm, developed toward E',
                                       melodicRange='D#4-C#5 theme, C#4-C#5 development',lead='One primary line at a time; celesta only in phrase-ending gaps'),
                      padBreaths=dict(count=len(pad_windows),maximumSeconds=float(max(spans)),minimumGapSeconds=float(min(gaps)),
                                      windows=pad_windows,oscillators='Fundamental sine with second harmonic at 0.025; no saw, pulse, detuning, unison or chorus',
                                      roomSend=False),
                      arrangement='Connected eight-bar nylon theme, descending bass and close voice leading; related piano development, pad-free augmented motif, recognisable nylon return and quiet E close',
                      production='Actual FluidR3 electric piano/nylon/celesta; brief additive sine breaths; quiet filtered room and two restrained repeat taps')


def loudness(path):
    p=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af','loudnorm=I=-20:TP=-3.5:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    return json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}',p.stderr)[0])


def export(audio,meta,font):
    assert np.isfinite(audio).all() and audio.ndim==2 and audio.shape[1]==2
    # A static gain, calculated from the original PCM, preserves the full
    # composition's internal dynamics. No limiter or master saturation is used.
    audio*=min(.62/max(float(np.abs(audio).max()),1e-9),.085/max(float(np.sqrt(np.mean(audio**2))),1e-9))
    with tempfile.TemporaryDirectory(prefix='lucid-tidal-master-') as temp:
        wav=Path(temp)/'source.wav'
        def write(samples):
            with wave.open(str(wav),'wb') as w:
                w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE)
                w.writeframes((np.clip(samples,-1,1)*32767).astype('<i2').tobytes())
        write(audio);initial=loudness(wav)
        gain=min(-20.5-float(initial['input_i']),-3.8-float(initial['input_tp']))
        audio*=10**(gain/20);write(audio)
        destination=OUT/'tidal-memory.mp3'
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','192k','-metadata','artist=Lucid','-metadata','title=Tidal Memory','-metadata','genre=ambient',str(destination)],check=True)
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(destination),'-ac','2','-ar',str(RATE),'-f','f32le','-'])
    pcm=np.frombuffer(raw,dtype='<f4').reshape(-1,2);measure=loudness(destination)
    active=np.flatnonzero(np.any(np.abs(pcm)>10**(-65/20),axis=1))
    lead=active[0]/RATE;tail=(len(pcm)-active[-1]-1)/RATE
    assert np.isfinite(pcm).all() and float(measure['input_tp'])<=-2.7
    assert lead<.5 and tail<.65,(lead,tail)
    assert -22.25<=float(measure['input_i'])<=-16.0,measure
    means=np.mean(pcm,axis=0);corr=float(np.corrcoef(pcm.T)[0,1])
    assert float(np.max(np.abs(means)))<.002 and corr>-.1
    windows=pcm[:len(pcm)//RATE*RATE].reshape(-1,RATE,2)
    levels=np.sqrt(np.mean(windows.astype(np.float64)**2,axis=(1,2)))
    meta.update(seconds=len(pcm)/RATE,peakDbFS=float(20*np.log10(np.max(np.abs(audio)))),rmsDbFS=float(20*np.log10(np.sqrt(np.mean(audio**2)))),
                ending='Sampled E-major tonic cadence and natural room release, no trailing held pad',
                decoded=dict(seconds=len(pcm)/RATE,sampleRate=RATE,channels=2,finite=True,integratedLUFS=float(measure['input_i']),
                             truePeakDbFS=float(measure['input_tp']),loudnessRangeLU=float(measure['input_lra']),
                             channelCorrelation=corr,dcOffset=float(np.max(np.abs(means))),leadingQuietSeconds=lead,trailingSilenceSeconds=tail,
                             silentBodySeconds=int(np.sum(levels[4:-4]<.0001))),
                sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
                provenance=dict(soundfont=dict(name='FluidR3 GM',license='MIT',sha256=hashlib.sha256(font.read_bytes()).hexdigest(),
                                               packageURL='https://deb.debian.org/debian/pool/main/f/fluid-soundfont/fluid-soundfont-gm_3.1-5.3_all.deb',
                                               licenseSource='https://sources.debian.org/src/fluid-soundfont/3.1-5.3/COPYING/'),
                                sampledRenderer='FluidSynth, authored notes with dry source samples',
                                effects='Pedalboard 0.9.26 algorithmic filtered room, original feedforward echoes',
                                synth='Only explicitly bounded fundamental/quiet-second-harmonic sine breaths; no Surge analog pad used',
                                artistAudioCopied=False,auditionPerformed=False))
    for section in meta['sections']:
        a=round(section['start']*RATE);b=min(len(pcm),round(section['end']*RATE))
        section['rmsDbFS']=float(20*np.log10(np.sqrt(np.mean(pcm[a:b].astype(np.float64)**2))))
    (OUT/'tidal-remake-metrics.json').write_text(json.dumps([meta],indent=2)+'\n')
    print(json.dumps({k:meta[k] for k in ['id','seconds','peakDbFS','rmsDbFS','padBreaths','decoded','sha256']}),flush=True)
    return meta


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--soundfont',type=Path,default=os.environ.get('FLUID_SOUNDFONT') or CACHE/'fluidr3/usr/share/sounds/sf2/FluidR3_GM.sf2')
    args=parser.parse_args();font=Path(args.soundfont)
    if not font.is_file():parser.error('Pass a verified MIT FluidR3 GM bank with --soundfont.')
    digest=hashlib.sha256(font.read_bytes()).hexdigest()
    if digest!=FONT_HASH:parser.error('SoundFont differs from the verified MIT FluidR3 GM source.')
    backup=CACHE/'tidal-before-brief-remake';backup.mkdir(parents=True,exist_ok=True)
    source=OUT/'tidal-memory.mp3'
    if source.exists() and not (backup/source.name).exists():shutil.copy2(source,backup/source.name)
    audio,metadata=arrange(font);export(audio,metadata,font)


if __name__=='__main__':main()
