"""Five original genre scores for Lucid, made entirely from authored synthesis.

Offline authoring: Python 3, numpy, scipy and ffmpeg. No downloaded samples,
external services or runtime synthesizer. Each renderer owns its harmony,
melody, form, sound design and rhythmic vocabulary. Run with --only <id> to
re-render one recording. Existing soundtrack assets are never modified.
"""
from pathlib import Path
from functools import lru_cache
import argparse
import json
import subprocess
import tempfile
import wave
import numpy as np
from scipy.signal import butter, sosfilt, resample_poly

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
        body = np.sin(phase)+.38*np.sin(phase*2)*np.exp(-5*t)+.17*np.sin(phase*3)*np.exp(-8*t)
        env = (1-np.exp(-140*t))*np.exp(-t/.46)
        body = lowpass(body, 3600)
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
            body = .38*np.sin(phase)+.24*np.sin(phase*1.0011+.3*np.sin(t*.43))
            body += .13*np.sin(phase*2.0007)+.08*np.sin(phase*3.001+.2*np.sin(t*.73))
            body *= 1+.11*np.sin(2*np.pi*.14*t+pitch)
            env = np.sin(np.pi*t/seconds)**1.4
        elif kind == 'shimmer':
            body = np.sin(phase)*.6+.2*np.sin(phase*2.001)+.1*np.sin(phase*3.003)
            env = (1-np.exp(-.9*t))*np.exp(-t/3.9)
        else:
            body = np.sin(phase)+.17*np.sin(phase*2.005)*np.exp(-2*t)
            env = (1-np.exp(-18*t))*np.exp(-t/1.7)
    elif kind == 'breakpad':
        body = .5*harmonic_wave(phase,hz,'saw',2)+.35*harmonic_wave(phase*1.003,hz,'saw',2)
        body = lowpass(body, 2300)
        env = np.sin(np.pi*t/seconds)**.8
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

    def bars_iter(self):
        for sec in self.sections:
            for i in range(sec['bars']): yield sec['name'],i,sec['bar']+i

    def reflections(self,room):
        # A stereo room attached to tonal material, leaving drum attacks clear.
        dry = self.music.copy()
        for delay,gain in room:
            shift = round(delay*RATE)
            self.music[shift:] += dry[:-shift,::-1]*gain

    def finish(self,cutoff=11000):
        self.music += self.drums
        del self.drums
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
    for sec,i,b in s.bars_iter():
        chord = harmony[i%8]; at=b*4
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
            for pos,n,duration in hook[i%8]:
                s.note(n-(12 if sec=='second verse' and i<4 else 0),at+pos,duration,'lofiguitar',.10,.13,.15)
        elif i%2==0:
            s.note(chord[-1]+12,at+1,2,'dustkeys',.035,.3,.18)
    # Quiet, continuous tape texture, with sparse synthetic dust clicks.
    n=s.frames
    dust=band(rng.normal(0,1,n),400,6000)*.0011
    s.music[:,0]+=dust; s.music[:,1]+=np.roll(dust,173)*.8
    for at in rng.uniform(0,s.bars*4*s.beat,round(s.bars*.8)):
        click=noise_hit(rng,.012,1500,9000,300)
        s.put(click,at/s.beat,.006,float(rng.uniform(-.6,.6)))
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
    for sec,i,b in s.bars_iter():
        ci=i%8 if sec!='horizon turn' else [4,5,2,3,1,6,7,7][i%8]
        chord=harmony[ci]; at=b*4
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
            for pos,n in zip([0,1.5,3],[chord[2]+12,chord[1]+12,chord[3]+12]):
                s.note(n,at+pos,.8,'neonlead',.061,-.12,.27)
    # Beat-locked gentle pump on the tonal stem, not on the kick/snare.
    for sec in s.sections:
        if sec['name'] not in ('night drive','horizon turn','neon return'): continue
        for beat in range(sec['bar']*4,(sec['bar']+sec['bars'])*4):
            start=round(beat*s.beat*RATE); count=round(.24*RATE)
            count=min(count,s.frames-start)
            env=1-.24*np.exp(-np.arange(count)/RATE/.075)
            s.music[start:start+count]*=env[:,None]
    s.reflections([(.123,.09),(.237,.065),(.411,.035)])
    return s,s.finish(11500)


def tidal_memory():
    s=Score(66,[('incoming tide',6),('first horizon',8),('luminous water',8),('deep water',8),('remembering',8),('receding tide',4)],tail=10)
    rng=np.random.default_rng(307)
    # E Lydian color, then C# minor, with very slow voice-leading.
    harmony=[[52,59,63,66,70],[49,56,59,63,68],[45,52,56,59,63],[47,54,58,61,66],
             [52,59,63,68,70],[56,63,66,70,73],[49,56,59,63,66],[47,54,59,63,66]]
    motif=[(0,82,3.5),(7,78,2.5),(12,75,4),(21,78,3),(27,73,4)]
    for sec,i,b in s.bars_iter():
        at=b*4
        if i%2==0:
            chord=harmony[(i//2+(2 if sec=='deep water' else 0))%8]
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
            s.note(73,at+1,5,'shimmer',.035,-.28,.32)
    # Wide filtered air with a slow swell. No drums or regular bass pulse.
    t=np.arange(s.frames)/RATE
    for channel in range(2):
        raw=band(rng.normal(0,1,s.frames),180+channel*100,2400+channel*500)
        swell=.0018*(.5+.5*np.sin(2*np.pi*t/23+channel*1.2))
        s.music[:,channel]+=raw*swell
    s.reflections([(.173,.18),(.337,.14),(.619,.10),(1.07,.075),(1.63,.045),(2.17,.025)])
    return s,s.finish(8700)


def petal_breaks():
    s=Score(164,[('petal drift',8),('first fracture',24),('open sky',8),('glass garden',16),('still centre',8),('bloom fragments',24),('falling petals',8)])
    kit=drumkit(409,'breakcore')
    rng=np.random.default_rng(410)
    # Build a wholly original two-bar acoustic-style break, then physically cut
    # it into sixteenth-note cells. Rearrangement, reverse cells, rate changes
    # and ratchets happen to this recording, rather than merely speeding a beat.
    cell=round(s.beat*.25*RATE)
    source=np.zeros((cell*32,2),dtype=np.float32)
    def break_hit(kind,pos,gain,pan=0):
        sig=kit[kind]; start=round(pos*s.beat*RATE)
        n=min(len(sig),len(source)-start)
        if n>0: source[start:start+n]+=sig[:n,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)])*gain
    for pos,gain in [(0,.20),(.75,.13),(1.5,.16),(2.5,.17),(3.5,.12),(4,.19),(5.75,.16),(6.5,.15),(7.5,.10)]:
        break_hit('kick',pos,gain)
    for pos,gain in [(1,.20),(3,.21),(5,.20),(7,.22),(.875,.045),(2.75,.055),(3.75,.05),(4.75,.05),(6.75,.06),(7.75,.07)]:
        break_hit('snare',pos,gain,-.07)
    for i in range(16): break_hit('hat',i*.5,.035 if i%2 else .026,.34)
    for pos in [1.5,5.5]: break_hit('open',pos,.035,.3)
    source=np.tanh(source*1.2)/1.2
    cells=[source[i*cell:(i+1)*cell].copy() for i in range(32)]
    # Authored amen-like permutations preserve backbeat references amidst edits.
    patterns=[list(range(16)),
              [0,1,6,7,4,5,14,15,8,9,2,3,12,13,30,31],
              [16,17,18,19,20,21,6,7,24,25,26,27,28,29,14,15],
              [0,1,4,5,12,13,6,7,8,9,20,21,28,29,30,31],
              [16,17,2,3,20,21,22,23,8,9,10,11,28,29,12,13],
              [0,1,2,3,4,5,6,7,24,25,12,13,28,29,30,31]]
    harmony=[[50,57,60,65,69],[46,53,57,60,65],[53,60,64,67,72],[48,55,58,62,67],
             [43,50,53,57,62],[46,53,57,62,65],[45,52,55,60,64],[45,52,57,61,64]]
    hook=[[(0,81,1),(1.5,84,.5),(2.5,89,1)],[(.5,86,1),(2,81,1.5)],
          [(0,84,.7),(1,88,.7),(2.5,91,1)],[(.5,86,1),(2,82,.8),(3,79,.7)],
          [(0,82,1.2),(1.5,81,.5),(2.5,77,1)],[(0,77,.8),(1.5,74,.6),(3,77,.7)],
          [(.5,76,1),(2,79,.6),(3,84,.7)],[(0,85,1),(1.5,81,.7),(3,73,.7)]]
    for sec,i,b in s.bars_iter():
        chord=harmony[(i//2)%8]; at=b*4
        if i%2==0:
            for k,n in enumerate(chord[1:]): s.note(n,at-.15,8.4,'breakpad',.06,(k-1.5)*.22)
            s.note(chord[0]-12,at,4.5,'roundbass',.115)
        active=sec in ('first fracture','glass garden','bloom fragments')
        if active:
            pattern=patterns[(i+(2 if sec=='bloom fragments' else 0))%len(patterns)]
            for step,idx in enumerate(pattern):
                sig=cells[idx]
                # Local reverses and pitch-shifted slices occur at phrase ends.
                if i%4==3 and step in (10,14): sig=sig[::-1].copy()
                if sec=='bloom fragments' and i%4==2 and step in (6,7):
                    sig=resample_poly(sig,4,5,axis=0).astype(np.float32)
                # Tiny edge windows prevent clicks introduced by the edits.
                sig=sig.copy(); edge=min(90,len(sig)//4)
                sig[:edge]*=np.linspace(0,1,edge)[:,None]
                sig[-edge:]*=np.linspace(1,0,edge)[:,None]
                s.put(sig,at+step*.25,1,drums=True)
            if i%4==3:
                # 32nd/64th ratchets with decreasing velocity, then a clear rest.
                for j in range(6):
                    grain=kit['snare'][:round(cell*.45)]
                    s.put(grain,at+3.25+j*.125,.055*(1-j*.10),(-1)**j*.25,True)
            if sec=='bloom fragments' and i%8==7:
                for j in range(8): s.put(kit['rim'],at+3+j*.125,.04,-.4+.1*j,True)
        elif sec=='open sky':
            for pos in [0,2.75]: s.put(kit['kick'],at+pos,.08,drums=True)
            s.put(kit['snare'],at+2,.06,-.1,True)
        if sec in ('first fracture','glass garden','bloom fragments'):
            # A half-time piano hook holds the musical thread across rapid drums.
            for pos,n,dur in hook[(i//2)%8]:
                if i%2==0: s.note(n-(12 if sec=='glass garden' else 0),at+pos*2,dur*1.5,'breakpiano',.095,.12,.23)
        elif i%4==0:
            s.note(chord[-1]+12,at+1,4,'feltbell',.06,.3,.35)
    s.reflections([(.113,.08),(.263,.06),(.491,.04)])
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
    previous=27
    for sec,i,b in s.bars_iter():
        chord=harmony[i%8]; at=b*4
        sparse=sec in ('streetlight','underpass','distant lights')
        for k,n in enumerate(chord[1:]): s.note(n,at-.12,4.7,'darkpad',.048,(k-1)*.3)
        root=chord[0]-24
        if not sparse:
            for j,(pos,dur,offset) in enumerate([(0,1.2,0),(1.75,.45,12),(2.5,.8,0),(3.5,.4,7)]):
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
            for pos,n,dur in hooks[i%8]:
                # The side-street bridge answers in the lower octave.
                s.note(n-(12 if sec=='side street' else 0),at+pos,dur,'cowbell',.048 if sec!='night bloom' else .055,.08,.19)
        else:
            s.put(sub808(root,2.7),at,.09)
            if i%2==0: s.note(chord[2]+12,at+1,1.8,'feltbell',.044,.25,.26)
            if sec=='underpass' and i>=4:
                s.put(kit['snare'],at+3,.045,-.1,True)
                for pos in [.5,1.5,2.5,3.5]: s.put(kit['hat'],at+pos,.015,.25,True)
    s.reflections([(.151,.09),(.307,.055),(.517,.03)])
    return s,s.finish(10000)


TRACKS = [
    dict(id='cassette-clouds',title='Cassette Clouds',genre='lofi',bpm=82,period='day',render=cassette_clouds),
    dict(id='neon-afterglow',title='Neon Afterglow',genre='synthwave',bpm=104,period='evening',render=neon_afterglow),
    dict(id='tidal-memory',title='Tidal Memory',genre='ambient',bpm=66,period='night',render=tidal_memory),
    dict(id='petal-breaks',title='Petal Breaks',genre='breakcore',bpm=164,period='day',render=petal_breaks),
    dict(id='midnight-drift',title='Midnight Drift',genre='phonk',bpm=88,period='night',render=midnight_drift),
]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',choices=[t['id'] for t in TRACKS])
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    metrics_file=OUT/'genre-metrics.json'
    old=json.loads(metrics_file.read_text()) if metrics_file.exists() else []
    results={row['id']:row for row in old}
    for track in TRACKS:
        if args.only and args.only!=track['id']: continue
        score,samples=track['render']()
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
        row.update(seconds=len(samples)/RATE,peakDbFS=20*np.log10(peak),rmsDbFS=20*np.log10(rms),
                   sections=[{k:v for k,v in sec.items() if k not in ('bar','bars')} for sec in score.sections])
        del score,samples
        decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(destination),'-f','f32le','-'])
        pcm=np.frombuffer(decoded,dtype='<f4').reshape(-1,2)
        assert np.isfinite(pcm).all() and np.max(np.abs(pcm))<.9
        windows=pcm[:len(pcm)//RATE*RATE].reshape(-1,RATE,2)
        levels=np.sqrt(np.mean(windows**2,axis=(1,2)))
        # An ambient entry/exit can be very quiet, the body must remain present.
        assert not (levels[6:-10]<.0001).any(), f"Silent gap in {track['id']}"
        row['decoded']={ 'seconds':len(pcm)/RATE,'peakDbFS':float(20*np.log10(np.max(np.abs(pcm)))),
                        'rmsDbFS':float(20*np.log10(np.sqrt(np.mean(pcm**2)))),'channels':2,'sampleRate':RATE,
                        'finite':True,'silentBodySeconds':int(np.sum(levels[6:-10]<.0001)) }
        results[track['id']]=row
        metrics_file.write_text(json.dumps([results[t['id']] for t in TRACKS if t['id'] in results],indent=2)+'\n')
        print(json.dumps(row),flush=True)
        del pcm,decoded,windows

if __name__=='__main__': main()
