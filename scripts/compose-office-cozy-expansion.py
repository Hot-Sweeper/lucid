"""Eight separately written cozy, lo-fi and ambient pieces for Lucid.

Offline authoring only: NumPy/SciPy, Pedalboard, FluidSynth, MIT FluidR3 GM and
the pinned CC0 VCSL drum cache. Existing recordings are never output targets.
Themes/harmonies below are authored data; randomness is limited to performance.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import math
import os
import re
import subprocess
import tempfile
import wave
import numpy as np
from scipy.signal import butter, sosfilt
from cozy_percussion import CozyPercussion
from music_production import process_stem, center_low_end

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'src/assets/audio'
CACHE=Path.home()/'.cache/lucid-audio-authoring'
RATE=44100
FONT_HASH='74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0'
spec=importlib.util.spec_from_file_location('cozy_reference_authoring',Path(__file__).with_name('reference_mixes.py'))
ref=importlib.util.module_from_spec(spec);spec.loader.exec_module(ref)

# Every theme is a complete phrase. Values are (beat, MIDI pitch, held beats).
# The three lo-fi tunes have deliberately different contours and pockets.
HONEY_A=[[(.5,74,.6),(1.5,77,.4),(2.25,74,.7),(3.25,72,.4)],
         [(0,70,1.5),(2.5,69,.5),(3.25,67,.5)],
         [(.5,75,.6),(1.5,79,.4),(2.25,75,.7),(3.25,74,.4)],
         [(0,72,1.6),(2.5,69,.55),(3.25,65,.5)],
         [(.5,74,.6),(1.5,77,.4),(2.25,74,.7),(3.25,72,.4)],
         [(.5,75,1.2),(2.25,74,.5),(3,72,.75)],
         [(0,69,.75),(1,67,.6),(2.5,65,1.1)],[(0,70,3.2)]]
HONEY_B=[[(.5,72,.6),(1.5,75,.4),(2.25,74,.7),(3.25,70,.4)],
         [(0,67,1.5),(2.5,70,.5),(3.25,74,.5)],
         [(.5,73,.6),(1.5,75,.4),(2.25,73,.7),(3.25,70,.4)],
         [(0,68,1.6),(2.5,65,1.0)],
         [(.5,72,.6),(1.5,75,.4),(2.25,74,.7),(3.25,72,.4)],
         [(0,69,1.5),(2.5,67,.6)],[(0,65,1.2),(2,69,1.2)],[(0,70,3.2)]]
HONEY_H=[(46,[57,60,62,65]),(43,[53,57,58,62]),(48,[55,58,62,63]),(41,[55,57,60,63]),
         (50,[58,62,65,69]),(39,[55,58,62,65]),(41,[55,57,60,63]),(46,[57,60,62,65])]
HONEY_K=[(39,[55,58,62,65]),(43,[53,57,58,62]),(39,[54,58,61,65]),(44,[55,60,63,68]),
         (48,[55,58,62,63]),(41,[55,57,60,63]),(41,[55,57,60,63]),(46,[57,60,62,65])]

BLUE_A=[[(0,74,.55),(.75,75,.32),(1.25,74,1.2),(3,70,.65)],
        [(.5,69,1.0),(2,67,1.6)],
        [(0,74,.55),(.75,75,.32),(1.25,74,1.2),(3,72,.65)],
        [(.5,70,1.0),(2,69,.65),(3,65,.65)],
        [(0,72,.55),(.75,74,.32),(1.25,75,1.2),(3,74,.65)],
        [(.5,72,1),(2,69,1.6)],
        [(0,70,1.1),(1.5,69,.65),(2.5,66,1)],[(0,67,3.2)]]
BLUE_B=[[(0,77,1.3),(1.75,74,.5),(2.75,72,.8)],
        [(.5,70,1.2),(2.5,74,.9)],
        [(0,75,1.3),(1.75,74,.5),(2.75,72,.8)],
        [(.5,69,1.2),(2.5,66,.9)],
        [(0,74,1.3),(1.75,72,.5),(2.75,70,.8)],
        [(.5,69,1.2),(2.5,67,.9)],
        [(0,66,1.2),(2,69,1.2)],[(0,67,3.2)]]
BLUE_H=[(43,[58,62,65,69]),(39,[55,58,62,65]),(45,[57,60,62,65]),(46,[57,62,65,69]),
        (48,[55,58,62,63]),(38,[54,60,63,69]),(38,[54,60,63,69]),(43,[55,58,62,65])]
BLUE_K=[(46,[57,62,65,69]),(39,[55,58,62,65]),(48,[55,58,62,63]),(38,[54,60,63,69]),
        (39,[55,58,62,65]),(36,[55,58,62,63]),(38,[54,60,63,69]),(43,[55,58,62,65])]

SUNDAY_A=[[(0,79,.45),(.75,76,.45),(1.5,74,.8),(3.25,71,.4)],
          [(.5,72,1.2),(2.25,71,.5),(3,67,.7)],
          [(0,76,.45),(.75,72,.45),(1.5,71,.8),(3.25,69,.4)],
          [(.5,75,1.2),(2.25,74,.5),(3,71,.7)],
          [(0,79,.45),(.75,76,.45),(1.5,74,.8),(3.25,71,.4)],
          [(.5,72,1.2),(2.25,76,.5),(3,74,.7)],
          [(0,72,.8),(1.5,69,.7),(2.75,75,.8)],[(0,76,3)]]
SUNDAY_B=[[(.25,76,1.2),(1.75,79,.5),(2.75,78,.8)],
          [(.25,76,1.2),(1.75,74,.5),(2.75,71,.8)],
          [(.25,74,1.2),(1.75,76,.5),(2.75,78,.8)],
          [(.25,75,1.2),(1.75,71,.5),(2.75,69,.8)],
          [(.25,72,1.2),(1.75,76,.5),(2.75,79,.8)],
          [(.25,78,1.2),(1.75,76,.5),(2.75,72,.8)],
          [(.25,75,1.2),(1.75,74,.5),(2.75,71,.8)],[(0,76,3)]]
SUNDAY_H=[(40,[55,59,62,66]),(36,[55,59,64,67]),(45,[55,59,60,64]),(35,[54,57,63,66]),
          (43,[55,59,62,64]),(36,[55,60,64,69]),(42,[57,60,64,66]),(40,[55,59,62,64])]
SUNDAY_K=[(45,[55,59,60,64]),(40,[55,59,62,66]),(42,[57,60,64,66]),(35,[54,57,63,66]),
          (36,[55,59,64,67]),(45,[55,59,60,64]),(35,[54,57,63,66]),(40,[55,59,62,64])]

SNOW_A=[[(0,76,1.75),(2.5,73,1.0)],[(1,71,2.2)],
        [(0,76,1.75),(2.5,75,1.0)],[(1,73,2.2)],
        [(0,78,1.75),(2.5,76,1.0)],[(1,73,1.5),(3,71,.7)],
        [(0,75,1.3),(2,73,1.2)],[(0,71,.9),(1.5,69,2.1)]]
SNOW_B=[[(0,73,1.75),(2.5,71,1.0)],[(1,68,2.2)],
        [(0,75,1.75),(2.5,73,1.0)],[(1,71,2.2)],
        [(0,76,1.75),(2.5,75,1.0)],[(1,73,2.2)],
        [(0,71,1.3),(2,68,1.2)],[(0,69,3.1)]]
SNOW_H=[(45,[57,61,64,68]),(44,[56,59,64,68]),(45,[59,63,66,71]),(49,[56,59,61,64]),
        (42,[57,61,64,68]),(44,[56,59,64,68]),(47,[59,63,66,68]),(45,[57,61,64,68])]
SNOW_K=[(42,[57,61,64,68]),(44,[56,59,64,68]),(47,[59,63,66,68]),(44,[56,59,64,68]),
        (49,[56,59,61,64]),(45,[59,63,66,71]),(44,[56,59,64,68]),(45,[57,61,64,68])]

MOSS_A=[[(.5,65,1.25),(2.5,69,.9)],[(.5,67,1.2),(2.5,64,1.0)],
        [(.5,65,1.25),(2.5,69,.9)],[(.5,71,1.2),(2.5,67,1.0)],
        [(.5,69,1.25),(2.5,65,.9)],[(.5,64,1.2),(2.5,62,1.0)],
        [(.5,64,1.1),(2,65,.65),(3,67,.6)],[(.5,62,2.9)]]
MOSS_B=[[(.5,69,1.25),(2.5,72,.9)],[(.5,71,1.2),(2.5,67,1.0)],
        [(.5,67,1.25),(2.5,71,.9)],[(.5,69,1.2),(2.5,64,1.0)],
        [(.5,65,1.25),(2.5,69,.9)],[(.5,67,1.2),(2.5,64,1.0)],
        [(.5,65,1.1),(2,64,.65),(3,60,.6)],[(.5,62,2.9)]]
MOSS_H=[(38,[53,57,60,64]),(43,[55,59,62,64]),(48,[55,59,62,64]),(45,[55,57,60,64]),
        (38,[53,57,60,64]),(43,[55,59,62,64]),(40,[55,59,62,65]),(38,[53,57,60,62])]
MOSS_K=[(41,[53,57,60,64]),(43,[55,59,62,64]),(40,[55,59,62,64]),(45,[55,57,60,64]),
        (38,[53,57,60,64]),(48,[55,59,62,64]),(48,[55,60,64,67]),(38,[53,57,60,62])]

QUIET_A=[[(.25,78,1.45),(2.5,75,.7),(3.5,73,.4)],[(.5,71,2.7)],
         [(.25,78,1.45),(2.5,80,.7),(3.5,78,.4)],[(.5,75,1.2),(2.5,73,1.0)],
         [(.25,78,1.45),(2.5,75,.7),(3.5,73,.4)],[(.5,76,1.2),(2.5,75,1.0)],
         [(.25,73,1.4),(2,70,1.2)],[(.5,71,2.7)]]
QUIET_B=[[(.25,76,1.45),(2.5,75,.7),(3.5,73,.4)],[(.5,75,2.7)],
         [(.25,73,1.45),(2.5,71,.7),(3.5,68,.4)],[(.5,70,1.2),(2.5,73,1.0)],
         [(.25,75,1.45),(2.5,73,.7),(3.5,71,.4)],[(.5,68,1.2),(2.5,66,1.0)],
         [(.25,70,1.4),(2,73,1.2)],[(.5,71,2.7)]]
QUIET_H=[(35,[54,58,61,63]),(44,[54,59,63,66]),(40,[56,59,63,66]),(42,[54,58,61,64]),
         (39,[54,58,59,63]),(37,[56,59,63,64]),(42,[54,58,61,64]),(35,[54,58,61,63])]
QUIET_K=[(40,[56,59,63,66]),(39,[54,58,59,63]),(37,[56,59,63,64]),(42,[54,58,61,64]),
         (44,[54,59,63,66]),(40,[56,59,63,66]),(42,[54,58,61,64]),(35,[54,58,61,63])]

MAPLE_A=[[(0,74,.55),(.75,79,.45),(1.5,78,.45),(2.25,74,.55)],
         [(0,76,.85),(1.5,74,.45),(2.25,71,.5)],
         [(0,74,.55),(.75,79,.45),(1.5,81,.45),(2.25,79,.55)],
         [(0,78,1.25),(1.75,74,.75)],
         [(0,76,.55),(.75,79,.45),(1.5,78,.45),(2.25,76,.55)],
         [(0,75,.85),(1.5,74,.45),(2.25,72,.5)],
         [(0,74,.75),(1,72,.5),(2,69,.75)],[(0,71,.8),(1.25,67,1.4)]]
MAPLE_B=[[(0,76,.85),(1.5,79,.45),(2.25,83,.5)],
         [(0,81,1.25),(1.75,79,.75)],
         [(0,78,.85),(1.5,76,.45),(2.25,74,.5)],
         [(0,73,1.25),(1.75,69,.75)],
         [(0,74,.85),(1.5,76,.45),(2.25,78,.5)],
         [(0,79,.85),(1.5,78,.45),(2.25,76,.5)],
         [(0,74,.75),(1,72,.5),(2,69,.75)],[(0,71,.8),(1.25,67,1.4)]]
MAPLE_H=[(43,[55,59,62]),(40,[55,59,62]),(48,[55,60,64]),(38,[54,60,62]),
         (48,[55,60,64]),(48,[55,60,63]),(38,[54,60,62]),(43,[55,59,62])]
MAPLE_K=[(48,[55,60,64]),(45,[55,60,64]),(38,[54,60,62]),(45,[55,61,64]),
         (38,[54,60,62]),(43,[55,59,62]),(38,[54,60,62]),(43,[55,59,62])]

SEA_A=[[(0,69,.7),(1,71,.45),(1.75,74,1.1),(3.25,73,.45)],
       [(.25,71,1.1),(1.75,69,.65),(3,66,.65)],
       [(0,67,.7),(1,69,.45),(1.75,71,1.1),(3.25,74,.45)],
       [(.25,73,1.1),(1.75,71,.65),(3,69,.65)],
       [(0,71,.7),(1,74,.45),(1.75,78,1.1),(3.25,76,.45)],
       [(.25,75,1.1),(1.75,74,.65),(3,70,.65)],
       [(0,69,.8),(1.25,66,.7),(2.5,64,1.0)],[(0,66,.8),(1.25,62,2.0)]]
SEA_B=[[(0,74,1.4),(2,71,.7),(3,67,.6)],
       [(.25,69,1.1),(1.75,71,.65),(3,74,.65)],
       [(0,76,1.4),(2,73,.7),(3,71,.6)],
       [(.25,69,1.1),(1.75,66,.65),(3,64,.65)],
       [(0,71,1.4),(2,74,.7),(3,76,.6)],
       [(.25,75,1.1),(1.75,74,.65),(3,70,.65)],
       [(0,69,.8),(1.25,67,.7),(2.5,64,1.0)],[(0,66,.8),(1.25,62,2.0)]]
SEA_H=[(38,[54,57,61,64]),(35,[54,57,61,64]),(40,[55,59,62,66]),(45,[55,59,61,66]),
       (43,[54,57,59,62]),(43,[55,58,62,63]),(42,[54,57,62,64]),(38,[54,57,61,64])]
SEA_K=[(43,[54,57,59,62]),(40,[55,59,62,66]),(45,[55,59,61,66]),(42,[54,57,62,64]),
       (43,[54,57,59,62]),(43,[55,58,62,63]),(45,[55,58,61,64]),(38,[54,57,61,64])]


def piece(ident,title,genre,bpm,key,mode,energy,period,meter,A,B,H,K,lead,comp,middle,motif,groove):
    return dict(id=ident,title=title,genre=genre,bpm=bpm,key=key,mode=mode,energy=energy,period=period,meter=meter,
                A=A,B=B,H=H,K=K,lead=lead,comp=comp,middle=middle,motif=motif,groove=groove)


PIECES=[
 piece('honeycomb-hours','Honeycomb Hours','lofi',76,10,'major',.27,'day',4,HONEY_A,HONEY_B,HONEY_H,HONEY_K,24,4,0,
       'D-F-D-C dotted turn, lower answer, borrowed Eb-minor middle and Bb close','laid back'),
 piece('blue-hour-bookshop','Blue Hour Bookshop','lofi',84,7,'minor',.34,'evening',4,BLUE_A,BLUE_B,BLUE_H,BLUE_K,26,0,4,
       'D-Eb-D neighbour, falling Bb-A-G answer and F#-G dominant resolution','halftime'),
 piece('sunday-signal','Sunday Signal','lofi',92,4,'minor',.39,'morning',4,SUNDAY_A,SUNDAY_B,SUNDAY_H,SUNDAY_K,11,4,24,
       'Syncopated G-E-D-B fall, repeated rhythm with an ascending B answer','broken bossa'),
 piece('snowglobe-orbit','Snowglobe Orbit','ambient',60,9,'lydian',.10,'night',4,SNOW_A,SNOW_B,SNOW_H,SNOW_K,4,46,0,
       'Long E-C#-B falling phrase, D# Lydian light and A resolution','open water'),
 piece('mosslight','Mosslight','ambient',62,2,'dorian',.17,'night',4,MOSS_A,MOSS_B,MOSS_H,MOSS_K,24,4,74,
       'F-A question, G-E answer, modal B expansion and D resting point','forest space'),
 piece('quiet-constellations','Quiet Constellations','ambient',70,11,'major',.20,'night',4,QUIET_A,QUIET_B,QUIET_H,QUIET_K,11,4,0,
       'Held F# and late D#-C# sigh, augmented lower piano answer and B close','bell space'),
 piece('maple-street-morning','Maple Street Morning','acoustic',94,7,'major',.36,'morning',3,MAPLE_A,MAPLE_B,MAPLE_H,MAPLE_K,12,24,0,
       'D-G-F#-D waltz turn, lyrical wider B and borrowed C-minor colour','waltz'),
 piece('seaside-post-office','Seaside Post Office','acoustic',86,2,'major',.42,'day',4,SEA_A,SEA_B,SEA_H,SEA_K,0,24,12,
       'A-B-D pickup and C# answer, wider G/F# arc, G-minor borrowing and D close','coastal bossa'),
]


def filt(audio,low=None,high=None):
    cut,kind=([low,high],'bandpass') if low and high else (low or high,'highpass' if low else 'lowpass')
    return sosfilt(butter(2,cut,fs=RATE,btype=kind,output='sos'),audio,axis=0).astype(np.float32)


class Score:
    def __init__(self,p,seed):
        self.p=p;self.beat=60/p['bpm'];self.meter=p['meter'];self.rng=np.random.default_rng(seed)
        if p['genre']=='ambient':form=[('first light',4),('the theme',8),('a different shore',8),('weightless',4),('homeward',8),('last light',4)]
        elif p['meter']==3:form=[('opening',4),('the theme',16),('a different shore',16),('weightless',8),('homeward',16),('last light',4)]
        else:form=[('opening',4),('the theme',16),('a different shore',8),('weightless',4),('homeward',16),('last light',4)]
        self.sections=[];bar=0
        for name,bars in form:
            self.sections.append(dict(name=name,bars=bars,bar=bar,start=bar*self.meter*self.beat,end=(bar+bars)*self.meter*self.beat));bar+=bars
        self.bars=bar;self.frames=round((bar*self.meter*self.beat+7)*RATE)
        self.notes={name:[] for name in ('lead','comp','middle','bass')}
        self.pads=np.zeros((self.frames,2),np.float32);self.pad_windows=[]
        self.percussion=CozyPercussion(self.frames,seed+177,CACHE/'vcsl-cozy') if p['genre']!='ambient' else None
    def note(self,role,pitch,at,held,velocity):
        onset=max(0,at*self.beat+float(self.rng.uniform(-.006,.007)))
        self.notes[role].append((onset,int(pitch),float(held)*self.beat,int(velocity)))
    def pad(self,pitches,at,seconds=2.9):
        t=np.arange(round(seconds*RATE),dtype=np.float64)/RATE
        env=np.sin(np.pi*t/seconds)**1.5
        sound=np.zeros((len(t),2),np.float32)
        for i,pitch in enumerate(pitches):
            hz=440*2**((pitch-69)/12);tone=(np.sin(2*np.pi*hz*t)+.035*np.sin(4*np.pi*hz*t))*env*.008
            pan=[-.25,.2,0][i%3]
            sound+=tone[:,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)])
        first=round(at*self.beat*RATE);n=min(len(sound),self.frames-first);self.pads[first:first+n]+=sound[:n]
        self.pad_windows.append(dict(start=at*self.beat,seconds=seconds,pitches=pitches))


def drums(score,section,i,at):
    p=score.p;kit=score.percussion;beat=score.beat;quiet=section in ('opening','weightless','last light')
    if section=='opening' and i<2 or section=='last light' and i>=2:return
    if p['meter']==3:
        kit.hit('kick',(at+.01)*beat,.075 if quiet else .11)
        if not quiet:
            kit.hit('snare',(at+1.025)*beat,.027)
            kit.hit('snare',(at+2.025)*beat,.023,throw=i%8==6)
            for pos in (.5,1.5,2.5):kit.hit('hat',(at+pos)*beat,.016)
        return
    if p['groove']=='halftime':
        kicks=[0,2.72] if i%2==0 else [0,1.78,3.52];snares=[2.035]
        hats=[0,.58,1,1.58,2,2.58,3,3.58]
    elif p['groove'] in ('broken bossa','coastal bossa'):
        kicks=[0,1.76,2.52] if i%2==0 else [0,2.76];snares=[1.05,3.05]
        hats=[.5,1.5,2.5,3.5]
    else:
        kicks=[0,2.56] if i%2==0 else [0,.81,2.76];snares=[1.055,3.055]
        hats=[0,.61,1,1.61,2,2.61,3,3.61]
    if quiet:kicks=[0];snares=[];hats=[.5,2.5] if i%2==0 else []
    for j,pos in enumerate(kicks):kit.hit('kick',(at+pos)*beat,(.10 if j==0 else .075)*(.75 if quiet else 1))
    for j,pos in enumerate(snares):kit.hit('snare',(at+pos)*beat,.051 if p['genre']=='lofi' else .034,accent=i%8==6 and j==1,throw=i%8==6 and j==1)
    for j,pos in enumerate(hats):kit.hit('hat',(at+pos)*beat,.017 if j%2 else .023)
    if not quiet and i%4==1:kit.hit('snare',(at+2.83)*beat,.015,pan=.12)


def compose(p,index):
    s=Score(p,63101+index*131);meter=p['meter'];ambient=p['genre']=='ambient'
    for sec in s.sections:
        name=sec['name'];quiet=name in ('opening','first light','weightless','last light')
        for i in range(sec['bars']):
            at=(sec['bar']+i)*meter;cycle=i%8
            contrast=name=='a different shore'
            root,voices=(p['K'] if contrast else p['H'])[cycle]
            ending=name=='last light' and i==sec['bars']-1
            if name=='last light' and not ending:root,voices=p['H'][4+i]
            if ending:root,voices=p['H'][7]
            if ambient:
                # Brief, exposed instrument gestures leave genuine gaps. The
                # separate pad is bounded; no continuous saw or noise is used.
                if name!='weightless' or i%2==0:
                    s.note('bass',root,at+.02,1.6,34 if quiet else 42)
                    s.note('comp',voices[0],at+.08,1.25,34 if quiet else 39)
                    s.note('comp',voices[2],at+1.8,1.2,29 if quiet else 34)
                if name not in ('weightless','last light') and i in (0,4):s.pad(voices[:3],at+.18,2.8 if i==0 else 3.15)
            else:
                s.note('bass',root,at+.015,1.1 if meter==3 else 1.5,53 if quiet else 63)
                if meter==3:
                    if not ending:
                        for pos in (1,2):
                            for j,pitch in enumerate(voices[1:]):s.note('comp',pitch,at+pos+j*.017,.48,41 if pos==1 else 36)
                else:
                    # Four-bar written comp pocket, below the principal tune.
                    pocket=[[(.04,1.5),(2.75,.6)],[(.55,1.65)],[(.06,1.35),(2.55,.7)],[(.65,1.65)]]
                    strokes=[(.08,2.2)] if quiet else pocket[i%4]
                    for pos,held in strokes:
                        for j,pitch in enumerate(voices):s.note('comp',pitch,at+pos+j*.018,held,43-j*2 if quiet else 50-j*2)
                    if not quiet and cycle!=7:s.note('bass',root+7,at+2.5,.75,48)
                drums(s,name,i,at)
            if name in ('the theme','homeward'):
                for k,(pos,pitch,held) in enumerate(p['A'][cycle]):
                    s.note('lead',pitch,at+pos,held,62+(3 if name=='homeward' else 0)-[0,5,2,6][k%4])
            elif contrast:
                # A related B phrase has its own bass/harmony. Instrument
                # transfer, longer answers and register changes clarify form.
                for k,(pos,pitch,held) in enumerate(p['B'][cycle]):
                    s.note('middle',pitch-(12 if ambient and p['middle']==0 else 0),at+pos,held,55-[0,4,2,5][k%4])
            elif name in ('opening','first light') and i in (0,2):
                for pos,pitch,held in p['A'][0 if i==0 else 1][:1]:s.note('lead',pitch,at+pos,min(held,1.6),43)
            elif name=='weightless' and i in (0,2,4,6):
                source=p['A'][(i//2)%4][0]
                s.note('middle',source[1]-(12 if p['middle']==0 else 0),at+.5,min(2.2,meter-1),43)
            elif name=='last light':
                source=p['A'][4+i] if i<3 else [(0,(p['key']+60),meter+.6)]
                if i<3:
                    pos,pitch,held=source[0];s.note('lead',pitch,at+pos,min(held,1.9),49-i*3)
                else:
                    tonic=p['key']+60
                    s.note('lead',tonic,at+.15,meter+.3,45)
            if ending:
                # Per-pitch gate ownership below ensures earlier accompaniment
                # cannot choke this sustained final chord. The bass retains
                # its earlier tonic entry instead of being struck twice.
                final=at+meter*.55
                for j,pitch in enumerate(voices[:3]):s.note('comp',pitch,final+j*.035,meter*.85,32-j*2)
    return s


def safe_sampled(notes,frames,program,pan):
    # Per-pitch gate ownership for keys/plucks. Bell parts use independent
    # undamped voices instead, retaining their natural long releases.
    ordered=sorted(notes);following={};fixed=[]
    for at,pitch,held,velocity in reversed(ordered):
        if pitch in following:held=min(held,max(.025,following[pitch]-at-.012))
        following[pitch]=at;fixed.append((at,pitch,held,velocity))
    return ref.sampled_instrument(list(reversed(fixed)),frames,program,pan)


def render(s):
    p=s.p;ambient=p['genre']=='ambient';mixed=s.pads.copy();levels={}
    programs={'lead':p['lead'],'comp':p['comp'],'middle':p['middle'],'bass':32 if not ambient else 4}
    for name,program in programs.items():
        notes=s.notes[name]
        if not notes:continue
        print('  sampled',name,program,len(notes),'notes',flush=True)
        audio=ref.sampled_bell_strikes(notes,s.frames,.12) if program==11 else safe_sampled(notes,s.frames,program,{'lead':.12,'comp':-.22,'middle':-.1,'bass':0}[name])
        audio=filt(audio,low=35 if name=='bass' else 110 if name=='comp' else 160,high=3100 if ambient else 5200 if name=='lead' else 4200)
        target={'lead':.033 if ambient else .039,'comp':.023 if ambient else .029,'middle':.029 if ambient else .034,'bass':.027 if ambient else .036}[name]
        audio=ref.scale_stem(audio,target)
        cap={'lead':.15,'comp':.12,'middle':.14,'bass':.15}[name]
        audio*=min(1,cap/max(float(np.abs(audio).max()),1e-9))
        role='bass' if name=='bass' else 'lead' if name in ('lead','middle') else 'keys'
        produced=process_stem(audio,RATE,role,room='none' if name=='bass' else 'chamber' if ambient else 'small',send=.14 if ambient else .08)
        if name in ('lead','middle') and ambient:
            delayed=filt(audio,low=550,high=3300)
            for beats,gain in [(.75,.065),(1.5,.027)]:
                shift=round(beats*s.beat*RATE);produced[shift:]+=delayed[:-shift,::-1]*gain
        mixed+=produced
        levels[name]=dict(program=program,notes=len(notes),wholeStemActiveRMSTarget=target,peakCeiling=cap)
        del audio,produced
    if s.percussion is not None:mixed+=s.percussion.mix(s.beat)
    mixed=center_low_end(filt(mixed,low=28),RATE,155)
    # Static gain after measuring the performance preserves its section arc.
    # Output true-peak headroom is checked after the MP3 encode as well.
    mixed*=min(1,.65/max(float(np.abs(mixed).max()),1e-9))
    attack=round(.08*RATE);mixed[:attack]*=np.linspace(0,1,attack)[:,None]
    active=np.flatnonzero(np.any(np.abs(mixed)>10**(-70/20),axis=1))
    mixed=mixed[:min(len(mixed),active[-1]+round(.26*RATE))].copy()
    n=round(.04*RATE);mixed[-n:]*=np.linspace(1,0,n)[:,None]
    return mixed,levels


def loudness(path):
    proc=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af','loudnorm=I=-20:TP=-3.8:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    return json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}',proc.stderr)[0])


def export(s,audio,levels):
    p=s.p;destination=OUT/(p['id']+'.mp3')
    with tempfile.TemporaryDirectory(prefix='lucid-cozy-expansion-') as temp:
        wav=Path(temp)/'master.wav'
        def write():
            with wave.open(str(wav),'wb') as stream:
                stream.setnchannels(2);stream.setsampwidth(2);stream.setframerate(RATE)
                stream.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
        write();initial=loudness(wav)
        gain=min(-20.5-float(initial['input_i']),-3.9-float(initial['input_tp']))
        audio*=10**(gain/20);write()
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','192k','-metadata','artist=Lucid','-metadata','title='+p['title'],'-metadata','genre='+p['genre'],str(destination)],check=True)
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(destination),'-ac','2','-ar',str(RATE),'-f','f32le','-'])
    decoded=np.frombuffer(raw,dtype='<f4').reshape(-1,2);measured=loudness(destination)
    live=np.flatnonzero(np.any(np.abs(decoded)>=10**(-65/20),axis=1))
    lead=live[0]/RATE;tail=(len(decoded)-live[-1]-1)/RATE;peak=float(measured['input_tp']);integrated=float(measured['input_i'])
    assert np.isfinite(decoded).all() and peak<=-2.7,(p['id'],peak)
    assert lead<.5 and tail<.65,(p['id'],lead,tail)
    assert -22.0<=integrated<=-16.0,(p['id'],integrated)
    corr=float(np.corrcoef(decoded.T)[0,1]);dc=float(np.abs(decoded.mean(axis=0)).max())
    assert corr>-.1 and dc<.002,(p['id'],corr,dc)
    assert len(decoded)/RATE>=100
    meta={k:v for k,v in p.items() if k not in ('A','B','H','K','lead','comp','middle','motif','groove')}
    tags=['sampled electric piano' if p['comp']==4 else 'sampled nylon guitar' if p['comp']==24 else 'sampled piano' if p['comp']==0 else 'sampled harp',
          'vibraphone bells' if p['lead']==11 else 'sampled nylon guitar' if p['lead']==24 else 'sampled guitar' if p['lead']==26 else 'sampled marimba' if p['lead']==12 else 'sampled electric piano' if p['lead']==4 else 'sampled piano']
    if p['genre']=='ambient':tags.append('brief sine pads')
    else:tags.extend(['sampled upright bass','recorded acoustic drums'])
    meta.update(revision=1,textures=tags,seconds=len(decoded)/RATE,peakDbFS=float(20*np.log10(np.abs(audio).max())),rmsDbFS=float(20*np.log10(np.sqrt(np.mean(audio.astype(np.float64)**2)))),
                sections=[{**sec,'instruments':list(levels),'rmsDbFS':float(20*np.log10(max(1e-12,np.sqrt(np.mean(decoded[round(sec['start']*RATE):min(len(decoded),round(sec['end']*RATE))].astype(np.float64)**2)))))} for sec in s.sections],
                composition=dict(motif=p['motif'],themeBars=8,theme=p['A'],relatedTheme=p['B'],harmony=p['H'],contrastingHarmony=p['K'],groove=p['groove'],
                                 form='Hint, full theme, related contrasting phrase, exposed fragments, recognisable return and tonic cadence',randomMelody=False),
                sampledParts=levels,padBreaths=s.pad_windows,
                decoded=dict(channels=2,sampleRate=RATE,finite=True,integratedLUFS=integrated,truePeakDbFS=peak,loudnessRangeLU=float(measured['input_lra']),channelCorrelation=corr,dcOffset=dc,leadingQuietSeconds=lead,trailingSilenceSeconds=tail),
                sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
                provenance=dict(soundfont=dict(name='FluidR3 GM',license='MIT',sha256=FONT_HASH,licenseFile='docs/licenses/FluidR3-GM.txt'),
                                rendering='FluidSynth dry sampled instruments, Pedalboard filtered room sends; independent vibraphone voices',
                                pads='Explicit bounded sine fundamental plus second harmonic at .035, no saw/unison/noise',
                                percussion=s.percussion.provenance() if s.percussion else None,referenceAudioCopied=False,auditionPerformed=False))
    print(json.dumps({k:meta[k] for k in ('id','seconds','decoded','sha256')}),flush=True)
    return meta


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',choices=[p['id'] for p in PIECES])
    parser.add_argument('--soundfont',type=Path,default=os.environ.get('FLUID_SOUNDFONT') or CACHE/'fluidr3/usr/share/sounds/sf2/FluidR3_GM.sf2')
    args=parser.parse_args();font=Path(args.soundfont)
    assert hashlib.sha256(font.read_bytes()).hexdigest()==FONT_HASH
    ref.SF=font
    output=OUT/'cozy-expansion-metrics.json'
    existing={row['id']:row for row in json.loads(output.read_text())} if output.exists() else {}
    for i,p in enumerate(PIECES):
        if args.only and args.only!=p['id']:continue
        print('Composing',p['title'],flush=True)
        score=compose(p,i);audio,levels=render(score);existing[p['id']]=export(score,audio,levels)
        output.write_text(json.dumps([existing[p['id']] for p in PIECES if p['id'] in existing],indent=2)+'\n')
        del score,audio
    print('Finished cozy expansion; existing music targets were not rendered.',flush=True)


if __name__=='__main__':main()
