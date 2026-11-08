"""Remove proven dead MP3 tail packets from Lucid's thirteen legacy additions.

Offline authoring: Python + numpy and ffmpeg/ffprobe. No samples are re-encoded,
normalized, faded, shifted or synthesized. Every retained decoded sample must be
bit-identical to its source prefix before the candidate can replace an asset.
Run after compose-office-playlist.py / compose-office-encore.py regenerate them.
Backups go outside the checkout, to /tmp/lucid-legacy-before by default.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/assets/audio'
RATE = 44100
# Deliberately excludes Little Lights, room air and every newer genre/story file.
IDS = ('window-garden', 'first-coffee', 'paper-kites', 'peach-parade',
       'apricot-hour', 'tram-home', 'moonlit-desks', 'sleepy-satellites',
       'pocket-sunrise', 'cloud-arcade', 'velvet-elevator', 'lantern-carousel',
       'the-last-constellation')
THRESHOLD_DB = -65
MINIMUM_QUIET_TAIL = .6
KEEP_QUIET_SECONDS = .20


def run(*args):
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          check=True).stdout


def decode(file):
    raw = run('ffmpeg', '-v', 'error', '-i', str(file), '-ar', str(RATE),
              '-ac', '2', '-f', 'f32le', '-')
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2)


def db(value):
    return float(20 * math.log10(max(float(value), 1e-12)))


def inspect(file, pcm):
    assert len(pcm) > RATE * 90 and np.isfinite(pcm).all(), f'Invalid audio: {file}'
    peak = float(np.max(np.abs(pcm)))
    assert peak < .95, f'Clipped audio: {file}'
    seconds = len(pcm) / RATE
    probe = json.loads(run('ffprobe', '-v', 'error', '-show_entries',
                           'format=duration', '-of', 'json', str(file)))
    silence = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(file),
                              '-af', f'silencedetect=noise={THRESHOLD_DB}dB:d=0.05',
                              '-f', 'null', '-'], stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, check=True).stderr
    starts = [float(n) for n in re.findall(r'silence_start: ([\d.]+)', silence)]
    ends = [float(n) for n in re.findall(r'silence_end: ([\d.]+)', silence)]
    intervals = list(zip(starts, ends))
    leading = next((end for start, end in intervals if start < .001), 0.)
    trailing = next((seconds - start for start, end in intervals if abs(end - seconds) < .001), 0.)
    loud = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(file),
                           '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, check=True).stderr
    summary = loud[loud.rfind('Summary:'):]
    integrated = re.search(r'I:\s*(-?[\d.]+) LUFS', summary)
    true_peak = re.search(r'Peak:\s*(-?[\d.]+) dBFS', summary)
    loudness_range = re.search(r'LRA:\s*([\d.]+) LU', summary)
    assert integrated and true_peak and loudness_range, f'Missing EBU metrics: {file}'
    means = pcm.mean(axis=0, dtype=np.float64)
    assert np.max(np.abs(means)) < .001, f'Unexpected DC: {file}'
    return dict(seconds=seconds, encodedSeconds=float(probe['format']['duration']),
                sampleRate=RATE, channels=2, finite=True, peakDbFS=db(peak),
                rmsDbFS=db(np.sqrt(np.mean(pcm.astype(np.float64) ** 2))),
                integratedLUFS=float(integrated[1]), truePeakDbTP=float(true_peak[1]),
                loudnessRangeLU=float(loudness_range[1]),
                dcMean=[float(n) for n in means], dcDbFS=[db(abs(n)) for n in means],
                leadingQuietSeconds=leading, trailingQuietSeconds=max(0., trailing))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup-dir', type=Path, default=Path('/tmp/lucid-legacy-before'))
    args = parser.parse_args()
    args.backup_dir.mkdir(parents=True, exist_ok=True)
    metadata_file = OUT / 'soundtrack-metrics.json'
    backup_metadata = args.backup_dir / metadata_file.name
    if not backup_metadata.exists():
        shutil.copy2(metadata_file, backup_metadata)
    metadata = json.loads(metadata_file.read_text())
    by_id = {row['id']: row for row in metadata}
    assert set(IDS) <= by_id.keys(), 'Missing legacy source metadata'
    report_file = OUT / 'legacy-mastering-metrics.json'
    previous = json.loads(report_file.read_text()) if report_file.exists() else {}
    previous_tracks = {row['id']: row for row in previous.get('tracks', [])}
    report = []
    changed = 0
    for ident in IDS:
        file = OUT / f'{ident}.mp3'
        backup = args.backup_dir / file.name
        if not backup.exists():
            shutil.copy2(file, backup)
        before_hash = hashlib.sha256(file.read_bytes()).hexdigest()
        original = decode(file)
        before = inspect(file, original)
        after, after_hash = before, before_hash
        prefix_identical = True
        trimmed = 0.
        if before['trailingQuietSeconds'] > MINIMUM_QUIET_TAIL:
            # Keep every sample through the detector's last nonquiet point, plus
            # a short natural breathing gap. -c copy copies whole MPEG frames.
            target = before['seconds'] - before['trailingQuietSeconds'] + KEEP_QUIET_SECONDS
            with tempfile.TemporaryDirectory(prefix='lucid-legacy-master-') as tmp:
                candidate = Path(tmp) / file.name
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(file),
                                '-map', '0:a:0', '-t', f'{target:.9f}', '-c:a', 'copy',
                                '-map_metadata', '0', str(candidate)], check=True)
                retained = decode(candidate)
                after = inspect(candidate, retained)
                prefix_identical = bool(np.array_equal(original[:len(retained)], retained))
                assert prefix_identical, f'Packet trim changed retained music: {ident}'
                assert after['trailingQuietSeconds'] <= .5, f'Tail still too long: {ident}'
                assert after['seconds'] >= target - .05, f'Trim cut the intended release: {ident}'
                assert after['leadingQuietSeconds'] == before['leadingQuietSeconds'], f'Head changed: {ident}'
                trimmed = before['seconds'] - after['seconds']
                assert trimmed > 0
                # Validate before replacing. Copy to an adjacent temp name makes
                # replacement atomic even when /tmp uses a different filesystem.
                adjacent = file.with_name(f'.{ident}.mastering.mp3')
                try:
                    shutil.copy2(candidate, adjacent)
                    os.replace(adjacent, file)
                finally:
                    adjacent.unlink(missing_ok=True)
            after_hash = hashlib.sha256(file.read_bytes()).hexdigest()
            changed += 1
            del retained
        by_id[ident]['seconds'] = after['seconds']
        # Preserve the first useful before/after evidence on idempotent reruns.
        earlier = previous_tracks.get(ident)
        if trimmed == 0 and earlier and earlier.get('outputSha256') == after_hash:
            row = earlier
        else:
            row = dict(id=ident, operation='mpeg-packet-copy-tail-trim' if trimmed else 'unchanged',
                       silenceThresholdDbFS=THRESHOLD_DB, keptQuietTargetSeconds=KEEP_QUIET_SECONDS,
                       before=before, after=after, removedSeconds=trimmed,
                       retainedDecodedPcmIdentical=prefix_identical,
                       reencoded=False, normalized=False, sourceSha256=before_hash,
                       outputSha256=after_hash)
        report.append(row)
        print(json.dumps(dict(id=ident, changed=trimmed > 0, seconds=after['seconds'],
                              encodedSeconds=after['encodedSeconds'], removedSeconds=trimmed,
                              trailingQuietSeconds=after['trailingQuietSeconds'],
                              retainedDecodedPcmIdentical=prefix_identical)), flush=True)
        del original
    metadata_file.write_text(json.dumps(metadata, indent=2) + '\n')
    report_file.write_text(json.dumps(dict(method='Copy MPEG packets, retain identical decoded prefix; no re-encoding.',
                                          silenceThresholdDbFS=THRESHOLD_DB,
                                          tracks=report), indent=2) + '\n')
    print(json.dumps(dict(trimmedThisRun=changed,
                          originalTotalRemovedSeconds=sum(row['removedSeconds'] for row in report))), flush=True)


if __name__ == '__main__':
    main()
