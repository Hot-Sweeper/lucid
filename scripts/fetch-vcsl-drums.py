"""Fetch the pinned CC0 drum hits used to author Petal Breaks.

The source WAVs are an offline authoring input, not an application dependency.
Run: python scripts/fetch-vcsl-drums.py --output-dir /tmp/lucid-vcsl-drums
Then pass that directory to compose-office-playlist.py or compose-office-encore.py with --sample-dir.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse
import hashlib
import json
import urllib.request


MANIFEST = Path(__file__).with_name('assets') / 'vcsl-drums.json'


def fetch(destination):
    manifest = json.loads(MANIFEST.read_text())
    assert manifest['license'] == 'CC0-1.0'
    destination.mkdir(parents=True, exist_ok=True)

    def retrieve(entry):
        filename = entry['file']
        if Path(filename).name != filename:
            raise ValueError('Sample filenames must remain within the output directory.')
        target = destination / filename
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == entry['sha256']:
            return
        with urllib.request.urlopen(entry['url'], timeout=45) as response:
            data = response.read()
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError(f'Pinned sample verification failed: {filename}')
        temporary = target.with_suffix('.download')
        temporary.write_bytes(data)
        temporary.replace(target)

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(retrieve, manifest['files']))
    commit = manifest['commit']
    for filename in ['LICENSE', 'README.md']:
        url = f'https://raw.githubusercontent.com/sgossner/VCSL/{commit}/{filename}'
        with urllib.request.urlopen(url, timeout=45) as response:
            data = response.read()
        if filename == 'LICENSE' and hashlib.sha256(data).hexdigest() != manifest['licenseSha256']:
            raise ValueError('Pinned CC0 license verification failed.')
        (destination / filename).write_bytes(data)
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f"Verified {len(manifest['files'])} CC0 samples, {sum(f['bytes'] for f in manifest['files']):,} bytes, VCSL {commit}.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, required=True)
    fetch(parser.parse_args().output_dir)
