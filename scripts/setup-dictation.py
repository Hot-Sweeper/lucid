"""One-time Windows setup for the isolated Ultra microphone trial."""
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import urllib.request
import venv

if sys.platform != "win32":
    raise SystemExit("This trial launcher currently targets Windows.")
root = Path(os.environ.get("LUCID_DICTATION_HOME", Path(os.environ["LOCALAPPDATA"]) / "Lucid" / "dictation"))
root.mkdir(parents=True, exist_ok=True)
python = root / "venv" / "Scripts" / "python.exe"
if not python.exists():
    venv.EnvBuilder(with_pip=True).create(root / "venv")
if subprocess.run([str(python), "-m", "pip", "--version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
    subprocess.run([str(python), "-m", "ensurepip"], check=True)
subprocess.run([str(python), "-m", "pip", "install", "transcribe-cpp==0.4.1", "transcribe-cpp-native==0.4.1"], check=True)
model = root / "parakeet-ultra-Q8_0.gguf"
expected = "007a59761e9258779f189df396b50d12b83bb5b79e66df4b955c230d2f2a0a59"
def digest(file):
    with file.open("rb") as source:
        checksum = hashlib.sha256()
        for block in iter(lambda: source.read(4 * 1024 * 1024), b""):
            checksum.update(block)
        return checksum.hexdigest()
if not model.exists() or digest(model) != expected:
    url = "https://huggingface.co/handy-computer/parakeet-ultra-gguf/resolve/a1539be1b849ea7463b88343e5277b373d0c4ea9/parakeet-ultra-Q8_0.gguf"
    partial = model.with_suffix(".partial")
    def progress(blocks, size, total):
        if total > 0:
            print(f"\rDownloading Ultra: {min(blocks * size, total) / total:.0%}", end="", flush=True)
    urllib.request.urlretrieve(url, partial, progress)
    if digest(partial) != expected:
        raise SystemExit("Model checksum mismatch. Run setup again to retry.")
    partial.replace(model)
print(f"\nReady. Model verified at {model}")
print('Open "Test Dictation.cmd" to try the microphone.')
