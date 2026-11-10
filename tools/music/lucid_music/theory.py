"""Pitch, chord and notation helpers for hand-written scores.

Everything is measured in beats. A score is a list of Note objects; the
renderer turns beats into seconds with the song's tempo and swing.
"""
from __future__ import annotations
from dataclasses import dataclass, replace
from fractions import Fraction
import itertools
import re

NAMES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


@dataclass
class Note:
    t: float          # start, beats
    d: float          # length, beats
    p: int            # MIDI pitch
    v: float = .75    # velocity 0..1

    def shifted(self, beats=0., semis=0, vel=1.):
        return replace(self, t=self.t + beats, p=self.p + semis, v=min(1., self.v * vel))


def midi(name: str | int) -> int:
    if isinstance(name, int):
        return name
    m = re.fullmatch(r'([A-Ga-g])([#b]*)(-?\d)', name.strip())
    if not m:
        raise ValueError(f'Bad note name {name!r}')
    pc = NAMES[m[1].upper()] + m[2].count('#') - m[2].count('b')
    return 12 * (int(m[3]) + 1) + pc


def pc_of(name: str) -> int:
    m = re.fullmatch(r'([A-G])([#b]*)', name)
    return (NAMES[m[1]] + m[2].count('#') - m[2].count('b')) % 12


# Intervals above the root. Extensions are written as real pitches (9 = 14).
QUALITIES = {
    '': (0, 4, 7), 'maj': (0, 4, 7), 'm': (0, 3, 7), '5': (0, 7),
    'maj7': (0, 4, 7, 11), 'maj9': (0, 4, 7, 11, 14), 'maj7#11': (0, 4, 7, 11, 18),
    'maj9#11': (0, 4, 11, 14, 18), 'maj13': (0, 4, 11, 14, 21),
    '6': (0, 4, 7, 9), '69': (0, 4, 9, 14), 'add9': (0, 4, 7, 14),
    'm7': (0, 3, 7, 10), 'm9': (0, 3, 7, 10, 14), 'm11': (0, 3, 10, 14, 17),
    'm6': (0, 3, 7, 9), 'm69': (0, 3, 9, 14), 'madd9': (0, 3, 7, 14), 'mmaj7': (0, 3, 7, 11),
    'mmaj9': (0, 3, 11, 14),
    '7': (0, 4, 7, 10), '9': (0, 4, 10, 14), '13': (0, 4, 10, 14, 21),
    '7b9': (0, 4, 10, 13), '7#9': (0, 4, 10, 15), '7b13': (0, 4, 10, 20),
    '7alt': (0, 4, 10, 15, 20), '7#11': (0, 4, 10, 18), '9#11': (0, 4, 10, 14, 18),
    '13b9': (0, 4, 10, 13, 21),
    '7sus4': (0, 5, 7, 10), '9sus4': (0, 5, 10, 14), '13sus4': (0, 5, 10, 14, 21),
    'sus2': (0, 2, 7), 'sus4': (0, 5, 7),
    'm7b5': (0, 3, 6, 10), 'm9b5': (0, 3, 6, 10, 14), 'dim': (0, 3, 6), 'dim7': (0, 3, 6, 9),
    'aug': (0, 4, 8),
}


@dataclass(frozen=True)
class Chord:
    symbol: str
    root: int          # pitch class
    intervals: tuple
    bass: int          # pitch class of the bass note

    @property
    def pcs(self):
        return [(self.root + i) % 12 for i in self.intervals]

    def guide_tones(self):
        """3rd and 7th (or 6th / sus note): what defines the chord's colour."""
        ints = [i % 12 for i in self.intervals]
        out = [i for i in ints if i in (3, 4, 5)][:1] + [i for i in ints if i in (9, 10, 11)][:1]
        return [(self.root + i) % 12 for i in out]


def chord(symbol: str) -> Chord:
    m = re.fullmatch(r'([A-G][#b]?)(.*?)(?:/([A-G][#b]?))?', symbol.strip())
    if not m or m[2] not in QUALITIES:
        raise ValueError(f'Unknown chord {symbol!r}')
    root = pc_of(m[1])
    return Chord(symbol, root, QUALITIES[m[2]], pc_of(m[3]) if m[3] else root)


def progression(text: str, beats_per_bar=4):
    """'Fmaj9 | Em7 A7 | Dm9 | G13' -> [(start, length, Chord)]. Each bar is
    split evenly; 'Dm9:3 G7:1' sets explicit beats; '%' repeats the previous bar."""
    out, t, prev = [], 0., None
    for bar in text.split('|'):
        items = bar.split()
        if items == ['%']:
            items = prev
        prev = items
        explicit = [it for it in items if ':' in it]
        if explicit:
            for it in items:
                sym, beats = it.split(':')
                out.append((t, float(beats), chord(sym)))
                t += float(beats)
        else:
            each = beats_per_bar / len(items)
            for sym in items:
                out.append((t, each, chord(sym)))
                t += each
    return out


def chord_at(prog, beat):
    for start, length, c in prog:
        if start <= beat < start + length:
            return c
    return prog[-1][2]


def voice(c: Chord, lo='C3', hi='C5', n=4, prev=None, rootless=False, drop_fifth=True):
    """Choose a voicing of n notes in [lo, hi] that moves least from prev.

    Candidates are every octave placement of the chosen pitch classes within the
    range. Close clusters low in the register are penalised (muddy), as are wide
    gaps between neighbouring upper voices.
    """
    lo, hi = midi(lo), midi(hi)
    ints = list(c.intervals)
    if rootless and len(ints) > 3:
        ints = [i for i in ints if i % 12 != 0]
    if drop_fifth and len(ints) > n:
        ints = [i for i in ints if i % 12 != 7] or ints
    # Prefer colour tones when trimming: keep guide tones and extensions.
    while len(ints) > n:
        removable = [i for i in ints if i % 12 == 0] or [i for i in ints if i % 12 == 7] or ints[:1]
        ints.remove(removable[0])
    altered_fifth = any(i % 12 in (6, 8) for i in c.intervals)
    for extra in (7, 0):          # thin chords: add the fifth, then the root
        if extra == 7 and altered_fifth:
            continue              # never a natural 5th next to b5/#11 or #5/b13
        if len(ints) < n and extra not in [i % 12 for i in ints] and (extra != 0 or not rootless):
            ints.append(extra)
    if len(ints) < n:
        n = len(ints)
    pcs = [(c.root + i) % 12 for i in ints]
    options = []
    for pc in pcs:
        options.append([p for p in range(lo, hi + 1) if p % 12 == pc])
    best, best_score = None, 1e9
    for combo in itertools.product(*options):
        notes = sorted(combo)
        if len(set(notes)) < len(notes):
            continue
        span = notes[-1] - notes[0]
        if span > 19:
            continue
        score = 0.
        for a, b in zip(notes, notes[1:]):
            gap = b - a
            if a < 52 and gap < 5:
                score += 6           # muddy low cluster
            if gap > 9:
                score += (gap - 9) * .8
            if gap == 1 and a < 64:
                score += 2.5
        if prev:
            pv = sorted(prev)
            score += sum(abs(a - b) for a, b in zip(notes, pv)) * .9 if len(pv) == len(notes) else \
                sum(min(abs(a - b) for b in pv) for a in notes)
        else:
            score += abs((notes[0] + notes[-1]) / 2 - (lo + hi) / 2) * .4
        if score < best_score:
            best, best_score = notes, score
    if best is None:
        raise ValueError(f'No voicing for {c.symbol} in range')
    return best


def bass_note(c: Chord, lo='E1', hi='E2'):
    lo, hi = midi(lo), midi(hi)
    for p in range(lo, hi + 1):
        if p % 12 == c.bass:
            return p
    raise ValueError('range')


def _dur(text):
    return float(Fraction(text))


def melody(text: str, start=0., octave_shift=0, vel=.78):
    """Hand-written line. Tokens: 'E5:1', 'r:2', 'Bb4:1/3', '[E5,G5]:1'.
    Suffixes after the length: '>' accent, '_' soft, "'" staccato, '~' legato
    (slight overlap into the next note). '|' marks bars and is ignored."""
    notes, t = [], float(start)
    for tok in text.replace('|', ' | ').split():
        if tok == '|':
            continue
        m = re.fullmatch(r"(\[[^\]]+\]|[A-Ga-g][#b]?-?\d|r):([\d./]+)([>_'~]*)", tok)
        if not m:
            raise ValueError(f'Bad melody token {tok!r}')
        head, length, marks = m[1], _dur(m[2]), m[3]
        if head != 'r':
            pitches = head.strip('[]').split(',') if head.startswith('[') else [head]
            v = vel * (1.18 if '>' in marks else .62 if '_' in marks else 1.)
            gate = .5 if "'" in marks else 1.06 if '~' in marks else .92
            for ptxt in pitches:
                notes.append(Note(t, length * gate, midi(ptxt) + 12 * octave_shift, min(1., v)))
        t += length
    return notes


def length_of(text: str) -> float:
    return sum(_dur(tok.split(':')[1].rstrip(">_'~")) for tok in text.replace('|', ' | ').split() if tok != '|')


def scale(root: str, mode='major'):
    steps = {'major': (0, 2, 4, 5, 7, 9, 11), 'minor': (0, 2, 3, 5, 7, 8, 10),
             'dorian': (0, 2, 3, 5, 7, 9, 10), 'phrygian': (0, 1, 3, 5, 7, 8, 10),
             'lydian': (0, 2, 4, 6, 7, 9, 11), 'mixolydian': (0, 2, 4, 5, 7, 9, 10),
             'harmonic': (0, 2, 3, 5, 7, 8, 11)}[mode]
    r = pc_of(root)
    return {(r + s) % 12 for s in steps}


def offset(notes, beats=0., semis=0, vel=1.):
    return [n.shifted(beats, semis, vel) for n in notes]
