"""Original analog patches rendered offline through Surge XT 1.3.4 + Pedalboard.

This uses the actual open-source Surge DSP, not a hand-written imitation. No
factory presets, wavetables or sampled material are loaded. The supplied plugin
and optional Surge resources are authoring dependencies only; Lucid ships MP3s.

SURGE_VST3 must point to the portable Surge XT.vst3 directory. For this session:
/tmp/lucid-surge/extracted/usr/lib/vst3/Surge XT.vst3
Portable SurgeXTUserData/SurgeXTData folders should sit in its ancestor tree.

Primary documentation and implementation:
https://surge-synthesizer.github.io/manual-xt/ (Classic oscillator/filter/envelopes)
https://github.com/surge-synthesizer/surge/tree/release_xt_1.3.4 (GPL-3.0-only)
https://spotify.github.io/pedalboard/reference/pedalboard.html (MIDI instrument rendering)
"""
from pathlib import Path
import hashlib
import os
import re
import numpy as np
from pedalboard import load_plugin

SURGE_PACKAGE = {
    'name':'Surge XT', 'engineVersion':'1.3.4', 'packageVersion':'1.3.4-7',
    'license':'GPL-3.0-only', 'authoringOnly':True,
    'officialSource':'https://github.com/surge-synthesizer/surge/tree/release_xt_1.3.4',
    'licenseSource':'https://github.com/surge-synthesizer/surge/blob/release_xt_1.3.4/LICENSE',
    'packageURL':'https://geo.mirror.pkgbuild.com/extra/os/x86_64/surge-xt-vst3-1.3.4-7-x86_64.pkg.tar.zst',
    'packageSHA256':'7a6acb25b31e640483474ff297b6c97c922f122cbc0d902b139f1ac01dfc45f4',
    'testedBinarySHA256':'04d8a5d1eb095946d479bca4d97615b0b91d4beb7145464d8daaf17ee05e8d35',
    'factoryPresetsUsed':False, 'factorySamplesUsed':False,
}


def authoring_provenance(plugin_path=None):
    path=Path(plugin_path or os.environ.get('SURGE_VST3','/tmp/lucid-surge/extracted/usr/lib/vst3/Surge XT.vst3'))
    binary=path/'Contents/x86_64-linux/Surge XT.so'
    actual=hashlib.sha256(binary.read_bytes()).hexdigest()
    return dict(SURGE_PACKAGE,binarySHA256=actual,
                verifiedTestedBinary=actual==SURGE_PACKAGE['testedBinarySHA256'])

PATCHES = {
    'lead': dict(shape=0,second_shape=-90,second_volume=-12,voices='2 voices',detune=7,
                 cutoff=2600,resonance=13,attack=.008,decay=.45,sustain=67,release=.23,
                 filter_attack=.004,filter_decay=.48,filter_sustain=15,filter_amount=19,drift=3.5,width=82),
    'pad': dict(shape=64,second_shape=-58,second_volume=-11,voices='3 voices',detune=8,
                cutoff=1900,resonance=9,attack=.65,decay=2.6,sustain=73,release=1.75,
                filter_attack=1.8,filter_decay=3.6,filter_sustain=48,filter_amount=10,drift=4.5,width=94),
    'atmosphere': dict(shape=34,second_shape=-72,second_volume=-14,voices='3 voices',detune=9,
                cutoff=1250,resonance=8,attack=1.2,decay=3.5,sustain=70,release=2.8,
                filter_attack=2.4,filter_decay=5.0,filter_sustain=45,filter_amount=13,drift=5,width=98),
    'arp': dict(shape=-35,second_shape=None,second_volume=-48,voices='1 voice',detune=0,
                cutoff=3500,resonance=16,attack=.004,decay=.17,sustain=8,release=.075,
                filter_attack=.004,filter_decay=.13,filter_sustain=0,filter_amount=16,drift=2,width=68),
    'bass': dict(shape=0,second_shape=-100,second_volume=-16,voices='1 voice',detune=0,
                cutoff=650,resonance=12,attack=.004,decay=.19,sustain=36,release=.095,
                filter_attack=.004,filter_decay=.15,filter_sustain=0,filter_amount=20,drift=1,width=0),
}


def _closest_string(plugin, name, value, unit):
    choices = plugin.parameters[name].valid_values
    def number(text):
        match = re.match(r'([-+\d.]+)', text)
        if not match:
            return float('inf')
        x = float(match[1])
        if unit == 'seconds':
            return x / 1000 if 'ms' in text else x
        return x
    selected = min(choices, key=lambda text: abs(number(text)-value))
    setattr(plugin, name, selected)
    return selected


def original_patch(role='lead', plugin_path=None):
    """Return a fresh native synth with an explicit own analog patch and settings."""
    if role not in PATCHES:
        raise ValueError(f'Choose one of {list(PATCHES)}.')
    path = Path(plugin_path or os.environ.get('SURGE_VST3', '/tmp/lucid-surge/extracted/usr/lib/vst3/Surge XT.vst3'))
    if not path.is_dir():
        raise FileNotFoundError('Set SURGE_VST3 to the portable Surge XT.vst3 plugin directory.')
    plugin = load_plugin(str(path))
    cfg = PATCHES[role]
    settings = {'scene_mode':'Single','active_scene':0.0,'global_volume':0.0,
                'a_play_mode':'Poly','polyphony_limit':32 if role in ('pad','atmosphere') else 16,
                'a_osc_1_type':'Classic','a_osc_1_shape':cfg['shape'],
                'a_osc_1_unison_voices':cfg['voices'],'a_osc_1_mute':False,
                'a_osc_2_type':'Classic','a_osc_2_mute':cfg['second_shape'] is None,
                'a_osc_3_mute':True,
                # Native stereo unison requires Wide, as documented by Surge.
                # Serial configurations deliberately remain mono for the bass
                # and centered lead instead of pretending width is active.
                'a_filter_configuration':'Wide' if role in ('pad','atmosphere') else 'Serial 1',
                'a_osc_1_route':'Both','a_osc_2_route':'Both','a_feedback':0,
                'a_filter_1_type':'LP Vintage Ladder','a_filter_2_type':'Off',
                'a_filter_1_cutoff':cfg['cutoff'],'a_filter_1_resonance':cfg['resonance'],
                'a_amp_eg_sustain':cfg['sustain'],'a_filter_eg_sustain':cfg['filter_sustain'],
                'a_osc_drift':cfg['drift'],'a_width':cfg['width'],
                # Initialized Surge has velocity sensitivity disabled. Enable
                # the real VCA response so authored note levels affect touch.
                'a_velocity_vca_gain':-18,
                'a_amp_eg_envelope_mode':'Analog','a_filter_eg_envelope_mode':'Analog'}
    if cfg['second_shape'] is not None:
        settings.update(a_osc_2_shape=cfg['second_shape'], a_osc_2_volume=cfg['second_volume'])
    for name,value in settings.items():
        setattr(plugin,name,value)
    # Time and detune are string-labelled VST parameters. Select the nearest real
    # value, rather than guessing a normalized setting or silently ignoring it.
    for field,value in [('a_amp_eg_attack',cfg['attack']),('a_amp_eg_decay',cfg['decay']),
                        ('a_amp_eg_release',cfg['release']),('a_filter_eg_attack',cfg['filter_attack']),
                        ('a_filter_eg_decay',cfg['filter_decay']),('a_filter_eg_release',cfg['release'])]:
        settings[field]=_closest_string(plugin,field,value,'seconds')
    settings['a_osc_1_unison_detune']=_closest_string(plugin,'a_osc_1_unison_detune',cfg['detune'],'cents')
    settings['a_filter_1_feg_mod_amount']=_closest_string(plugin,'a_filter_1_feg_mod_amount',cfg['filter_amount'],'semitones')
    if role=='bass':
        plugin.a_osc_1_sub_mix=28
        settings['a_osc_1_sub_mix']=28
    return plugin, settings


def render_surge_part(events, bpm, frames, role='lead', sample_rate=44100,
                      gain=.35, plugin_path=None):
    """Render score events with beat/pitch/held/level into frame×2 float32 audio.

    Each part is a fresh instrument. A complete timeline avoids resetting the
    oscillator/filter on every note. Velocity carries the authored level; no
    random melody, preset, quantization or loudness normalization is introduced.
    Scores must allocate their intended release tail in frames.
    """
    plugin, settings = original_patch(role,plugin_path)
    beat = 60/bpm; duration = frames/sample_rate
    notes=[]
    for event in events:
        at=float(event['beat'])*beat; end=at+float(event['held'])*beat
        pitch=int(event['pitch']); level=float(event.get('level',.08))
        if not 0<=pitch<=127 or not np.isfinite([at,end,level]).all() or level<0:
            raise ValueError('Invalid score event.')
        if end<=0 or at>=duration or level==0:
            continue
        notes.append((max(0,at),min(duration-.001,max(max(0,at)+.008,end)),pitch,level))
    if role in ('pad','atmosphere'):
        # Tie common tones across overlapping chord events instead of cutting a
        # new note with the older note-off on the same MIDI pitch.
        tied=[]
        for pitch in sorted({n[2] for n in notes}):
            line=sorted((n for n in notes if n[2]==pitch))
            merged=[]
            for note in line:
                if merged and note[0]<=merged[-1][1]:
                    old=merged[-1];merged[-1]=(old[0],max(old[1],note[1]),pitch,max(old[3],note[3]))
                else:merged.append(note)
            tied.extend(merged)
        notes=tied
    midi=[]
    for at,end,pitch,level in notes:
        velocity=max(1,min(120,round(85*np.sqrt(level/.10))))
        midi.append((bytes([0x90,pitch,velocity]),at))
        midi.append((bytes([0x80,pitch,0]),end))
    midi.sort(key=lambda item:(item[1],item[0][0]))
    data=plugin(midi,duration=duration,sample_rate=sample_rate,num_channels=2,buffer_size=8192,reset=True)
    if data.shape!=(2,frames) or not np.isfinite(data).all():
        raise RuntimeError('Unexpected native instrument output.')
    data=np.ascontiguousarray(data.T*gain,dtype=np.float32)
    if role=='bass':
        mono=data.mean(axis=1);data[:,0]=mono;data[:,1]=mono
    return data, dict(engine='Surge XT 1.3.4 native VST3 through Pedalboard 0.9.26',
                     patch=role,settings=settings,events=len(notes),factoryPreset=False)


def smoke_check():
    notes=[dict(beat=0,pitch=60,held=1.2,level=.09),dict(beat=1.5,pitch=67,held=1,level=.07)]
    for role in PATCHES:
        data,meta=render_surge_part(notes,90,44100*4,role)
        assert data.shape==(44100*4,2) and np.isfinite(data).all()
        rms=float(np.sqrt(np.mean(data**2)))
        assert rms>.0001,role+' is silent'
        print(role,'peak',round(float(np.abs(data).max()),5),'rms',round(rms,5),flush=True)
    print('PASS: native Surge own-patch MIDI rendering, nonzero finite stereo; no GUI, factory preset or sample bank.')


if __name__=='__main__':smoke_check()
