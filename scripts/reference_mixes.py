"""Original sampled lofi and atmospheric lunar phonk arrangements for Lucid.

Offline authoring only: numpy/scipy, FluidSynth, FFmpeg and Pedalboard. Run with
--soundfont /path/FluidR3_GM.sf2 --drums /path/to/verified-vcsl-drums. Sources are
MIT FluidR3 GM and CC0 VCSL, with provenance recorded in the output metrics.
Reference previews informed comparisons only; no reference audio or notes are
loaded into the composition. The app ships the encoded original recordings.
"""
from pathlib import Path
from functools import lru_cache
import argparse
import hashlib
import json
import os
import re
import struct
import subprocess
import tempfile
import wave
import numpy as np
from scipy.signal import butter, sosfilt, resample_poly, stft, find_peaks
from pedalboard import Pedalboard, PeakFilter, Reverb, HighpassFilter, LowpassFilter
from music_production import process_stem, center_low_end

RATE = 44100
OUT = Path(__file__).resolve().parents[1] / 'src/assets/audio'
SF = None
DRUMS = None
USED_SAMPLES = set()
# One recording gain per physical instrument, shared by every velocity and
# alternate take. A quiet played stroke must stay quieter than a hard stroke.
KIT_RECORDING_GAIN = {'bass':2.30, 'snare':3.33, 'hat':2.48}


def filt(audio, low=None, high=None):
    if low and high:
        cut, kind = [low, high], 'bandpass'
    else:
        cut, kind = low or high, 'highpass' if low else 'lowpass'
    return sosfilt(butter(2, cut, fs=RATE, btype=kind, output='sos'), audio, axis=0).astype(np.float32)


def vlq(value):
    value = int(value); result = [value & 127]; value >>= 7
    while value:
        result.insert(0, 128 | (value & 127)); value >>= 7
    return bytes(result)


def sampled_instrument(notes, frames, program, pan=0, spread=0):
    """Render authored notes through real FluidR3 samples, with no built-in FX."""
    queue = [(0, 0, b'\xff\x51\x03\x07\xa1\x20')]
    for channel in range(2 if spread else 1):
        placement=np.clip(pan+(-spread if channel==0 else spread),-.9,.9)
        queue += [(0, 0, bytes([0xc0|channel, program])), (0, 0, bytes([0xb0|channel, 7, 90])),
                  (0, 0, bytes([0xb0|channel, 10, round(64+placement*55)])),
                  (0, 0, bytes([0xb0|channel, 91, 0])), (0, 0, bytes([0xb0|channel, 93, 0]))]
    for at, pitch, held, velocity in notes:
        channel=1 if spread and pitch>=67 else 0
        start = max(0, round(at*960)); stop = max(start+1, round((at+held)*960))
        queue += [(start, 2, bytes([0x90|channel, int(pitch), int(np.clip(velocity, 1, 120))])),
                  (stop, 1, bytes([0x80|channel, int(pitch), 0]))]
    queue.sort(key=lambda event: (event[0], event[1]))
    track = bytearray(); previous = 0
    for tick, _, message in queue:
        track += vlq(tick-previous)+message; previous = tick
    track += b'\x00\xff\x2f\x00'
    midi = b'MThd'+struct.pack('>IHHH', 6, 0, 1, 480)+b'MTrk'+struct.pack('>I',len(track))+track
    with tempfile.TemporaryDirectory(prefix='lucid-reference-score-') as directory:
        source = Path(directory)/'original.mid'; source.write_bytes(midi)
        target = Path(directory)/'sampled.wav'
        subprocess.run(['fluidsynth','-ni','-a','file','-F',str(target),'-T','wav','-r',str(RATE),
                        '-g','.45','-R','0','-C','0',str(SF),str(source)], check=True, capture_output=True)
        raw = subprocess.check_output(['ffmpeg','-v','error','-i',str(target),'-f','f32le','-'])
        rendered = np.frombuffer(raw, dtype='<f4').reshape(-1,2)
        audio = np.zeros((frames,2),dtype=np.float32)
        audio[:min(frames,len(rendered))] = rendered[:frames]
        return audio


@lru_cache(maxsize=32)
def kit(name):
    USED_SAMPLES.add(name)
    raw = subprocess.check_output(['ffmpeg','-v','error','-i',str(DRUMS/(name+'.wav')),
                                   '-ar',str(RATE),'-ac','2','-f','f32le','-'])
    audio = np.frombuffer(raw,dtype='<f4').reshape(-1,2).copy()
    # Trim leading air, retaining 2.7 ms before the recorded attack. Do not
    # normalize individual hits: that previously erased the played dynamics.
    active = np.flatnonzero(np.max(np.abs(audio),axis=1)>10**(-52/20))
    if len(active): audio = audio[max(0,active[0]-120):active[-1]+240]
    return audio * KIT_RECORDING_GAIN[name.split('_')[0]]


def scale_stem(audio, target):
    levels = np.sqrt(np.mean(audio.astype(np.float64)**2,axis=1))
    active = levels > max(float(levels.max())*.015, 1e-7)
    rms = np.sqrt(np.mean(audio[active].astype(np.float64)**2)) if active.any() else 1
    return audio * min(12, target/max(rms,1e-9))


class Arrangement:
    def __init__(self,bpm,form,seed,tail=6):
        self.bpm,self.beat = bpm,60/bpm
        self.sections=[]; bar=0
        for name,bars,gain in form:
            self.sections.append(dict(name=name,bar=bar,bars=bars,start=bar*4*self.beat,
                                      end=(bar+bars)*4*self.beat,authoredGain=gain))
            bar+=bars
        self.bars=bar;self.frames=round((bar*4*self.beat+tail)*RATE)
        self.stems={};self.notes={};self.events=[];self.rng=np.random.default_rng(seed)
        self.drum_rng=np.random.default_rng(seed+271);self.percussion_events=[]
        self.percussion_metrics={};self.motif_throws=[]
    def stem(self,name):
        if name not in self.stems:self.stems[name]=np.zeros((self.frames,2),dtype=np.float32)
        return self.stems[name]
    def put(self,name,audio,at,level=1,pan=0):
        if audio.ndim==1:
            audio=audio[:,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)],np.float32)
        elif pan:
            audio=audio*np.array([np.sqrt(1-pan),np.sqrt(1+pan)],np.float32)
        start=round(at*self.beat*RATE);skip=max(0,-start);start=max(0,start)
        n=min(len(audio)-skip,self.frames-start)
        if n>0:self.stem(name)[start:start+n]+=audio[skip:skip+n]*level
    def note(self,name,pitch,at,held,velocity,pan=0):
        at=max(0,at*self.beat+float(self.rng.uniform(-.009,.012)))
        self.notes.setdefault(name,[]).append((at,pitch,held*self.beat,velocity))
        self.events.append(dict(beat=at/self.beat,pitch=pitch,held=held,instrument=name,velocity=velocity))
    def each(self):
        for section in self.sections:
            for i in range(section['bars']):yield section['name'],i,section['bar']+i
    def record(self,name,pitch,at,held):
        self.events.append(dict(beat=at,pitch=pitch,held=held,instrument=name))


def pingpong(audio, beat, amount=.18):
    result=audio.copy()
    for beats,gain,flip in [(.75,amount,True),(1.5,amount*.52,False),(2.25,amount*.27,True)]:
        n=round(beats*beat*RATE)
        delayed=filt(audio[:-n],low=350,high=5800)
        result[n:]+=delayed[:,::-1] * gain if flip else delayed*gain
    return result


def sampled_phrase_tape(audio, beat):
    """Resample original four-bar EP phrases with tiny continuous tape drift.

    Delay ranges are under 1 ms. This is a restrained original modulation,
    not a physical tape emulation or a blanket muffling filter.
    """
    result=np.empty_like(audio); block=round(16*beat*RATE)
    for start in range(0,len(audio),block):
        end=min(start+block,len(audio)); index=np.arange(start,end,dtype=np.float64)
        seconds=index/RATE
        position=index+RATE*(.00065*np.sin(2*np.pi*.43*seconds)+.00011*np.sin(2*np.pi*5.3*seconds))
        left=np.floor(position).astype(np.int64);fraction=(position-left).astype(np.float32)
        left=np.clip(left,0,len(audio)-2)
        result[start:end]=audio[left]*(1-fraction[:,None])+audio[left+1]*fraction[:,None]
    return np.tanh(result*1.12)/1.12


@lru_cache(maxsize=192)
def shaped_drum(name,short,lowpass):
    """Keep the recorded transient, control acoustic ringing and cymbal wash."""
    audio=kit(name).copy();family=name.split('_')[0]
    t=np.arange(len(audio),dtype=np.float64)/RATE
    if family=='bass':
        # These are recorded concert-bass-drum hits with a long 80-90 Hz ring.
        # A damped body retains their real impact without a boomy sustained tone.
        audio=np.repeat(audio.mean(axis=1)[:,None],2,axis=1)
        audio=filt(audio,low=31,high=min(lowpass or 3400,3400))
        audio*=np.exp(-np.maximum(t-.065,0)/.105).astype(np.float32)[:,None]
        audio=Pedalboard([PeakFilter(235,gain_db=-2.2,q=.85)])(audio.T,RATE,reset=True).T
        onset=min(len(audio),round(.002*RATE))
        audio[:onset]*=np.sin(np.linspace(0,np.pi/2,onset,dtype=np.float32))[:,None]
    elif family=='snare':
        audio=filt(audio,low=115,high=lowpass or 10500)
        audio=Pedalboard([PeakFilter(215,gain_db=-2.3,q=2.0),PeakFilter(335,gain_db=-1.5,q=2.7)])(
            audio.T,RATE,reset=True).T
        audio*=np.exp(-np.maximum(t-.075,0)/.16).astype(np.float32)[:,None]
    else:
        # Recorded hats include low shell/stand energy. Leave the stick detail
        # and metallic air while removing the low-mid gong-like ring.
        audio=filt(audio,low=760,high=lowpass or 11200)
    if short:
        audio=audio[:round(short*RATE)].copy();fade=min(len(audio),round(.025*RATE))
        audio[-fade:]*=(.5+.5*np.cos(np.linspace(0,np.pi,fade,dtype=np.float32)))[:,None]
    return np.ascontiguousarray(audio,dtype=np.float32)


def drum_hit(score,name,at,level,pan=0,short=None,lowpass=None,room=0,delay=0):
    USED_SAMPLES.add(name)
    family={'bass':'kick','snare':'snare','hat':'hats'}[name.split('_')[0]]
    audio=shaped_drum(name,short,lowpass)
    jitter=.0012 if family=='kick' else .0025
    at+=float(score.drum_rng.uniform(-jitter,jitter))/score.beat
    level*=float(score.drum_rng.uniform(.95,1.045))
    score.put(family,audio,at,level,0 if family=='kick' else pan)
    # Kicks never enter a reverb or delay bus. The send is written by the
    # performance, so only chosen backbeats and cymbal openings gain space.
    if family!='kick':
        if room:score.put(family+' room feed',audio,at,level*room,pan)
        if delay:score.put(family+' delay feed',audio,at,level*delay,pan)
    score.percussion_events.append(dict(beat=at,kind=family,source=name,level=level,room=room,delay=delay,
                                       maximumSeconds=short,lowpassHz=lowpass))


def calibrated_stem(audio,target):
    scaled=scale_stem(audio,target)
    peak=float(np.max(np.abs(audio)))
    gain=float(np.max(np.abs(scaled)))/peak if peak>1e-12 else 1
    return scaled,gain


def percussion_finish(score,lunar=False):
    """Separate dry recorded shells and hats from selected filtered returns."""
    targets={'kick':.031 if lunar else .029,'snare':.022,'hats':.012 if lunar else .009}
    room_feed=np.zeros((score.frames,2),dtype=np.float32);delay_feed=np.zeros_like(room_feed)
    buses={}
    for family,target in targets.items():
        audio,gain=calibrated_stem(score.stem(family),target)
        # Compression is gentle and belongs to snare/hat buses only. The kick
        # remains dry, mono and free of pitch, distortion, chorus or room FX.
        score.stems[family]=process_stem(audio,RATE,'bass' if family=='kick' else 'drums',room='none')
        for destination,feed in [('room',room_feed),('delay',delay_feed)]:
            name=family+' '+destination+' feed'
            if name in score.stems:feed+=score.stems.pop(name)*gain
        produced=score.stems[family]
        windows=produced[:len(produced)//441*441].reshape(-1,441,2)
        peaks=np.max(np.abs(windows),axis=(1,2))
        live=np.flatnonzero(peaks>1e-5)
        buses[family]=dict(targetActiveRMS=target,performanceGain=gain,
                           peakDbFS=float(20*np.log10(max(np.max(np.abs(produced)),1e-12))),
                           active10msWindows=len(live),events=sum(e['kind']==family for e in score.percussion_events),
                           wet=False if family=='kick' else 'Selected separate sends')
    # Predelay separates the recorded backbeat from its ambience. Return EQ
    # removes low energy before the algorithmic room and darkens the tail.
    wet=Pedalboard([HighpassFilter(460),Reverb(room_size=.34 if lunar else .23,damping=.79,
                                             wet_level=1,dry_level=0,width=1),LowpassFilter(4900)])(
        room_feed.T,RATE,buffer_size=8192,reset=True).T
    offset=round((.024 if lunar else .014)*RATE)
    returned=np.zeros_like(wet);returned[offset:]=wet[:-offset]
    score.stems['selected percussion room']=returned
    echoes=np.zeros_like(delay_feed)
    for beats,level,cut in [(.75,.72,4500),(1.5,.34,3300),(2.25,.13,2500)]:
        offset=round(beats*score.beat*RATE)
        echoes[offset:]+=filt(delay_feed[:-offset],low=600,high=cut)[:,::-1]*level
    score.stems['selected percussion echoes']=echoes
    score.percussion_metrics=dict(recordingGainByInstrument=KIT_RECORDING_GAIN,
                                  individualSampleNormalization=False,kickPitchProcessing=False,
                                  kickRoomSend=0,kickDelaySend=0,buses=buses,
                                  roomPredelayMs=24 if lunar else 14,roomReturnBandHz=[460,4900],
                                  delayBeatOffsets=[.75,1.5,2.25],delayReturnHighpassHz=600,
                                  timingVariationMs={'kick':1.2,'snare':2.5,'hats':2.5},
                                  noSimultaneousOpenAndClosedHat=True,
                                  selectedRoomEvents=sum(e['room']>0 for e in score.percussion_events),
                                  selectedDelayEvents=sum(e['delay']>0 for e in score.percussion_events),
                                  primaryProductionReferences=[
                                      'https://www.toontrack.com/blog/how-to-program-drums/',
                                      'https://www.izotope.com/community/blog/9-tips-for-using-reverb-with-drums',
                                      'https://www.izotope.com/community/blog/reverb-pre-delay'])
    diagnostics={}
    for name in sorted({event['source'] for event in score.percussion_events}):
        event=next(event for event in score.percussion_events if event['source']==name)
        raw=kit(name);shaped=shaped_drum(name,event['maximumSeconds'],event['lowpassHz'])
        row=dict(sourcePeakAfterSharedGainDbFS=float(20*np.log10(max(np.max(np.abs(raw)),1e-12))),
                 shapedPeakDbFS=float(20*np.log10(max(np.max(np.abs(shaped)),1e-12))))
        if name.startswith('bass'):
            body=np.sqrt(np.mean(shaped[round(.03*RATE):round(.11*RATE)].astype(np.float64)**2))
            late=np.sqrt(np.mean(shaped[round(.15*RATE):round(.26*RATE)].astype(np.float64)**2))
            row['late150To260msVersusBody30To110msDb']=float(20*np.log10(max(late,1e-12)/max(body,1e-12)))
        diagnostics[name]=row
    score.percussion_metrics['recordedHitDiagnostics']=diagnostics


def cassette_clouds():
    score=Arrangement(82,[('dusty window',4,.78),('first verse',12,.94),('sunny hook',8,1.04),
                         ('tape interlude',8,.74),('second verse',8,.96),('homecoming',8,1.07),
                         ('tape tail',4,.76)],104729)
    harmony=[[53,57,60,64,67],[50,53,57,60,64],[55,58,62,65,69],[48,52,55,58,62],
             [58,62,65,69,72],[58,61,65,68,72],[53,57,60,64,67],[48,52,55,58,62]]
    bridge=[[58,61,65,68,72],[51,55,58,62,65],[56,60,63,67,70],[48,52,55,58,61],
            [50,53,57,60,64],[55,58,62,65,69],[48,52,55,58,62],[48,52,55,58,61]]
    hook=[[(0,76,.7),(1.65,79,.4),(2.5,81,.8)],[(.5,77,1.2),(2.65,76,.8)],
          [(0,74,.7),(1.65,77,.4),(2.5,81,.8)],[(.5,79,.65),(1.65,76,.4),(3,74,.7)],
          [(0,77,1.2),(1.65,81,.4),(2.65,84,.8)],[(.5,80,.7),(2,77,1)],
          [(0,76,.7),(1.65,74,.4),(2.65,72,.8)],[(.5,74,.7),(2,72,1.6)]]
    answer=[[(.5,77,.7),(2,80,.7)],[(0,79,1.2),(2.65,77,.6)],
            [(.5,75,.8),(2,72,1)],[(0,73,.6),(1.65,74,.4),(2.5,76,1)],
            [(0,77,.8),(2,76,.7)],[(.5,74,1.3),(2.65,77,.5)],
            [(0,76,.7),(1.65,74,.4),(3,72,.6)],[(.5,73,.7),(2,72,1.5)]]
    for section,i,bar in score.each():
        at=bar*4;sparse=section in ('dusty window','tape interlude','tape tail')
        chord=(bridge if section in ('tape interlude','second verse') else harmony)[i%8]
        # The EP is a compact inner voice; guitar carries the upper theme, and
        # answering piano uses open intervals instead of copying the EP block.
        voicing=[chord[1],chord[3],chord[4],chord[2]+12]
        if i%2:voicing=[voicing[0],voicing[1]+12,voicing[2],voicing[3]]
        strike=.07 if i%2 else .015
        for k,pitch in enumerate(voicing):
            score.note('electric piano',pitch,at+strike+k*.029,2.25 if sparse else 1.7,
                       (47 if sparse else 57)+int(score.rng.integers(-5,6)))
            if not sparse:
                score.note('electric piano',pitch,at+2.64+k*.019,.63,43+int(score.rng.integers(-5,5)))
        score.note('acoustic bass',chord[0]-12,at+.015,1.7 if sparse else 1.35,64)
        if not sparse:
            score.note('acoustic bass',chord[0]-5,at+2.51,.75,51)
            if i%4==3:score.note('acoustic bass',chord[0]-13,at+3.66,.23,43)
        if section in ('first verse','sunny hook','second verse','homecoming'):
            phrase=answer if section=='second verse' else hook
            for event,(pos,pitch,held) in enumerate(phrase[i%8]):
                if section=='first verse' and i%4==3 and event==2:continue
                score.note('nylon guitar',pitch,at+pos,held,66+int(score.rng.integers(-7,7)))
            if section=='homecoming' and i%2:
                for pos,pitch in [(1.1,chord[2]+12),(3.32,chord[1]+12)]:
                    score.note('answer piano',pitch,at+pos,.7,47)
        elif section=='tape interlude':
            for pos,pitch,held in answer[i%8]:
                score.note('answer piano',pitch-12,at+pos,held*1.2,46)
        elif i%2==0:score.note('answer piano',chord[-1]+12,at+1.15,1.6,42)
        active=not sparse or section=='dusty window' and i>=2
        if active:
            kicks=([0,1.74,2.52] if i%2==0 else [0,.78,2.76])
            for j,pos in enumerate(kicks):
                accent=section in ('sunny hook','homecoming') and i%4==0 and j==0
                sample=('bass_main_' if accent else 'bass_soft_')+str(1+(i+j)%2)
                drum_hit(score,sample,at+pos,.10 if accent else .20 if j==0 else .14,short=.34,lowpass=3200)
            for j,pos in enumerate([1.045,3.055]):
                drum_hit(score,'snare_medium_'+str(1+(i+j)%2),at+pos,.115*(1.05 if i%4==3 else .97),-.09,
                         short=.25,lowpass=7600,room=.12 if j else .065,
                         delay=.14 if j==1 and i%4==3 else 0)
            if i%2:
                drum_hit(score,'snare_soft_'+str(1+i%2),at+2.87,.050,-.18,short=.15,lowpass=6800)
            for step in range(8):
                if step==5 and section in ('sunny hook','homecoming') and i%2==0:continue
                pos=step*.5+(.073 if step%2 else 0)+float(score.rng.uniform(-.012,.013))
                drum_hit(score,'hat_soft_'+str(1+(i+step)%2),at+pos,.043 if step%2 else .031,.32,short=.115)
            if i%4==3:
                for j,pos in enumerate([3.49,3.71]):
                    drum_hit(score,'hat_main_'+str(1+j%2),at+pos,.017,-.25+j*.3,short=.085,
                             delay=.075 if j==1 else 0)
            if section in ('sunny hook','homecoming') and i%2==0:
                drum_hit(score,'hat_loose_'+str(1+i%2),at+2.58,.018,-.28,short=.23,lowpass=8500,room=.07)
        elif section=='tape interlude' and i>=4:
            drum_hit(score,'snare_soft_'+str(1+i%2),at+3.06,.065,-.15,short=.22,lowpass=6800,
                     room=.13,delay=.13 if i%4==3 else 0)
            for pos in [.57,1.57,2.57,3.57]:
                drum_hit(score,'hat_soft_'+str(1+i%2),at+pos,.023,.30,short=.075)
    end=score.bars*4
    for k,pitch in enumerate([53,60,64,67,69]):score.note('electric piano',pitch,end-1+k*.026,5.1,52)
    score.note('acoustic bass',41,end-1,2.5,58)
    score.note('nylon guitar',77,end-.5,3.3,54)
    for name,program,pan,target in [('electric piano',4,-.30,.043),('nylon guitar',24,.27,.030),
                                   ('answer piano',0,-.46,.015),('acoustic bass',32,0,.048)]:
        audio=sampled_instrument(score.notes.get(name,[]),score.frames,program,
                                 -.02 if name=='electric piano' else pan,.66 if name=='electric piano' else 0)
        if name=='electric piano':audio=sampled_phrase_tape(audio,score.beat)
        if name in ('nylon guitar','answer piano'):audio=pingpong(audio,score.beat,.16)
        audio=scale_stem(audio,target)
        score.stems[name]=process_stem(audio,RATE,'bass' if name=='acoustic bass' else 'keys',
                                       room='none' if name=='acoustic bass' else 'chamber' if name=='electric piano' else 'small',
                                       send=.18 if name=='electric piano' else .12,
                                       chorus=name=='electric piano')
    percussion_finish(score)
    # Sparse reverse swells use only our own newly recorded EP, beneath the B
    # section entrances. They are not lifted from any reference recording.
    own=score.stems['electric piano'];swells=np.zeros_like(own)
    for bar in [24,28,32,40]:
        position=round(bar*4*score.beat*RATE);n=round(.7*score.beat*RATE)
        source=own[position:min(len(own),position+n)][::-1].copy()
        source*=np.linspace(0,1,len(source),dtype=np.float32)[:,None]
        swells[position-len(source):position]+=source*.22
    score.stems['original phrase swells']=filt(swells,low=320,high=6800)
    return score


@lru_cache(maxsize=96)
def lunar_voice(pitch,seconds,kind):
    t=np.arange(round(seconds*RATE),dtype=np.float64)/RATE;hz=440*2**((pitch-69)/12)
    phase=2*np.pi*hz*t
    if kind=='pad':
        left=np.zeros(len(t));right=np.zeros(len(t))
        for harmonic,level in [(1,.62),(2,.20),(3,.09),(5,.035)]:
            left+=level*np.sin(phase*harmonic*.9986+.21*np.sin(t*.31+pitch))
            right+=level*np.sin(phase*harmonic*1.0015+.27*np.sin(t*.37+pitch*.2)+.6)
        envelope=np.sin(np.pi*t/seconds)**1.15
        audio=np.column_stack((left,right))*envelope[:,None]
        return filt(audio,low=180,high=4200)
    if kind=='bell':
        body=.58*np.sin(phase)+.24*np.sin(phase*2.009)*np.exp(-3*t)+.13*np.sin(phase*3.93)*np.exp(-5*t)
        env=(1-np.exp(-260*t))*np.exp(-t/.58)
    else:
        # Tuned inharmonic metal voices supply a brief cowbell edge under the
        # slower mallet body, with a softer attack than a constant square lead.
        body=np.sin(phase)+.48*np.sin(phase*1.487)+.24*np.sin(phase*2.97)+.12*np.sin(phase*4.13)
        body=np.tanh(body*1.6)/1.6
        env=(1-np.exp(-390*t))*np.exp(-t/.145)
    return (body*env*np.clip((seconds-t)/.035,0,1)).astype(np.float32)


def clean_sub(pitch,seconds):
    """Stable-pitch bass, with rounded onset and release, not a swept kick."""
    t=np.arange(round(seconds*RATE),dtype=np.float64)/RATE;hz=440*2**((pitch-69)/12)
    phase=2*np.pi*hz*t
    body=np.sin(phase)+.070*np.sin(phase*2)+.015*np.sin(phase*3)
    attack=np.sin(np.minimum(t/.011,1)*np.pi/2)**2
    release=np.sin(np.minimum(np.maximum(seconds-t,0)/.085,1)*np.pi/2)**2
    env=attack*np.exp(-t/1.5)*release
    return (body*env).astype(np.float32)


def midnight_drift():
    score=Arrangement(74,[('streetlight',4,.74),('cruise',12,.98),('side street',8,.92),
                         ('underpass',8,.70),('night bloom',12,1.07),('distant lights',4,.75)],503)
    harmony=[[51,58,63,66],[47,54,58,63],[44,51,56,59],[46,53,58,61],
             [51,58,63,66],[47,54,58,63],[44,51,56,59],[46,53,58,62]]
    bridge=[[47,54,58,63],[49,56,61,65],[54,61,66,70],[51,58,63,66],
            [44,51,56,59],[47,54,58,63],[46,53,58,61],[46,53,58,62]]
    hook=[[(0,75,.35),(.75,82,.3),(1.5,78,.55),(2.75,75,.45)],
          [(.5,78,.4),(1.25,75,.35),(2.5,70,.65),(3.5,73,.3)],
          [(0,75,.35),(.75,80,.3),(1.5,78,.55),(3,75,.45)],
          [(.5,77,.45),(1.5,73,.4),(2.75,70,.6)],
          [(0,75,.35),(.75,82,.3),(1.5,87,.55),(2.75,82,.45)],
          [(.5,85,.4),(1.25,82,.4),(2.5,78,.6),(3.5,75,.3)],
          [(0,80,.35),(.75,78,.35),(1.5,75,.55),(3,68,.5)],
          [(.5,70,.45),(1.5,74,.4),(2.75,75,.8)]]
    answer=[[ (.5,70,.55),(1.75,75,.45),(3,78,.7)],[(0,73,.65),(1.5,77,.55),(3,73,.65)],
            [(.75,78,.5),(2,82,.6),(3.25,78,.45)],[(0,78,.7),(2,75,1.1)],
            [(.5,80,.55),(1.75,78,.45),(3,75,.65)],[(0,78,.6),(1.5,75,.6),(3,70,.7)],
            [(.5,73,.7),(2,70,1.1)],[(.5,74,.7),(2,75,1.6)]]
    kicks=[]
    for section,i,bar in score.each():
        at=bar*4;sparse=section in ('streetlight','underpass','distant lights')
        chord=(bridge if section=='side street' else harmony)[i%8]
        for k,pitch in enumerate(chord[1:]):
            pad=lunar_voice(pitch,round(5.2*score.beat,3),'pad')
            score.put('lunar pads',pad,at-.20,.034 if sparse else .042)
            score.record('detuned lunar pads',pitch,at-.20,5.2)
        root=chord[0]-24
        while root<26:root+=12
        pattern=([(0,1.8,0),(2.75,.8,7)] if section=='side street' else
                 [(0,1.4,0),(1.75,.5,12),(2.5,.95,0),(3.5,.48,7)])
        if sparse:pattern=[(0,3.0,0)]
        for j,(pos,held,offset) in enumerate(pattern):
            pitch=root+offset
            score.put('sub',clean_sub(pitch,held*score.beat),at+pos+.012,.23 if j==0 else .17)
            score.record('rounded stable-pitch sub',pitch,at+pos+.012,held)
        if not sparse:
            # Main snare on 2/4 at 74 BPM, fine hats establish the 148 BPM
            # movement. Recorded velocities/round robins keep the pocket alive.
            kick_pattern=[0,1.73,2.51] if i%2==0 else [0,.77,2.76]
            if section=='night bloom' and i%4==3:kick_pattern.append(3.49)
            for j,pos in enumerate(kick_pattern):
                sample=('bass_main_' if j==0 else 'bass_soft_')+str(1+(i+j)%2)
                drum_hit(score,sample,at+pos,.13 if j==0 else .25,short=.30,lowpass=3100)
                kicks.append((at+pos)*score.beat)
            for j,pos in enumerate([1.015,3.022]):
                # The softer center-hit sample carries the relaxed backbeat;
                # the harder dry articulation is reserved for phrase arrivals.
                accent=i%4==3 and j==1 and section!='side street'
                sample=('snare_dry_' if accent else 'snare_medium_')+str(1+(i+j)%2)
                drum_hit(score,sample,at+pos,.075 if accent else .16,-.06,short=.24,
                         lowpass=9200,room=.18 if j else .07,
                         delay=.18 if j==1 and i%4==3 else 0)
            if i%2:
                drum_hit(score,'snare_soft_'+str(1+i%2),at+2.84,.066,.15,short=.14,lowpass=8500)
            for step in range(16):
                if step==2 or step in (6,14) and i%2==0:continue
                if i%4==3 and step in (14,15):continue
                if section=='side street' and step in (5,11,15):continue
                pos=step*.25+(.025 if step%2 else 0)+float(score.rng.uniform(-.006,.008))
                sample=('hat_soft_' if step%2 else 'hat_main_')+str(1+(i+step)%2)
                drum_hit(score,sample,at+pos,.060 if step%4==0 else .043 if step%2==0 else .075,
                         .30 if step%2 else .12,short=.10)
            drum_hit(score,'hat_loose_'+str(1+i%2),at+.52,.025,-.34,short=.20,room=.055)
            if i%4==3:
                for j,pos in enumerate([3.52,3.65,3.77,3.90]):
                    drum_hit(score,'hat_soft_'+str(1+j%2),at+pos,.072-j*.007,-.32+j*.15,short=.075,
                             delay=.10 if j==3 else 0)
            phrase=answer if section=='side street' else hook
            for event,(pos,pitch,held) in enumerate(phrase[i%8]):
                if section=='cruise' and i%4==3 and event==2:continue
                # A rounded pitched metal body and quiet cowbell edge share
                # one authored motif; changing register answers the A theme.
                if section=='side street':pitch-=12
                score.put('lunar motif',lunar_voice(pitch,round((held+.7)*score.beat,3),'bell'),at+pos,.079,.15)
                if event==0 or (i+event)%3==0:
                    score.put('cowbell edge',lunar_voice(pitch,round(.48*score.beat,3),'cowbell'),at+pos,.016,-.10)
                score.note('sampled moon motif',pitch,at+pos,held+.15,58+int(score.rng.integers(-4,5)))
                if event==len(phrase[i%8])-1 and i%4==3:score.motif_throws.append(at+pos)
                score.record('rounded bell and cowbell motif',pitch,at+pos,held)
            if section=='night bloom' and i%2:
                for pos,pitch in [(1.27,chord[2]+12),(3.37,chord[1]+12)]:
                    score.note('vibraphone answer',pitch,at+pos,.8,49)
        else:
            if i%2==0:
                score.note('vibraphone answer',chord[2]+12,at+1.1,2.1,48)
            if section=='underpass' and i>=4:
                drum_hit(score,'snare_soft_'+str(1+i%2),at+3.02,.075,-.1,short=.21,
                         room=.21,delay=.20 if i%4==3 else 0)
                for pos in [.5,1.5,2.5,3.5]:
                    drum_hit(score,'hat_soft_'+str(1+i%2),at+pos,.024,.25,short=.07)
    end=score.bars*4
    for pitch in [58,63,66,70]:
        score.put('lunar pads',lunar_voice(pitch,6.4,'pad'),end-1,.047)
        score.record('tonic pad cadence',pitch,end-1,6.4/score.beat)
    score.put('sub',clean_sub(27,2.8),end-1,.18)
    score.note('vibraphone answer',75,end-.6,3.4,46)
    score.stems['vibraphone answer']=sampled_instrument(score.notes['vibraphone answer'],score.frames,11,-.38)
    score.stems['vibraphone answer']=process_stem(scale_stem(pingpong(score.stems['vibraphone answer'],score.beat,.24),.014),
                                                RATE,'keys',room='bloom',send=.15)
    score.stems['sampled moon motif']=sampled_instrument(score.notes['sampled moon motif'],score.frames,11,.18)
    # Open selected phrase endings with dark tempo-locked echoes, while the
    # main sampled theme stays clearer between those musical responses.
    response_feed=np.zeros((score.frames,2),dtype=np.float32)
    for beat in score.motif_throws:
        start=round(beat*score.beat*RATE);n=min(round(.85*score.beat*RATE),score.frames-start)
        part=score.stems['sampled moon motif'][start:start+n].copy()
        edge=min(round(.015*RATE),n//3)
        part[:edge]*=np.linspace(0,1,edge,dtype=np.float32)[:,None]
        part[-edge:]*=np.linspace(1,0,edge,dtype=np.float32)[:,None]
        response_feed[start:start+n]+=part
    score.stems['sampled moon motif']=process_stem(scale_stem(pingpong(score.stems['sampled moon motif'],score.beat,.16),.026),
                                                 RATE,'keys',room='small',send=.11)
    response=pingpong(response_feed,score.beat,.48)-response_feed
    score.stems['motif response echoes']=process_stem(scale_stem(response,.007),RATE,'lead',room='chamber',send=.11)
    score.stems['lunar pads']=process_stem(scale_stem(score.stem('lunar pads'),.034),RATE,'pads',room='bloom',send=.20,chorus=True)
    score.stems['lunar motif']=process_stem(scale_stem(pingpong(score.stem('lunar motif'),score.beat,.25),.010),
                                          RATE,'lead',room='small',send=.07)
    score.stems['cowbell edge']=process_stem(score.stem('cowbell edge'),RATE,'lead',room='none')
    score.stems['sub']=process_stem(scale_stem(score.stem('sub'),.075),RATE,'bass')
    # A short look-ahead ramp avoids abruptly cutting an already sounding
    # bass wave when a kick arrives. Only sub receives this smooth envelope.
    duck=np.ones(score.frames,dtype=np.float32)
    for at in kicks:
        start=round(at*RATE)-round(.006*RATE)
        down=.5+.5*np.cos(np.linspace(0,np.pi,round(.006*RATE),dtype=np.float32))
        up=.5-.5*np.cos(np.linspace(0,np.pi,round(.125*RATE),dtype=np.float32))
        shape=np.concatenate((.58+.42*down,np.full(round(.018*RATE),.58,np.float32),.58+.42*up))
        skip=max(0,-start);start=max(0,start);n=min(len(shape)-skip,score.frames-start)
        if n>0:duck[start:start+n]=np.minimum(duck[start:start+n],shape[skip:skip+n])
    score.stems['sub']*=duck[:,None]
    percussion_finish(score,lunar=True)
    score.percussion_metrics.update(subPitchSweepOnAttack=False,subAttackMs=11,subReleaseMs=85,
                                    kickSubDuck=dict(lookaheadMs=6,holdMs=18,recoveryMs=125,minimumGain=.58),
                                    motifResponseThrows=len(score.motif_throws),cowbell='Quiet sparse accents under the sampled motif')
    lunar_voice.cache_clear()
    return score


def master(score):
    audio=sum(score.stems.values());audio=center_low_end(audio,RATE,155)
    envelope=np.ones(score.frames,dtype=np.float32)
    for section in score.sections:
        envelope[round(section['start']*RATE):round(section['end']*RATE)]=section['authoredGain']
    envelope[round(score.sections[-1]['end']*RATE):]=score.sections[-1]['authoredGain']
    ramp=round(.14*RATE)
    for section in score.sections[1:]:
        start=round(section['start']*RATE)
        envelope[start-ramp:start+ramp]=np.linspace(envelope[start-ramp],envelope[start+ramp],2*ramp)
    audio*=envelope[:,None]
    audio=filt(audio,low=25,high=16000)
    audio*=.103/np.sqrt(np.mean(audio.astype(np.float64)**2))
    # Softly catch isolated drum excursions, leaving headroom and section arc.
    audio=.67*np.tanh(audio/.67)
    audio*=min(1,.66/float(np.max(np.abs(audio))))
    fade=round(.35*RATE);audio[:fade]*=np.linspace(0,1,fade,dtype=np.float32)[:,None]
    fade=round(1.8*RATE);audio[-fade:]*=np.linspace(1,0,fade,dtype=np.float32)[:,None]
    window=round(.02*RATE);usable=len(audio)//window*window
    peaks=np.max(np.abs(audio[:usable].reshape(-1,window,2)),axis=(1,2))
    active=np.flatnonzero(peaks>10**(-65/20))
    if len(active):audio=audio[:min(len(audio),(active[-1]+1)*window+round(.24*RATE))]
    audio[-min(len(audio),RATE//20):]*=np.linspace(1,0,min(len(audio),RATE//20),dtype=np.float32)[:,None]
    return audio


def comparison(audio, start=88):
    """Same objective proxies as temporary reference analysis, no copied audio."""
    a=resample_poly(audio,160,441,axis=0)[start*16000:(start+24)*16000];rate=16000
    if not len(a):return {}
    f,t,z=stft(a.mean(axis=1),fs=rate,nperseg=1024,noverlap=896,boundary=None)
    power=np.abs(z)**2;total=power[(f>=20)&(f<7900)].sum()
    fractions=[float(100*power[(f>=lo)&(f<hi)].sum()/total) for lo,hi in [(20,120),(120,500),(500,2000),(2000,7900)]]
    flux=np.maximum(np.diff(np.log1p(np.abs(z)*100),axis=1),0)
    pulse=flux[(f>120)&(f<7000)].mean(axis=0)
    onsets,_=find_peaks(pulse,prominence=max(.005,float(pulse.std())*.7),distance=5)
    high=sosfilt(butter(3,200,fs=rate,btype='highpass',output='sos'),a,axis=0)
    mid=high.mean(axis=1);side=(high[:,0]-high[:,1])/2
    return dict(excerptSeconds=[start,start+24],bandHz=[[20,120],[120,500],[500,2000],[2000,7900]],
                bandEnergyPercent=fractions,centroidHz=float((f[:,None]*power).sum()/power.sum()),
                detectedOnsetsPerSecond=len(onsets)/24,
                upperSideMidDb=float(10*np.log10((np.mean(side**2)+1e-12)/(np.mean(mid**2)+1e-12))),
                caveat='Objective excerpt proxies, not audition or perceptual-quality scores. Energy is mono STFT power.')


def encoded_metrics(audio, path):
    window=round(.02*RATE);usable=len(audio)//window*window
    peaks=np.max(np.abs(audio[:usable].reshape(-1,window,2)),axis=(1,2))
    active=np.flatnonzero(peaks>10**(-65/20))
    trailing=len(audio)/RATE-(active[-1]+1)*.02 if len(active) else len(audio)/RATE
    seconds=audio[:len(audio)//RATE*RATE].reshape(-1,RATE,2)
    rms_seconds=np.sqrt(np.mean(seconds.astype(np.float64)**2,axis=(1,2)))
    assert trailing<.4, f'Unintended quiet tail: {trailing:.3f} seconds'
    assert not (rms_seconds[6:-10]<.0001).any(), 'Unintended silent body second'
    loudness=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af',
                             'loudnorm=I=-20:TP=-2.8:LRA=11:print_format=json','-f','null','-'],
                            capture_output=True,text=True,check=True)
    measured=json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}',loudness.stderr).group())
    mid=audio.mean(axis=1);side=(audio[:,0]-audio[:,1])*.5
    return dict(seconds=len(audio)/RATE,peakDbFS=float(20*np.log10(np.max(np.abs(audio)))),
                rmsDbFS=float(20*np.log10(np.sqrt(np.mean(audio.astype(np.float64)**2)))),
                channels=2,sampleRate=RATE,integratedLUFS=float(measured['input_i']),
                truePeakDbFS=float(measured['input_tp']),loudnessRangeLU=float(measured['input_lra']),
                channelCorrelation=float(np.corrcoef(audio.T)[0,1]),
                sideToMidRMS=float(np.sqrt(np.mean(side**2))/np.sqrt(np.mean(mid**2))),
                dcOffset=float(np.max(np.abs(np.mean(audio,axis=0)))),trailingSilenceSeconds=float(trailing),
                finite=bool(np.isfinite(audio).all()),silentBodySeconds=int(np.sum(rms_seconds[6:-10]<.0001)))


TRACKS=[dict(id='cassette-clouds',title='Cassette Clouds',genre='lofi',bpm=82,key=5,mode='major',meter=4,
             period='day',energy=.32,textures=['sampled electric piano','nylon guitar','tape phrases','swung acoustic drums'],
             render=cassette_clouds),
        dict(id='midnight-drift',title='Midnight Drift',genre='phonk',bpm=74,key=3,mode='minor',meter=4,
             period='night',energy=.51,textures=['lunar pads','pitched metal motif','rounded sub bass','sampled drums'],
             render=midnight_drift)]


def main():
    global SF,DRUMS
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--soundfont',default=os.environ.get('FLUID_SOUNDFONT'))
    parser.add_argument('--drums',required=True)
    parser.add_argument('--only',choices=[track['id'] for track in TRACKS])
    args=parser.parse_args();SF=Path(args.soundfont or '');DRUMS=Path(args.drums)
    if not SF.is_file():parser.error('Pass an MIT FluidR3 GM SoundFont via --soundfont.')
    if not (DRUMS/'manifest.json').is_file():parser.error('Pass the verified CC0 VCSL drum cache.')
    manifest=json.loads((DRUMS/'manifest.json').read_text())
    for entry in manifest['files']:
        data=(DRUMS/entry['file']).read_bytes()
        if hashlib.sha256(data).hexdigest()!=entry['sha256']:
            raise RuntimeError('VCSL sample differs from pinned source: '+entry['file'])
    old=OUT/'reference-mix-metrics.json';results={r['id']:r for r in json.loads(old.read_text())} if old.exists() else {}
    for track in TRACKS:
        if args.only and args.only!=track['id']:continue
        USED_SAMPLES.clear();kit.cache_clear();shaped_drum.cache_clear()
        print('Rendering '+track['title'],flush=True);score=track['render']();audio=master(score)
        destination=OUT/(track['id']+'.mp3')
        with tempfile.TemporaryDirectory(prefix='lucid-reference-master-') as directory:
            wav=Path(directory)/'master.wav'
            with wave.open(str(wav),'wb') as output:
                output.setnchannels(2);output.setsampwidth(2);output.setframerate(RATE)
                output.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','192k',
                            '-metadata','title='+track['title'],'-metadata','artist=Lucid','-metadata','genre='+track['genre'],
                            str(destination)],check=True)
        raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(destination),'-f','f32le','-'])
        decoded=np.frombuffer(raw,dtype='<f4').reshape(-1,2)
        assert np.isfinite(decoded).all() and np.max(np.abs(decoded))<.71
        sections=[]
        for section in score.sections:
            start,end=round(section['start']*RATE),min(len(decoded),round(section['end']*RATE))
            events=[event for event in score.events if section['bar']*4<=event['beat']<(section['bar']+section['bars'])*4]
            sections.append({**{key:value for key,value in section.items() if key not in ('bar','bars')},
                             'rmsDbFS':float(20*np.log10(np.sqrt(np.mean(decoded[start:end].astype(np.float64)**2)))),
                             'instruments':sorted({event['instrument'] for event in events}),'tonalOnsets':len(events)})
        row={key:value for key,value in track.items() if key!='render'}
        row.update(seconds=len(decoded)/RATE,revision=4,sections=sections,
                   peakDbFS=float(20*np.log10(np.max(np.abs(decoded)))),
                   rmsDbFS=float(20*np.log10(np.sqrt(np.mean(decoded.astype(np.float64)**2)))),
                   ending='Original tonic cadence, natural sample and pad release, short quiet guard',
                   referenceComparison=comparison(decoded),
                   activeSectionComparison=comparison(decoded,25),
                   decoded=encoded_metrics(decoded,destination),
                   percussionProduction=score.percussion_metrics,
                   sources={'soundfont':dict(name='FluidR3 GM',license='MIT',sha256=hashlib.sha256(SF.read_bytes()).hexdigest(),
                                              url='https://packages.debian.org/bookworm/fluid-soundfont-gm'),
                            'drums':dict(project=manifest['project'],repository=manifest['repository'],
                                         commit=manifest['commit'],license=manifest['license'],
                                         files=[entry for entry in manifest['files'] if Path(entry['file']).stem in USED_SAMPLES])},
                   renderProcess={'acousticRenderer':'FluidSynth, dry actual sampled instruments',
                                  'production':'Pedalboard 0.9.26, role-specific stem EQ, restrained chorus and filtered parallel room',
                                  'phraseTreatment':('Own recorded electric piano resampled in four-bar phrases with sub-millisecond continuous drift'
                                                      if track['id']=='cassette-clouds' else 'A/B pitched-metal themes, sampled vibraphone answers, quiet bridge and varied reprise'),
                                  'toneSources':('MIT FluidR3 GM electric piano, nylon guitar, piano and acoustic bass; CC0 VCSL multi-velocity drums'
                                                 if track['id']=='cassette-clouds' else 'Original detuned stereo pads, pitched metal edge, clean sine-based 808, actual sampled vibraphone motif/answers and CC0 VCSL drums'),
                                  'referenceAudioInComposition':False,'auditionPerformed':False})
        results[track['id']]=row
        old.write_text(json.dumps([results[track['id']] for track in TRACKS if track['id'] in results],indent=2)+'\n')
        print(json.dumps({key:row[key] for key in ('id','seconds','peakDbFS','rmsDbFS','referenceComparison')}),flush=True)
        del score,audio,decoded,raw


if __name__=='__main__':main()
