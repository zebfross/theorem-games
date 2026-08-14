'use strict';

/* Chomp — a bar of chocolate with one poisoned corner.
 *
 * Take a square and everything above and to the right of it goes with it. The
 * corner square is poisoned, so the game is really about who runs out of safe
 * squares first: whoever is left facing the poison alone has to eat it.
 *
 * THE THEOREM, AND WHY THIS GAME IS SHAPED THE WAY IT IS. On any rectangle
 * bigger than a single square, the player who moves first wins. The proof is
 * strategy stealing: suppose the second player had a winning reply to every
 * opening. The first player could then take the far corner alone, look up the
 * reply that is supposed to beat it, and — since that reply is itself one move
 * from the full bar — could simply have opened with it. The assumption kills
 * itself, so no second-player strategy exists.
 *
 * That proof is non-constructive, and aggressively so. It guarantees a winning
 * move and says nothing about which one. Every rectangle in this pack has
 * exactly one winning opening, out of up to forty-one squares, and no known
 * rule produces it — for the five by seven bar it is simply the answer a search
 * found. The hints here are search results for that reason: there is no rule to
 * hand over instead. Every other game in this collection teaches you something
 * you can carry to the next board; this one is about a proof that refuses to.
 *
 * NO THEORY LIVES IN THIS FILE. The opponent's reply to every position, and the
 * count of moves still needed from every position, are computed by
 * tools/theory.py and shipped with the level. This module looks things up. That
 * is the rule the API doc gives for games with an opponent, and the reason is
 * that a second implementation here would be free to drift from the one that
 * was actually checked, and the drift would surface as a par nobody can reach.
 *
 * A position is the width of each row, from the poisoned row upward, and those
 * widths never increase going up — taking a square takes everything above and
 * right, so what is left is always a staircase. Keyed as digits, bottom row
 * first, which is exactly what the build wrote.
 */

import { board, svgEl } from '../../engine/engine.js';

const CELL = 100;
const PAD = 34;

/** A position as the level files key it: widths, bottom row first. */
const keyOf = (pos) => pos.join('');

/** "rc" as shipped -> [r, c]. */
const moveOf = (s) => [Number(s[0]), Number(s[1])];

/** Row 0 is the poisoned row and sits at the bottom, so y counts down. */
const xOf = (c) => c * CELL;
const yOf = (level, r) => (level.rows - 1 - r) * CELL;

/** The squares taken when (r, c) goes: it, and everything up and to the right. */
function swallowed(pos, r, c) {
  const gone = [];
  for (let i = r; i < pos.length; i++) {
    for (let j = c; j < pos[i]; j++) gone.push([i, j]);
  }
  return gone;
}

function apply(pos, r, c) {
  return pos.map((w, i) => (i >= r ? Math.min(w, c) : w));
}

/** Is the poison the only thing left? Then whoever is to move must eat it. */
const onlyPoison = (pos) => pos[0] === 1 && pos.every((w, i) => (i === 0 ? w === 1 : w === 0));

function render(level, play) {
  board.replaceChildren();

  // The squares the opponent has just taken, drawn as empty outlines until the
  // player moves again. Without this the board silently changes shape between
  // one click and the next and a reply that swallows nine squares is
  // unreadable — the API doc's warning, and it is a real one here because a
  // single move can clear most of the bar.
  for (const [r, c] of play.theirs) {
    board.appendChild(svgEl('rect', {
      class: 'chomp-gone', x: xOf(c) + 4, y: yOf(level, r) + 4,
      width: CELL - 8, height: CELL - 8, rx: 10,
    }));
  }

  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < play.pos[r]; c++) {
      const poison = r === 0 && c === 0;
      const g = svgEl('g', { class: 'chomp-square' });
      g.appendChild(svgEl('rect', {
        class: poison ? 'chomp-poison' : 'chomp-choc',
        x: xOf(c) + 3, y: yOf(level, r) + 3,
        width: CELL - 6, height: CELL - 6, rx: 12,
      }));
      // A groove along the top and left, so the bar reads as moulded squares
      // rather than as a grid of tiles.
      g.appendChild(svgEl('rect', {
        class: 'chomp-facet',
        x: xOf(c) + 13, y: yOf(level, r) + 13,
        width: CELL - 26, height: CELL - 26, rx: 7,
      }));
      if (poison) {
        // A skull rather than a ring with two dots, which is what this was
        // first and which read as a smiley — cheerful is the one thing this
        // square must not look like.
        const cx = xOf(0) + CELL / 2;
        const cy = yOf(level, 0) + CELL / 2;
        g.appendChild(svgEl('path', {
          class: 'chomp-skull',
          d: `M ${cx - 15} ${cy - 2} a 15 16 0 0 1 30 0 v 8 a 5 5 0 0 1 -5 5`
             + ` h -20 a 5 5 0 0 1 -5 -5 z`,
        }));
        g.appendChild(svgEl('circle', { class: 'chomp-eye', cx: cx - 6, cy: cy - 3, r: 4.2 }));
        g.appendChild(svgEl('circle', { class: 'chomp-eye', cx: cx + 6, cy: cy - 3, r: 4.2 }));
        g.appendChild(svgEl('path', {
          class: 'chomp-jaw',
          d: `M ${cx - 8} ${cy + 12} h 16 M ${cx - 3} ${cy + 12} v 5 M ${cx + 3} ${cy + 12} v 5`,
        }));
      }
      board.appendChild(g);
    }
  }

  if (play.lit) {
    const [r, c] = play.lit;
    board.appendChild(svgEl('rect', {
      class: 'chomp-lit', x: xOf(c) + 3, y: yOf(level, r) + 3,
      width: CELL - 6, height: CELL - 6, rx: 12,
    }));
  }
}

export default {
  id: 'chomp',
  title: 'Chomp',
  blurb: 'Eat the chocolate. Leave the poisoned corner for them.',
  credit:
    'A game on <b>strategy stealing</b> &mdash; Chomp is due to <b>David '
    + 'Gale</b> (1974), with the poset form of the argument going back to '
    + '<b>Schuh</b> (1952). The argument proves the first player wins on any '
    + 'rectangle and reveals no winning move whatever. Every position, every '
    + 'reply and every par here is computed by exhaustive search in '
    + '<code>tools/theory.py</code>, so this game carries no third-party data.',

  group: (m) => m.tag,
  chip: (m) => m.chip,
  par: (m) => m.par,

  start(level) {
    return {
      pos: Array(level.rows).fill(level.cols),
      moves: 0,
      done: null,
      why: null,
      theirs: [],
      lit: null,
      past: [],
    };
  },

  view: (level) => [
    -PAD, -PAD, level.cols * CELL + PAD * 2, level.rows * CELL + PAD * 2,
  ],

  describe(level, play) {
    const left = play.pos.reduce((a, b) => a + b, 0);
    return {
      goal: 'Take a square and everything above and to the right of it goes '
        + 'too. The corner with the skull is poisoned &mdash; whoever eats it '
        + 'loses, so leave it for them.',
      status: play.done === 'won' ? `won in ${play.moves}`
        : play.done === 'lost'
          ? (play.why === 'ate' ? 'you ate the poison' : 'only the poison is left')
          : play.moves === 0 ? 'your move' : `your move · ${play.moves} so far · ${left} squares`,
    };
  },

  click(level, play, p) {
    if (play.done) return { message: 'This one is over. Clear to play it again.' };

    const c = Math.floor(p.x / CELL);
    const r = level.rows - 1 - Math.floor(p.y / CELL);
    if (r < 0 || r >= level.rows || c < 0 || c >= level.cols) {
      return { message: 'Click a square of the bar.' };
    }
    if (c >= play.pos[r]) return { message: 'That square has already gone.' };

    // Both halves of the round happen in this one click, so one snapshot takes
    // back the move and the reply to it together.
    play.past.push({ pos: play.pos, moves: play.moves, theirs: play.theirs });
    play.lit = null;

    if (r === 0 && c === 0) {
      // Eating the poison is always available and always loses. It is not a
      // move the search considers, because nobody would choose it — but the
      // player can, and the game has to let them find that out.
      play.pos = apply(play.pos, 0, 0);
      play.moves += 1;
      play.done = 'lost';
      play.why = 'ate';
      return { changed: true };
    }

    play.pos = apply(play.pos, r, c);
    play.moves += 1;
    play.theirs = [];

    if (onlyPoison(play.pos)) {
      play.done = 'won';                  // nothing safe left for them
      return { changed: true };
    }

    const back = level.reply[keyOf(play.pos)];
    if (back === undefined) {
      // The table covers every position reachable here, so this cannot fire.
      // If it ever does, stopping is better than inventing a reply that the
      // par was not measured against.
      play.done = 'won';
      return { changed: true };
    }
    const [br, bc] = moveOf(back);
    play.theirs = swallowed(play.pos, br, bc);
    play.pos = apply(play.pos, br, bc);
    if (onlyPoison(play.pos)) {
      play.done = 'lost';                 // the poison, and your turn
      play.why = 'left';
    }
    return { changed: true };
  },

  draw: (level, play) => render(level, play),

  over: (level, play) => play.done !== null,

  undoable: (level, play) => play.past.length > 0,

  /** Take back your move and their reply together.
   *
   *  Not treated as help, and so not costing a best score: the opponent is a
   *  fixed table that answers the same way every time, so anything reachable
   *  by undoing is equally reachable by pressing Clear and replaying. A hint
   *  tells you something you did not know; this only saves you the retyping.
   */
  undo(level, play) {
    const back = play.past.pop();
    if (!back) return false;
    play.pos = back.pos;
    play.moves = back.moves;
    play.theirs = back.theirs;
    play.done = null;
    play.why = null;
    play.lit = null;
    return true;
  },

  verdict(level, play) {
    if (play.done === 'lost') {
      const detail = play.why === 'ate'
        ? 'That was the poisoned one. Taking it is always allowed and always '
          + 'loses, which is the only rule this game has.'
        : 'Everything safe is gone and it is your turn, so the poison is '
          + 'yours. Somewhere back there you handed over a position they could '
          + 'win from — on a rectangle it is only ever one move that keeps the '
          + 'win, so it is easier to lose here than it looks.';
      return { won: false, title: 'You have to eat it.', detail };
    }
    if (play.moves === level.par) {
      return {
        won: true,
        perfect: true,
        score: play.moves,
        title: 'Perfect.',
        detail: `They are left with the poison in ${play.moves} moves, which is `
          + 'as fast as this bar can be won against an opponent who never errs.',
      };
    }
    return {
      won: true,
      perfect: false,
      score: play.moves,
      title: 'They have to eat it.',
      detail: `Won in ${play.moves} moves, where ${level.par} would do. Taking `
        + 'more of the bar at once gets there sooner, so long as what you leave '
        + 'behind is still a position they cannot win from.',
    };
  },

  hint(level, play, tier) {
    const here = keyOf(play.pos);
    const need = level.need[here];
    const opening = play.moves === 0;

    if (tier === 1) {
      if (opening) {
        return {
          text: `This is a rectangle, so you win — strategy stealing proves it. `
            + `If they had an answer to everything you could open with, you `
            + `could have opened with that answer instead. What the proof will `
            + `not tell you is which move it is, and on this bar exactly `
            + `${level.openings} of the ${level.rows * level.cols - 1} you `
            + `could play does it.`,
        };
      }
      if (need === undefined) {
        return {
          text: 'There is no winning move left here. A perfect opponent takes '
            + 'this whatever you do, so the mistake is already behind you — '
            + 'undo, or clear and start again.',
        };
      }
      return {
        text: `You are still winning: ${need} more move${need === 1 ? '' : 's'} `
          + 'does it from here, against this opponent.',
      };
    }

    if (need === undefined) {
      return {
        text: 'Nothing to point at — this position is lost against perfect '
          + 'play, so no move here is better than any other.',
      };
    }

    const [r, c] = moveOf(level.best[here]);
    if (tier === 2) {
      // Half the answer. Uniqueness is the problem with hinting this game —
      // with one winning move there is no fact true of "every solution" to
      // give away safely, so what is offered instead is a narrowing: the row,
      // which cuts the choice to a handful without naming it.
      const which = r === 0 ? 'the bottom row, the one with the poison in it'
        : `row ${r + 1} counting up from the poison`;
      return {
        text: `The move you want is in ${which}. Which square in it is the `
          + 'part no rule will give you.',
      };
    }

    play.lit = [r, c];
    return {
      text: 'Take the square that is lit. Everything above and to the right of '
        + 'it goes with it, and what that leaves is a position they cannot win '
        + 'from. Make the move yourself.',
    };
  },
};
