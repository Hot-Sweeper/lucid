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


def rain(frames, seed=1, level=.004):
    """Soft rain bed: band-limited noise with slow swells plus sparse droplets."""
    import numpy as np
    from scipy.signal import butter, sosfilt
    from lucid_music.sampler import SR
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal((frames, 2)).astype(np.float32)
    sos = butter(2, [700, 5500], 'bandpass', fs=SR, output='sos')
    bed = sosfilt(sos, noise, axis=0)
    t = np.arange(frames) / SR
    swell = .75 + .25 * np.sin(2 * np.pi * .07 * t + 1) * np.sin(2 * np.pi * .023 * t)
    bed *= swell[:, None]
    drops = np.zeros((frames, 2))
    for p in rng.integers(0, frames - 2000, int(frames / SR * 6)):
        n = 900
        f = rng.uniform(1800, 4200)
        blip = np.sin(2 * np.pi * f * np.arange(n) / SR) * np.exp(-np.arange(n) / (n / 6)) * rng.uniform(.2, 1)
        side = rng.uniform(.2, 1)
        drops[p:p + n, 0] += blip * side
        drops[p:p + n, 1] += blip * (1.2 - side)
    return ((bed + drops * .15) * level * 10).astype(np.float32)


def check_bars(text, beats=4):
    """Raise if any '|'-separated bar of a melody does not add up to `beats`."""
    from lucid_music.theory import length_of
    for i, bar in enumerate(text.split('|')):
        if bar.strip() and abs(length_of(bar) - beats) > 1e-6:
            raise ValueError(f'bar {i + 1} has {length_of(bar)} beats: {bar.strip()}')
