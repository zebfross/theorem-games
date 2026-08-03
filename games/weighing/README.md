# Coin weighing

One coin in the pile is fake. It might be heavier than the rest or it might be
lighter, and you do not know which. You have a balance and no weights.

Weigh, see which way it tips, choose what to weigh next — and then name the
culprit. You win only if your weighings actually pinned it down. Naming while
two cases still fit is a guess, and a guess loses even when it is right.

## The theorem

A weighing comes out one of three ways: left pan down, right pan down, or
level. So *k* weighings can tell at most 3<sup>k</sup> cases apart. There are
2*n* cases here — which coin, and whether it is heavy or light — so

$$k \ge \log_3 2n$$

and no strategy gets under that. The classic twelve-coin puzzle sits right on
the edge of it: 24 cases, 27 outcomes, three weighings, almost nothing to spare.

## The scales are an adversary

There is no fake coin chosen at the start. The balance answers each weighing
honestly — every answer it gives is consistent with at least one fake still in
play, so nothing you are told is ever false — but among the honest answers it
picks whichever leaves you worst off.

That is what makes par mean something. You cannot stumble into a short game by
luck, a lazy weighing is punished the moment you make it, and the last case
standing at the end really is the one the balance meant all along. It is also
the theorem wearing a costume: the adversary's entire power is that three
outcomes cannot separate more than three groups.

## What the board will not do for you

It shows every weighing you have made and how it came out, and it counts how
many cases still fit. It does not tell you *which* cases those are.

That line is deliberate and it is where this game was originally wrong. The
first version had you plan all your weighings up front and press a button; the
button then enumerated the cases, computed every outcome and reported whether
any two collided. It measured well on the repo's usual test — careless play won
0.007% of the time — but the test was asking the wrong question. Careless play
losing is not the same as the interesting work being yours. All the deduction
had been automated, and what was left was applying a bookkeeping rule about
patterns, which you can do forever without once thinking about a balance.

So the deduction came back, and the only way to have it is adaptively: choosing
the next weighing in light of the last answer is exactly the step the plan-ahead
form forbids. The second hint gives up the live cases to anyone who has lost
the thread.

## Adaptivity buys nothing

Worth knowing, and slightly surprising: playing adaptively does **not** let you
find the coin in fewer weighings. `tools/adaptive.py` solves the minimax exactly
and the answer agrees with the plan-ahead optimum at every size from 3 to 39
coins. Being allowed to look between weighings makes the puzzle far more
*pleasant*, and no more powerful.

## Two sizes where counting is not the answer

Par is not always ⌈log₃ 2n⌉.

- **Four coins.** Counting allows two weighings — 8 cases inside 9 outcomes —
  but no strategy achieves it.
- **Thirteen coins.** Counting allows three: 26 cases inside 27. No strategy
  achieves that either, which is why the classic puzzle stops at twelve.

Both are blocked by the pans. A weighing has to hold the same number of coins
on each side or it tips for reasons that have nothing to do with the fake, and
in both cases every arrangement that would fit inside the outcomes leaves some
weighing holding an odd number of coins. Both are settled here by exhaustive
minimax rather than by argument.

Hand yourself one coin you *know* is genuine and both become possible: ballast
is what the parity obstruction is short of. That variant is in
`docs/GAME-IDEAS.md` and is not built.

## Can it be lost?

Yes. Careless play — legal weighings picked at random, then naming a case that
is still alive — measured over 3,000 games per size:

| coins | par | careless wins |
| --- | --- | --- |
| 3 | 2 | 62% |
| 5 | 3 | 41% |
| 8 | 3 | 0.93% |
| 12 | 3 | 0.87% |
| 20 | 4 | none in 3,000 |
| 39 | 4 | none in 3,000 |

The first two are tutorials and are meant to fall over.

## Files

```
game.js                the module the engine loads
style.css              coins, balance, the record
poster.svg             the homepage card
data/index.json        24 levels
data/levels/*.json     n, par, and the value of every position that can arise
tools/adaptive.py      the minimax, and the tables the game reads
tools/build_pack.py    writes the pack
tools/check_pack.py    re-derives every shipped value from its own successors
```

Levels and answers are generated here, so this game carries no third-party data.

```
python3 tools/build_pack.py && python3 tools/check_pack.py
```

`check_pack.py` does not re-run the solver, which would only prove the solver
agrees with itself. It checks that the shipped numbers satisfy the equation
defining them — `value = 1 + min over weighings of max over outcomes` — which is
correct whatever produced them, and cheap where solving was not.
