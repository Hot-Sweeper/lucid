"""Neon/Tidal reference-production revisions using real Surge XT and Pedalboard.

No factory patches or borrowed melodies. SURGE_VST3 points to a portable native
Surge XT 1.3.4 VST3, VCSL_DRUMS to the pinned CC0 acoustic hit subset. The app
ships only MP3 masters. This authoring chain runs offline without an audio device.

Production references (principles, not copied notes or presets):
https://surge-synthesizer.github.io/manual-xt/
https://www.ableton.com/en/blog/made-in-ableton-live-s1gns-of-l1fe/
https://github.com/spotify/pedalboard
https://github.com/sgossner/VCSL (CC0)
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
import wave
import numpy as np
from scipy.signal import butter, sosfilt, lfilter
from pedalboard import Pedalboard, Chorus, Reverb, Delay, HighpassFilter, LowpassFilter, PeakFilter, LowShelfFilter
from music_production import process_stem, room_send
from surge_instruments import render_surge_part, authoring_provenance

RATE=44100
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'src/assets/audio'


def note(events,pitch,at,held,level=.08):
    events.append(dict(pitch=int(pitch),beat=float(at),held=float(held),level=float(level)))


def place(target,signal,at,beat,level=1,pan=0):
    start=round(at*beat*RATE)
    if signal.ndim==1:
        signal=signal[:,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)],dtype=np.float32)
    trim=max(0,-start);start=max(0,start);n=min(len(signal)-trim,len(target)-start)
    if n>0:target[start:start+n]+=signal[trim:trim+n]*level


def hit(name,seconds=None):
    path=Path(os.environ.get('VCSL_DRUMS','/tmp/lucid-vcsl-drums'))/(name+'.wav')
    if not path.is_file():raise FileNotFoundError('Set VCSL_DRUMS to the pinned CC0 subset: '+str(path))
    data=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ar',str(RATE),'-ac','1','-f','f32le','-'])
    a=np.frombuffer(data,dtype='<f4').copy()
    if seconds is not None:a=a[:round(seconds*RATE)]
    a-=a.mean()
    # Retain the recorded transient and room; only remove irrelevant pre-roll.
    loud=np.flatnonzero(np.abs(a)>max(.00003,np.max(np.abs(a))*.008))
    if len(loud):a=a[max(0,loud[0]-round(.0008*RATE)):]
    a/=max(.05,np.max(np.abs(a)))
    edge=min(round(.012*RATE),len(a)//4);a[-edge:]*=np.linspace(1,0,edge)
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    manifest_path=path.parent/'manifest.json'
    manifest=json.loads(manifest_path.read_text())
    original=next(row for row in manifest['files'] if row['file']==path.name)
    assert original['sha256']==digest,'Recorded hit no longer matches pinned CC0 source: '+str(path)
    return a.astype(np.float32),dict(original,license=manifest['license'],commit=manifest['commit'])


def recorded_kick(source):
    """Keep a real membrane's transient/body; gently damp its recorded room."""
    a=Pedalboard([HighpassFilter(28),LowShelfFilter(90,gain_db=1.0),
                 PeakFilter(360,gain_db=-2.0,q=.9),LowpassFilter(4500)])(source,RATE)
    t=np.arange(len(a))/RATE
    a*=np.exp(-np.maximum(0,t-.065)/.19)
    a[:round(.001*RATE)]*=np.linspace(0,1,round(.001*RATE))
    a[-round(.035*RATE):]*=np.linspace(1,0,round(.035*RATE))
    return (a/max(.05,float(np.abs(a).max()))).astype(np.float32)


def filtered_echo_return(audio,seconds,feedback=.22,low=430,high=4200,modulation=False):
    """A fully wet stereo send. Source transients and centered bass stay dry.

    Left/right delay lengths differ deliberately. The return is band limited
    before and after the delays, with optional very slow native modulation.
    """
    out=np.zeros_like(audio)
    for channel,delay in enumerate(seconds):
        chain=Pedalboard([HighpassFilter(low),LowpassFilter(high),
                         Delay(delay_seconds=delay,feedback=feedback,mix=1),LowpassFilter(high)])
        out[:,channel]=chain(np.ascontiguousarray(audio[:,channel]),RATE,buffer_size=8192,reset=True)
    if modulation:
        out=Pedalboard([Chorus(rate_hz=.073,depth=.12,centre_delay_ms=13,
                              feedback=.02,mix=.13)])(out.T,RATE,buffer_size=8192,reset=True).T
    assert out.shape==audio.shape and np.isfinite(out).all()
    return np.ascontiguousarray(out,dtype=np.float32)


def pluck(pitch,seconds=1.2,attack=.048,cutoff=4200):
    hz=440*2**((pitch-69)/12);size=round(seconds*RATE)
    delay=max(8,round(RATE/hz-.5));rng=np.random.default_rng(77000+pitch)
    exc=np.zeros(size);exc[:delay]=rng.normal(0,.6,delay);exc[:delay]-=exc[:delay].mean()
    denominator=np.zeros(delay+2);denominator[0]=1;denominator[delay:delay+2]=-.496
    a=lfilter([1],denominator,exc);a/=max(.1,np.abs(a).max())
    # A rounded onset removes the old three-millisecond broadband click. The
    # ringing string still carries the melody instead of becoming pure reverb.
    a=Pedalboard([HighpassFilter(170),LowpassFilter(cutoff)])(a.astype(np.float32),RATE)
    t=np.arange(size)/RATE
    ramp=.5-.5*np.cos(np.pi*np.clip(t/attack,0,1))
    a*=np.exp(-t/1.5)*ramp
    a[-round(.03*RATE):]*=np.linspace(1,0,round(.03*RATE))
    return a.astype(np.float32)


def render_part(events,bpm,frames,role,gain):
    print('Rendering native Surge',role,len(events),'events',flush=True)
    return render_surge_part(events,bpm,frames,role,gain=gain)


def neon_afterglow():
    bpm=104;beat=60/bpm
    form=[('first lights',4),('night-drive question',16),('horizon answer',8),('tunnel respite',8),('rising side street',8),('neon homecoming',16),('distant afterglow',8)]
    frames=round((sum(n for _,n in form)*4*beat+5)*RATE)
    parts={name:[] for name in ['pad','lead','arp','bass']};drums=np.zeros((frames,2),np.float32)
    snare_throws=np.zeros_like(drums)
    sounds={};provenance=[]
    for k,filename in [('kick1','bass_main_1'),('kick2','bass_main_2'),('kickSoft1','bass_soft_1'),('kickSoft2','bass_soft_2'),
                       ('snare1','snare_main_1'),('snare2','snare_main_2'),('hat1','hat_main_1'),('hat2','hat_main_2'),('open','hat_open_1')]:
        duration=.48 if k.startswith('kick') else .38 if k.startswith('snare') else .18
        a,source=hit(filename,duration);sounds[k]=recorded_kick(a) if k.startswith('kick') else a;provenance.append(source)
    # A real snare gets a controlled, short gated room. The direct transient
    # stays present; the tail does not blur the bass groove.
    for k in ('snare1','snare2'):
        source=np.column_stack((sounds[k],sounds[k])).astype(np.float32)
        expanded=room_send(source,RATE,'small',send=.20)
        t=np.arange(len(expanded))/RATE;gate=np.clip((.255-t)/.035,0,1)
        sounds[k]=(expanded.mean(axis=1)*gate).astype(np.float32)
    harmony=[[50,57,60,65],[46,53,57,62],[53,60,65,69],[48,55,60,64],
             [43,50,53,58],[46,53,57,62],[45,52,55,60],[45,52,57,61]]
    bridge=[[46,53,57,62],[48,55,60,64],[53,60,65,69],[50,57,60,65],
            [43,50,53,58],[46,53,57,62],[52,59,62,67],[45,52,57,61]]
    hook=[[(0,65,.65),(.75,69,.4),(1.5,72,.8),(3,69,.7)],
          [(.5,70,.8),(2,65,1.4)],[(0,69,.6),(1,72,.6),(2,77,1.2)],
          [(.5,76,.7),(1.5,72,.6),(3,67,.7)],[(0,70,1.2),(1.5,69,.4),(2.5,65,.9)],
          [(0,65,.7),(1.5,62,.6),(3,65,.7)],[(.5,64,.6),(1.5,67,.6),(2.5,72,.9)],
          [(0,73,.7),(1.5,69,.6),(3,61,.7)]]
    response=[[(.5,74,1.3),(2.5,72,.8)],[(0,76,.7),(1.5,72,.7),(3,67,.6)],
              [(0,77,1.6),(2.5,72,.9)],[(.5,69,.8),(2,65,1.5)],
              [(0,70,1),(1.5,74,.6),(3,69,.7)],[(0,65,1),(2,62,1.5)],
              [(.5,67,.7),(1.5,64,.7),(3,62,.6)],[(0,61,1.5),(2.5,64,.6)]]
    bass_rhythms=[[(0,.65),(.75,.35),(1.5,.4),(2.5,.7),(3.75,.2)],
                  [(0,.8),(1.25,.35),(2,.45),(2.75,.4)],
                  [(.0,.45),(.75,.5),(2.5,.8),(3.5,.3)],
                  [(.0,.9),(1.5,.4),(2.75,.45),(3.75,.2)]]
    sections=[];bar=0
    for section,bars in form:
        sections.append(dict(name=section,start=bar*4*beat,end=(bar+bars)*4*beat))
        for i in range(bars):
            at=bar*4;quiet=section in ('first lights','tunnel respite','distant afterglow')
            chord=(bridge if section in ('horizon answer','rising side street') else harmony)[i%8]
            if section=='distant afterglow' and i==bars-1:chord=[50,57,62,65]
            velocity=.055 if quiet else .085
            # Common pad tones are tied by the native renderer; envelope state
            # continues over the entire song instead of resetting every sample.
            for k,pitch in enumerate(chord[1:]):note(parts['pad'],pitch,at-.06*k,4.2,velocity*(1+k*.04))
            if not quiet:
                for j,(pos,held) in enumerate(bass_rhythms[i%4]):
                    octave=12 if j==2 and i%4==1 else 0
                    note(parts['bass'],chord[0]-12+octave,at+pos,held,.095 if j==0 else .075)
                kicks=[[0,1.75,2.5],[0,.75,2.5,3.75],[0,1.5,2.75],[0,2.5]][i%4]
                if i%8==7:kicks=[0,2.5] # leave room for the written phrase ending
                for j,pos in enumerate(kicks):
                    soft=pos in (.75,1.75,3.75)
                    take=('kickSoft' if soft else 'kick')+str(1+(i+j)%2)
                    place(drums,sounds[take],at+pos,beat,.125 if pos==0 else .075 if soft else .098)
                for j,pos in enumerate([1,3]):
                    snare=sounds['snare1' if (i+j)%2 else 'snare2']
                    place(drums,snare,at+pos+.015,beat,.091 if j==0 else .104,-.025)
                    if j==1 and i%8 in (3,7):
                        place(snare_throws,snare,at+pos+.015,beat,.027,.10 if i%8==3 else -.10)
                for j in range(8):
                    if i%8==7 and j==7:continue
                    # Alternate recorded takes and 13% velocity accents; only a
                    # tiny timing displacement, not random off-grid smearing.
                    pos=j*.5+(0.016 if j%2 else 0)
                    accent=1.12 if j in (0,4) else .80 if j%2 else .94
                    place(drums,sounds['hat1' if (i+j)%2 else 'hat2'],at+pos,beat,.017*accent,.24)
                if i%2 and i%8!=7:place(drums,sounds['open'],at+2.5,beat,.020,.25)
                if i%8==7:
                    for pos,level in [(3.25,.026),(3.625,.019)]:place(drums,sounds['snare2'],at+pos,beat,level,-.08)
                # Arps answer the lead in the gaps, rather than continuously
                # filling every half beat with the same ostinato.
                for j,pos in enumerate([.5,2.25,3.5] if i%2 else [1.25,2.75]):
                    note(parts['arp'],chord[1+j%3]+12,at+pos,.22,.035)
            else:
                if not (section=='distant afterglow' and i==bars-1):
                    note(parts['bass'],chord[0]-12,at,2.6,.055)
                if i%2==0:note(parts['arp'],chord[-1]+12,at+1.5,.5,.026)
            if section in ('night-drive question','neon homecoming'):
                for pos,pitch,held in hook[i%8]:note(parts['lead'],pitch,at+pos,held,.082 if section=='neon homecoming' else .075)
                if section=='neon homecoming' and i%4==2:
                    for pos,pitch in [(1.25,chord[2]),(3.5,chord[1])]:note(parts['arp'],pitch+12,at+pos,.45,.04)
            elif section in ('horizon answer','rising side street'):
                for pos,pitch,held in response[i%8]:note(parts['lead'],pitch,at+pos,held,.074)
            elif section=='tunnel respite' and i%2==0:
                note(parts['lead'],chord[2]+12,at+1.5,1.4,.047)
            bar+=1
    # Deliberate D-minor cadence, not A-major left unresolved into silence.
    cadence=(bar-1)*4
    for pitch in [50,57,62,65,69]:note(parts['pad'],pitch,cadence,5,.075)
    note(parts['bass'],38,cadence,3.5,.07);note(parts['lead'],74,cadence+.5,2.5,.057)
    mixed=np.zeros((frames,2),np.float32);native={}
    for role,gain in [('pad',.64),('bass',.60),('arp',.42),('lead',.52)]:
        audio,info=render_part(parts[role],bpm,frames,role,gain);native[role]=info
        audio=process_stem(audio,RATE,'pads' if role=='pad' else role if role in ('bass','lead') else 'keys',
                           room='small' if role=='lead' else 'none',send=.10,chorus=role=='pad')
        # Beat-locked duck only on the sustained pad, leaving lead articulation.
        if role=='pad':
            for section in sections:
                a,b=round(section['start']*RATE),min(frames,round(section['end']*RATE))
                if section['name']=='first lights':
                    audio[a:b]*=np.linspace(.35,.68,b-a,dtype=np.float32)[:,None];continue
                if section['name']=='tunnel respite':
                    audio[a:b]*=.47;continue
                if section['name']=='distant afterglow':
                    audio[a:b]*=np.linspace(.70,.28,b-a,dtype=np.float32)[:,None]
                    audio[b:]*=.28
                    continue
                for pos in np.arange(section['start'],section['end'],beat):
                    start=round(pos*RATE);n=min(round(.22*RATE),frames-start)
                    audio[start:start+n]*=(1-.19*np.exp(-np.arange(n)/RATE/.075))[:,None]
            # Two deliberately placed reverse-chord pickups announce the B
            # answer and homecoming, using only the track's own native pad.
            for boundary in (sections[2]['start'],sections[5]['start']):
                end=round(boundary*RATE);length=round(.78*RATE);begin=end-length
                swell=audio[begin:end][::-1].copy()
                audio[begin:end]+=swell*np.linspace(0,.24,length,dtype=np.float32)[:,None]**1.5
        print('Stem',role,'peak',float(np.abs(audio).max()),'rms',float(np.sqrt(np.mean(audio**2))),flush=True)
        mixed+=audio
    mixed+=process_stem(drums,RATE,'drums')
    # Echo only selected snare phrase endings. The kick/bass never enter this
    # return, and its upper-band repeats cannot smear the downbeat's low end.
    throw_return=filtered_echo_return(snare_throws,(.75*beat,beat),feedback=.18,low=480,high=3900)
    mixed+=room_send(throw_return,RATE,'small',send=.06)
    return mixed,dict(id='neon-afterglow',title='Neon Afterglow',genre='synthwave',bpm=bpm,key=2,mode='minor',meter=4,
                     energy=.65,textures=['analog leads','pads','arpeggios','recorded bass drum','gated acoustic snare','syncopated bass'],
                     sections=sections,nativeParts=native,sampleSources=provenance,
                     percussionProduction=dict(kick='Four verified VCSL recorded takes; no synthesized oscillator layer',
                         kickTreatment='28 Hz highpass, gentle 90 Hz shelf, 360 Hz mud cut, damped natural room, dry mono',
                         groove='Four-bar broken kick cycle, softer recorded pickups, alternate snare/hat takes, phrase-end hat gaps',
                         snareSpace='Short filtered gated room; selected phrase-ending 3/16 and 1/4 note stereo throws, 18% feedback, 480-3900 Hz'),
                     arrangement='Lower-register question/answer lead, broken recorded-kick/bass groove, real gated snare, filtered phrase-ending echoes, contrasting B, quiet tunnel and reprise')


def tidal_memory():
    bpm=66;beat=60/bpm;total_beats=180;frames=round((total_beats*beat+7)*RATE)
    events=[];motif=[];shadows=[]
    sections=[dict(name='a distant shore',start=0,end=24*beat),dict(name='overlapping horizons',start=24*beat,end=64*beat),
              dict(name='refracted light',start=64*beat,end=104*beat),dict(name='deep water',start=104*beat,end=132*beat),
              dict(name='a remembered shoreline',start=132*beat,end=164*beat),dict(name='receding',start=164*beat,end=frames/RATE)]
    # Non-periodic phrase lengths; each next voicing is voiced close to the
    # previous one. E Lydian's A# is a color, not a constant glaring top note.
    voicings=[[52,59,63,66],[49,56,59,63],[46,56,61,64],[47,54,58,61],
              [52,59,66,70],[56,59,63,66],[49,56,61,64],[47,54,59,63],
              [46,56,61,64],[42,54,58,61],[47,54,58,63],[52,59,63,66]]
    phrase_lengths=[13,15,17,14,19,16,13,17,14,16,12,14]
    at=0
    for i,(chord,held) in enumerate(zip(voicings,phrase_lengths)):
        for k,pitch in enumerate(chord):note(events,pitch,at+k*.31,held+.9,.066+(.009 if i in (4,5,10) else 0))
        if i%3==1:note(shadows,chord[1]+12,at+6.75,7.3,.024)
        if i%4==2:note(shadows,chord[2]+12,at+9.5,5.1,.02)
        at+=held
    # The authored sparse melody returns as an answer in a lower register.
    for pos,pitch,held in [(20.5,82,3.2),(28.25,78,3.4),(39.5,75,4.1),(49.75,78,3.5),(61,73,4.2),
                           (131.25,70,4.2),(142,66,4.4),(151.5,63,5.1),(164.25,66,4.1)]:
        note(motif,pitch,pos,held,.035)
    pads,info=render_part(events,bpm,frames,'atmosphere',.64)
    pads=process_stem(pads,RATE,'pads',room='bloom',send=.17,chorus=True)
    halo,halo_info=render_part(shadows,bpm,frames,'pad',.28)
    halo=process_stem(halo,RATE,'pads',room='bloom',send=.16,chorus=False)
    # One physically modelled string is transformed into a wash by native slow
    # chorus, unsynced delay and 100%-wet reverb. It has its own overlapping
    # phrase periods and never resets on the pad chord/section boundaries.
    wash=np.zeros((frames,2),np.float32)
    phrase=[76,78,83,75,78,71,73]
    for cycle,start in enumerate(np.arange(8.75,171,10.75)):
        pitch=phrase[cycle%len(phrase)]
        place(wash,pluck(pitch,1.4,attack=.085,cutoff=3400),float(start),beat,.044,(-1)**cycle*.26)
    distant=filtered_echo_return(wash,(3.1,4.7),feedback=.31,low=330,high=4500,modulation=True)
    diffuse=Pedalboard([Reverb(room_size=.80,damping=.66,wet_level=1,dry_level=0,width=1),
                       HighpassFilter(330),LowpassFilter(4100)])(distant.T,RATE,buffer_size=8192,reset=True).T
    wash=distant*.16+diffuse*.84
    bells=np.zeros((frames,2),np.float32)
    for i,event in enumerate(motif):
        # A soft plucked bell, with its own physical string onset, carries the
        # old melodic identity while the native synth owns the evolving pad.
        sound=pluck(event['pitch'],4.1,attack=.048,cutoff=4200)
        place(bells,sound,event['beat'],beat,.064,.13 if i%2 else -.12)
    reflections=filtered_echo_return(bells,(.68,1.03),feedback=.27,low=520,high=3600,modulation=True)
    # Near notes stay intelligible; a separate dark repeat and diffused return
    # place their answers further away without reverberating the whole master.
    bells=room_send(bells,RATE,'chamber',send=.10)+reflections*.22
    far_bells=Pedalboard([Reverb(room_size=.68,damping=.70,wet_level=1,dry_level=0,width=.94),
                         HighpassFilter(520),LowpassFilter(3400)])(reflections.T,RATE,buffer_size=8192,reset=True).T
    bells+=far_bells*.10
    mixed=pads+halo+wash+bells
    # Resolve gently on E/B rather than resetting the eight-chord list at exit.
    ending=np.ones(frames,np.float32);start=round(173*beat*RATE)
    ending[start:]=np.clip(np.cos(np.linspace(0,np.pi/2,frames-start,dtype=np.float32)),0,1)**1.4
    mixed*=ending[:,None]
    return mixed,dict(id='tidal-memory',title='Tidal Memory',genre='ambient',bpm=bpm,key=4,mode='lydian',meter=4,
                     energy=.12,textures=['pads','transformed plucked wash','bells','unsynced delay'],
                     sections=sections,nativeParts={'atmosphere':info,'halo':halo_info},
                     spaceProduction=dict(dryMotif='48 ms raised-cosine attack and 4.2 kHz lowpass; alternating close positions',
                         nearReflections='680/1030 ms stereo filtered echoes, 27% feedback, 520-3600 Hz, slow 0.073 Hz modulation',
                         distantWash='85 ms softened string excitation; 3.1/4.7s independent filtered repeats and separate diffused reverb',
                         master='No added master reverb, delay or percussion'),
                     arrangement='Free-running 13/15/17/14/19-beat phrases, tied voice-leading, rounded pluck return, filtered near/far echoes, low-register motif reprise and drumless space')


def export(samples,meta):
    # Preserve the arrangement's relative levels, then apply one conservative
    # headroom pass. The app computes perceived-level trims independently.
    assert samples.ndim==2 and samples.shape[1]==2 and np.isfinite(samples).all(), 'Invalid mix before export'
    samples=Pedalboard([HighpassFilter(25)])(samples.T,RATE).T
    samples=np.asarray(samples,dtype=np.float32)
    # A static gain preserves the actual crest factor. JUCE's limiter includes
    # makeup gain, so it would change the intended playback level here.
    samples*=min(.1016/max(1e-8,np.sqrt(np.mean(samples**2))),
                 .706/max(1e-8,np.abs(samples).max()))
    fade=round(.06*RATE);samples[:fade]*=np.linspace(0,1,fade)[:,None]
    # Keep the natural release, remove only confirmed inaudible padding.
    audible=np.flatnonzero(np.any(np.abs(samples)>=10**(-65/20),axis=1))
    keep=min(len(samples),int(audible[-1]+round(.25*RATE)))
    samples=samples[:keep].copy();samples[-round(.03*RATE):]*=np.linspace(1,0,round(.03*RATE))[:,None]
    peak=float(np.max(np.abs(samples)));rms=float(np.sqrt(np.mean(samples**2)))
    assert np.isfinite(samples).all() and peak<=.707 and rms>0
    with tempfile.TemporaryDirectory(prefix='lucid-surge-master-') as temp:
        wav=Path(temp)/'master.wav'
        with wave.open(str(wav),'wb') as w:
            w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE)
            w.writeframes((np.clip(samples,-1,1)*32767).astype('<i2').tobytes())
        destination=OUT/(meta['id']+'.mp3')
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','192k',
                        '-metadata','artist=Lucid','-metadata','title='+meta['title'],str(destination)],check=True)
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(destination),'-f','f32le','-'])
    pcm=np.frombuffer(raw,dtype='<f4').reshape(-1,2)
    loud=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(destination),'-af','loudnorm=I=-20:TP=-2.8:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    loud=json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}',loud.stderr)[0])
    active=np.flatnonzero(np.any(np.abs(pcm)>=10**(-65/20),axis=1))
    tail=(len(pcm)-active[-1]-1)/RATE
    assert np.isfinite(pcm).all() and np.max(np.abs(pcm))<.8 and tail<.45,dict(
        finite=bool(np.isfinite(pcm).all()),peak=float(np.abs(pcm).max()),tail=float(tail))
    assert -.1<float(np.corrcoef(pcm.T)[0,1])
    meta.update(revision=4,production='Surge XT 1.3.4 original analog patches + Pedalboard 0.9.26 stem production',
                provenance=dict(instrument=authoring_provenance(),
                    effects=dict(name='Spotify Pedalboard',version='0.9.26',license='GPL-3.0-only',authoringOnly=True,
                        source='https://github.com/spotify/pedalboard',
                        documentation='https://spotify.github.io/pedalboard/reference/pedalboard.html'),
                    composition='Original Lucid scores and own explicit Classic oscillator patches; no artist melody, factory preset or factory audio copied',
                    delivery='Only encoded music ships in the app; native plugin and Python processors remain offline authoring dependencies'),
                seconds=len(samples)/RATE,peakDbFS=20*np.log10(peak),rmsDbFS=20*np.log10(rms),
                decoded=dict(seconds=len(pcm)/RATE,integratedLUFS=float(loud['input_i']),truePeakDbFS=float(loud['input_tp']),
                             loudnessRangeLU=float(loud['input_lra']),peakDbFS=float(20*np.log10(np.abs(pcm).max())),
                             rmsDbFS=float(20*np.log10(np.sqrt(np.mean(pcm**2)))),trailingSilenceSeconds=tail,
                             channelCorrelation=float(np.corrcoef(pcm.T)[0,1]),finite=True))
    for section in meta['sections']:
        a,b=round(section['start']*RATE),min(len(samples),round(section['end']*RATE))
        section['rmsDbFS']=float(20*np.log10(np.sqrt(np.mean(samples[a:b]**2))))
    return meta


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--only',choices=['neon-afterglow','tidal-memory']);args=parser.parse_args()
    metric_file=OUT/'surge-mix-metrics.json'
    rows={r['id']:r for r in json.loads(metric_file.read_text())} if metric_file.exists() else {}
    for ident,render in [('neon-afterglow',neon_afterglow),('tidal-memory',tidal_memory)]:
        if args.only and args.only!=ident:continue
        samples,meta=render()
        # Offline authoring cache makes headroom/encoding checks repeatable
        # without changing oscillator phases by rerendering the composition.
        np.save('/tmp/lucid-surge-'+ident+'.npy',samples)
        Path('/tmp/lucid-surge-'+ident+'.json').write_text(json.dumps(meta,indent=2)+'\n')
        row=export(samples,meta);rows[ident]=row
        metric_file.write_text(json.dumps(list(rows.values()),indent=2)+'\n')
        print(json.dumps({k:row[k] for k in ['id','seconds','peakDbFS','rmsDbFS','decoded']}),flush=True)


if __name__=='__main__':main()
