"""Eight separately written electronic office songs, rendered offline.

Requires the existing numpy/scipy/Pedalboard environment, verified native
Surge XT 1.3.4, CC0 VCSL drum cache and MIT FluidR3 GM SoundFont. No runtime
plugin, downloaded reference audio, factory preset or random melody is used.
The original twenty-three masters are never opened for writing.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import math
import os
import re
import subprocess
import tempfile
import wave
import numpy as np
from scipy.signal import butter,sosfilt
from pedalboard import Pedalboard,HighpassFilter,LowpassFilter,Reverb
from acoustic_breaks import AcousticBreak
from music_production import process_stem,center_low_end,room_send
import surge_instruments as surge
import reference_mixes as reference

RATE=44100
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'src/assets/audio'
CACHE=Path.home()/'.cache/lucid-audio-authoring'
FONT=CACHE/'fluidr3/usr/share/sounds/sf2/FluidR3_GM.sf2'
FONT_SHA='74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0'
PLUGIN=CACHE/'surge-portable/usr/lib/vst3/Surge XT.vst3'

# Every theme below is authored separately. An event is (beat,pitch,held beats).
# The breaks themes span two bars per line; the other themes span one bar.
SONGS=[
 dict(id='electric-horizon',title='Electric Horizon',genre='synthwave',bpm=112,key=0,mode='minor',energy=.63,period='evening',palette=0,
  harmony=[(36,[55,58,62]),(32,[55,60,63]),(39,[55,58,62]),(34,[53,60,62]),(41,[56,60,63]),(32,[55,60,63]),(31,[53,59,62]),(36,[55,58,60])],
  bridge=[(32,[55,60,63]),(34,[53,58,62]),(39,[55,58,62]),(43,[55,58,62]),(41,[56,60,63]),(38,[53,56,60]),(31,[53,59,62]),(36,[55,58,60])],
  A=[[(0,75,.5),(.75,79,.5),(1.5,75,1),(3,74,.5)],[(.5,72,1.3),(2.5,67,1)],
     [(0,75,.5),(.75,79,.5),(1.5,82,1),(3,79,.5)],[(.5,77,1.3),(2.5,74,1)],
     [(0,77,.5),(.75,80,.5),(1.5,79,1.4)],[(.5,75,1),(2,72,1.4)],
     [(.5,74,.75),(1.5,72,.5),(2.5,71,1)],[(0,79,.6),(1,75,.6),(2.25,72,1.4)]],
  B=[[(.5,80,2.4)],[(.5,77,1.2),(2.5,74,.9)],[(.5,79,2.4)],[(.5,77,1.2),(2.5,74,.9)],
     [(.5,77,1.3),(2.25,75,1)],[(.5,74,1.3),(2.25,72,1)],[(0,71,1),(1.5,74,.6),(2.5,71,.9)],[(.5,72,2.5)]],
  motif='Eb-G-Eb-D question and falling C-G answer; returning high Bb then a quiet C close'),
 dict(id='violet-motorway',title='Violet Motorway',genre='synthwave',bpm=100,key=9,mode='major',energy=.58,period='evening',palette=1,
  harmony=[(33,[56,61,64]),(32,[56,59,64]),(30,[57,61,64]),(38,[57,61,66]),(37,[56,59,64]),(38,[57,61,66]),(35,[57,62,66]),(33,[57,61,64])],
  bridge=[(38,[57,61,66]),(40,[56,59,64]),(37,[56,61,64]),(30,[57,61,64]),(35,[57,62,66]),(38,[57,61,66]),(40,[56,59,62]),(33,[57,61,64])],
  A=[[ (.25,73,.35),(1,76,.35),(1.75,73,.35),(2.5,71,1)],[(.25,68,2.2),(3,71,.55)],
     [(.25,73,.35),(1,76,.35),(1.75,78,1.6)],[(0,76,.8),(1.5,74,.65),(2.5,73,1)],
     [(.25,73,.35),(1,76,.35),(1.75,73,.35),(2.5,71,1)],[(.25,78,1.5),(2.5,76,1)],
     [(0,74,.8),(1.5,73,.6),(2.5,71,1)],[(.25,73,.8),(1.5,71,.6),(2.5,69,1.1)]],
  B=[[(.5,78,1.5),(2.5,76,1)],[(.5,76,1.5),(2.5,71,1)],[(.5,73,2.4)],[(.5,76,1.5),(2.5,73,1)],
     [(.5,74,1.5),(2.5,73,1)],[(.5,71,2.4)],[(0,68,1),(1.5,71,.65),(2.5,68,1)],[(.5,69,2.5)]],
  motif='C#-E-C# syncopation answers a held G#; the F# apex falls through E-D-C# to A'),
 dict(id='city-of-comets',title='City of Comets',genre='synthwave',bpm=118,key=4,mode='minor',energy=.72,period='night',palette=2,
  harmony=[(40,[55,59,62]),(36,[55,59,64]),(31,[55,59,64]),(38,[54,57,64]),(33,[55,59,64]),(36,[55,59,64]),(35,[54,57,63]),(40,[55,59,64])],
  bridge=[(36,[55,59,64]),(38,[54,57,64]),(35,[55,59,62]),(40,[55,59,64]),(33,[55,59,64]),(38,[54,57,62]),(35,[54,57,63]),(40,[55,59,64])],
  A=[[(0,67,.55),(.75,74,1.3),(2.5,71,.55),(3.25,69,.45)],[(.25,67,2.25)],
     [(0,67,.55),(.75,74,1.3),(2.5,76,.55),(3.25,74,.45)],[(.25,71,1.25),(2.5,69,.95)],
     [(0,72,.55),(.75,76,1.3),(2.5,74,.55),(3.25,71,.45)],[(.25,67,1.25),(2.5,64,.95)],
     [(0,66,.65),(1.25,69,.65),(2.5,63,1.1)],[(.25,64,2.5)]],
  B=[[(0,76,1.5),(2,74,1.25)],[(0,74,1.5),(2,69,1.25)],[(0,71,1.5),(2,74,1.25)],[(0,76,2.7)],
     [(0,72,1.5),(2,71,1.25)],[(0,69,1.5),(2,66,1.25)],[(0,63,1.5),(2,66,1.25)],[(0,64,2.7)]],
  motif='G-D leap followed by B-A-G, against a sparse three-plus-three-plus-two pluck pulse'),
 dict(id='fern-frequency',title='Fern Frequency',genre='breakcore',bpm=168,key=7,mode='minor',energy=.77,period='day',palette=0,
  harmony=[(31,[58,62,65]),(39,[55,58,62]),(34,[57,62,65]),(29,[57,60,67]),(36,[55,58,62]),(39,[55,58,62]),(38,[54,60,63]),(31,[55,58,62])],
  bridge=[(39,[55,58,62]),(29,[57,60,65]),(34,[57,62,65]),(38,[54,57,60]),(36,[55,58,62]),(39,[55,58,62]),(38,[54,60,63]),(31,[55,58,62])],
  A=[[(.5,67,1.2),(2,74,1.5),(5,75,1.2),(7,74,.6)],[(.5,70,2.2),(4,67,2.4)],
     [(.5,67,1.2),(2,74,1.5),(5,77,1.2),(7,75,.6)],[(.5,72,2.2),(4,69,2.4)],
     [(.5,70,1.2),(2,75,1.5),(5,74,1.2),(7,72,.6)],[(.5,70,2.2),(4,67,2.4)],
     [(.5,69,1.2),(2,66,1.5),(5,69,1.2),(7,66,.6)],[(.5,67,5.5)]],
  B=[[(.5,70,2.2),(4,69,2.4)],[(.5,69,2.2),(4,65,2.4)],[(.5,70,2.2),(4,74,2.4)],[(.5,72,2.2),(4,69,2.4)],
     [(.5,67,1.2),(2,70,1.5),(5,75,1.8)],[(.5,74,2.2),(4,70,2.4)],[(.5,69,2.2),(4,66,2.4)],[(.5,67,5.5)]],
  motif='G-D-Eb-D suspension; two-bar piano phrases soften the edited acoustic break'),
 dict(id='blue-hour-breaks',title='Blue Hour Breaks',genre='breakcore',bpm=160,key=11,mode='minor',energy=.74,period='evening',palette=1,
  harmony=[(35,[57,61,66]),(38,[57,61,66]),(33,[56,61,64]),(40,[56,59,66]),(31,[55,59,62]),(40,[55,59,62]),(30,[54,58,61]),(35,[54,57,62])],
  bridge=[(31,[55,59,62]),(33,[57,61,64]),(38,[57,61,66]),(30,[54,58,61]),(40,[55,59,62]),(31,[55,59,62]),(30,[54,58,61]),(35,[54,57,62])],
  A=[[(0,71,1.4),(2,78,1.2),(4.5,74,1.1),(6.5,73,1)],[(.5,71,3.0),(5,69,1.7)],
     [(0,73,1.4),(2,76,1.2),(4.5,73,1.1),(6.5,71,1)],[(.5,68,3),(5,66,1.7)],
     [(0,71,1.4),(2,74,1.2),(4.5,78,2.1)],[(.5,76,1.4),(2.5,74,1),(5,71,1.7)],
     [(0,73,1.4),(2,70,1.2),(4.5,73,2.1)],[(.5,74,1.7),(3,73,1),(5,71,2.1)]],
  B=[[(.5,74,2.4),(4,71,2.6)],[(.5,73,2.4),(4,69,2.6)],[(.5,74,2.4),(4,78,2.6)],[(.5,76,2.4),(4,73,2.6)],
     [(.5,71,2.4),(4,67,2.6)],[(.5,66,2.4),(4,67,2.6)],[(.5,70,2.4),(4,73,2.6)],[(.5,71,5.5)]],
  motif='Held B-F# rise and D-C# sigh, answered by a related electric-piano phrase'),
 dict(id='orbital-bloom',title='Orbital Bloom',genre='breakcore',bpm=174,key=5,mode='minor',energy=.86,period='night',palette=2,
  harmony=[(29,[56,60,63]),(37,[56,60,65]),(32,[55,60,63]),(39,[55,58,65]),(34,[56,60,65]),(37,[56,60,65]),(36,[55,58,64]),(29,[56,60,65])],
  bridge=[(37,[56,60,65]),(39,[55,58,63]),(32,[55,60,63]),(36,[55,58,64]),(34,[56,60,65]),(37,[56,60,65]),(36,[55,58,64]),(29,[56,60,65])],
  A=[[(.75,68,.8),(2,72,1.1),(4.5,75,1.5),(7,72,.5)],[(.75,73,2.0),(4.5,72,2.1)],
     [(.75,68,.8),(2,72,1.1),(4.5,79,1.5),(7,75,.5)],[(.75,77,2),(4.5,75,2.1)],
     [(.75,77,.8),(2,72,1.1),(4.5,68,1.5),(7,70,.5)],[(.75,73,2),(4.5,72,2.1)],
     [(.75,70,.8),(2,67,1.1),(4.5,64,1.5),(7,67,.5)],[(.75,65,5.7)]],
  B=[[(.75,77,2),(4.5,75,2.1)],[(.75,75,2),(4.5,70,2.1)],[(.75,72,2),(4.5,68,2.1)],[(.75,67,2),(4.5,64,2.1)],
     [(.75,65,.8),(2,68,1.1),(4.5,72,2.1)],[(.75,73,2),(4.5,72,2.1)],[(.75,70,2),(4.5,67,2.1)],[(.75,65,5.7)]],
  motif='Ab-C-Eb reaching cell, repeated toward G before falling into the F-minor cadence'),
 dict(id='mercury-boulevard',title='Mercury Boulevard',genre='phonk',bpm=78,key=1,mode='minor',energy=.47,period='night',palette=0,
  harmony=[(37,[56,59,63]),(33,[56,61,64]),(30,[57,61,64]),(32,[56,60,63]),(40,[56,59,63]),(30,[57,61,64]),(32,[54,60,63]),(37,[56,59,61])],
  bridge=[(33,[56,61,64]),(35,[54,59,63]),(40,[56,59,63]),(32,[56,60,63]),(30,[57,61,64]),(33,[56,61,64]),(32,[54,60,63]),(37,[56,59,61])],
  A=[[(.5,68,.45),(1.5,68,.45),(2.5,71,1)],[(.5,73,1.5),(2.5,71,.75)],
     [(.5,69,.45),(1.5,68,.45),(2.5,66,1)],[(.5,68,1.5),(2.5,63,.75)],
     [(.5,68,.45),(1.5,68,.45),(2.5,71,1)],[(.5,73,1.5),(2.5,69,.75)],
     [(.5,66,.45),(1.5,63,.45),(2.5,60,1)],[(.5,61,2.5)]],
  B=[[(.5,76,1.4),(2.5,73,.85)],[(.5,75,1.4),(2.5,71,.85)],[(.5,73,1.4),(2.5,71,.85)],[(.5,68,2.4)],
     [(.5,69,1.4),(2.5,66,.85)],[(.5,64,2.4)],[(.5,63,1.4),(2.5,60,.85)],[(.5,61,2.4)]],
  motif='Repeated G#-G#-B metal-soft mallet cell with a C# answer; quiet upper-key B section'),
 dict(id='velvet-transmission',title='Velvet Transmission',genre='phonk',bpm=70,key=9,mode='minor',energy=.52,period='evening',palette=1,
  harmony=[(33,[55,59,64]),(29,[57,60,64]),(38,[57,60,64]),(40,[56,59,62]),(36,[55,59,64]),(29,[57,60,64]),(40,[56,59,62]),(33,[57,60,64])],
  bridge=[(29,[57,60,64]),(31,[55,59,62]),(36,[55,59,64]),(40,[56,59,62]),(38,[57,60,64]),(29,[57,60,64]),(40,[56,59,62]),(33,[57,60,64])],
  A=[[(.25,64,.8),(1.5,60,.45),(2.5,62,1.1)],[(.25,64,1.5),(2.5,60,1)],
     [(.25,65,.8),(1.5,64,.45),(2.5,62,1.1)],[(.25,59,1.5),(2.5,56,1)],
     [(.25,64,.8),(1.5,67,.45),(2.5,71,1.1)],[(.25,69,1.5),(2.5,65,1)],
     [(.25,64,.8),(1.5,62,.45),(2.5,59,1.1)],[(.25,60,.8),(1.5,59,.45),(2.5,57,1.1)]],
  B=[[(.25,69,1.5),(2.5,65,1)],[(.25,67,1.5),(2.5,62,1)],[(.25,64,2.5)],[(.25,62,1.5),(2.5,59,1)],
     [(.25,65,1.5),(2.5,64,1)],[(.25,60,2.5)],[(.25,59,1.5),(2.5,56,1)],[(.25,57,2.5)]],
  motif='E-C-D lilt in a low mallet register, with a nylon-guitar middle and a G#-A cadence'),
]


def place(target,a,beat,tempo,gain=1,pan=0):
    first=round(beat*tempo*RATE);trim=max(0,-first);first=max(0,first)
    if a.ndim==1:a=a[:,None]*np.array([math.sqrt((1-pan)/2),math.sqrt((1+pan)/2)],np.float32)
    n=min(len(a)-trim,len(target)-first)
    if n>0:target[first:first+n]+=a[trim:trim+n]*gain


def fit_peak(a,target):
    assert np.isfinite(a).all()
    return a*(target/max(1e-8,float(np.abs(a).max())))


def filtered_echo(a,beat,amount=.12):
    source=sosfilt(butter(2,[470,3900],btype='bandpass',fs=RATE,output='sos'),a,axis=0).astype(np.float32)
    out=a.copy()
    for delay,level in [(.75,amount),(1.5,amount*.4)]:
        n=round(delay*beat*RATE);out[n:]+=source[:-n,::-1]*level
    return out


def form_for(song):
    if song['genre']=='synthwave':
        return [('street lamps',4),('the main road',16),('a different skyline',8),('headlights fade',8),('homeward current',16),('last light',8)]
    if song['genre']=='breakcore':
        return [('first spores',8),('the unfolding',16),('another orbit',16),('suspended air',8),('the full bloom',16),('a quieter answer',16),('leaving the garden',16)]
    return [('radio opens',4),('night signal',8),('a warmer frequency',8),('under the bridge',8),('the signal returns',16),('radio closes',4)]


def events_add(part,pitch,at,held,level=.08):
    part.append(dict(pitch=int(pitch),beat=float(at),held=float(held),level=float(level)))


def drum_performance(song,kit,drums,room,bar,at,beat,kind,quiet,counters,kick_beats):
    palette=song['palette'];genre=song['genre']
    if quiet:
        if kind in ('headlights fade','suspended air','under the bridge'):return
        if bar%2==0:place(drums,kit.hit('hat',.4,bar),at+2,beat,.50)
        return
    if genre=='synthwave':
        patterns=[[[0,1.5,2.75],[0,.75,2.5],[0,1.75,2.5],[0,2.5]],
                  [[0,2],[0,1.75,2.5],[0,2.75],[0,.75,2.5]],
                  [[0,1,2,3],[0,1,2,3],[0,1,2,3],[0,1,2,3]]]
        kicks=patterns[palette][bar%4];snares=[1.015,3.018]
        hats=[step*.5 for step in range(8) if not(bar%4==3 and step==7)]
    elif genre=='breakcore':
        patterns=[[[0,1.5,2.75],[0,.75,2.5,3.5],[0,1.75,2.5],[0,2.5]],
                  [[0,.75,2.5],[0,1.75,2.75],[0,.5,2.5],[0,2.25,3.5]],
                  [[0,1.75,2.5],[0,.75,2.75,3.5],[0,1.5,2.5],[0,2.5,3.75]]]
        kicks=patterns[palette][bar%4];snares=[1.012,3.016]
        hats=[step*.5+(.018 if step%2 else 0) for step in range(8) if not(bar%4==3 and step==7)]
        if kind=='a quieter answer':kicks=kicks[:1];snares=[2.014]
    else:
        kicks=([0,1.72,2.53] if palette==0 else [0,.76,2.76]) if bar%2==0 else [0,2.51]
        snares=[1.024,3.030];hats=[step*.25+(.025 if step%2 else 0) for step in range(16) if step not in (6,14)]
    for j,pos in enumerate(kicks):
        place(drums,kit.hit('kick',.94 if j==0 else .72,bar+j),at+pos,beat,.90)
        counters['kick']+=1
        kick_beats.append(at+pos)
    for j,pos in enumerate(snares):
        audio=kit.hit('snare',.82 if genre!='phonk' else .60,bar+j)
        place(drums,audio,at+pos,beat,.65 if genre!='breakcore' else .73)
        if j==1 and bar%4==3:place(room,audio,at+pos,beat,.10)
        counters['snare']+=1
    for j,pos in enumerate(hats):
        accent=.62 if j%2 else .46
        place(drums,kit.hit('hat',accent,bar+j),at+pos,beat,.72 if genre=='breakcore' else .54,pan=.21)
        counters['hats']+=1
    if genre=='breakcore':
        for j,pos in enumerate(([.625,2.75,3.75] if bar%2 else [1.625,2.625])):
            place(drums,kit.hit('snare',.18+j*.035,bar+j),at+pos,beat,.68);counters['ghost']+=1
        if bar%8==7:
            # A shaped two-beat reply from our own recorded-hit performance.
            for j,pos in enumerate([3.25,3.5,3.75] if palette!=1 else [3.5,3.75]):
                place(drums,kit.hit('dry',.44-j*.07,j+bar),at+pos,beat,.52);counters['edits']+=1
        if palette==2 and bar%8==3:
            for pos in [2.875,3.125,3.375]:
                place(drums,kit.hit('snare',.22,bar),at+pos,beat,.52);counters['edits']+=1
    elif genre=='phonk' and bar%4==3:
        place(drums,kit.hit('snare',.20,bar),at+2.85,beat,.60);counters['ghost']+=1


def sampled(events,frames,bpm,program,pan=0,bells=False):
    beat=60/bpm
    notes=[(e['beat']*beat,e['pitch'],e['held']*beat,round(58+e['level']*170)) for e in events]
    return reference.sampled_bell_strikes(notes,frames,pan) if bells else reference.sampled_instrument(notes,frames,program,pan)


def native(events,song,frames,role,target):
    # These remain our original initialized patches, with a different authored
    # envelope/oscillator balance for each track. No factory preset is loaded.
    previous=copy.deepcopy(surge.PATCHES[role]);cfg=surge.PATCHES[role]
    palette=song['palette']
    if role=='lead':
        cfg.update(shape=[-45,-78,22][palette],cutoff=[2400,2100,2850][palette],
                   decay=[.36,.53,.24][palette],sustain=[42,50,28][palette],release=[.18,.28,.13][palette],
                   second_volume=[-17,-20,-16][palette],detune=[4,3,5][palette])
    elif role=='pad':cfg.update(attack=.40,release=.60,cutoff=1350,sustain=48,detune=4,second_volume=-18)
    elif role=='arp':cfg.update(cutoff=[2700,2250,3200][palette],decay=[.18,.24,.13][palette],release=.07)
    try:audio,settings=surge.render_surge_part(events,song['bpm'],frames,role,gain=.25,plugin_path=PLUGIN)
    finally:surge.PATCHES[role]=previous
    audio=fit_peak(audio,target)
    return process_stem(audio,RATE,'pads' if role=='pad' else 'bass' if role=='bass' else 'lead',
                        room='small' if role in ('lead','arp') else 'none',send=.07),settings


def render(song,sample_dir):
    bpm=song['bpm'];beat=60/bpm;form=form_for(song)
    frames=round((sum(n for _,n in form)*4*beat+6)*RATE)
    parts={k:[] for k in ('pad','lead','answer','arp','bass')}
    drums=np.zeros((frames,2),np.float32);drum_room=np.zeros_like(drums)
    sub=np.zeros_like(drums);metal=np.zeros_like(drums)
    kit=AcousticBreak(sample_dir,bpm);sections=[];bar=0
    hits={k:0 for k in ('kick','snare','hats','ghost','edits')};kick_beats=[]
    genre=song['genre'];span=2 if genre=='breakcore' else 1
    for section,bars in form:
        section_start=bar*4*beat
        quiet=section in ('street lamps','headlights fade','last light','first spores','suspended air','leaving the garden','radio opens','under the bridge','radio closes')
        is_B=section in ('a different skyline','another orbit','a quieter answer','a warmer frequency')
        harmony=song['bridge'] if is_B else song['harmony'];melody=song['B'] if is_B else song['A']
        for local in range(bars):
            at=bar*4;index=(local//span)%8;root,voices=harmony[index]
            # Independent additive phonk pads can finish the penultimate bar.
            # Only the actual final bar belongs exclusively to the cadence;
            # withholding two slow bars would create an empty three-second gap.
            closing_guard=1 if genre=='phonk' else 2
            ending=section==form[-1][0] and local>=bars-closing_guard
            if ending:root,voices=song['harmony'][-1]
            # Slower harmony in the break pieces leaves the two-bar theme free
            # to cross barlines. Synthwave holds only modest three-note pads.
            if local%span==0 and not ending:
                if genre=='synthwave' and song['palette']==2:
                    if local%2==0:
                        for k,p in enumerate(voices):events_add(parts['arp'],p,at+.035*k,.75,.047)
                else:
                    for k,p in enumerate(voices):events_add(parts['pad'],p,at+.025*k,span*4-1.05,.035 if quiet else .05)
            if genre=='synthwave':
                patterns=[[(0,.65),(.75,.35),(2,.55),(2.75,.55)],
                          [(0,.8),(1.5,.35),(2.5,.65),(3.5,.28)],
                          [(0,.34),(.5,.28),(1,.34),(1.5,.28),(2,.34),(2.5,.28),(3,.34),(3.5,.28)]]
                if not ending:
                    for j,(pos,held) in enumerate([(0,2.2)] if quiet else patterns[song['palette']]):
                        pitch=root+(7 if j%4==2 else 0)
                        events_add(parts['bass'],pitch,at+pos,held,.085 if j==0 else .060)
                if not quiet and local%2==1:
                    # The propulsion cell stays beneath the tune, rather than
                    # filling every upper-register rest with another melody.
                    for j,pos in enumerate([0,1.5,3]):events_add(parts['arp'],voices[j],at+pos,.22,.035)
            else:
                bass_pattern=[(0,1.7),(2.65,.7)] if genre=='phonk' else [(0,1.8),(2.5,1.0)]
                if quiet:bass_pattern=[(0,2.7)]
                if not ending:
                    for j,(pos,held) in enumerate(bass_pattern):
                        a=reference.clean_sub(root,held*beat)
                        place(sub,a,at+pos,beat,.11 if j==0 else .075)
            if not quiet and local%span==0:
                for j,(pos,pitch,held) in enumerate(melody[index]):
                    dest='answer' if is_B else 'lead'
                    events_add(parts[dest],pitch,at+pos,held,.078 if j==0 else .069)
                    # Quiet short metal accent on the identifying first note
                    # only, leaving the vibraphone as the full musical voice.
                    if genre=='phonk' and not is_B and index in (0,4) and j==0:
                        place(metal,reference.lunar_voice(pitch,.5,'cowbell'),at+pos,beat,.009,pan=-.12)
            elif quiet:
                # Fragments are always taken from THIS score's motif. The
                # quiet middle changes duration and foreground instrument.
                if section in ('headlights fade','suspended air','under the bridge') and local%4==0:
                    pitch=song['A'][local//4%2][0][1]
                    events_add(parts['answer'],pitch-12 if genre=='synthwave' else pitch,at+.5,2.5,.045)
                elif section==form[0][0] and local in (1,3):
                    for pos,pitch,held in song['A'][0][:2]:events_add(parts['lead'],pitch,at+pos,held,.041)
                elif section==form[-1][0] and local in (0,4):
                    for pos,pitch,held in song['A'][0][:2]:events_add(parts['lead'],pitch,at+pos,held,.043 if local==0 else .035)
            drum_performance(song,kit,drums,drum_room,local,at,beat,section,quiet or ending,hits,kick_beats)
            bar+=1
        sections.append(dict(name=section,start=section_start,end=bar*4*beat,foreground='Related B theme' if is_B else 'Motif fragments' if quiet else 'Main theme'))
    # One final tonic attack owns the closing bar, avoiding old MIDI note-offs
    # cutting a re-struck sustained final chord. Natural decay is retained.
    cadence=(bar-1)*4
    root,voices=song['harmony'][-1]
    for k,p in enumerate(voices):events_add(parts['pad'],p,cadence+.04*k,2.8,.032)
    events_add(parts['lead'],song['key']+60,cadence+.12,2.4,.045)
    if genre=='synthwave':events_add(parts['bass'],root,cadence,2.5,.058)
    else:place(sub,reference.clean_sub(root,2.5*beat),cadence,beat,.08)
    music=np.zeros_like(drums);provenance={};stem_levels={}
    for name,events in parts.items():
        if not events:continue
        print(song['id'],name,len(events),flush=True)
        if genre=='synthwave':
            role='lead' if name in ('lead','answer') else name
            target={'pad':.030,'lead':.115,'answer':.095,'arp':.035,'bass':.11}[name]
            audio,prov=native(events,song,frames,role,target);provenance[name]=prov
        elif name=='pad':
            # Only a few quiet overtones, independent bounded chord gestures;
            # no held unison saw pad is used in these acoustic-led pieces.
            audio=np.zeros_like(drums)
            for e in events:
                duration=min(3.7,e['held']*beat)
                place(audio,reference.lunar_voice(e['pitch'],round(duration,3),'pad'),e['beat'],beat,.014 if genre=='breakcore' else .018)
            audio=process_stem(audio,RATE,'pads')
        else:
            if name in ('bass','arp'):continue
            bells=(genre=='phonk' and name=='lead') or (song['id']=='orbital-bloom' and name=='answer')
            program=4 if song['id']=='blue-hour-breaks' else 24 if song['id']=='velvet-transmission' and name=='answer' else 0 if genre=='breakcore' else 4
            audio=sampled(events,frames,bpm,program,-.10 if name=='lead' else .18,bells)
            audio=fit_peak(audio,.108 if name=='lead' else .087)
            audio=process_stem(audio,RATE,'keys' if not bells else 'lead',room='small',send=.10)
            audio=filtered_echo(audio,beat,.085 if genre=='breakcore' else .11)
            provenance[name]=dict(renderer='FluidSynth',program=11 if bells else program,independentBellVoices=bells)
        music+=audio
        stem_levels[name]=dict(peak=float(np.max(np.abs(audio))),rms=float(np.sqrt(np.mean(audio**2))),events=len(events))
        del audio
    drums=process_stem(drums,RATE,'drums')
    drums=fit_peak(drums,.14 if genre=='breakcore' else .105)
    wet=Pedalboard([HighpassFilter(430),Reverb(room_size=.24,damping=.78,wet_level=1,dry_level=0,width=.9),LowpassFilter(4500)])(drum_room.T,RATE,reset=True).T
    if genre=='phonk':
        # Give each real recorded kick a small space in the sustained mono
        # sub. The rest of the music remains independent of this envelope.
        duck=np.ones(frames,np.float32);t=np.arange(round(.198*RATE))/RATE
        fall=.5+.5*np.cos(np.pi*np.clip(t/.008,0,1))
        rise=.5-.5*np.cos(np.pi*np.clip((t-.012)/.180,0,1))
        shape=np.where(t<.008,.60+.40*fall,.60+.40*rise).astype(np.float32)
        for at in kick_beats:
            first=round((at*beat-.004)*RATE);skip=max(0,-first);first=max(0,first)
            n=min(len(shape)-skip,frames-first)
            if n>0:duck[first:first+n]=np.minimum(duck[first:first+n],shape[skip:skip+n])
        sub*=duck[:,None]
    # Retain a quiet room only around selected snare responses, never kicks.
    music+=drums+wet*.10+metal+sub
    music=center_low_end(music,RATE,160)
    music=sosfilt(butter(2,26,btype='highpass',fs=RATE,output='sos'),music,axis=0).astype(np.float32)
    first=round(.06*RATE);music[:first]*=np.linspace(0,1,first)[:,None]
    active=np.flatnonzero(np.max(np.abs(music),axis=1)>10**(-69/20))
    music=music[:min(len(music),int(active[-1])+round(.26*RATE))].copy()
    music[-round(.04*RATE):]*=np.linspace(1,0,round(.04*RATE))[:,None]
    metadata={k:v for k,v in song.items() if k not in ('harmony','bridge','A','B','palette')}
    metadata.update(meter=4,sections=sections,textures=(['native analog synth','pads','arpeggio','bass','recorded drums'] if genre=='synthwave' else ['sampled piano' if song['id']!='blue-hour-breaks' else 'sampled electric piano','quiet pads','bass','recorded break drums'] if genre=='breakcore' else ['natural vibraphone bells','quiet pads','sub bass','recorded drums','pitched metal accents']),
      composition=dict(themeBars=16 if genre=='breakcore' else 8,theme=song['A'],relatedAnswer=song['B'],harmony=song['harmony'],contrastingHarmony=song['bridge'],motif=song['motif'],
        arrangement='One primary theme, related contrasting phrase, sparse own-motif interlude, recognizable full return and explicit tonic close'),
      stemLevels=stem_levels,drumPerformance=hits,
      provenance=dict(synth=surge.authoring_provenance(PLUGIN) if genre=='synthwave' else 'Original additive quiet pads and stable fundamental sub',
        nativeParts=provenance,soundfont=dict(name='FluidR3 GM',license='MIT',sha256=FONT_SHA),
        drumSource=dict(project='VCSL',license='CC0-1.0',commit=kit.manifest['commit'],manifest='scripts/assets/vcsl-drums.json',individualSampleNormalization=False),
        effects='Pedalboard role EQ and filtered parallel room; original feedforward phrase echoes',factoryPresetsUsed=False,referenceAudioCopied=False,auditionPerformed=False))
    if song['id']=='orbital-bloom':metadata['textures'].append('natural vibraphone bells')
    if genre=='phonk':metadata['provenance']['subBassDucking']=dict(kickEvents=len(kick_beats),depth=.40,lookaheadMs=4,recoveryMs=180,otherStemsDucked=False)
    reference.lunar_voice.cache_clear()
    return music,metadata


def loudness(path):
    p=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af','loudnorm=I=-20:TP=-3.5:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    return json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}',p.stderr)[0])


def export(audio,meta):
    assert np.isfinite(audio).all() and audio.shape[1]==2
    # The native plucks and acoustic snare have isolated high-crest attacks.
    # Bring up the authored performance once, then round only those excursions
    # with the same modest smooth ceiling used by the established office score.
    # Final LUFS/true-peak adjustment below remains a single static gain.
    audio*=.104/max(1e-8,float(np.sqrt(np.mean(audio.astype(np.float64)**2))))
    audio=.68*np.tanh(audio/.68)
    meta['provenance']['mastering']='Whole-performance calibration, smooth 0.68 soft ceiling on isolated attacks, then static measured loudness/headroom gain'
    with tempfile.TemporaryDirectory(prefix='lucid-electronic-expansion-') as temp:
        wav=Path(temp)/'source.wav'
        def write():
            with wave.open(str(wav),'wb') as w:
                w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE);w.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
        write();initial=loudness(wav)
        gain=min(-20.35-float(initial['input_i']),-3.5-float(initial['input_tp']))
        audio*=10**(gain/20);write()
        destination=OUT/(meta['id']+'.mp3')
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','192k','-metadata','title='+meta['title'],'-metadata','artist=Lucid','-metadata','genre='+meta['genre'],str(destination)],check=True)
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(destination),'-ac','2','-ar',str(RATE),'-f','f32le','-'])
    pcm=np.frombuffer(raw,dtype='<f4').reshape(-1,2);measure=loudness(destination)
    assert np.isfinite(pcm).all()
    active=np.flatnonzero(np.max(np.abs(pcm),axis=1)>=10**(-65/20));lead=active[0]/RATE;tail=(len(pcm)-1-active[-1])/RATE
    assert lead<=.5 and tail<=.65,(meta['id'],lead,tail)
    assert float(measure['input_tp'])<=-2.7,measure
    assert -22<=float(measure['input_i'])<=-16,measure
    corr=float(np.corrcoef(pcm.T)[0,1]);dc=float(np.max(np.abs(np.mean(pcm,axis=0))))
    assert corr>-.1 and dc<.002
    meta.update(revision=1,seconds=len(pcm)/RATE,
      peakDbFS=float(20*np.log10(np.abs(pcm).max())),
      rmsDbFS=float(20*np.log10(np.sqrt(np.mean(pcm.astype(np.float64)**2)))),
      sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
      ending='Written tonic cadence with natural instrument release and short quiet guard',
      decoded=dict(channels=2,sampleRate=RATE,finite=True,
        integratedLUFS=float(measure['input_i']),truePeakDbFS=float(measure['input_tp']),
        loudnessRangeLU=float(measure['input_lra']),leadingQuietSeconds=lead,
        trailingSilenceSeconds=tail,channelCorrelation=corr,dcOffset=dc))
    for section in meta['sections']:
        a=round(section['start']*RATE);b=min(len(pcm),round(section['end']*RATE))
        section['rmsDbFS']=float(20*np.log10(np.sqrt(np.mean(pcm[a:b].astype(np.float64)**2))))
    print(json.dumps({k:meta[k] for k in ('id','seconds','sha256','decoded')}),flush=True)
    return meta


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',choices=[s['id'] for s in SONGS])
    parser.add_argument('--sample-dir',type=Path,default=CACHE/'vcsl-cozy')
    args=parser.parse_args()
    assert hashlib.sha256(FONT.read_bytes()).hexdigest()==FONT_SHA
    reference.SF=FONT;os.environ['SURGE_VST3']=str(PLUGIN)
    old=OUT/'electronic-expansion-metrics.json'
    rows={r['id']:r for r in json.loads(old.read_text())} if old.exists() else {}
    for song in SONGS:
        if args.only and args.only!=song['id']:continue
        audio,meta=render(song,args.sample_dir);rows[song['id']]=export(audio,meta)
        old.write_text(json.dumps([rows[s['id']] for s in SONGS if s['id'] in rows],indent=2)+'\n')
        del audio,meta


if __name__=='__main__':main()
