# Max-flow min-cut

Cut pipes until no water reaches the sink, spending as little as you can.

**Menger, Ford and Fulkerson:** the most water a network can carry from source
to sink is exactly the cost of the cheapest set of pipes that separates them.

That equality is the game rather than a footnote to it. Par is the max flow, so
the number you are trying to beat and the number you are trying to stop are the
same number. Turn the water on before cutting anything and the readout tells you
the answer — 11 getting through means 11 is what stopping it will cost — which
is a fact worth discovering rather than being told.

## Status

**Playable.** 117 levels, from a six-junction network up to a twenty-two.

### It can be lost

Checked before anything was built, because the previous game could not be. A
careless player cuts a few pipes, turns the water on, and watches it arrive at
the sink anyway. Measured, by spending par at random on pipes and seeing how
often that happens to separate the network:

| | |
| --- | --- |
| random spend of par separates the network | 1.9% of attempts |
| worst level | 11.5% |
| (a previous game, since removed, for comparison) | 58% |

Levels are generated in surplus and the least forgiving kept, which is what
holds that number down.

The one soft spot, and it is the same as Unpinning's: cutting *everything* wins,
just at a ruinous price. That is a scoring question rather than a structural one
— playing at the level you are actually asked to play at can genuinely fail —
but it is the thing to check first on any game of this shape.

### No third-party data

Unlike Unpinning, nothing is catalogued and nothing is looked up. Max flow is
polynomial, so networks are generated here and their answers computed exactly:
no licence to inherit, no ceiling on level size, and the pack can be rebuilt at
any size from `tools/build_pack.py`.

The win check is exact and cheap — is the sink still reachable — so the
animation cannot disagree with the verdict. That is the failure mode
`docs/GAME-API.md` warns about, and here it is designed out rather than managed.

### What levels have to earn

In `tools/build_pack.py`, `wanted()`. The test that matters is that the obvious
answers are wrong: cutting everything at the source, and everything at the sink,
must both cost more than the cheapest cut. Otherwise the player never has to
look at the middle of the network, which is the only place the theorem lives.
Also required is a cut of between two and five pipes — one pipe is not a
decision, six is a chore — and that the cheapest cut is not simply the cheapest
pipes on the board.

### The picture

Pipe width is capacity, so a fat pipe is an expensive cut. Cut pipes keep their
place with a snip mark, so you can see what you spent and where without
re-reading the network.

The two ends are named in full rather than lettered. They were **S** and **T**,
and the first person to play it asked whether S was the sink, because the water
was running away from it — which it should, S being the source. "S" is just as
good an abbreviation for sink, and a label that has to be decoded before the
animation makes sense is worse than no label. They read `source` and `sink` now.

Water is in two parts, and the split is the whole reading of a level:

- **Standing water** fills every pipe the source can still reach, whether or
  not it is going anywhere.
- **The current** runs inside it, as wide as the flow actually passing through
  that pipe and moving faster the fuller the pipe is. A pipe with spare
  capacity shows a thin stream inside a full pipe, so the bottleneck is watched
  rather than deduced.
- **Water going nowhere still moves**, slowly and faintly. A holding cut takes
  the flow to zero everywhere, so without this the run that proves a *right*
  answer was the only one that froze — exactly backwards. The source never
  stops pushing; this is water under pressure with nowhere to go, and watching
  it die at the snip is the point. It is kept slow and pale so it cannot be
  mistaken for water getting through.

Getting the first of those wrong made the run that *proves* a correct answer a
still picture: with a holding cut the flow is zero everywhere, so drawing only
the current drew nothing at all. Now the water arrives, fills the source side,
and stops dead at the snips while the sink side stays dry — which is the most
useful thing the animation does.

There is no scrub bar. The engine offers one, and it is right for Unpinning,
but this run has no inspectable middle: the water advances outwards from the
source and that is all, so stopping partway shows a half-filled network that
says nothing the finished one does not say better. `replay: false` drops it,
and the frame recording with it.

Two details worth keeping. The current runs from whichever end the flow says,
not the end the search happened to reach first; those disagree often enough
that taking the search order draws water visibly running uphill. And the
movement is a CSS dash animation rather than particles — one element per pipe,
animated by the browser without waking the main loop, which matters because the
run itself is only twenty-odd frames long and then holds.

### Hints

Tier 1 says how much still gets through and states the bound — stopping it will
cost at least par, because that is what the network carries. Tier 2 points at a
pipe that is in *every* cheapest cut, which gives away no branch at all since
every best answer contains it. Tier 3 completes whichever cheapest cut most
overlaps what the player has already done, and stops, so they still turn the
water on themselves.

### Still to do

- **A proof-shaped hint ladder.** Tier 2 is honest but it is not a proof. The
  natural one is the augmenting-path argument: show a route the water can still
  take, since a cut has to break every one of them.
- **Directed pipes.** Everything here is undirected, which is what a player
  expects of a pipe. One-way pipes are a small change to the generator and make
  the min cut much less symmetric.
- **Bigger networks.** Nothing stops them; the layout is the only limit.
