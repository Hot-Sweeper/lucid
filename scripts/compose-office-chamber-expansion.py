"""Eight new authored Lucid chamber scores, using the existing acoustic renderer.

Offline only: numpy/scipy, Pedalboard, FluidSynth, FFmpeg and verified MIT
FluidR3 GM. Every title owns its written theme, harmony and form. This script
only writes these eight additions and chamber-expansion-metrics.json, never an
earlier master. No artist recording, reference melody or factory loop is used.
"""
from pathlib import Path
import argparse
import gc
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

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'src/assets/audio'
RATE=44100
FONT_HASH='74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0'
spec=importlib.util.spec_from_file_location('lucid_chamber_renderer',Path(__file__).with_name('compose-office-stories.py'))
chamber=importlib.util.module_from_spec(spec)
spec.loader.exec_module(chamber)

# Each bar is a written phrase fragment: (beat, absolute MIDI pitch, held beats).
# Pitches are never chosen from a random pool or by indexing the current chord.
MOTH_A=[[(.5,74,1.5),(2.5,70,.8)],[(.25,69,2.6)],
        [(.5,74,1.5),(2.5,76,.8)],[(.25,72,1.3),(2,69,.8)],
        [(.5,77,1.5),(2.5,74,.8)],[(.25,72,1.3),(2,70,.8)],
        [(.5,69,1),(2,72,.8),(3,69,.6)],[(.25,67,3)]]
MOTH_B=[[(.5,67,1.5),(2.5,69,.8)],[(.25,70,2.6)],
        [(.5,67,1.5),(2.5,72,.8)],[(.25,69,2.6)],
        [(.5,74,1.5),(2.5,72,.8)],[(.25,70,1.3),(2,69,.8)],
        [(.5,72,1),(2,69,.8)],[(.25,67,3)]]
MOTH_H=[(43,[58,62,65]),(41,[57,60,65]),(48,[55,60,64]),(45,[55,60,64]),
        (46,[53,58,62]),(48,[55,58,64]),(45,[53,60,65]),(43,[58,62,67])]
MOTH_J=[(46,[53,58,62]),(48,[55,58,64]),(43,[58,62,65]),(41,[57,60,65]),
        (48,[55,58,64]),(46,[53,58,62]),(41,[57,60,65]),(43,[58,62,67])]

AMBER_A=[[(0,76,1.8),(2.5,74,.5),(3.25,76,.4)],[(.5,79,1.2),(2,78,.8),(3,76,.7)],
         [(0,76,1.8),(2.5,74,.5),(3.25,72,.4)],[(.5,74,2.6)],
         [(0,81,1.8),(2.5,79,.5),(3.25,78,.4)],[(.5,76,1.2),(2,74,.8),(3,72,.7)],
         [(0,74,1.8),(2.5,71,.7)],[(.5,72,2.8)]]
AMBER_B=[[(0,72,1.8),(2.5,74,.5),(3.25,76,.4)],[(.5,74,1.2),(2,71,.8),(3,67,.7)],
         [(0,69,1.8),(2.5,72,.5),(3.25,74,.4)],[(.5,71,2.6)],
         [(0,74,1.8),(2.5,76,.5),(3.25,78,.4)],[(.5,79,1.2),(2,76,.8),(3,74,.7)],
         [(0,71,1.8),(2.5,74,.7)],[(.5,72,2.8)]]
AMBER_H=[(48,[55,59,64]),(42,[57,62,66]),(40,[55,59,62]),(43,[55,59,62]),
         (45,[55,60,64]),(50,[57,60,66]),(47,[55,62,64]),(48,[55,59,64])]
AMBER_J=[(45,[55,60,64]),(43,[55,59,62]),(42,[57,62,66]),(40,[55,59,62]),
         (50,[57,60,66]),(43,[55,59,62]),(47,[55,62,64]),(48,[55,59,64])]

FOX_A=[[(0,76,.45),(.75,74,.35),(1.5,72,.8),(2.5,69,.3)],[(0,71,1.4),(2,72,.7)],
       [(0,76,.45),(.75,74,.35),(1.5,72,.8),(2.5,76,.3)],[(0,74,1.4),(2,71,.7)],
       [(0,79,.45),(.75,76,.35),(1.5,74,.8),(2.5,72,.3)],[(0,74,1.4),(2,72,.7)],
       [(0,71,.7),(1,67,.7),(2,71,.7)],[(0,69,2.5)]]
FOX_B=[[(0,72,.45),(.75,74,.35),(1.5,76,.8),(2.5,79,.3)],[(0,78,1.4),(2,76,.7)],
       [(0,74,.45),(.75,76,.35),(1.5,78,.8),(2.5,76,.3)],[(0,74,1.4),(2,71,.7)],
       [(0,72,.45),(.75,76,.35),(1.5,79,.8),(2.5,76,.3)],[(0,74,1.4),(2,71,.7)],
       [(0,67,.7),(1,71,.7),(2,74,.7)],[(0,69,2.5)]]
FOX_H=[(45,[57,60,64]),(48,[55,60,64]),(45,[57,60,64]),(43,[55,59,62]),
       (48,[55,60,64]),(50,[57,62,66]),(43,[55,59,62]),(45,[57,60,64])]
FOX_J=[(48,[55,60,64]),(50,[57,62,66]),(47,[54,59,62]),(43,[55,59,62]),
       (48,[55,60,64]),(50,[57,62,66]),(43,[55,59,62]),(45,[57,60,64])]

WILLOW_A=[[(.5,72,1),(2,69,.65)],[(0,70,.65),(1,72,.65),(2,77,.7)],
          [(.5,76,1),(2,72,.65)],[(0,74,1.5),(2,72,.7)],
          [(.5,69,1),(2,72,.65)],[(0,70,.65),(1,69,.65),(2,67,.7)],
          [(0,67,.65),(1,64,.65),(2,67,.7)],[(0,65,2.5)]]
WILLOW_B=[[(.5,77,1),(2,76,.65)],[(0,74,.65),(1,72,.65),(2,69,.7)],
          [(.5,74,1),(2,77,.65)],[(0,76,1.5),(2,72,.7)],
          [(.5,74,1),(2,72,.65)],[(0,70,.65),(1,69,.65),(2,67,.7)],
          [(0,69,.65),(1,67,.65),(2,64,.7)],[(0,65,2.5)]]
WILLOW_H=[(41,[53,57,60]),(46,[53,58,62]),(45,[53,57,60]),(43,[53,58,62]),
          (41,[53,57,60]),(46,[53,58,62]),(48,[52,55,58]),(41,[53,57,60])]
WILLOW_J=[(50,[53,57,62]),(46,[53,58,62]),(43,[53,58,62]),(45,[53,57,60]),
          (46,[53,58,62]),(43,[53,58,62]),(48,[52,55,58]),(41,[53,57,60])]

VELVET_A=[[(.5,67,.6),(1.67,70,.3),(2.5,73,.25),(2.83,74,.8)],
          [(.33,72,.5),(1.67,70,.4),(2.5,69,1.1)],
          [(.5,67,.6),(1.67,70,.3),(2.5,74,.9)],[(.33,73,.3),(1,74,.6),(2,66,1.5)],
          [(.5,70,1.25),(2,74,.5),(3,77,.6)],[(.33,76,.3),(1,75,.8),(2.5,72,1.1)],
          [(.5,69,.6),(1.67,66,.3),(2.5,69,.9)],[(.33,67,2.9)]]
VELVET_B=[[(.5,75,1.25),(2,74,.5),(3,70,.6)],[(.33,74,1.25),(2,72,.5),(3,70,.6)],
          [(.5,72,1.25),(2,70,.5),(3,67,.6)],[(.33,69,1.25),(2,66,.5),(3,69,.6)],
          [(.5,70,1.25),(2,74,.5),(3,77,.6)],[(.33,75,1.25),(2,72,.5),(3,70,.6)],
          [(.5,69,1.25),(2,66,1.2)],[(.33,67,2.9)]]
VELVET_H=[(43,[58,62,65]),(41,[57,63,67]),(43,[58,62,65]),(38,[54,60,64]),
          (46,[57,62,65]),(48,[55,58,63]),(38,[54,60,64]),(43,[58,62,65])]
VELVET_J=[(51,[55,58,62]),(46,[53,58,62]),(48,[55,58,63]),(38,[54,60,64]),
          (43,[58,62,65]),(48,[55,58,63]),(38,[54,60,64]),(43,[58,62,65])]

BAKER_A=[[ (.5,66,.35),(1,69,.35),(1.5,71,.9)],[(0,74,.9),(1.25,73,.4),(2,71,.7)],
         [(.5,66,.35),(1,69,.35),(1.5,71,.9)],[(0,73,.9),(1.25,70,.4),(2,66,.7)],
         [(.5,74,.35),(1,76,.35),(1.5,78,.9)],[(0,76,.9),(1.25,74,.4),(2,73,.7)],
         [(0,70,.6),(1,73,.6),(2,70,.6)],[(0,71,2.5)]]
BAKER_B=[[(0,74,1.3),(1.5,71,.4),(2,67,.7)],[(.5,66,1.2),(2,64,.7)],
         [(0,71,1.3),(1.5,73,.4),(2,74,.7)],[(.5,73,1.2),(2,70,.7)],
         [(0,74,1.3),(1.5,76,.4),(2,78,.7)],[(.5,76,1.2),(2,73,.7)],
         [(0,70,.6),(1,73,.6),(2,70,.6)],[(0,71,2.5)]]
BAKER_H=[(47,[54,59,62]),(43,[55,59,62]),(47,[54,59,62]),(42,[54,58,61]),
         (50,[57,62,66]),(40,[55,59,64]),(42,[58,61,64]),(47,[54,59,62])]
BAKER_J=[(43,[55,59,62]),(40,[55,59,64]),(47,[54,59,62]),(42,[54,58,61]),
         (50,[57,62,66]),(40,[55,59,64]),(42,[58,61,64]),(47,[54,59,62])]

SUNDAY_A=[[(0,66,.75),(1,67,.4),(1.5,69,1),(3,74,.7)],[(0,73,1.5),(2,71,.75),(3,69,.7)],
          [(0,66,.75),(1,67,.4),(1.5,69,1),(3,71,.7)],[(0,73,2.5),(3,69,.7)],
          [(0,74,.75),(1,73,.4),(1.5,71,1),(3,69,.7)],[(0,71,1.5),(2,69,.75),(3,67,.7)],
          [(0,66,.75),(1,64,.4),(1.5,61,1),(3,64,.7)],[(0,62,3.3)]]
SUNDAY_B=[[(0,69,.75),(1,71,.4),(1.5,73,1),(3,76,.7)],[(0,74,1.5),(2,73,.75),(3,71,.7)],
          [(0,67,.75),(1,69,.4),(1.5,71,1),(3,74,.7)],[(0,73,2.5),(3,69,.7)],
          [(0,71,.75),(1,69,.4),(1.5,67,1),(3,66,.7)],[(0,67,1.5),(2,66,.75),(3,64,.7)],
          [(0,64,.75),(1,61,.4),(1.5,64,1),(3,69,.7)],[(0,62,3.3)]]
SUNDAY_H=[(38,[50,54,57]),(35,[50,54,59]),(31,[47,50,55]),(33,[49,52,55]),
          (43,[47,50,55]),(40,[47,50,55]),(45,[49,52,55]),(38,[50,54,57])]
SUNDAY_J=[(42,[49,54,57]),(35,[50,54,59]),(43,[47,50,55]),(33,[49,52,55]),
          (35,[50,54,59]),(43,[47,50,55]),(45,[49,52,55]),(38,[50,54,57])]

SEPT_A=[[(0,75,.6),(1,74,.6),(2,67,.7)],[(0,68,1.3),(1.5,70,.4),(2,72,.7)],
        [(0,75,.6),(1,74,.6),(2,70,.7)],[(0,69,.4),(.75,70,1.8)],
        [(0,72,.6),(1,75,.6),(2,79,.7)],[(0,77,1.3),(1.5,75,.4),(2,72,.7)],
        [(0,74,.6),(1,72,.6),(2,70,.7)],[(0,75,2.5)]]
SEPT_B=[[(0,72,.6),(1,75,.6),(2,77,.7)],[(0,74,1.3),(1.5,72,.4),(2,70,.7)],
        [(0,72,.6),(1,75,.6),(2,77,.7)],[(0,71,2.5)],
        [(0,70,.6),(1,67,.6),(2,65,.7)],[(0,68,1.3),(1.5,67,.4),(2,65,.7)],
        [(0,65,.6),(1,62,.6),(2,65,.7)],[(0,63,2.5)]]
SEPT_H=[(39,[55,58,62]),(44,[56,60,63]),(43,[55,58,62]),(41,[53,58,62]),
        (48,[55,58,63]),(41,[56,60,65]),(46,[56,62,65]),(39,[55,58,63])]
SEPT_J=[(41,[56,60,63]),(46,[55,58,62]),(44,[56,60,63]),(44,[56,59,63]),
        (46,[55,58,63]),(41,[56,60,65]),(46,[56,62,65]),(39,[55,58,63])]

PIECES=[
 dict(id='mothlight-atlas',title='Mothlight Atlas',genre='mystical',bpm=70,meter=4,key=7,mode='dorian',energy=.20,period='night',
      textures=['pads','bells','strings','plucked','reeds'],A=MOTH_A,B=MOTH_B,H=MOTH_H,J=MOTH_J,lead='celesta',answer='recorder',tonic=67,
      form=[('folded wings',4),('mothlight theme',8),('turning the atlas',8),('ink constellations',8),('the map returns',8),('last lantern',4)],
      idea='Held D-Bb sigh and long A answer; the return lifts D to the Dorian E before coming home to G'),
 dict(id='the-amber-archive',title='The Amber Archive',genre='mystical',bpm=76,meter=4,key=0,mode='lydian',energy=.25,period='night',
      textures=['pads','piano','plucked','strings'],A=AMBER_A,B=AMBER_B,H=AMBER_H,J=AMBER_J,lead='harp',answer='feltpiano',tonic=72,
      form=[('the amber door',4),('light through resin',8),('a page unfolds',8),('suspended dust',8),('the archive glows',8),('the door rests',4)],
      idea='Long E with two short answering notes; F# resolves through E over a separate D chord, preserving C Lydian colour'),
 dict(id='foxglove-crossing',title='Foxglove Crossing',genre='medieval',bpm=96,meter=3,key=9,mode='dorian',energy=.38,period='morning',
      textures=['plucked','reeds','strings'],A=FOX_A,B=FOX_B,H=FOX_H,J=FOX_J,lead='recorder',answer='harp',tonic=69,
      form=[('the footbridge',4),('foxglove dance',16),('across the meadow',16),('the river listens',8),('footsteps return',16),('the far bank',4)],
      idea='Falling E-D-C turn and a two-note answer; brighter B strain reveals Dorian F# over D major'),
 dict(id='the-willow-court',title='The Willow Court',genre='medieval',bpm=84,meter=3,key=5,mode='major',energy=.32,period='morning',
      textures=['plucked','reeds','strings'],A=WILLOW_A,B=WILLOW_B,H=WILLOW_H,J=WILLOW_J,lead='harp',answer='recorder',tonic=65,
      form=[('beneath the branches',4),('a courtly invitation',16),('the answering bow',16),('a quiet pavilion',8),('the court returns',16),('the final bow',4)],
      idea='Offbeat C-A invitation, rising Bb-C-F reply; the second strain reaches F and resolves through a written C7 cadence'),
 dict(id='the-velvet-alibi',title='The Velvet Alibi',genre='noir',bpm=108,meter=4,key=7,mode='minor',energy=.46,period='evening',
      textures=['reeds','piano','plucked','bass'],A=VELVET_A,B=VELVET_B,H=VELVET_H,J=VELVET_J,lead='clarinet',answer='feltpiano',tonic=67,
      form=[('a chair in the corner',4),('the alibi',16),('a different account',8),('the room goes quiet',8),('the story repeats',16),('the door clicks shut',4)],
      idea='Swinging G-Bb rise with a quick Db-to-D blues inflection; a lyrical B strain returns to F#-G dominant resolution'),
 dict(id='clocks-on-baker-street',title='Clocks on Baker Street',genre='noir',bpm=100,meter=3,key=11,mode='minor',energy=.42,period='evening',
      textures=['plucked','reeds','piano','bass'],A=BAKER_A,B=BAKER_B,H=BAKER_H,J=BAKER_J,lead='pizz',answer='clarinet',tonic=71,
      form=[('one clock behind',4),('the clockwork clue',16),('the hour unravels',8),('an empty staircase',8),('the clocks agree',16),('the final chime',4)],
      idea='Offbeat F#-A-B three-note pickup on plucked strings; legato answer reveals the same cadence, with A# resolving to B'),
 dict(id='sunday-at-the-station',title='Sunday at the Station',genre='nostalgic',bpm=84,meter=4,key=2,mode='major',energy=.30,period='evening',
      textures=['piano','strings'],A=SUNDAY_A,B=SUNDAY_B,H=SUNDAY_H,J=SUNDAY_J,lead='feltpiano',answer='cello',tonic=62,
      form=[('an empty platform',4),('the familiar train',8),('a distant passenger',8),('the timetable fades',8),('home on sunday',16),('the last carriage',4)],
      idea='F#-G-A turn opens toward D, then a long C# answers; the lower cello development shares the same breath and closes C#-D'),
 dict(id='september-letters',title='September Letters',genre='nostalgic',bpm=72,meter=3,key=3,mode='major',energy=.23,period='evening',
      textures=['piano','strings'],A=SEPT_A,B=SEPT_B,H=SEPT_H,J=SEPT_J,lead='feltpiano',answer='cello',tonic=75,
      form=[('the envelope',4),('a september letter',8),('the remembered address',8),('an unspoken line',8),('reading it again',16),('the letter folded',4)],
      idea='Eb-D fall leaps down to G before an Ab-Bb-C answer; a supported borrowed Ab-minor chord gives the middle its Cb colour'),
]


def render(piece):
    s=chamber.Score(piece['bpm'],piece['meter'],piece['form'],seed=37001+PIECES.index(piece)*137,tail=7)
    m=piece['meter'];family=piece['genre'];first,main,answer,quiet,reprise,coda=[name for name,_ in piece['form']]
    for sec,i,b in s.each():
        at=b*m;index=i%8;is_answer=sec==answer;hush=sec in (first,quiet,coda)
        root,chord=(piece['J'] if is_answer or sec==quiet else piece['H'])[index]
        last_coda=sec==coda and i==3
        if sec==coda:root,chord=piece['H'][6 if i in (0,2) else 7]
        if family=='mystical':
            # Quiet low sustained support, one upper voice. The hush contains
            # actual rests in the lead, with short voiced swells below it.
            for k,n in enumerate(chord):s.note(n,at+.045*k,3.3,'auralpad',.016 if hush else .022,(k-1)*.35)
            if i%2==0 or last_coda:s.note(root,at+.03,3.35,'cello',.025 if hush else .037,-.14)
        elif family=='medieval':
            s.note(root,at,.8,'lute',.10 if hush else .145,-.17)
            if not hush:
                for pos in (1,2):
                    for n in chord[1:]:s.note(n,at+pos,.40,'lute',.058 if pos==1 else .047,.12)
            elif i%2==0:
                s.note(piece['H'][7][0]-12,at,5.4,'strings',.021,-.15)
                s.note(piece['H'][7][1][0],at+.05,5.35,'strings',.014,.18)
        elif family=='noir':
            # Acoustic plucked bass and clipped piano leave room for the clue.
            # Four-beat lounge swing and three-beat clockwork are separate grooves.
            s.note(root-12,at,.64,'basspluck',.095 if hush else .14,-.05)
            positions=(.67,2.67) if m==4 else (1,2)
            for pos in positions:
                for n in chord:s.note(n,at+pos,.30,'feltpiano',.033 if hush else .049,-.14)
            if not hush and m==4:
                s.note(root-5,at+2,.55,'basspluck',.070,-.05)
        else:
            # All accompanying keys stay below the piano melody. Cello gets
            # the theme alone in B; it is never doubled by a competing lead.
            s.note(root,at,2.65 if m==4 else 2.25,'feltpiano',.085 if hush else .105,-.10)
            for k,n in enumerate(chord):
                # Reserve the final high tonic for the melody/cadence below.
                if last_coda and n==piece['tonic']:continue
                s.note(n,at+.05+k*.035,2.25 if m==4 else 1.95,'feltpiano',.032 if hush else .041,-.13)
            if sec==reprise and i>=8 and i%4==0:
                for k,n in enumerate(chord[:2]):s.note(n,at+.08,3.4 if m==4 else 2.5,'strings',.014,(k*2-1)*.2)
        if sec in (main,reprise):
            level={'celesta':.072,'harp':.125,'recorder':.073,'clarinet':.088,'pizz':.155,'feltpiano':.132}[piece['lead']]
            if sec==reprise:level*=1.055
            s.melody(piece['A'],index,at,piece['lead'],level,.10,echo=.10 if piece['lead']=='celesta' else 0)
        elif sec==answer:
            kind=piece['answer'];level={'recorder':.068,'feltpiano':.132,'harp':.14,'clarinet':.080,'cello':.080}[kind]
            octave=-12 if kind=='cello' else 0
            s.melody(piece['B'],index,at,kind,level,-.10,octave=octave)
        elif sec==first:
            # Two opening notes seed the full theme; the introduction does not
            # reveal a second unrelated tune before the theme arrives.
            if i in (0,2):
                pos,pitch,held=piece['A'][0 if i==0 else 1][0]
                kind='harp' if family=='mystical' else piece['lead']
                s.note(pitch,at+.05 if i==0 else at+pos,min(held,1.3),kind,.067 if kind!='pizz' else .11,.08)
        elif sec==quiet:
            # The same opening material is augmented, with no overlapping lead.
            if i in (0,2,4,6):
                line=piece['B'][i][0]
                kind='harp' if family in ('mystical','medieval') else 'cello' if family=='nostalgic' else 'feltpiano'
                pitch=line[1]-12 if family=='nostalgic' else line[1]
                s.note(pitch,at+.35,min(m-.65,line[2]*1.5),kind,.078 if kind=='harp' else .065 if kind=='cello' else .09,-.08)
        elif sec==coda:
            if i==0:
                for pos,pitch,held in piece['A'][6]:
                    s.note(pitch,at+pos,min(held,.9),piece['lead'],.060 if piece['lead'] not in ('pizz','feltpiano','harp') else .10,.08)
            if last_coda:
                # A single tonic attack owns the last bar. There is no second
                # strike of the same piano pitch that could choke its hold.
                s.note(piece['tonic'],at+.05,m+.65,piece['lead'],.063 if piece['lead'] not in ('pizz','feltpiano','harp') else .10,.08)
                if family in ('mystical','medieval'):s.note(root,at+.02,m+1,'harp',.066,-.10)
    s.composition=dict(themeBars=8,themeMIDI=piece['A'],answerMIDI=piece['B'],
        harmonyA=piece['H'],harmonyB=piece['J'],idea=piece['idea'],
        form=[{'name':n,'bars':bars} for n,bars in piece['form']],
        writing='Original complete phrases, repeated identifying contour and rhythm, related answer, augmented middle, recognizable reprise and tonic cadence',
        foreground='One primary line; counter-activity is limited to sparse accompaniment in a separate register',
        pitchSelection='Explicit authored note tables; randomness affects only subtle timing and performance gain, never pitch')
    return s,s.finish([],10500 if family!='mystical' else 7800)


def loudness(path):
    result=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af',
        'loudnorm=I=-20:TP=-3.8:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    return json.JSONDecoder().raw_decode(result.stderr[result.stderr.rfind('{'):])[0]


def export(piece,score,song,font):
    assert np.isfinite(song).all()
    row={k:v for k,v in piece.items() if k not in ('A','B','H','J','form','lead','answer','tonic','idea')}
    destination=OUT/(piece['id']+'.mp3')
    with tempfile.TemporaryDirectory(prefix='lucid-chamber-addition-') as temp:
        source=Path(temp)/'performance.wav'
        def write():
            with wave.open(str(source),'wb') as output:
                output.setnchannels(2);output.setsampwidth(2);output.setframerate(RATE)
                output.writeframes((np.clip(song,-1,1)*32767).astype('<i2').tobytes())
        write();initial=loudness(source)
        gain=min(-20-float(initial['input_i']),-3.8-float(initial['input_tp']))
        song*=10**(gain/20);write()
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-c:a','libmp3lame','-b:a','192k',
                        '-metadata','artist=Lucid','-metadata','title='+piece['title'],'-metadata','genre='+piece['genre'],str(destination)],check=True)
    decoded=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(destination),'-ar',str(RATE),'-ac','2','-f','f32le','-']),dtype='<f4').reshape(-1,2)
    measures=loudness(destination)
    assert np.isfinite(decoded).all() and len(decoded)/RATE>=100
    active=np.flatnonzero(np.any(np.abs(decoded)>=10**(-65/20),axis=1));assert len(active)
    leading=active[0]/RATE;trailing=(len(decoded)-1-active[-1])/RATE
    assert leading<=.5 and trailing<=.65,(piece['id'],leading,trailing)
    assert float(measures['input_tp'])<=-2.7,measures
    assert -22<=float(measures['input_i'])<=-16.0,measures
    dc=float(np.max(np.abs(np.mean(decoded,axis=0))));corr=float(np.corrcoef(decoded.T)[0,1])
    assert dc<.002 and corr>-.1
    row.update(seconds=len(decoded)/RATE,revision=1,composition=score.composition,noteEvents=len(score.events),
               peakDbFS=float(20*np.log10(np.max(np.abs(decoded)))),rmsDbFS=float(20*np.log10(np.sqrt(np.mean(decoded.astype(np.float64)**2)))),
               sections=[{**section,'rmsDbFS':float(20*np.log10(max(1e-12,np.sqrt(np.mean(decoded[round(section['start']*RATE):min(len(decoded),round(section['end']*RATE))].astype(np.float64)**2)))))} for section in score.sections],
               decoded=dict(seconds=len(decoded)/RATE,finite=True,integratedLUFS=float(measures['input_i']),truePeakDbFS=float(measures['input_tp']),
                            loudnessRangeLU=float(measures['input_lra']),leadingQuietSeconds=leading,trailingQuietSeconds=trailing,
                            channelCorrelation=corr,dcOffset=dc),
               gainDb=round(-20-float(measures['input_i']),2),sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
               ending='Written tonic cadence, independently released acoustic notes and natural room tail, short quiet guard',
               sources=dict(soundfont=dict(name='FluidR3 GM',license='MIT',sha256=hashlib.sha256(font.read_bytes()).hexdigest(),
                            licenseSource='https://sources.debian.org/src/fluid-soundfont/3.1-5.3/COPYING/'),
                            instrumentPrograms={kind:chamber.GM[kind] for kind in sorted({e['instrument'] for e in score.events if e['instrument'] in chamber.GM})}),
               production='Offline FluidSynth sampled performance; authored bow/breath CC11 and key velocities; role EQ and filtered chamber room through Pedalboard',
               provenance=dict(artistAudioCopied=False,auditionPerformed=False,existingMastersModified=False))
    if any(e['instrument']=='celesta' for e in score.events):
        row['bellArticulation']=dict(independentOneShotSeconds=5.0,earlyBodyPreservedSeconds=.35,terminalTaperSeconds=.50)
    print(json.dumps({k:row[k] for k in ('id','seconds','sha256','decoded')}),flush=True)
    return row


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',choices=[p['id'] for p in PIECES])
    parser.add_argument('--soundfont',type=Path,default=os.environ.get('FLUID_SOUNDFONT') or Path.home()/'.cache/lucid-audio-authoring/fluidr3/usr/share/sounds/sf2/FluidR3_GM.sf2')
    args=parser.parse_args();font=Path(args.soundfont)
    assert font.is_file() and hashlib.sha256(font.read_bytes()).hexdigest()==FONT_HASH,'Use the verified MIT FluidR3 bank.'
    chamber.SOUNDFONT=font;chamber.SOUNDFONT_HASH=FONT_HASH
    report=OUT/'chamber-expansion-metrics.json';prior={r['id']:r for r in json.loads(report.read_text())} if report.exists() else {}
    for piece in PIECES:
        if args.only and piece['id']!=args.only:continue
        print('Rendering '+piece['title'],flush=True)
        score,song=render(piece);prior[piece['id']]=export(piece,score,song,font)
        report.write_text(json.dumps([prior[p['id']] for p in PIECES if p['id'] in prior],indent=2)+'\n')
        del score,song;gc.collect()


if __name__=='__main__':main()
