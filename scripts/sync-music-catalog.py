"""Install rendered songs into Lucid and regenerate the catalog.

The 14 original cozy recordings keep their rows untouched. Every song module in
scripts/lucid_music/songs/ is installed from its latest render
(~/.cache/lucid-audio-authoring/renders/<id>.mp3 + .json). Afterwards run
`python scripts/verify-music-masters.py --write` to measure durations and
playback trims from the encoded files.
"""
from pathlib import Path
import importlib
import json
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
AUDIO = ROOT / 'src/assets/audio'
CATALOG = ROOT / 'src/office/soundtrack.ts'
RENDERS = Path.home() / '.cache/lucid-audio-authoring/renders'
ORIGINALS = ['little-lights', 'window-garden', 'first-coffee', 'paper-kites', 'peach-parade', 'apricot-hour',
             'tram-home', 'moonlit-desks', 'sleepy-satellites', 'pocket-sunrise', 'cloud-arcade',
             'velvet-elevator', 'lantern-carousel', 'the-last-constellation']
GENRE_ORDER = ['ambient', 'lofi', 'jazz', 'phonk', 'synthwave', 'breakcore']


def camel(ident):
    head, *rest = ident.split('-')
    name = head + ''.join(w.capitalize() for w in rest)
    return name if not name[0].isdigit() else 'song' + name


def main():
    source = CATALOG.read_text()
    imports = [l for l in source.splitlines() if l.startswith('import ') and 'soundtrack-queue' not in l]
    rows = re.findall(r"^  \{ id: '([a-z0-9-]+)'.*$", source, re.M)
    keep_rows = {i: re.search(r"^  \{ id: '" + i + r"'.*$", source, re.M)[0] for i in rows if i in ORIGINALS}
    assert list(keep_rows) == ORIGINALS, 'original rows changed'
    keep_imports = [l for l in imports if any(f"/{i}.mp3'" in l for i in ORIGINALS)]

    songs = []
    for f in sorted((ROOT / 'scripts/lucid_music/songs').glob('[a-z]*.py')):
        meta = json.loads((RENDERS / f'{f.stem.replace("_", "-")}.json').read_text())
        assert meta['id'] == f.stem.replace('_', '-'), f
        songs.append((f.stem, meta))
    songs.sort(key=lambda x: (GENRE_ORDER.index(x[1]['genre']), x[1]['energy'], x[1]['id']))

    new_imports, new_rows, provenance = [], [], []
    for module, m in songs:
        shutil.copy(RENDERS / f'{m["id"]}.mp3', AUDIO / f'{m["id"]}.mp3')
        var = camel(m['id'])
        new_imports.append(f"import {var} from '../assets/audio/{m['id']}.mp3';")
        new_rows.append(
            f"  {{ id: '{m['id']}', title: {json.dumps(m['title'])}, url: {var}, period: '{m['period']}', "
            f"bpm: {m['bpm']}, genre: '{m['genre']}', energy: {m['energy']}, seconds: {m['seconds']:.4f}, "
            f"key: {m['key']}, mode: '{m['mode']}', meter: {m['meter']}, textures: {json.dumps(m['textures'])}, gainDb: 0.00 }},")
        provenance.append(dict(id=m['id'], title=m['title'], genre=m['genre'], bpm=m['bpm'],
                               source=f'scripts/lucid_music/songs/{module}.py', sections=m.get('sections', []),
                               renderLUFS=m['lufs'], renderTruePeak=m['truePeak'],
                               tracks=[dict(name=t['track'], kind=t['kind'], items=t['items']) for t in m['tracks']]))

    head = '\n'.join(keep_imports + new_imports) + "\nimport type { SoundtrackSong } from './soundtrack-queue';\n\n"
    body = 'export const SOUNDTRACK: readonly SoundtrackSong[] = [\n' + '\n'.join(
        [keep_rows[i] for i in ORIGINALS] + new_rows) + '\n];\n'
    CATALOG.write_text(head + body)
    (AUDIO / 'library-songs.json').write_text(json.dumps(dict(
        engine='scripts/lucid_music (sampled instruments, Surge XT patches, offline mastering)',
        libraries=['jRhodes3d (Jeff Learman, free use)', 'Salamander Grand Piano V3 (Alexander Holm, CC-BY 3.0)',
                   'Karoryfer Sneakybass (CC0)', 'Greg Sullivan E-Pianos', 'Virtuosity Drums (CC0)',
                   'VCSL vibraphone, harp, claps (CC0)', 'Karoryfer x Bigcat cello (CC0)', 'Surge XT 1.3.4 factory and third-party patches (GPL-3.0)'],
        songs=provenance), indent=1) + '\n')
    print(f'{len(ORIGINALS)} originals + {len(new_rows)} new songs written to {CATALOG.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
