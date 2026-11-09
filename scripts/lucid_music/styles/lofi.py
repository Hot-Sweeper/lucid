"""Small shared helpers for the lo-fi songs."""
from lucid_music import fx


def at(prog, bar, beats_per_bar=4):
    """Shift a progression to start at `bar`."""
    return [(st + bar * beats_per_bar, ln, c) for st, ln, c in prog]


def intro_outro_filter(song, open_bar, close_bar, end_bar, closed=900, open_=14000, end=1400):
    """Music-bus low-pass: closed through the intro, open from `open_bar`, closing over the outro."""
    sec = lambda bar: song.sec(bar * song.meter, False)
    return lambda a, s: fx.filter_sweep(a, [(0, closed), (sec(open_bar) - .4, closed), (sec(open_bar), open_),
                                            (sec(close_bar), open_), (sec(end_bar) + 2, end)])
