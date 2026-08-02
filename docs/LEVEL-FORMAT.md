# Level packs

A game's `data/` directory holds an index and one file per level. The engine
reads only a little of it; the rest is yours.

## `data/index.json`

```json
{
  "count": 1074,
  "note": "shown in the footer, e.g. what is missing and why",
  "levels": [
    { "id": "6^2_1", "...": "whatever your own hooks read" }
  ]
}
```

The engine needs `id` on each entry, and passes the whole entry to your
`group`, `chip` and `par` hooks. Order here is play order, and drives the
"next puzzle" button.

Keep this file small: it loads at startup. Pinning's is 158KB for 1074 levels,
holding only what the picker and scoring need. Everything else waits.

## `data/levels/<id>.json`

Fetched when the level is opened, so it can be as large as it needs to be.
Entirely your own shape — the engine hands it to your hooks untouched.

Pinning's carries the drawing, the clickable regions with their polygons, and
the precomputed answers.

## Notes from building the first pack

**Put the answers in the data.** Runtime solving is the thing you will regret.
Pinning's underlying decision problem is NP-complete, and shipping the answers
made the game instant and, more importantly, correct.

**Record what you left out, and say so in the UI.** 23 of 1097 catalogued
objects are missing from Pinning: 22 whose labels could not be matched to
their drawing unambiguously, and one whose source page is an empty file. The
`note` field puts that in the footer. A pack that silently drops what it could
not handle reads as complete when it is not.

**Give clickable things room.** Pinning first placed each region's pin at the
region centroid, which for a thin region sits almost on the boundary: the median
clearance from a pin to the rope was 7 units and the minimum was zero. Placing
them at the point furthest from the boundary instead took the minimum to 24, and
that headroom is what let the pins be drawn large enough to read.

**Verify the pack against something you did not generate.** Cross-check a
derived quantity against one the source published, on every level, and fail the
build on a mismatch.
