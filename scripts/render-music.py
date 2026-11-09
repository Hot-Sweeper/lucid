"""Render Lucid songs from scripts/lucid_music/songs/*.py.

python scripts/render-music.py rain_on_the_tram [--preview 40] [--png] [--install]
Outputs WAV/MP3 to ~/.cache/lucid-audio-authoring/renders; --install copies the
MP3 into src/assets/audio. Offline authoring only.
"""
import argparse
import importlib
import json
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from lucid_music import fx, parts
from lucid_music.sampler import SR

ROOT = Path(__file__).resolve().parents[1]
OUT = Path.home() / '.cache/lucid-audio-authoring/renders'


def spectrogram(mix, path, title):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    m = mix.mean(axis=1)
    fig, ax = plt.subplots(2, 1, figsize=(14, 6), gridspec_kw=dict(height_ratios=[3, 1]))
    ax[0].specgram(m, NFFT=4096, Fs=SR, noverlap=2048, cmap='magma', vmin=-120, vmax=-20, scale='dB')
    ax[0].set_yscale('symlog', linthresh=200); ax[0].set_ylim(30, 18000); ax[0].set_title(title)
    hop = SR // 4
    rms = [20 * np.log10(np.sqrt(np.mean(m[i:i + hop] ** 2)) + 1e-9) for i in range(0, len(m), hop)]
    ax[1].plot(np.arange(len(rms)) / 4, rms); ax[1].set_ylim(-60, -5); ax[1].grid(alpha=.3)
    fig.tight_layout(); fig.savefig(path, dpi=70); plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('songs', nargs='+')
    ap.add_argument('--preview', type=float)
    ap.add_argument('--png', action='store_true')
    ap.add_argument('--install', action='store_true')
    args = ap.parse_args()
    for name in args.songs:
        t0 = time.time()
        mod = importlib.import_module(f'lucid_music.songs.{name}')
        song = mod.build()
        wav, report, mix = song.render(OUT, preview=args.preview)
        mp3 = OUT / f'{song.id}.mp3'
        song.encode(wav, mp3)
        meta = song.catalog_row() | dict(seconds=round(len(mix) / SR, 3), lufs=round(float(fx.loudness(mix)), 2),
                                         truePeak=round(float(fx.true_peak_db(mix)), 2), tracks=report)
        (OUT / f'{song.id}.json').write_text(json.dumps(meta, indent=1))
        if args.png:
            spectrogram(mix, OUT / f'{song.id}.png', f'{song.title} ({song.genre}, {song.bpm} BPM)')
        print(f'{song.id}: {meta["seconds"]:.1f}s, {meta["lufs"]} LUFS, TP {meta["truePeak"]} dB, {time.time() - t0:.0f}s render')
        for r in report:
            print(f'   {r["track"]:<16} peak {r["peak"]:<8} rms {r["rms"]}')
        if args.install:
            shutil.copy(mp3, ROOT / 'src/assets/audio' / f'{song.id}.mp3')


if __name__ == '__main__':
    main()
