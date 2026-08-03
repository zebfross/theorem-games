# Coin weighing

One coin in the pile is fake. It might be heavier than the rest or it might be
lighter, and you do not know which. You have a balance and no weights. Plan
every weighing in advance, and use as few of them as you can.

## The theorem

A weighing comes out one of three ways: left pan down, right pan down, or level.
So *k* weighings can tell at most 3<sup>k</sup> cases apart. There are 2*n*
cases here — which coin is fake, and whether it is heavy or light — so

$$k \ge \log_3 2n$$

and no cleverness gets under that. It is the same counting argument behind the
classic twelve-coin puzzle: 24 cases, 27 outcomes, three weighings, and barely
any room to spare.

The rack along the bottom of the board is that argument drawn. It holds one slot
per outcome, and it triples every time you bring in another weighing. Every case
drops into its slot when you run, and two in the same slot is exactly the thing
the theorem is counting — the scales behave identically, so you cannot say which
of the two it was.

## The non-adaptive form

The twelve-coin puzzle is usually solved *adaptively*: weigh, look, then decide
what to weigh next. Here every weighing is chosen up front, which is a real
restriction — but it is what makes this a thing you arrange and then run rather
than a dialogue, and at these sizes the minimum comes out the same.

Written non-adaptively the puzzle turns into something pleasantly concrete.
Give each coin the pattern of pans it sits in, one entry per weighing:

```
+1 left pan     -1 right pan     0 set aside
```

If coin *i* is the heavy one, every weighing tips towards the pan holding it, so
the outcome is that pattern exactly. If it is the light one, the scales tip the
other way and the outcome is the pattern negated. A scheme works precisely when
all 2*n* of those are distinct, which needs three things:

- **No coin set aside every time.** Its pattern is all zeroes, which is its own
  negation, so it looks the same heavy or light.
- **No two coins with mirrored patterns.** That coin heavy and this one light
  would tip every weighing alike.
- **Even pans.** A weighing with more coins on one side tips that way whatever
  the fake is doing, and tells you nothing.

The first two say a scheme is a choice of *n* patterns, one from each mirrored
pair — and there are (3<sup>k</sup> − 1)/2 pairs to choose from. That is the
second hint, and it is most of the answer.

## Why thirteen coins needs a fourth weighing

Counting alone permits it: 26 cases fit inside 27 outcomes. But there are
exactly 13 usable patterns for three weighings, so all thirteen must be used —
and each weighing is touched by 9 of them. Nine coins cannot be split evenly
between two pans, so the pans can never come out even. Thirteen needs four.

Four coins in two weighings fails for the same reason, which is why par is 3
there and not the 2 the counting bound allows. Both are checked exhaustively
rather than argued, in `tools/check_pack.py`.

## Can it be lost?

Yes, which is the point — a puzzle that solves itself under careless play is not
a puzzle, and this repo has thrown one away for failing exactly that test.
Playing thoughtlessly here means evening up the pans and then assigning coins at
random, which is the strongest careless strategy available. Measured over
40,000 random arrangements at par:

| coins | par | careless wins |
| --- | --- | --- |
| 3 | 2 | 66% |
| 5 | 3 | 21% |
| 8 | 3 | 0.59% |
| 12 | 3 | 0.007% |
| 20 | 4 | 0.005% |
| 24+ | 4 | none in 40,000 |

The first two levels are tutorials and are meant to fall over. Everything from
about seven coins upward has to be reasoned about.

The board deliberately does **not** fill the rack while you arrange. It shows
the slots, empty, so the count of slots against the count of stories is there to
read before you commit — but what lands where is only revealed by running. With
live collision feedback a blind hill-climber solves twelve coins in a median of
360 nudges, which is not a game so much as a fidget.

## Files

```
game.js              the module the engine loads
style.css            coins, pans, rack
poster.svg           the homepage card
data/index.json      24 levels
data/levels/*.json   n, par, rows, and one worked answer for the last hint
tools/weighing.py    schemes, faults, and the search for the minimum
tools/build_pack.py  writes the pack
tools/check_pack.py  re-derives every claim from the level files alone
```

Levels and answers are generated here, so this game carries no third-party data.

```
python3 tools/build_pack.py && python3 tools/check_pack.py
```
