"""Measure encoded masters, verify musical gaps/headroom and sync playback trims.

Offline authoring/check: Python + numpy and ffmpeg. --write updates the catalogue's
actual durations and gainDb, plus a reproducible measurement report. No audio is
changed: gainDb is a constant playback trim, not compression or re-encoding.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import re
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT/'src/assets/audio'
CATALOG = ROOT/'src/office/soundtrack.ts'
RATE = 44100
TARGET = -20.0


def measure(ident):
    path = AUDIO/f'{ident}.opus'
    raw = subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ar',str(RATE),'-ac','2','-f','f32le','-'])
    pcm = np.frombuffer(raw,dtype='<f4').reshape(-1,2)
    assert np.isfinite(pcm).all(), f'{ident}: non-finite samples'
    loud = subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af',
        'loudnorm=I=-20:TP=-2.5:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    result = json.JSONDecoder().raw_decode(loud.stderr[loud.stderr.rfind('{'):])[0]
    integrated, peak = float(result['input_i']), float(result['input_tp'])
    assert math.isfinite(integrated) and math.isfinite(peak)
    active = np.flatnonzero(np.any(np.abs(pcm)>=10**(-65/20),axis=1))
    assert len(active), f'{ident}: empty master'
    lead = active[0]/RATE
    tail = (len(pcm)-1-active[-1])/RATE
    # End guards concern real silence, not soft sustained notes or intentional rests.
    assert lead <= .5, f'{ident}: {lead:.3f}s dead air before the first note'
    assert tail <= .65, f'{ident}: {tail:.3f}s dead air after the natural release'
    assert peak <= -2.7, f'{ident}: insufficient encoded true-peak headroom'
    assert np.max(np.abs(np.mean(pcm,axis=0))) < .002, f'{ident}: excessive DC'
    gain = round(min(2.0, -2.5-peak, max(-4.0,TARGET-integrated)),2)
    assert abs(integrated+gain-TARGET)<=.25, f'{ident}: perceived level outside target'
    assert peak+gain<=-2.49, f'{ident}: playback gain exhausts headroom'
    correlation = float(np.corrcoef(pcm.T)[0,1])
    assert correlation > -.10, f'{ident}: inspect antiphase cancellation'
    return dict(id=ident,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),seconds=len(pcm)/RATE,integratedLUFS=integrated,
                truePeakDbTP=peak,gainDb=gain,effectiveLUFS=round(integrated+gain,2),
                leadingQuietSeconds=round(float(lead),4),trailingQuietSeconds=round(float(tail),4),
                stereoCorrelation=round(correlation,5),dcOffset=float(np.max(np.abs(np.mean(pcm,axis=0)))),finite=True)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--write',action='store_true');args=parser.parse_args()
    source=CATALOG.read_text();ids=re.findall(r"  \{ id: '([a-z0-9-]+)'",source)
    report=[measure(ident) for ident in ids]
    for row in report:
        pattern=r"(  \{ id: '"+row['id']+r"'.*?)( \},)"
        match=re.search(pattern,source);assert match
        value=re.sub(r'seconds: [\d.]+',f"seconds: {row['seconds']:.4f}",match[1])
        value=re.sub(r', gainDb: -?[\d.]+','',value)+f", gainDb: {row['gainDb']:.2f}"
        if args.write: source=source[:match.start()]+value+match[2]+source[match.end():]
        else:
            seconds=float(re.search(r'seconds: ([\d.]+)',match[1])[1])
            gain=float(re.search(r'gainDb: (-?[\d.]+)',match[1])[1])
            assert abs(seconds-row['seconds'])<.03, row['id']+': stale duration'
            assert abs(gain-row['gainDb'])<.05, row['id']+': stale loudness trim'
        print(f"{row['id']}: {row['seconds']:.2f}s, {row['integratedLUFS']:.2f} LUFS, trim {row['gainDb']:+.2f}dB, tail {row['trailingQuietSeconds']:.3f}s",flush=True)
    if args.write:
        CATALOG.write_text(source)
        (AUDIO/'library-mastering.json').write_text(json.dumps(dict(targetLUFS=TARGET,quietThresholdDbFS=-65,tracks=report),indent=2)+'\n')
    print(f'PASS: {len(report)} encoded masters, finite stereo, measured loudness trims, headroom, DC and end gaps. Not a subjective listening test.')

if __name__=='__main__':main()
