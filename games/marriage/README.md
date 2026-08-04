# Hall's marriage theorem

Applicants down one side, jobs down the other, a line where somebody is
qualified. Give everyone a job. When you cannot, say *why* — and the theorem
guarantees there is always a why.

## The theorem

**Hall.** Every applicant can be placed exactly when every group of *k*
applicants has at least *k* jobs open to them between them.

**König.** When that fails, the fewest people who must go unplaced is the worst
deficiency of any group — the largest value of *(size of group) − (jobs open to
it)*.

So a failure is never bad luck. There is always a group of *k* people sharing
fewer than *k* jobs, and that group is a **proof** that no arrangement could
have done better. You can check it by counting.

## Why the certificate is the game

Matching people to jobs is pleasant but it is not, on its own, a puzzle with an
end: you shuffle until you are stuck, and then you wonder whether you are really
stuck or merely tired.

So the blocked levels do not ask for a matching at all. They ask for the proof:
the smallest group of applicants sharing too few jobs between them. Saying "I
think this is the best possible" is a guess; naming the group is knowing, and
the game only accepts the second. Same move as naming the fake coin in
`games/weighing/`.

Par is the size of the smallest group that settles it, so what is being
minimised is how tight a proof you can find. **Matching is a tool, not the
task** — an augmenting search that gets stuck hands you the group, which is
exactly how the proof of the theorem goes — but you can answer with an empty
board if you can see it.

An earlier version required you to build a maximum matching *before* it would
accept a bottleneck. That was backwards: on many boards the bottleneck is the
first thing you notice, and the game made you grind out the rest of the puzzle
before letting you say the answer you already had. The certificate stands on its
own — it fixes the maximum at *n* minus its deficiency whatever is on the board
— so there was never a reason to gate it.

The board counts for you as you build the group — *"2 chosen · 1 job between
them"* — because that comparison is the whole of Hall's condition, and watching
it go wrong is the point.

## What it does not do for you

Whether an applicant has a job is visible at a glance, so the machine checking
it is not doing your thinking. Knowing the theorem does not give the answer
away either: *n* minus the worst deficiency is the **count**, never the
assignment. You still have to find the chain of swaps — take somebody unplaced,
follow their options, and when a job they want is taken ask whether its holder
can move. That is an augmenting path, and it is the reasoning the game is made
of.

## Can it be lost?

Yes, and here are the numbers. Careless play is greedy matching in a random
order — grab whatever is free, never back up — and on blocked levels it must
also produce a certificate.

| levels | careless play wins |
| --- | --- |
| solvable | 27.9% |
| blocked | 2.3% |

The certificate is what does the work: careless play that happens to find the
maximum still has to explain it, which takes the blocked rate from 34% to 2.3%.

Levels are filtered on that measurement rather than on judgement. Solvable ones
must resist greedy at least 70% of the time; four-applicant boards are exempt
and are tutorials, since there is no room for greedy to go wrong on four
applicants.

Blocked levels have two further rules, both there to stop the answer being
visible at a glance. **Every applicant has at least two options** — one option
is what makes a bottleneck leap off the screen, since two people whose only job
is the same job is a puzzle solved before it starts. And **the smallest
bottleneck has at least three people in it**. Bottleneck sizes now run from 3 to
9.

## Files

```
game.js               the module the engine loads
style.css             applicants, jobs, and the lines between them
poster.svg            the homepage card
data/index.json       40 levels
tools/hall.py         matchings, deficiencies, and König's identity
tools/build_pack.py   writes the pack
```

Instances and answers are generated here, so this game carries no third-party
data.

König's identity is checked on 6000 random instances with the two sides computed
by completely different means — augmenting paths against an exhaustive sweep
over every subset of applicants — so agreement is evidence rather than a
tautology. It earned that within seconds of first running: it caught an
early-exit in the sweep that stopped as soon as some group of size *k* had
deficiency *k*. One unqualified applicant is such a group; four unqualified
applicants have deficiency 4.

Every level is re-checked against König as it is generated, so a disagreement
fails the build rather than shipping.
