# Unpinning

A web game built on the pinning problem for multiloops. A loop of rope lies
tangled on a table. Push pins into the table, then pull the rope tight. Pins in
the right spaces keep every crossing; anywhere else and the rope slides through
and comes undone. Use as few pins as possible.

The mathematical content is Simon and Stucky's *pinning number*: the fewest
punctures that leave a generic immersion with the minimal number of double
points in its homotopy class. Deciding it is NP-complete, so every puzzle here
ships with its answer precomputed rather than solved at runtime.

```
python3 tools/extract_levels.py     # rebuild data/ from the catalog
python3 -m http.server 8000         # then open / at the repo root
```

## Layout

| Path | What it is |
| --- | --- |
| `../../reference/LooPindex/` | Upstream catalog, cloned. Not part of the game. |
| `tools/extract_levels.py` | Turns the catalog into playable level JSON. |
| `../../lib/geometry/arrangement.py` | Planar arrangement: splits the rope at crossings and extracts region polygons. Shared with other games. |
| `game.js` | The game module. See `docs/GAME-API.md`. |
| `data/` | Generated. `index.json` plus one file per level. |

## Where the levels come from

[LooPindex](https://github.com/ChristopherLloyd/LooPindex) catalogs all 1097
irreducible, indecomposable multiloops in the sphere with at most 12
complementary regions, together with their pinning data. Each level directory
holds `clean.svg` (the rope as plain polyline coordinates) and
`labels_numeric.svg` (a region number per region); the HTML page holds the
pinning number and every minimal pinning set.

The extractor joins these. The catalog anchors each region's label at that
region's leftmost boundary vertex plus a fixed offset (`saveLoop.py:522-556`),
so labels are matched to computed faces by fitting that offset, not by guessing
at centroids.

**1074 of 1097 levels are playable.** 22 are dropped because the label-anchor
fit is ambiguous — several regions share an anchor vertex — and `5^1_1` is
dropped because its catalog page is a zero-byte file upstream. The game states
this in its footer rather than quietly showing a smaller number.

### How the region mapping is verified

The label fit alone would be circumstantial, so the extractor checks it against
geometry it derives independently. It computes each face's degree — the number
of crossings on its boundary — from the arrangement, and requires that to match
the catalog's published region degree sequence *and* the per-pinning-set degree
sequences on every level. All 1074 pass.

## Rules, and why the outer region is free

The catalog pins on the sphere, where every region is alike. This game is rope
on a flat table, which is the plane, and a homotopy in `R² ∖ P` is literally a
homotopy in `S² ∖ (P ∪ {∞})`. So the outer region always comes pre-pinned, and
each level's real targets are the catalog's minimal pinning sets with that
region removed and the result re-reduced to its minimal elements
(`generators` in the level JSON). This shifts only 36 of 1074 levels, each by a
single pin, and makes none of them trivial.

A placement holds exactly when it contains some generator, since pinning sets
are upward closed. That was checked against the catalog's own independently
computed totals: for all 1096 parseable levels, the number of subsets containing
some stored minimal set equals the published total pinning set count exactly.

## The pull-tight simulation

Curve shortening flow with the pins as hard obstacles. The rope is allowed to
pass through itself — this is homotopy, not isotopy, which is exactly why
crossings can cancel and why the pins are the only thing that can stop them.

Three deliberate details:

- **The verdict never comes from the physics.** It is read off `generators`.
  The simulation exists to show you why, not to decide.
- **Crossing counts are clamped to their running minimum.** Self-intersections
  are non-increasing under curve shortening, so any rise is numerical: at the
  taut limit, strands between the same two pins lie on top of each other and
  the discretised polylines jitter across each other repeatedly.
- **A final inflation pass runs only after the topology has settled.** A
  zero-width taut rope is degenerate and unreadable. Pushing overlapping
  strands apart restores real rope's thickness. It can only separate, so it
  cannot cancel a crossing — and it must not run earlier, because during the
  pull a bigon has to be able to close.

### Known limitation

Measured over 60 sampled levels: correct placements preserve the exact crossing
count in 60 of 60 cases. Of 60 verified-incorrect placements (one pin short of
a generator, confirmed not to hold), 54 visibly collapse and **6 jam** — curve
shortening reaches a locally taut configuration and stops, the way real rope
snags when you haul on it. Larger pins and random perturbation both fail to
shake these loose; they are genuine local minima of length in a flat metric.

The verdict stays correct because it comes from the catalog, and the game says
what actually happened: the rope jammed, but a jam is luck rather than a lock,
and these pins provably do not hold it.

## Licence

GPL-3.0. The LooPindex catalog by Christopher-Lloyd Simon and Ben Stucky is
GPL-3.0, and this game embeds geometry and pinning data derived from it.
