"""Small helpers shared by the ambient pieces."""
from lucid_music.theory import progression, melody


def at(prog, bar, beats_per_bar=4):
    """Shift a progression to start at `bar`."""
    return [(st + bar * beats_per_bar, ln, c) for st, ln, c in prog]


def chain(*parts, beats_per_bar=4):
    """chain(('Ebmaj9:8 F/Eb:8', 0), ...) or progression lists with bar offsets."""
    out = []
    for prog, bar in parts:
        if isinstance(prog, str):
            prog = progression(prog, beats_per_bar)
        out += at(prog, bar, beats_per_bar)
    return out


def pedal_per_chord(prog, release=.15):
    """Sustain pedal changes with each chord (lifted just before the change)."""
    return [(st, st + ln - release) for st, ln, _ in prog]


def legato_pedal(prog, catch=.25):
    """Pedal pressed just after each chord is struck and lifted at the next
    change (legato pedalling): old harmony rings into the new attack briefly
    without blurring two chords together."""
    return [(st + catch, st + ln) for st, ln, _ in prog]


def cello(**kw):
    """Karoryfer x Bigcat cello (CC0), sustained arco: four dynamics, down/up bow
    round robins. Files are named an octave below sounding pitch (measured:
    'A1' sounds A2 = MIDI 45). Samples last about 4 s and are not looped, so
    write notes of at most about 3.5 s."""
    import re
    from lucid_music.sampler import LIBS, MultiSampler, Region, _ranges
    from lucid_music.theory import midi
    root = LIBS / 'cello/Samples/sus'
    dyn = {'p': (1, 40), 'mp': (41, 70), 'mf': (71, 100), 'f': (101, 127)}
    parsed = []
    for f in root.glob('*.wav'):
        m = re.fullmatch(r'([A-G]b?)(\d)_(p|mp|mf|f)_([dg])\.wav', f.name)
        if m:
            parsed.append((midi(m[1] + m[2]) + 12, m[3], 1 if m[4] == 'd' else 2, str(f)))
    if not parsed:
        raise FileNotFoundError(root)
    ranges = _ranges([p for p, *_ in parsed])
    regs = [Region(path, *ranges[p], p, *dyn[d], seq=rr, seq_len=2) for p, d, rr, path in parsed]
    kw.setdefault('release', .55)
    kw.setdefault('veltrack', .35)
    kw.setdefault('attack', .03)
    return MultiSampler('cello', regs, **kw)


def fit(song):
    """Chain wrapper: pad/trim a part to the song's render length (Surge renders
    can come back one frame short, which breaks the bus sum)."""
    import numpy as np
    from lucid_music.sampler import SR

    def wrap(audio, s):
        n = int((s.sec(s.length_beats, False) + s.space['seconds'] + 1.0) * SR)
        if len(audio) < n:
            audio = np.pad(audio, ((0, n - len(audio)), (0, 0)))
        return audio[:n]
    return wrap
