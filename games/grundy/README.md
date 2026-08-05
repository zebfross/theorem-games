# Sprague–Grundy — four games, one theorem

Four games are played here under four different rulebooks. Take any number of
coins from one row; take at most three; knock down one skittle or two standing
side by side; cut a twig and watch everything above it fall. They look nothing
like each other.

**Sprague** (1935) and **Grundy** (1939), independently, proved they are all the
same game. Every impartial game under normal play is equivalent to a single Nim
heap. The heap's size is the position's *Grundy value* — the least whole number
that is not the value of anything you can move to — and whoever has to move from
a value of zero loses. Games played side by side are worth the XOR of their
parts.

So the game is a disguise, and the hint is the theorem taking it off.

- **Ask once** and you are told what the position is worth, and therefore
  whether a winning move exists at all.
- **Ask twice** and every independent part of the position is labelled with the
  Nim heap it is really worth, along with the rule that got you there. This is
  true of the position rather than of any one answer, so it teaches without
  giving a move away.
- **Ask again** and the winning move lights up — the fastest one, not merely a
  sufficient one — and you still have to play it yourself.

## The four disguises

| game | the rule | what a part is worth |
| --- | --- | --- |
| Nim | take any number from one row | its own length |
| Take-away | take at most *k* from one row | length mod *k*+1 |
| Skittles (Kayles) | knock one pin, or two side by side | a table: 0, 1, 2, 3, 1, 4, 3, 2, 1, 4, 2, 6 … |
| Hackenbush | cut a twig; anything cut loose falls | one more than the XOR of what grows above it |

Kayles is the one that makes the point. No formula reads its values off the
length of a rack, and knocking a pin out of the middle splits one rack into two
independent games — the theorem carries on working anyway. Hackenbush is the
prettiest: the *colon principle* says whatever grows above an edge can be
replaced by a single stalk of the same value without changing the game, so an
edge under a stalk of *k* is just a stalk of *k+1*.

## The opponent

It never makes a mistake, and it is not played in the browser. Every level ships
the reply to every position it can ever face, worked out in
`tools/build_pack.py` and looked up by bitmask. That is deliberate: a heuristic
opponent in JavaScript would be a second implementation of the theory, free to
drift from the one that was checked.

When it is losing it drags the game out as long as it can rather than giving up,
which is what makes **par** — the fewest moves you need — worth chasing. Winning
is not the only thing being scored, because most winnable positions can be won
in several numbers of moves, and taking the shortest is the difference between
playing the position and dribbling it away.

## The wall

The last level is **1, 2, 3**, and it cannot be won. Those XOR to zero, so it is
lost before you touch it: every move out of a zero hands back something that is
not zero, and a perfect opponent hands you a zero straight back. It is here to
be lost once, on purpose — the theorem is as much about which positions are
hopeless as about which are winnable.

## What is checked

Nothing here is taken on trust. The build refuses to write a level unless:

- the position's value is non-zero, so it is winnable at all — or zero exactly
  when the level is the wall;
- par is achievable, verified by playing the whole line against the shipped
  opponent;
- the opponent has a reply to every position it can reach;
- and the closed forms in the table above agree with a full Grundy search — the
  mex of the options, computed over every reachable position — at every one of
  them. A hint that named the wrong heap would be worse than no hint: it would
  teach a rule that does not hold and send you to a losing move with the game's
  own authority behind it.

It also measures how often a player moving completely at random still wins,
because a game that cannot be lost is not a game:

| | Nim | Take-away | Skittles | Hackenbush |
| --- | --- | --- | --- | --- |
| careless win rate | 0.0–2.1% | 0.4–4.1% | 0.7–4.4% | 0.5–8.7% |

## Files

```
game.js               the board, the clicks, the hints
style.css             coins, skittles, twigs
data/index.json       13 levels
tools/theory.py       positions, moves, Grundy values, the opponent
tools/build_pack.py   builds and verifies the pack
```
