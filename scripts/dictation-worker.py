"""Persistent local Parakeet Ultra worker. Audio is never sent to a service."""
import array
import base64
import json
import os
import pathlib
import sys
import time


def emit(value):
    # ASCII JSON escapes survive Windows code pages and UTF-8 pipe readers.
    print(json.dumps(value, ensure_ascii=True), flush=True)


def main():
    root = pathlib.Path(os.environ["LUCID_DICTATION_HOME"])
    import transcribe_cpp

    started = time.perf_counter()
    with transcribe_cpp.Model(str(root / "parakeet-ultra-Q8_0.gguf"), backend=sys.argv[1]) as model:
        with model.session() as session:
            emit({"type": "ready", "device": model.device.description, "backend": model.device.kind,
                  "loadMs": round((time.perf_counter() - started) * 1000)})
            for line in sys.stdin:
                try:
                    request = json.loads(line)
                    raw = base64.b64decode(request["audio"], validate=True)
                    if not raw or len(raw) % 4 or len(raw) > 16000 * 4 * 120:
                        raise ValueError("Record between a moment and two minutes of audio.")
                    pcm = array.array("f")
                    pcm.frombytes(raw)
                    if sys.byteorder != "little":
                        pcm.byteswap()
                    started = time.perf_counter()
                    result = session.run(pcm)
                    emit({"type": "result", "text": result.text, "audioSeconds": len(pcm) / 16000,
                          "computeMs": round((time.perf_counter() - started) * 1000)})
                except Exception as error:
                    emit({"type": "error", "error": str(error)})


try:
    main()
except Exception as error:
    emit({"type": "error", "error": str(error)})
    sys.exit(1)
