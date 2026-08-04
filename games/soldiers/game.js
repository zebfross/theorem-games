'use strict';

/* Conway's soldiers — how far above the line can you get?
 *
 * Soldiers stand below a line. One may jump over a neighbour into the empty
 * cell beyond, orthogonally, and the soldier jumped over is taken off the
 * board: peg solitaire, with every piece starting on one side of a line.
 *
 * The fewest needed to put a man on row n:
 *
 *     row 1    2 soldiers
 *     row 2    4
 *     row 3    8
 *     row 4   20
 *     row 5   impossible, for any army whatsoever
 *
 * That last line is Conway's and it is why this is here. Not hard, not open —
 * impossible. Weight cell (x, y) with phi^(n - y - |x|), where phi is the
 * golden ratio, chosen because phi^2 = phi + 1 is exactly what makes a jump
 * towards the target never increase the total. The whole half-plane below the
 * line sums to 1, which is the weight of the single target cell, and play
 * strictly decreases the total. So the target can never be reached, and an army
 * of any size at all, arranged however you please, does not help.
 *
 * The ladder is what makes it a game rather than a curiosity: four rows you can
 * reach, each with an exact classical par and a construction you have to find,
 * and then a wall.
 *
 * Nothing here searches. Each level ships an army of exactly par soldiers and a
 * jump sequence, both found and replayed offline; see tools/army.py. What is
 * computed here is only what the player can see anyway — which jumps are legal,
 * and whether anybody has got high enough.
 */

import { board, svgEl } from '../../engine/engine.js';

const CELL = 44;
const MARGIN = 22;
const PLATE_H = 34;

const cols = (level) => 2 * level.width + 1;
const rowsDeep = (level) => level.row + level.depth + 1;
const boardW = (level) => cols(level) * CELL;
const boardH = (level) => rowsDeep(level) * CELL;

const cx = (level, x) => MARGIN + (x + level.width) * CELL + CELL / 2;
const cy = (level, y) => MARGIN + (level.row - y) * CELL + CELL / 2;
const plateY = (level) => MARGIN + boardH(level) + 16;

/** Which cell a click landed on, or null. */
function cellAt(level, p) {
  const x = Math.round((p.x - MARGIN - CELL / 2) / CELL) - level.width;
  const y = level.row - Math.round((p.y - MARGIN - CELL / 2) / CELL);
  if (x < -level.width || x > level.width) return null;
  if (y > level.row || y < -level.depth + 1) return null;
  return [x, y];
}

const key = (c) => `${c[0]},${c[1]}`;
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/** Every jump available to the soldier on `from`. */
function jumpsFrom(army, from) {
  const out = [];
  for (const [dx, dy] of DIRS) {
    const over = [from[0] + dx, from[1] + dy];
    const to = [from[0] + 2 * dx, from[1] + 2 * dy];
    if (army.has(key(over)) && !army.has(key(to))) out.push({ over, to });
  }
  return out;
}

/** Is any jump available at all? */
function anyJump(army) {
  for (const k of army) {
    const from = k.split(',').map(Number);
    if (jumpsFrom(army, from).length) return true;
  }
  return false;
}

const highest = (army) => [...army].reduce(
  (best, k) => Math.max(best, Number(k.split(',')[1])), -Infinity);

/* ---------------------------------------------------------------- drawing */

function render(level, play) {
  board.replaceChildren();
  const reached = highest(play.army) >= level.row;

  // The ground below the line, and the country above it that has to be
  // invaded. Drawn as two fields rather than one grid, because which side of
  // the line a cell is on is the only thing about it that matters.
  board.appendChild(svgEl('rect', {
    x: MARGIN, y: MARGIN, width: boardW(level),
    height: (level.row + 0.5) * CELL, class: 'above',
  }));
  board.appendChild(svgEl('rect', {
    x: MARGIN, y: MARGIN + (level.row + 0.5) * CELL, width: boardW(level),
    height: boardH(level) - (level.row + 0.5) * CELL, class: 'below',
  }));

  for (let x = -level.width; x <= level.width; x++) {
    for (let y = -level.depth + 1; y <= level.row; y++) {
      board.appendChild(svgEl('rect', {
        x: cx(level, x) - CELL / 2 + 1, y: cy(level, y) - CELL / 2 + 1,
        width: CELL - 2, height: CELL - 2, rx: 5,
        class: 'cell' + (y === level.row ? ' target' : ''),
      }));
    }
  }

  const lineY = MARGIN + (level.row + 0.5) * CELL;
  board.appendChild(svgEl('line', {
    x1: MARGIN, y1: lineY, x2: MARGIN + boardW(level), y2: lineY,
    class: 'frontier',
  }));

  // Where a selected soldier could go.
  if (play.picked) {
    for (const { over, to } of jumpsFrom(play.army, play.picked)) {
      board.appendChild(svgEl('rect', {
        x: cx(level, to[0]) - CELL / 2 + 5, y: cy(level, to[1]) - CELL / 2 + 5,
        width: CELL - 10, height: CELL - 10, rx: 5, class: 'landing',
      }));
      board.appendChild(svgEl('circle', {
        cx: cx(level, over[0]), cy: cy(level, over[1]), r: 15, class: 'doomed',
      }));
    }
  }

  for (const k of play.army) {
    const [x, y] = k.split(',').map(Number);
    const top = y === highest(play.army);
    board.appendChild(svgEl('circle', {
      cx: cx(level, x), cy: cy(level, y), r: 15,
      class: 'soldier' + (play.picked && key(play.picked) === k ? ' picked' : '')
        + (reached && y >= level.row ? ' arrived' : '')
        + (!reached && top && y > 0 ? ' leader' : ''),
    }));
  }

  play.plates = plates(level, play);
}

function plates(level, play) {
  if (play.done) return [];
  const out = [];
  if (play.history.length) {
    out.push({ key: 'undo', caption: 'Take that jump back', on: true });
  }
  if (level.wall) {
    out.push({ key: 'give', caption: 'I cannot do it', on: true });
  }
  if (!out.length) return [];
  const width = boardW(level);
  const gap = 12;
  const each = (width - gap * (out.length - 1)) / out.length;
  out.forEach((p, i) => {
    p.x = MARGIN + i * (each + gap);
    p.w = each;
    board.appendChild(svgEl('rect', {
      x: p.x, y: plateY(level), width: p.w, height: PLATE_H, rx: 9,
      class: 'plate',
    }));
    const t = svgEl('text', {
      x: p.x + p.w / 2, y: plateY(level) + 22, class: 'plate-label',
    });
    t.textContent = p.caption;
    board.appendChild(t);
  });
  return out;
}

/* ---------------------------------------------------------------- exports */

export default {
  id: 'soldiers',
  title: 'Conway’s soldiers',
  blurb:
    'Jump your soldiers over each other to get one of them as far above the '
    + 'line as you can. There is a row nobody will ever reach.',
  credit:
    'A game on <b>Conway’s soldiers</b>. Reaching row n across the line takes '
    + 'at least 2, 4, 8 and 20 soldiers for n = 1, 2, 3, 4 — and row 5 cannot '
    + 'be reached by any army at all, however large. Weight the cell at '
    + 'distance d from the target by <b>φ<sup>−d</sup></b>, where φ is the '
    + 'golden ratio: because <b>φ² = φ + 1</b>, no jump towards the target '
    + 'increases the total, and the whole half-plane below the line sums to '
    + 'exactly the weight of the target cell. Armies and jump sequences are '
    + 'generated here, so this game carries no third-party data.',

  group: (m) => (m.wall ? 'the wall' : `reaching row ${m.row}`),
  chip: (m) => (m.wall ? 'row 5' : `${m.row}·${m.par}`),
  par: (m) => m.par,

  start: () => ({
    army: new Set(),
    picked: null,
    history: [],
    done: null,
    plates: [],
  }),

  view: (level) => [0, 0, boardW(level) + MARGIN * 2,
                    plateY(level) + PLATE_H + MARGIN],

  describe(level, play) {
    const top = play.army.size ? highest(play.army) : null;
    if (level.wall) {
      return {
        goal: 'Put one soldier on <b>row 5</b>. Use as many as you like',
        status: `${play.army.size} soldiers`
          + (top !== null && top > 0 ? ` · highest reached: row ${top}` : ''),
      };
    }
    return {
      goal: `Get a soldier to <b>row ${level.row}</b> using as few as you can`,
      status: `${play.army.size} soldiers`
        + (play.history.length ? ` · ${play.history.length} jumps` : '')
        + (top !== null && top > 0 ? ` · highest: row ${top}` : ''),
    };
  },

  click(level, play, p) {
    if (play.done) return {};

    if (p.y >= plateY(level) && p.y <= plateY(level) + PLATE_H) {
      const hit = play.plates.find((q) => p.x >= q.x && p.x <= q.x + q.w);
      if (hit) return this.plate(level, play, hit.key);
      return {};
    }

    const cell = cellAt(level, p);
    if (!cell) return { message: 'Click a square on the board.' };
    const k = key(cell);

    // A soldier already picked, and this is somewhere it can land.
    if (play.picked) {
      const jump = jumpsFrom(play.army, play.picked)
        .find((j) => key(j.to) === k);
      if (jump) {
        play.history.push(new Set(play.army));
        play.army.delete(key(play.picked));
        play.army.delete(key(jump.over));
        play.army.add(key(jump.to));
        play.picked = null;
        if (highest(play.army) >= level.row) play.done = 'arrived';
        else if (!anyJump(play.army)) play.done = 'stuck';
        return { changed: true };
      }
    }

    if (play.army.has(k)) {
      // Before any jump, clicking a soldier takes it off the board again;
      // afterwards the army is fixed and clicking picks it up to move.
      if (!play.history.length && !jumpsFrom(play.army, cell).length) {
        play.army.delete(k);
        play.picked = null;
        return { changed: true };
      }
      play.picked = play.picked && key(play.picked) === k ? null : cell;
      return { changed: true };
    }

    if (play.history.length) {
      return { message: 'The army is set once the jumping starts. '
                        + 'Take the jumps back to change it.' };
    }
    if (cell[1] > 0) {
      return { message: 'Soldiers start below the line.' };
    }
    play.army.add(k);
    play.picked = null;
    return { changed: true };
  },

  plate(level, play, which) {
    if (which === 'undo' && play.history.length) {
      play.army = play.history.pop();
      play.picked = null;
      return { changed: true };
    }
    if (which === 'give') { play.done = 'gave-up'; return { changed: true }; }
    return {};
  },

  draw: (level, play) => render(level, play),

  // Move by move: each jump is the move, and the level ends when somebody
  // arrives or nobody can move again.
  over: (level, play) => play.done !== null,

  verdict(level, play) {
    const used = play.history.length
      ? [...play.history[0]].length : play.army.size;
    const top = highest(play.army);

    if (level.wall) {
      return {
        won: true,
        perfect: true,
        score: 0,
        title: 'Nobody was ever going to reach row 5.',
        detail: `You got to row ${top > 0 ? top : 0}. So does everybody, and `
                + 'no army does better — not a hundred soldiers, not a million. '
                + 'Give the cell d steps from the target the weight φ⁻ᵈ, with φ '
                + 'the golden ratio. Because φ² = φ + 1, no jump towards the '
                + 'target adds to the total, and the entire half-plane below '
                + 'the line adds up to exactly the weight of the one cell you '
                + 'are aiming at. There is nothing left over to spend.',
        readout: `stopped at row ${top > 0 ? top : 0}`,
      };
    }

    if (play.done === 'stuck') {
      return {
        won: false,
        title: 'No jumps left.',
        detail: `The highest anybody got was row ${top > 0 ? top : 0}, and `
                + `row ${level.row} was the ask. Every jump spends a soldier, `
                + 'so an army that scatters runs out before it climbs — the '
                + 'ones that work keep their pieces within reach of each other.',
        readout: `stuck at row ${top > 0 ? top : 0}`,
      };
    }

    const perfect = used === level.par;
    return {
      won: true,
      perfect,
      score: used,
      title: perfect ? `Row ${level.row}, on exactly ${level.par}.`
                     : `Row ${level.row}.`,
      detail: perfect
        ? `${used} soldiers, which is the fewest that can do it — Conway's `
          + `number for row ${level.row}. The ladder runs 2, 4, 8, 20, and then `
          + 'stops: row 5 cannot be reached at all.'
        : `${used} soldiers got there, where ${level.par} is enough. The ladder `
          + 'runs 2, 4, 8, 20 — and then stops, because row 5 cannot be reached '
          + 'by any army whatsoever.',
      readout: `${used} soldiers`,
    };
  },

  hint(level, play, tier) {
    if (level.wall) {
      return {
        text: 'There is no hint, because there is no way. Row 5 is not hard, '
              + 'it is impossible: weight the cell d steps from the target by '
              + 'φ⁻ᵈ, and since φ² = φ + 1 no jump towards it can increase the '
              + 'total, while the whole half-plane below the line sums to '
              + 'exactly the target cell’s own weight. Play as long as you '
              + 'like and then say you cannot do it — that is the level.',
      };
    }

    if (tier === 1) {
      return {
        text: `Row ${level.row} takes ${level.par} soldiers and no fewer. The `
              + 'ladder is 2, 4, 8, 20 — each row costs more than double the '
              + 'one below, which is the first sign that it is going to stop '
              + 'somewhere, and it stops at row 5. Every jump costs you a '
              + 'soldier and gains two squares, so nothing is free: an army '
              + 'spread thin cannot feed the climb.',
      };
    }

    if (tier === 2) {
      const cluster = level.answer.filter(([, y]) => y === 0).length;
      return {
        text: 'Build a column under the target and a shelf beside it. The '
              + `answer here keeps ${cluster} of its ${level.par} soldiers on `
              + 'the top row, right below the line, because a soldier only ever '
              + 'jumps two squares — anything further back has to be walked '
              + 'forward first, and walking forward costs soldiers too.',
      };
    }

    play.army = new Set(level.answer.map((c) => key(c)));
    play.history = [];
    play.picked = null;
    return {
      text: `An army of ${level.par} that reaches row ${level.row} is on the `
            + 'board. Now jump it up — the sequence is yours to find, and there '
            + 'is more than one.',
    };
  },
};
