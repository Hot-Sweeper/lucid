"""Merge the current authored render reports into canonical catalogue metadata.

Run after all render jobs complete, then verify-music-masters.py --write. The
latter measures actual encoded duration and loudness; this only handles musical
identity. Render-specific detail remains in its provenance report.
"""
from pathlib import Path
import json
import re

ROOT=Path(__file__).resolve().parents[1]
AUDIO=ROOT/'src/assets/audio'
CATALOG=ROOT/'src/office/soundtrack.ts'
BASE_ORDER=['cassette-clouds','neon-afterglow','tidal-memory','petal-breaks','midnight-drift']


def main():
    genre={row['id']:row for row in json.loads((AUDIO/'genre-metrics.json').read_text())}
    for name in ['reference-mix-metrics.json','surge-mix-metrics.json']:
        path=AUDIO/name
        if not path.exists():raise FileNotFoundError(f'Finish the {name} render before synchronizing.')
        data=json.loads(path.read_text())
        for row in data if isinstance(data,list) else data['tracks']:
            assert row['id'] in BASE_ORDER
            genre[row['id']]=row
    assert set(genre)==set(BASE_ORDER)
    (AUDIO/'genre-metrics.json').write_text(json.dumps([genre[ident] for ident in BASE_ORDER],indent=2)+'\n')
    rows=list(genre.values())+json.loads((AUDIO/'story-metrics.json').read_text())
    source=CATALOG.read_text()
    for row in rows:
        raw=' '.join(row['textures']).lower();tags=[]
        for key,aliases in [('pads',['pad','drone']),('bells',['bell','vibraphone','pitched metal']),('piano',['piano','keys','rhodes','electric']),('strings',['string','cello','pizzicato']),('plucked',['plucked','harp','lute','guitar','pizzicato']),('reeds',['woodwind','reed','clarinet']),('breaks',['break']),('bass',['bass','sub','808']),('synth',['analog','arpeggio','surge','synth']),('drums',['drum','hat','percussion','snare','cymbal']),('cowbell',['cowbell'])]:
            if any(word in raw for word in aliases):tags.append(key)
        values={key:row[key] for key in ['bpm','genre','energy','key','mode','meter']}
        values['textures']=tags
        match=re.search(r"(  \{ id: '"+row['id']+r"'.*?)( \},)",source);assert match,row['id']
        text=match[1]
        for key,value in values.items():
            encoded="'"+value+"'" if isinstance(value,str) else json.dumps(value)
            text,n=re.subn(key+r': (?:\[[^\]]*\]|\x27[^\x27]*\x27|[-\d.]+)',key+': '+encoded,text)
            assert n==1,(row['id'],key)
        source=source[:match.start()]+text+match[2]+source[match.end():]
    for row in json.loads((AUDIO/'soundtrack-metrics.json').read_text()):
        if not sum(row.get('percussion',{}).get('hitCounts',{}).values()):continue
        match=re.search(r"(  \{ id: '"+row['id']+r"'.*?)( \},)",source);assert match,row['id']
        tags_match=re.search(r'textures: (\[[^\]]*\])',match[1]);assert tags_match
        tags=json.loads(tags_match[1])
        if 'drums' not in tags:tags.append('drums')
        line=match[1][:tags_match.start(1)]+json.dumps(tags)+match[1][tags_match.end(1):]
        source=source[:match.start()]+line+match[2]+source[match.end():]
    CATALOG.write_text(source)
    print('Synced current musical identities and recorded percussion tags; now run verify-music-masters.py --write for encoded duration and playback trims.')

if __name__=='__main__':main()
