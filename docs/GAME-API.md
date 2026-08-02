# Writing a game

A game is one directory under `games/`, listed in `games/registry.json`. It
supplies a level pack and a module default-exporting the object described here.
The engine owns everything else: the page, level select, saved progress, the
placing → running → result flow, the replay scrubber and the staged hint button.
It also owns the homepage, which builds itself from the registry.

The shortest useful summary of the shape: **the player arranges something, then
presses run, then watches what happens and is told whether it worked.** If your
theorem fits that, it fits the engine.

```
games/your-game/
  game.js          the module below
  style.css        optional, loaded automatically
  poster.svg       optional, the picture on your card on the homepage
  data/index.json  level list
  data/levels/*.json
  tools/           whatever generates the data
  README.md
```

Add a line to `games/registry.json` and a card appears on the homepage, linking
to `play.html?game=<your-id>`. The card is drawn from that line alone — `title`,
`blurb`, `theorem` and `levels` — plus your `poster.svg` and the player's saved
progress, so nothing on the homepage needs editing when you add a game. A game
with no poster still gets a card; the frame just stays empty.

## Identity

| Field | Meaning |
| --- | --- |
| `id` | Directory name. Namespaces saved progress, so never reuse one. |
| `title` | Shown in the header. |
| `blurb` | One line under the title. |
| `credit` | HTML for the footer: sources, papers, licence. |
| `verb` | Label for the run button, e.g. `"Pull it tight"`. |

## Levels

`data/index.json` is `{count, levels: [...]}`. Each entry needs an `id` and
whatever your own hooks read. Level files live at `data/levels/<id>.json` and are
fetched on demand, so the index should stay small.

```js
group(meta)   // picker heading this level belongs under
chip(meta)    // short label for its button
par(meta)     // best achievable score; a run matching it is "perfect"
```

## A play

```js
start(level)              // -> play, your mutable per-attempt state
describe(level, play)     // -> {goal, status}; goal may be HTML
runnable(level, play)     // -> can the run button be pressed yet
draw(level, play, phase)  // paint the board; phase is placing|running|result
view(level, play)         // -> initial [x, y, w, h]
click(level, play, point) // -> {changed} or {message} for a miss
```

`draw` is handed nothing: it renders into the shared `<svg id="board">`, which
you can import along with `svgEl` from the engine. Redraws happen whenever the
engine thinks state changed; keep it cheap enough to call freely.

## Games without a run

The summary above — arrange, run, watch — is the common shape, not the only
one. A game played move by move has no separate run: each click *is* a move,
and the level ends when the position says it has. Leave `sim` and `verb` out
and the run button disappears; supply `over` instead and the engine goes
straight to the verdict the moment a click returns true from it.

```js
over(level, play)  // -> has the level just ended?
```

Everything else is unchanged: `click` still reports `{changed}`, `verdict`
still decides the outcome, and hints and best scores work the same. `verdict`
is handed `null` where the sim would be, and with no recorded frames the
scrubber stays hidden, since there is nothing to replay that the player did
not already watch happen.

## The run

Frames are recorded by *distance moved*, not on a step timer, so the scrub bar
is even in how much changes rather than even in effort spent. That needs two
things from you: a cheap per-step upper bound (`motion`) used to skip the real
comparison most of the time, and a real one (`apart`) between scenes.

```js
sim: {
  create(level, play)   // -> sim
  step(sim)             // advance once; -> true when settled
  perFrame(sim)         // steps to run per animation frame
  motion(sim)           // cheap upper bound on distance moved last step
  scene(sim)            // -> snapshot, opaque to the engine
  apart(sceneA, sceneB) // -> distance between two snapshots
  show(sim, scene)      // restore a snapshot and repaint
  sceneView(scene)      // -> viewBox for that snapshot
  readout(sim, scene)   // -> status line while scrubbing
  paint(sim)            // cheap repaint during the run
}
```

Two things learned the hard way, worth honouring:

- **Do not converge on a scalar summary like total length.** A shape can be far
  from settled while its summary has stopped moving. Compare the thing you draw.
- **If you report a monotone quantity, require confirmation before believing a
  change.** A coarse discretisation can momentarily read wrong, and a running
  minimum will make that permanent.

## The result

```js
verdict(level, play, sim)  // -> {won, perfect, title, detail, score}
```

`score` is what gets recorded as a personal best, compared against `par(meta)`.
Return it only when the attempt was unaided; the engine handles the rest.

**Decide the verdict from your own answer data, never from the simulation.**
Physics is for showing the player why, and it will occasionally jam or drift.
Unpinning reads the verdict off precomputed pinning sets and uses the animation
purely as illustration.

## Other solutions (optional)

Puzzles with a minimum in them usually have ties for it, and seeing the
alternatives is where the structure of the answer shows itself. Provide this
and a button appears after a **best-possible** answer — a win your `verdict`
marked `perfect`. Leave it out and nothing changes.

Gating on `perfect` rather than on any win is deliberate: handing the
alternatives to somebody who solved it with pieces to spare gives away the
optimum they have not reached yet.

```js
solutions: {
  count(level)           // how many there are; the button needs at least two
  show(level, play, i)   // put solution i on the board, -> a caption
  restore(level, play)   // give the player their own arrangement back
}
```

The engine steps through them, then rounds the loop back to what the player
did. It is display only: hold their arrangement aside on the first `show` and
put it back on `restore`, which the engine calls on every way out.

## Hints

```js
hint(level, play, tier)  // tier 1, 2, 3... -> {text} and mutate play
```

One button, escalating on repeat presses, so asking once does not spend the
level. The pattern that works: **tier 1 orients without spoiling** (how far off
are they, and any reassurance the maths guarantees), **tier 2 reveals one
forced piece of the answer** — ideally something true of *every* solution, so it
gives away no branch and teaches the rule — and **tier 3 completes a solution**,
choosing the one nearest what the player already did, then stopping so they
still press run themselves.

Any tier that reveals anything marks the attempt as assisted, and assisted
solves never record a best.
