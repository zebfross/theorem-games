# Taut — pinning, generated

The same theorem as [Pinning](../pinning/), with levels made here instead of
taken from a catalogue. Pinning derives its 1074 levels from LooPindex, which is
why that game — and through it this whole repository — carries GPL-3.0.
Everything else is MIT and generated. This is the attempt to generate these too,
built alongside rather than in place of the original so the two can be compared.

## Where it stands

**Drawings: done.** `tools/draw.py` makes random multiloops — closed polylines
through scrambled points, which cross generically and avoid the degeneracies the
arrangement code refuses. The planar arrangement is
`lib/geometry/arrangement.py`, written for the original game and reused
unchanged. Over 400 random drawings, 209 came out usable at 2 to 7 crossings,
with no degeneracies and no position the solver declined to classify.

**Answers: blocked, and now precisely.** The solver cannot yet be trusted to
label them. Measured against the catalogue by size:

| crossings | answered | agreed |
| --- | --- | --- |
| ≤ 4 | 2 | 100% |
| ≤ 6 | 14 | 92.9% |
| ≤ 7 | 32 | 93.8% |
| ≤ 8 | 90 | 86.7% |
| all | 1035 | 86.7% |

The hoped-for shortcut — generate only small drawings, where the solver might be
sound — does not exist. It is already wrong at six crossings.

## The smallest counterexample

`7^2_1`, seven crossings, two strands. The solver reports three minimal pinning
sets where the catalogue has two:

```
solver     [1,2,4,7]  [1,2,5,6]  [1,2,6,7]
catalogue  [1,2,4,7]  [1,2,5,6]
```

The extra one is the whole disease in miniature. The solver believes pinning
`{1,2,6,7}` makes the drawing taut; the catalogue says it does not. Believing a
drawing is taut when it is not means having failed to find a bigon that is
there — which is why 105 of the 138 disagreements across the full catalogue have
the solver claiming *fewer* pins suffice, and why this is unsafe rather than
merely wrong: generated levels would tell players their answer works when it
does not.

Seven crossings is small enough to work through by hand. That is the next step,
and it is the only thing between this and a pack.

## Files

```
tools/draw.py   random multiloop drawings and their arrangements
```

The solver itself lives at `../pinning/tools/solver.py`, with its accuracy and
failure direction recorded at the top; `../pinning/tools/validate_solver.py`
measures it and takes `--max-regions` to slice by size.
