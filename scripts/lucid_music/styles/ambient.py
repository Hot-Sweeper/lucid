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
