"""Five original genre scores for Lucid, rendered offline.

Offline authoring: Python 3, numpy, scipy and ffmpeg; Petal additionally uses
Pedalboard 0.9.26 and the pinned CC0 VCSL drum hits fetched by
scripts/fetch-vcsl-drums.py. Its original break is performed from separate hits,
not a borrowed recording. No external service or runtime synthesizer is used.
Each renderer owns its harmony, melody, form and rhythmic vocabulary. Run with
--only <id> to re-render one recording without changing the other assets.
"""
from pathlib import Path
from functools import lru_cache
import argparse
import json
import os
import re
import subprocess
import tempfile
import wave
import numpy as np
from scipy.signal import butter, sosfilt, resample_poly, lfilter

RATE = 44100
OUT = Path(__file__).resolve().parents[1] / 'src/assets/audio'


def freq(pitch):
    return 440 * 2 ** ((pitch - 69) / 12)


def lowpass(sound, cutoff):
    return sosfilt(butter(2, cutoff, fs=RATE, output='sos'), sound).astype(np.float32)


def band(sound, low, high):
    return sosfilt(butter(2, [low, high], fs=RATE, btype='bandpass', output='sos'), sound).astype(np.float32)


def release(env, t, duration, seconds=.06):
    return env * np.clip((duration-t)/seconds, 0, 1)


def harmonic_wave(phase, hz, kind, brightness=1):
    """Finite harmonics below Nyquist, unlike an aliasing raw saw/square."""
    count = min(28, int((RATE*.44)/hz))
    result = np.zeros(len(phase), dtype=np.float64)
    for h in range(1, count+1):
        if kind == 'square' and h % 2 == 0:
            continue
        result += np.sin(phase*h) * ((-1)**(h+1) if kind == 'saw' else 1) / h * np.exp(-(h-1)/brightness)
    return result


@lru_cache(maxsize=48)
def voice(pitch, seconds, kind):
    t = np.arange(round(seconds*RATE), dtype=np.float64)/RATE
    hz = freq(pitch)
    phase = 2*np.pi*hz*t
    if kind == 'dustkeys':
        flutter = .004*np.sin(2*np.pi*.6*t)+.0014*np.sin(2*np.pi*5.7*t)
        ph = phase+flutter*hz*.1
        body = np.sin(ph+.9*np.exp(-4*t)*np.sin(2*ph))
        body += .22*np.sin(ph*1.0025+.2)*np.exp(-1.8*t)+.1*np.sin(ph*3)*np.exp(-5*t)
        env = (1-np.exp(-90*t))*np.exp(-t/1.2)
        body = lowpass(body, 2700)
    elif kind == 'lofiguitar':
        # A plucked delay-line string has a real moving harmonic decay, rather
        # than the same sine/FM body as the electric piano accompaniment.
        delay = max(8, round(RATE/hz-.5))
        rng = np.random.default_rng(1009+round(pitch*31))
        excitation = np.zeros(len(t)); excitation[:delay] = rng.normal(0,.65,delay)
        excitation[:delay] -= excitation[:delay].mean()
        denominator = np.zeros(delay+2); denominator[0] = 1
        denominator[delay:delay+2] = -.496
        body = lfilter([1], denominator, excitation)
        body /= max(.2, np.max(np.abs(body)))
        body = lowpass(body, 4200)
        env = (1-np.exp(-350*t))*np.exp(-t/1.5)
    elif kind == 'tapeorgan':
        flutter = .009*np.sin(2*np.pi*.7*t)+.003*np.sin(2*np.pi*5.2*t)
        body = .65*np.sin(phase+flutter)+.22*np.sin(phase*2)+.09*np.sin(phase*3)
        env = (1-np.exp(-12*t))*np.exp(-t/2.4)
    elif kind == 'softstrings':
        body = .45*harmonic_wave(phase*.998,hz,'saw',2.8)+.4*harmonic_wave(phase*1.002,hz,'saw',2.8)
        body = lowpass(body, 1800)
        env = np.sin(np.pi*t/seconds)**.9
    elif kind == 'roundbass':
        body = np.sin(phase)+.23*np.sin(phase*2)+.06*np.sin(phase*3)
        env = (1-np.exp(-75*t))*np.exp(-t/.85)
    elif kind in ('polypad', 'analogbass', 'neonlead', 'arp'):
        # A different oscillator/filter/envelope for each synthwave role.
        if kind == 'polypad':
            ph2 = phase*1.004+0.15*np.sin(2*np.pi*.22*t)
            body = .42*harmonic_wave(phase*.997,hz,'saw',4)+.42*harmonic_wave(ph2,hz,'saw',4)
            body += .12*np.sin(phase*.5)
            body = lowpass(body, 1500)
            env = np.sin(np.pi*t/seconds)**.8
        elif kind == 'analogbass':
            body = harmonic_wave(phase,hz,'saw',3)*.7+harmonic_wave(phase*1.001,hz,'square',2)*.2
            body = lowpass(body, 950)
            env = (1-np.exp(-130*t))*np.exp(-t/.32)
        elif kind == 'neonlead':
            vib = .025*np.sin(2*np.pi*5.1*t)*(1-np.exp(-3*t))
            body = .55*harmonic_wave(phase+vib,hz,'saw',6)+.35*harmonic_wave(phase*.998-vib,hz,'square',4)
            body = lowpass(body, 3300)
            env = (1-np.exp(-75*t))*np.minimum(1, np.exp(-(t-.13)*2.2))
        else:
            body = harmonic_wave(phase,hz,'square',4)*.6 + np.sin(phase*2)*.1
            body = lowpass(body, 2500)
            env = (1-np.exp(-180*t))*np.exp(-t/.14)
    elif kind in ('oceanpad','shimmer','feltbell'):
        if kind == 'oceanpad':
            body = .35*harmonic_wave(phase,hz,'saw',1.8)+.30*harmonic_wave(phase*1.0011+.3*np.sin(t*.43),hz,'saw',1.8)
            body += .10*np.sin(phase*2.0007)+.07*np.sin(phase*3.001+.2*np.sin(t*.73))
            closed,opened = lowpass(body,900),lowpass(body,2700)
            breath = .5+.5*np.sin(2*np.pi*t/11+pitch*.3)
            body = closed*(1-breath)+opened*breath
            body *= 1+.08*np.sin(2*np.pi*.11*t+pitch)
            env = np.sin(np.pi*t/seconds)**1.4
        elif kind == 'shimmer':
            body = np.sin(phase)*.6+.2*np.sin(phase*2.001)+.1*np.sin(phase*3.003)
            env = (1-np.exp(-.9*t))*np.exp(-t/3.9)
        else:
            body = np.sin(phase)+.17*np.sin(phase*2.005)*np.exp(-2*t)
            env = (1-np.exp(-18*t))*np.exp(-t/1.7)
    elif kind == 'breakpad':
        body = .32*harmonic_wave(phase*.998,hz,'saw',1.6)+.29*harmonic_wave(phase*1.002,hz,'saw',1.6)
        body += .24*np.sin(phase+.08*np.sin(2*np.pi*.21*t))
        body = band(body, 180, 2200)
        env = np.sin(np.pi*t/seconds)**.8
    elif kind == 'breaksub':
        # A stable, centered fundamental supports the break without crowding
        # the piano's middle register. Its held body differs from roundbass.
        body = np.sin(phase)+.035*np.sin(phase*2)
        env = (1-np.exp(-90*t))*np.clip((seconds-t)/.23,0,1)
    elif kind == 'breakpiano':
        body = np.sin(phase+1.1*np.sin(phase*2)*np.exp(-4*t))+.17*np.sin(phase*3)*np.exp(-5*t)
        env = (1-np.exp(-120*t))*np.exp(-t/.9)
    elif kind == 'cowbell':
        body = .6*harmonic_wave(phase,hz,'square',8)+.4*harmonic_wave(phase*1.483,hz*1.483,'square',8)
        body = band(body, 380, 6200)
        env = (1-np.exp(-300*t))*np.exp(-t/.21)
    elif kind == 'darkpad':
        body = .55*np.sin(phase)+.24*harmonic_wave(phase*.999,hz,'square',2)
        body = lowpass(body, 950)
        env = np.sin(np.pi*t/seconds)**1.1
    else:
        raise ValueError(kind)
    return (body*release(env,t,seconds,.10 if kind.endswith('pad') else .035)).astype(np.float32)


def noise_hit(rng, duration, low, high, decay):
    t = np.arange(round(duration*RATE))/RATE
    signal = band(rng.normal(0,1,len(t)),low,high)
    return (signal * np.exp(-decay*t)*(1-np.exp(-900*t))*np.clip((duration-t)/.012,0,1)).astype(np.float32)


def drumkit(seed, style):
    rng = np.random.default_rng(seed)
    t = np.arange(round(.42*RATE))/RATE
    hz = 43 if style in ('phonk','synthwave') else 52
    kick = np.sin(2*np.pi*(hz*t+3.2*(1-np.exp(-38*t))))*np.exp(-16*t)*(1-np.exp(-650*t))
    kick += noise_hit(rng,.42,1500,6500,150)*.14
    kick = np.tanh(kick*1.6)/1.6
    snare_duration = .32 if style == 'synthwave' else .22
    snare = noise_hit(rng,snare_duration,750,10500,17 if style=='synthwave' else 24)
    ts = np.arange(len(snare))/RATE
    snare += .26*np.sin(2*np.pi*(185*ts+2*(1-np.exp(-40*ts))))*np.exp(-ts*30)
    if style == 'synthwave':
        # Short gated room, a very different snare from the lo-fi brush.
        dry = snare.copy()
        for delay,level in [(.017,.4),(.033,.28),(.071,.2),(.103,.12)]:
            shift = round(delay*RATE)
            snare[shift:] += dry[:-shift]*level
        snare *= np.clip((.25-ts)/.04,0,1)
    if style == 'lofi':
        snare = lowpass(snare,3400)
        kick = lowpass(kick,2300)
    hat = noise_hit(rng,.08,3900,12500,65)
    openhat = noise_hit(rng,.22,4300,13000,19)
    rim = noise_hit(rng,.055,1100,6200,95)
    return { 'kick':kick.astype(np.float32), 'snare':snare.astype(np.float32), 'hat':hat,
             'open':openhat, 'rim':rim }


class Score:
    def __init__(self, bpm, sections, tail=6):
        self.bpm, self.beat = bpm,60/bpm
        self.sections = []
        bar = 0
        for name,bars in sections:
            self.sections.append(dict(name=name,bar=bar,bars=bars,start=bar*4*self.beat,end=(bar+bars)*4*self.beat))
            bar += bars
        self.bars = bar
        self.frames = round((bar*4*self.beat+tail)*RATE)
        self.music = np.zeros((self.frames,2),dtype=np.float32)
        self.drums = np.zeros_like(self.music)
        self.section_levels = {}
        self.events = []

    def put(self, signal, beat, level=1, pan=0, drums=False, echo=0):
        target = self.drums if drums else self.music
        if signal.ndim == 1:
            stereo = signal[:,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)],dtype=np.float32)*level
        else:
            stereo = signal*level
        for delay,gain in ([(0,1),(.75*self.beat,echo),(1.5*self.beat,echo*.42)] if echo else [(0,1)]):
            start = round((beat*self.beat+delay)*RATE)
            trim = max(0,-start)
            start = max(0,start)
            n = min(len(stereo)-trim,self.frames-start)
            if n>0: target[start:start+n] += stereo[trim:trim+n]*gain

    def note(self,pitch,at,beats,kind,level,pan=0,echo=0):
        self.put(voice(pitch,round(beats*self.beat+.18,3),kind),at,level,pan,echo=echo)
        self.events.append(dict(beat=at,pitch=pitch,held=beats,instrument=kind,level=level))

    def bars_iter(self):
        for sec in self.sections:
            for i in range(sec['bars']): yield sec['name'],i,sec['bar']+i

    def reflections(self,room):
        # A stereo room attached to tonal material, leaving drum attacks clear.
        dry = self.music.copy()
        for delay,gain in room:
            shift = round(delay*RATE)
            self.music[shift:] += dry[:-shift,::-1]*gain
        # Decorrelate only the upper tonal room. Centered bass/drums remain
        # stable; the added side signal cancels cleanly in a mono fold-down.
        mid = dry.mean(axis=1)
        upper = sosfilt(butter(2,420,fs=RATE,btype='highpass',output='sos'),mid).astype(np.float32)
        side = np.zeros(len(mid),dtype=np.float32)
        for delay,gain in [(.019,.22),(.037,-.17),(.071,.11)]:
            shift=round(delay*RATE); side[shift:]+=upper[:-shift]*gain
        self.music[:,0]+=side; self.music[:,1]-=side

    def cadence(self,chord,kind,level=.05):
        # Resolve the final dominant and let that tonic ring through the existing
        # tail. Previously a six-second allocation contained five seconds of
        # digital silence, creating an unintended gap before media-ended.
        end = self.bars*4
        remaining = (self.frames/RATE-end*self.beat)
        held = (remaining-1.0)/self.beat+1
        for i,pitch in enumerate(chord):
            self.note(pitch,end-1+i*.025,held,kind,level,(i-(len(chord)-1)/2)*.16,.12)
        self.note(chord[0]-12,end-1,2.5,'roundbass',level*1.1)

    def finish(self,cutoff=11000):
        self.music += self.drums
        del self.drums
        # Authored section dynamics survive the master normalization. Short
        # smooth ramps leave drum attacks intact and remove level discontinuity.
        if self.section_levels:
            envelope = np.ones(self.frames,dtype=np.float32)
            for sec in self.sections:
                start,end = round(sec['start']*RATE),round(sec['end']*RATE)
                envelope[start:end] = self.section_levels.get(sec['name'],1)
            envelope[round(self.sections[-1]['end']*RATE):] = self.section_levels.get(self.sections[-1]['name'],1)
            smooth = round(.15*RATE)
            for sec in self.sections[1:]:
                start = round(sec['start']*RATE)
                envelope[start-smooth:start+smooth] = np.linspace(envelope[start-smooth],envelope[start+smooth],smooth*2)
            self.music *= envelope[:,None]
        result = sosfilt(butter(2,cutoff,fs=RATE,output='sos'),self.music,axis=0).astype(np.float32)
        # HP removes inaudible DC/subsonic energy before matching the older score.
        result = sosfilt(butter(2,24,fs=RATE,btype='highpass',output='sos'),result,axis=0).astype(np.float32)
        result = np.tanh(result*1.2)/1.2
        result *= .102/np.sqrt(np.mean(result**2))
        # A soft ceiling only catches isolated attacks, not the entire dynamic arc.
        result = .69*np.tanh(result/.69)
        result *= min(1,.70/np.max(np.abs(result)))
        fade = round(1.2*RATE)
        result[:fade] *= np.linspace(0,1,fade,dtype=np.float32)[:,None]
        result[-2*RATE:] *= np.linspace(1,0,2*RATE,dtype=np.float32)[:,None]
        voice.cache_clear()
        return result


def cassette_clouds():
    s = Score(82,[('dusty window',4),('first verse',12),('sunny hook',8),('tape interlude',8),('second verse',8),('homecoming',8),('tape tail',4)])
    rng = np.random.default_rng(104729)
    kit = drumkit(101,'lofi')
    # Fmaj9, Dm9, Gm9, C13; borrowed Bbm in the bridge is the wistful turn.
    harmony = [[53,57,60,64,67],[50,53,57,60,64],[55,58,62,65,69],[48,52,55,58,62],
               [58,62,65,69,72],[58,61,65,68,72],[53,57,60,64,67],[48,52,55,58,62]]
    hook = [[(0,76,.7),(1.65,79,.4),(2.5,81,.8)],[(.5,77,1.2),(2.65,76,.8)],
            [(0,74,.7),(1.65,77,.4),(2.5,81,.8)],[(.5,79,.65),(1.65,76,.4),(3,74,.7)],
            [(0,77,1.2),(1.65,81,.4),(2.65,84,.8)],[(.5,80,.7),(2,77,1)],
            [(0,76,.7),(1.65,74,.4),(2.65,72,.8)],[(.5,74,.7),(2,72,1.6)]]
    bridge_harmony=[[58,61,65,68,72],[51,55,58,62,65],[56,60,63,67,70],[48,52,55,58,61],
                    [50,53,57,60,64],[55,58,62,65,69],[48,52,55,58,62],[48,52,55,58,61]]
    bridge_hook=[[(.5,77,.7),(2,80,.7)],[(0,79,1.2),(2.65,77,.6)],
                 [(.5,75,.8),(2,72,1)],[(0,73,.6),(1.65,74,.4),(2.5,76,1)],
                 [(0,77,.8),(2,76,.7)],[ (.5,74,1.3),(2.65,77,.5)],
                 [(0,76,.7),(1.65,74,.4),(3,72,.6)],[(.5,73,.7),(2,72,1.5)]]
    s.section_levels={'dusty window':.78,'first verse':.92,'sunny hook':1.04,'tape interlude':.72,'second verse':.95,'homecoming':1.08,'tape tail':.78}
    for sec,i,b in s.bars_iter():
        chord = (bridge_harmony if sec in ('tape interlude','second verse') else harmony)[i%8]; at=b*4
        sparse = sec in ('dusty window','tape interlude','tape tail')
        for k,n in enumerate(chord[1:]):
            s.note(n,at+.035*k,2.8,'dustkeys',.072 if not sparse else .05,(k-1.5)*.18)
            if not sparse: s.note(n,at+2.65+.025*k,.9,'dustkeys',.035,(1.5-k)*.12)
        s.note(chord[0]-12,at,1.55,'roundbass',.16)
        if not sparse: s.note(chord[0]-5,at+2.5,.8,'roundbass',.085)
        if not sparse or sec=='dusty window' and i>=2:
            for pos in [0,1.75,2.5] if i%2==0 else [0,.75,2.75]:
                s.put(kit['kick'],at+pos,.14,drums=True)
            for pos in [1.04,3.04]: s.put(kit['snare'],at+pos,.10,-.1,True)
            for step in range(8):
                s.put(kit['hat'],at+step*.5+(.10 if step%2 else 0),.028 if step%2 else .018,.28,True)
            if i%4==3: s.put(kit['rim'],at+3.68,.05,-.35,True)
        if sec in ('first verse','sunny hook','second verse','homecoming'):
            phrase = bridge_hook if sec=='second verse' else hook
            for event,(pos,n,duration) in enumerate(phrase[i%8]):
                # A small deterministic human offset and breath between phrases.
                if sec=='first verse' and i in (3,7,11) and event==2: continue
                s.note(n,at+pos+float(rng.uniform(-.012,.018)),duration,'lofiguitar',.09*float(rng.uniform(.88,1.10)),.13,.13)
            if sec=='homecoming' and i%2==1:
                for pos,n in [(1.05,chord[2]+12),(3.35,chord[1]+12)]:
                    s.note(n,at+pos,.65,'dustkeys',.036,-.30,.12)
        elif sec=='tape interlude' and i%2==0:
            for pos,n,dur in bridge_hook[i%8]: s.note(n-12,at+pos,dur*1.2,'tapeorgan',.054,-.22,.23)
        elif i%2==0:
            s.note(chord[-1]+12,at+1,2,'dustkeys',.035,.3,.18)
    # Quiet, continuous tape texture, with sparse synthetic dust clicks.
    n=s.frames
    dust=band(rng.normal(0,1,n),400,6000)*.0011
    s.music[:,0]+=dust; s.music[:,1]+=np.roll(dust,173)*.8
    for at in rng.uniform(0,s.bars*4*s.beat,round(s.bars*.8)):
        click=noise_hit(rng,.012,1500,9000,300)
        s.put(click,at/s.beat,.006,float(rng.uniform(-.6,.6)))
    s.cadence([53,60,64,67,69],'dustkeys',.047)
    s.reflections([(.091,.07),(.173,.05),(.317,.03)])
    return s,s.finish(6500)


def neon_afterglow():
    s=Score(104,[('ignition',8),('night drive',16),('horizon turn',8),('tunnel lights',8),('neon return',16),('afterglow',8)])
    kit=drumkit(211,'synthwave')
    harmony=[[50,57,60,65],[46,53,57,62],[53,60,65,69],[48,55,60,64],
             [43,50,53,58],[46,53,57,62],[45,52,55,60],[45,52,57,61]]
    hook=[[(0,77,.65),(.75,81,.4),(1.5,84,.8),(3,81,.7)],
          [(.5,82,.8),(2,77,1.4)],[(0,81,.6),(1,84,.6),(2,89,1.2)],
          [(.5,88,.7),(1.5,84,.6),(3,79,.7)],[(0,82,1.2),(1.5,81,.4),(2.5,77,.9)],
          [(0,77,.7),(1.5,74,.6),(3,77,.7)],[(.5,76,.6),(1.5,79,.6),(2.5,84,.9)],
          [(0,85,.7),(1.5,81,.6),(3,73,.7)]]
    bridge=[[46,53,57,62],[48,55,60,64],[53,60,65,69],[50,57,60,65],
            [43,50,53,58],[46,53,57,62],[52,59,62,67],[45,52,57,61]]
    bridge_hook=[[(.5,86,1.3),(2.5,84,.8)],[(0,88,.7),(1.5,84,.7),(3,79,.6)],
                 [(0,89,1.6),(2.5,84,.9)],[(.5,81,.8),(2,77,1.5)],
                 [(0,82,1),(1.5,86,.6),(3,81,.7)],[(0,77,1),(2,74,1.5)],
                 [(.5,79,.7),(1.5,76,.7),(3,74,.6)],[(0,73,1.5),(2.5,76,.6)]]
    s.section_levels={'ignition':.76,'night drive':.97,'horizon turn':1.03,'tunnel lights':.69,'neon return':1.08,'afterglow':.75}
    for sec,i,b in s.bars_iter():
        chord=(bridge if sec=='horizon turn' else harmony)[i%8]; at=b*4
        quiet=sec in ('ignition','tunnel lights','afterglow')
        for k,n in enumerate(chord[1:]): s.note(n,at-.1,4.7,'polypad',.09 if not quiet else .07,(k-1)*.35)
        if not quiet or sec=='ignition' and i>=4:
            for step in range(8):
                s.note(chord[0]-12+(12 if step%2 else 0),at+step*.5,.34,'analogbass',.12)
                s.note(chord[1+step%3]+12,at+step*.5+.25,.22,'arp',.032,(-1)**step*.36,.14)
            for pos in range(4): s.put(kit['kick'],at+pos,.15,drums=True)
            for pos in [1,3]: s.put(kit['snare'],at+pos,.115,-.04,True)
            for step in range(8): s.put(kit['hat'],at+step*.5,.023,.32,True)
            for pos in [.5,2.5]: s.put(kit['open'],at+pos,.025,.26,True)
            if i%8==7:
                for pos in [3.25,3.5,3.75]: s.put(kit['snare'],at+pos,.035+.02*(pos-3),-.08,True)
        else:
            s.note(chord[0]-12,at,3.8,'roundbass',.07)
            for step in range(4): s.note(chord[1+step%3]+12,at+step,.5,'arp',.032,(-1)**step*.3,.25)
        if sec in ('night drive','neon return'):
            for pos,n,dur in hook[i%8]:
                s.note(n,at+pos,dur,'neonlead',.075,.08,.26)
                if sec=='neon return' and i>=8: s.note(n-12,at+pos,dur,'neonlead',.018,-.2,.12)
        elif sec=='horizon turn':
            for pos,n,dur in bridge_hook[i%8]: s.note(n,at+pos,dur,'neonlead',.068,-.12,.23)
            for n in chord[1:]: s.note(n,at,4.6,'softstrings',.029,.25)
        if sec=='neon return' and i>=8 and i%2:
            # A lower answering phrase leaves room around the returning lead.
            for pos,n in [(1.25,chord[2]+12),(2.75,chord[1]+12)]: s.note(n,at+pos,.6,'arp',.044,-.28,.17)
    # Beat-locked gentle pump on the tonal stem, not on the kick/snare.
    for sec in s.sections:
        if sec['name'] not in ('night drive','horizon turn','neon return'): continue
        for beat in range(sec['bar']*4,(sec['bar']+sec['bars'])*4):
            start=round(beat*s.beat*RATE); count=round(.24*RATE)
            count=min(count,s.frames-start)
            env=1-.24*np.exp(-np.arange(count)/RATE/.075)
            s.music[start:start+count]*=env[:,None]
    s.cadence([50,57,60,65,69],'polypad',.072)
    s.note(74,s.bars*4-.65,2.5,'neonlead',.045,.08,.24)
    s.reflections([(.123,.09),(.237,.065),(.411,.035)])
    return s,s.finish(11500)


def tidal_memory():
    s=Score(66,[('incoming tide',6),('first horizon',8),('luminous water',8),('deep water',8),('remembering',8),('receding tide',4)],tail=10)
    rng=np.random.default_rng(307)
    # E Lydian color, then C# minor, with very slow voice-leading.
    harmony=[[52,59,63,66,70],[49,56,59,63,68],[45,52,56,59,63],[47,54,58,61,66],
             [52,59,63,68,70],[56,63,66,70,73],[49,56,59,63,66],[47,54,59,63,66]]
    motif=[(0,82,3.5),(7,78,2.5),(12,75,4),(21,78,3),(27,73,4)]
    answer=[(1,75,4),(10,73,3),(18,71,4.5),(26,70,3.5)]
    depths=[[49,56,59,63,68],[45,52,56,59,63],[42,49,54,57,61],[47,54,59,63,66]]
    s.section_levels={'incoming tide':.66,'first horizon':.90,'luminous water':1.07,'deep water':.78,'remembering':1.02,'receding tide':.72}
    for sec,i,b in s.bars_iter():
        at=b*4
        if i%2==0:
            chord=depths[(i//2)%4] if sec=='deep water' else harmony[(i//2)%8]
            for k,n in enumerate(chord):
                s.note(n,at-.5,10.5,'oceanpad',.075 if sec!='incoming tide' else .055,(k-2)*.23)
            s.note(chord[0]-12,at,7,'oceanpad',.09)
            # High spectral blooms occupy their own long overlapping envelopes.
            if sec in ('luminous water','remembering'):
                s.note(chord[3]+12,at+3,5.5,'shimmer',.04,.45,.3)
                s.note(chord[2]+19,at+4.5,5,'shimmer',.022,-.45,.22)
        if sec in ('first horizon','luminous water','remembering') and i%8==0:
            for pos,n,dur in motif:
                s.note(n-(12 if sec=='remembering' else 0),at+pos,dur,'feltbell',.064,.18,.35)
        if sec=='deep water' and i%4==0:
            for pos,n,dur in [(1,68,3.5),(6,71,2.5),(11,73,3.5)]:
                s.note(n,at+pos,dur,'tapeorgan',.031,-.22,.28)
        if sec=='remembering' and i==0:
            for pos,n,dur in answer: s.note(n-12,at+pos,dur,'tapeorgan',.045,-.28,.28)
    # Wide filtered air with a slow swell. No drums or regular bass pulse.
    t=np.arange(s.frames)/RATE
    for channel in range(2):
        raw=band(rng.normal(0,1,s.frames),180+channel*100,2400+channel*500)
        swell=.0018*(.5+.5*np.sin(2*np.pi*t/23+channel*1.2))
        s.music[:,channel]+=raw*swell
    s.cadence([52,59,63,66,70],'oceanpad',.048)
    s.reflections([(.173,.18),(.337,.14),(.619,.10),(1.07,.075),(1.63,.045),(2.17,.025)])
    return s,s.finish(8700)


def petal_breaks(sample_dir=None):
    from acoustic_breaks import AcousticBreak
    from music_production import process_stem, center_low_end, room_send
    s=Score(164,[('petal drift',8),('first fracture',24),('open sky',8),('glass garden',16),('still centre',8),('bloom fragments',24),('falling petals',8)])
    kit=AcousticBreak(sample_dir, s.bpm)
    edits=[]
    room_input=np.zeros_like(s.drums)
    throws=0
    def send_room(signal,at,gain=1):
        start=round(at*s.beat*RATE); skip=max(0,-start); start=max(0,start)
        length=min(len(signal)-skip,s.frames-start)
        if length>0: room_input[start:start+length]+=signal[skip:skip+length]*gain
    cymbal_level=1
    def break_phrase(at, source, beats, gain=1, reverse=False, speed=1):
        s.put(kit.fragment(source,beats,reverse=reverse,speed=speed,cymbals=cymbal_level),at,gain,drums=True)
        send_room(kit.fragment(source,beats,reverse=reverse,speed=speed,stem='room'),at,gain)
        edits.append(dict(beat=at,sourceBeat=source,beats=beats,reverse=reverse,speed=speed))
    harmony=[[50,57,60,65,69],[46,53,57,60,65],[53,60,64,67,72],[48,55,58,62,67],
             [43,50,53,57,62],[46,53,57,62,65],[45,52,55,60,64],[45,52,57,61,64]]
    hook=[[(0,81,1),(1.5,84,.5),(2.5,89,1)],[(.5,86,1),(2,81,1.5)],
          [(0,84,.7),(1,88,.7),(2.5,91,1)],[(.5,86,1),(2,82,.8),(3,79,.7)],
          [(0,82,1.2),(1.5,81,.5),(2.5,77,1)],[(0,77,.8),(1.5,74,.6),(3,77,.7)],
          [(.5,76,1),(2,79,.6),(3,84,.7)],[(0,85,1),(1.5,81,.7),(3,73,.7)]]
    glass_harmony=[[46,53,57,60,65],[48,55,60,64,67],[50,57,60,65,69],[53,60,64,67,72],
                   [43,50,53,57,62],[46,53,57,62,65],[52,59,62,67,71],[45,52,57,61,64]]
    glass_hook=[[(.0,77,1.7),(2,81,.8)],[(.5,79,1.4),(2.5,76,1)],
                [(0,77,.8),(1.5,81,.8),(3,84,.7)],[(.5,88,1.5),(2.5,84,1)],
                [(0,86,1.6),(2,82,.8)],[(.5,81,.8),(2,77,1.5)],
                [(0,79,.8),(1.5,76,.8),(3,74,.7)],[(.5,73,1.5),(2.5,76,.9)]]
    s.section_levels={'petal drift':.76,'first fracture':.96,'open sky':.82,'glass garden':1.01,'still centre':.64,'bloom fragments':1.09,'falling petals':.74}
    for sec,i,b in s.bars_iter():
        # The final return opens the cymbal layer; the bell-led middle leaves
        # it softer. This changes actual performed layers rather than applying
        # a blanket treble boost to every instrument in the song.
        cymbal_level=1.45 if sec=='bloom fragments' else .9 if sec=='glass garden' else 1.12
        chord=(glass_harmony if sec=='glass garden' else harmony)[(i//2)%8]; at=b*4
        if i%2==0:
            for k,n in enumerate(chord[1:]): s.note(n,at-.15,8.4,'breakpad',.052,(k-1.5)*.49)
        active=sec in ('first fracture','glass garden','bloom fragments')
        if active or sec=='open sky':
            s.note(chord[0]-12,at,3.1 if i%2==0 else 1.8,'breaksub',.098 if active else .078)
            if i%2:
                s.note(chord[0]-12,at+2.5,1.1,'breaksub',.082 if active else .065)
        elif i%2==0:
            s.note(chord[0]-12,at,4.5,'roundbass',.095)
        if active:
            # Eight-bar question, answer, lift and turnaround. Most source runs
            # remain whole, so the soft strokes, hats and actual drum decay can
            # form a groove. Edits are answers at phrase boundaries, not a
            # permanently scrambled sixteenth-note grid.
            position=i%8
            order=[0,1,2,3,4,5,6,7] if i//8%2==0 else [4,1,6,3,0,5,2,7]
            if sec=='glass garden': order=[5,1,0,3,4,2,6,7]
            source=order[position]*4
            level=.84 if sec=='glass garden' else 1
            if position==3:
                break_phrase(at,source,3.5,level)
                # Two real snare attacks, falling away into a short rest.
                break_phrase(at+3.5,3,.125,level*.65)
                break_phrase(at+3.625,3,.125,level*.40)
            elif position==7:
                break_phrase(at,source,2.5,level)
                # A displaced backbeat and acoustic tom answer. One later
                # phrase reverses a quiet tail, rather than every other hit.
                break_phrase(at+2.5,3,.5,level*.92)
                break_phrase(at+3,27,.25,level*.70)
                break_phrase(at+3.25,31.5,.25,level*.57,reverse=sec=='bloom fragments')
                break_phrase(at+3.5,31.625,.25,level*.70)
            elif sec=='bloom fragments' and position==5:
                break_phrase(at,source,2,level)
                # A single local 7-sixteenth span briefly changes the pull,
                # then the next bar restores the four-beat reference.
                break_phrase(at+2,9,1.75,level*.95,speed=1.12)
                break_phrase(at+3.625,7.75,.125,level*.53)
            elif sec=='glass garden' and position in (1,5):
                break_phrase(at,source,2.5,level)
                break_phrase(at+3,source+3,.75,level*.88)
            else:
                break_phrase(at,source,4,level)
            if i==0:
                s.put(kit.hit('crash',.8),at,.7,drums=True)
            if position==7:
                # A quiet dotted-eighth answer on the turnaround only. Filter
                # the actual snare phrase, leaving kick and bass out of delays.
                throw=band(kit.fragment(3,.5,stem='room').mean(axis=1),500,4300)
                edge=min(round(.007*RATE),len(throw))
                throw[-edge:]*=np.linspace(1,0,edge,dtype=np.float32)
                for delay,gain,pan in [(.75,.065,-.23),(1.5,.027,.23)]:
                    s.put(throw,at+2.5+delay,level*gain,pan,drums=True)
                throws+=1
        elif sec=='open sky':
            # A genuine half-time reset separates the two full-speed passages.
            for pos in [0,2.75]: s.put(kit.hit('kick',.7,i),at+pos,.49,drums=True)
            s.put(kit.hit('snare',.54,i),at+2,.55,drums=True)
            send_room(kit.hit('snare',.54,i),at+2,.55)
            if i%2:
                s.put(kit.hit('open',.5,i),at+3.5,.55,drums=True)
        elif sec=='petal drift' and i>=4:
            break_phrase(at,((i-4)%4)*4,4,.18)
        if sec in ('first fracture','glass garden','bloom fragments'):
            # A half-time piano hook holds the musical thread across rapid drums.
            melodic_phrase = glass_hook if sec=='glass garden' else hook
            for pos,n,dur in melodic_phrase[(i//2)%8]:
                if i%2==0:
                    # Alternate phrases breathe; final phrase returns an octave
                    # answer rather than stacking a constant lead over the break.
                    s.note(n,at+pos*2,dur*1.5,'feltbell' if sec=='glass garden' else 'breakpiano',.089,.12,.23)
            if sec=='bloom fragments' and i%8==5:
                s.note(chord[2]+12,at+.5,2,'lofiguitar',.052,-.32,.2)
        elif i%4==0:
            s.note(chord[-1]+12,at+1,4,'feltbell',.06,.3,.35)
    s.cadence([50,57,60,65,69],'breakpad',.062)
    s.note(74,s.bars*4-.5,4,'feltbell',.05,.18,.28)
    s.reflections([(.113,.09),(.263,.07),(.491,.05),(.817,.03)])
    # Open the existing voiced upper stage while keeping its low register mono.
    side=(s.music[:,0]-s.music[:,1])*.5
    s.music[:,0]+=side*.35; s.music[:,1]-=side*.35
    s.music=center_low_end(s.music,RATE,cutoff_hz=180)
    s.drums=process_stem(s.drums*1.85,RATE,role='drums',room='none')
    # A parallel room belongs only to the snare/tom bus. Its filtered return
    # continues past the phrase cuts; no reverb is placed on the kick or sub.
    room_input*=1.85
    wet_room=room_send(room_input,RATE,room='small',send=.13)-room_input
    room_return_rms=float(np.sqrt(np.mean(wet_room.astype(np.float64)**2)))
    s.drums+=wet_room
    del wet_room,room_input
    s.production=dict(revision=4,drumSource='Original eight-bar performance from separate VCSL acoustic hits',
                      sourceLicense=kit.manifest['license'],sourceCommit=kit.manifest['commit'],
                      sourceManifest='scripts/assets/vcsl-drums.json',sourceHitCount=len(kit.manifest['files']),
                      sourcePerformanceEvents=len(kit.events),phraseBars=8,
                      snareVelocityLayers=3,alternateTakes=2,phraseEdits=len(edits),
                      sampleCalibration='One shared gain per instrument/articulation against its strongest recorded layer; relative take and velocity amplitudes retained',
                      velocityResponse='Continuous blending of recorded soft, medium and main layers; no independent per-hit peak normalization',
                      kickProduction='Real damped acoustic body, exact mono, no synthetic pitched reinforcement and no room/delay send',
                      percussionRoom='Short filtered Pedalboard room on snare and tom material only, parallel send 0.13',
                      roomReturnRMS=room_return_rms,phraseEndThrows=throws,
                      cymbalDevelopment='Restrained first break, quieter bell-led middle, open final return',
                      reversedFragments=sum(edit['reverse'] for edit in edits),
                      rateChangedFragments=sum(edit['speed']!=1 for edit in edits),
                      drumProcessing='Pedalboard 0.9.26, 27 Hz high-pass, 1.35:1 transient-preserving compression, selective parallel snare/tom room',
                      rhythm='Performed syncopation and soft ghost strokes, eight-bar call and response, restrained phrase-end retriggers, half-time and drumless contrasts')
    return s,s.finish(12500)


def sub808(pitch,seconds,previous=None):
    t=np.arange(round(seconds*RATE))/RATE
    hz=freq(pitch)
    start=freq(previous) if previous is not None else hz*1.8
    glide=hz+(start-hz)*np.exp(-t/(.07 if previous is not None else .014))
    phase=2*np.pi*np.cumsum(glide)/RATE
    # The quiet harmonics make the sub line audible on small office speakers.
    body=np.sin(phase)+.25*np.sin(phase*2)+.07*np.sin(phase*3)
    env=(1-np.exp(-250*t))*np.exp(-t/.85)
    return (np.tanh(body*1.6)/1.6*release(env,t,seconds,.04)).astype(np.float32)


def midnight_drift():
    s=Score(88,[('streetlight',4),('cruise',16),('side street',8),('underpass',8),('night bloom',16),('distant lights',4)])
    kit=drumkit(503,'phonk')
    # Eb minor, Bmaj7, Abm, Bb minor; cowbell hook is composed, never a vocal sample.
    harmony=[[51,58,63,66],[47,54,58,63],[44,51,56,59],[46,53,58,61],
             [51,58,63,66],[47,54,58,63],[44,51,56,59],[46,53,58,62]]
    hooks=[[(0,75,.3),(.75,82,.3),(1.5,78,.5),(2.75,75,.4)],
           [(.5,78,.35),(1.25,75,.35),(2.5,70,.55),(3.5,73,.3)],
           [(0,75,.3),(.75,80,.3),(1.5,78,.5),(3,75,.4)],
           [(.5,77,.4),(1.5,73,.4),(2.75,70,.55)],
           [(0,75,.3),(.75,82,.3),(1.5,87,.5),(2.75,82,.4)],
           [(.5,85,.35),(1.25,82,.35),(2.5,78,.55),(3.5,75,.3)],
           [(0,80,.3),(.75,78,.3),(1.5,75,.5),(3,68,.4)],
           [(.5,70,.4),(1.5,74,.4),(2.75,75,.6)]]
    side_harmony=[[47,54,58,63],[49,56,61,65],[54,61,66,70],[51,58,63,66],
                  [44,51,56,59],[47,54,58,63],[46,53,58,61],[46,53,58,62]]
    side_hook=[[(.5,70,.5),(1.75,75,.4),(3,78,.6)],[(0,73,.6),(1.5,77,.5),(3,73,.6)],
               [(.75,78,.45),(2,82,.5),(3.25,78,.4)],[(0,78,.65),(2,75,1)],
               [(.5,80,.5),(1.75,78,.4),(3,75,.6)],[(0,78,.5),(1.5,75,.5),(3,70,.6)],
               [(.5,73,.6),(2,70,1)],[(.5,74,.6),(2,75,1.5)]]
    s.section_levels={'streetlight':.73,'cruise':.94,'side street':.84,'underpass':.68,'night bloom':1.08,'distant lights':.76}
    previous=27
    for sec,i,b in s.bars_iter():
        chord=(side_harmony if sec=='side street' else harmony)[i%8]; at=b*4
        sparse=sec in ('streetlight','underpass','distant lights')
        for k,n in enumerate(chord[1:]): s.note(n,at-.12,4.7,'darkpad',.048,(k-1)*.3)
        root=chord[0]-24
        if not sparse:
            bass_pattern = ([(0,1.6,0),(2.75,.65,7)] if sec=='side street'
                            else [(0,1.2,0),(1.75,.45,12),(2.5,.8,0),(3.5,.4,7)])
            for j,(pos,dur,offset) in enumerate(bass_pattern):
                target=root+offset
                s.put(sub808(target,dur*s.beat+.05,previous),at+pos,.20 if j==0 else .13)
                previous=target
                s.put(kit['kick'],at+pos,.105 if j==0 else .075,drums=True)
            for pos in [1,3]: s.put(kit['snare'],at+pos,.105,-.06,True)
            for step in range(16):
                if step in (5,13): continue
                swing=.045 if step%2 else 0
                s.put(kit['hat'],at+step*.25+swing,.021 if step%2==0 else .011,.25,True)
            if i%4==3:
                for pos in [3.5,3.625,3.75,3.875]: s.put(kit['hat'],at+pos,.025,.32,True)
            s.put(kit['open'],at+.5,.025,-.25,True)
            phrase = side_hook if sec=='side street' else hooks
            for event,(pos,n,dur) in enumerate(phrase[i%8]):
                if sec=='cruise' and i%4==3 and event==2: continue
                s.note(n-(12 if sec=='side street' else 0),at+pos,dur,'cowbell',.043 if sec!='night bloom' else .052,.08,.17)
            if sec=='night bloom' and i>=8 and i%2==0:
                s.note(chord[2]+12,at+1.25,1.2,'tapeorgan',.035,-.3,.22)
        else:
            s.put(sub808(root,2.7),at,.09)
            if i%2==0: s.note(chord[2]+12,at+1,1.8,'feltbell',.044,.25,.26)
            if sec=='underpass' and i>=4:
                s.put(kit['snare'],at+3,.045,-.1,True)
                for pos in [.5,1.5,2.5,3.5]: s.put(kit['hat'],at+pos,.015,.25,True)
    s.cadence([51,58,63,66],'darkpad',.068)
    s.note(75,s.bars*4-.5,3.5,'feltbell',.035,.18,.23)
    s.reflections([(.151,.09),(.307,.055),(.517,.03)])
    return s,s.finish(10000)


TRACKS = [
    dict(id='cassette-clouds',title='Cassette Clouds',genre='lofi',bpm=82,period='day',key=5,mode='major',meter=4,energy=.32,textures=['keys','plucked strings','dust','swung drums'],render=cassette_clouds),
    dict(id='neon-afterglow',title='Neon Afterglow',genre='synthwave',bpm=104,period='evening',key=2,mode='minor',meter=4,energy=.65,textures=['analog leads','pads','arpeggios','gated drums'],render=neon_afterglow),
    dict(id='tidal-memory',title='Tidal Memory',genre='ambient',bpm=66,period='night',key=4,mode='lydian',meter=4,energy=.12,textures=['evolving pads','bells','shimmer','air'],render=tidal_memory),
    dict(id='petal-breaks',title='Petal Breaks',genre='breakcore',bpm=164,period='day',key=2,mode='minor',meter=4,energy=.84,textures=['chopped breaks','piano','pads','bells'],render=petal_breaks),
    dict(id='midnight-drift',title='Midnight Drift',genre='phonk',bpm=88,period='night',key=3,mode='minor',meter=4,energy=.51,textures=['cowbell','sliding sub','hats','dark pads'],render=midnight_drift),
]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    # Other current genres have dedicated sampled/native renderers. Retain the
    # earlier sketches without allowing this command to overwrite those masters.
    parser.add_argument('--only',choices=['petal-breaks'],default='petal-breaks',
                        help='Other current genres use reference_mixes.py and surge_arrangements.py.')
    parser.add_argument('--sample-dir',type=Path,default=os.environ.get('LUCID_VCSL_DRUMS'),
                        help='Directory containing the pinned VCSL CC0 drum hits for Petal Breaks.')
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    metrics_file=OUT/'genre-metrics.json'
    old=json.loads(metrics_file.read_text()) if metrics_file.exists() else []
    results={row['id']:row for row in old}
    for track in TRACKS:
        if args.only and args.only!=track['id']: continue
        score,samples=track['render'](args.sample_dir) if track['id']=='petal-breaks' else track['render']()
        # Remove only the inaudible part AFTER the natural tonic release. A
        # short quiet guard is enough for a media-ended boundary transition.
        framesize=round(RATE*.02)
        complete=len(samples)//framesize*framesize
        endpeaks=np.max(np.abs(samples[:complete].reshape(-1,framesize,2)),axis=(1,2))
        last=np.flatnonzero(endpeaks>10**(-65/20))[-1]
        keep=min(len(samples),round(((last+1)*.02+.28)*RATE))
        if keep<len(samples):
            samples=samples[:keep].copy()
            guard=min(round(.075*RATE),len(samples))
            samples[-guard:]*=np.linspace(1,0,guard,dtype=np.float32)[:,None]
        peak=float(np.max(np.abs(samples))); rms=float(np.sqrt(np.mean(samples**2)))
        assert peak<=.725 and .075<rms<.115, (track['id'],peak,rms)
        with tempfile.TemporaryDirectory(prefix='lucid-genre-') as tmp:
            wav=Path(tmp)/'master.wav'
            with wave.open(str(wav),'wb') as writer:
                writer.setnchannels(2);writer.setsampwidth(2);writer.setframerate(RATE)
                writer.writeframes((np.clip(samples,-1,1)*32767).astype('<i2').tobytes())
            destination=OUT/(track['id']+'.mp3')
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','160k',
                            '-metadata',f"title={track['title']}",'-metadata','artist=Lucid',
                            '-metadata',f"genre={track['genre']}",str(destination)],check=True)
        row={k:v for k,v in track.items() if k!='render'}
        sections=[]
        for sec in score.sections:
            start,end=round(sec['start']*RATE),round(sec['end']*RATE)
            events=[event for event in score.events if sec['bar']*4<=event['beat']<(sec['bar']+sec['bars'])*4]
            sections.append({**{k:v for k,v in sec.items() if k not in ('bar','bars')},
                             'rmsDbFS':float(20*np.log10(np.sqrt(np.mean(samples[start:end]**2)))),
                             'instruments':sorted(set(event['instrument'] for event in events)),
                             'tonalOnsets':len(events),'authoredGain':score.section_levels.get(sec['name'],1)})
        row.update(seconds=len(samples)/RATE,peakDbFS=float(20*np.log10(peak)),rmsDbFS=float(20*np.log10(rms)),
                   revision=2,sections=sections,ending='Resolved tonic cadence with natural sustained release')
        if hasattr(score,'production'):
            row['revision']=score.production['revision']
            row['production']=score.production
        del score,samples
        decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(destination),'-f','f32le','-'])
        pcm=np.frombuffer(decoded,dtype='<f4').reshape(-1,2)
        assert np.isfinite(pcm).all() and np.max(np.abs(pcm))<.9
        windows=pcm[:len(pcm)//RATE*RATE].reshape(-1,RATE,2)
        levels=np.sqrt(np.mean(windows**2,axis=(1,2)))
        # An ambient entry/exit can be very quiet, the body must remain present.
        assert not (levels[6:-10]<.0001).any(), f"Silent gap in {track['id']}"
        measurement=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(destination),'-af',
                     'loudnorm=I=-20:TP=-2.8:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
        loudness=json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}',measurement.stderr).group())
        mid=(pcm[:,0]+pcm[:,1])*.5; side=(pcm[:,0]-pcm[:,1])*.5
        # Measure the final audible frame at a conservative -65dBFS threshold.
        frame=round(RATE*.02); usable=len(pcm)//frame*frame
        frame_peak=np.max(np.abs(pcm[:usable].reshape(-1,frame,2)),axis=(1,2))
        audible=np.flatnonzero(frame_peak>10**(-65/20))
        trailing=(len(pcm)/RATE-(audible[-1]+1)*.02) if len(audible) else len(pcm)/RATE
        assert trailing<.52, f"Unintended dead-air tail in {track['id']}: {trailing:.2f}s"
        row['decoded']={ 'seconds':len(pcm)/RATE,'peakDbFS':float(20*np.log10(np.max(np.abs(pcm)))),
                        'rmsDbFS':float(20*np.log10(np.sqrt(np.mean(pcm**2)))),'channels':2,'sampleRate':RATE,
                        'integratedLUFS':float(loudness['input_i']),'truePeakDbFS':float(loudness['input_tp']),
                        'loudnessRangeLU':float(loudness['input_lra']),
                        'channelCorrelation':float(np.corrcoef(pcm.T)[0,1]),
                        'sideToMidRMS':float(np.sqrt(np.mean(side*side))/np.sqrt(np.mean(mid*mid))),
                        'dcOffset':float(np.max(np.abs(np.mean(pcm,axis=0)))),
                        'trailingSilenceSeconds':float(trailing),
                        'finite':True,'silentBodySeconds':int(np.sum(levels[6:-10]<.0001)) }
        results[track['id']]=row
        metrics_file.write_text(json.dumps([results[t['id']] for t in TRACKS if t['id'] in results],indent=2)+'\n')
        print(json.dumps(row),flush=True)
        del pcm,decoded,windows

if __name__=='__main__': main()
