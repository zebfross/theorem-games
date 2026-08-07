'use strict';

/* Sorting networks — build one, using as few comparators as you can.
 *
 * A comparator network is a fixed list of comparisons. Values run left to
 * right; a comparator joining two wires puts the smaller on the upper and the
 * larger on the lower. Nothing branches and nothing loops, so the same
 * comparisons happen whatever the numbers are.
 *
 * That makes it hard to be sure of — there are infinitely many inputs — until
 * the **0-1 principle**: a network sorts every input exactly when it sorts
 * every input made only of zeros and ones. Comparators commute with any
 * non-decreasing function, so thresholding a failing input gives a failing
 * zero-one input.
 *
 * Which does something better than making the question decidable. It makes
 * failure *exhibitable*: a network that does not sort has a specific input of
 * noughts and ones that it gets wrong, and this game runs that input down the
 * wires in front of you. Every other game here shows you that you fell short.
 * This one hands you the counterexample.
 *
 * The verdict is decided by testing all 2^n zero-one inputs, not by watching
 * the animation. Par comes from tools/build_pack.py, where the fewest
 * comparators are searched for and the answer is checked by a second route.
 */

import { board, svgEl } from '../../engine/engine.js';

const LEFT = 70;          // where the wires start
const STEP = 46;          // horizontal gap between comparators
const GAP = 52;           // vertical gap between wires
const TOP = 46;

const wireY = (k) => TOP + k * GAP;
const slotX = (k) => LEFT + 34 + k * STEP;

/** How many comparator slots the board has to hold.
 *
 *  The prefix counts. Sizing from par alone drew the given comparators of a
 *  finish-it level clean off the right-hand edge — twelve of them on the last
 *  level, against a par of four. The slack is for the ones a player adds beyond
 *  par, since the view is set once when the level loads and cannot grow.
 */
const span = (level) => level.prefix.length + level.par + 4;

/** Run one input through a network, keeping every intermediate. */
function trace(wires, comps, input) {
  let v = input;
  const stages = [v];
  for (const [i, j] of comps) {
    if ((v >> i) & 1 && !((v >> j) & 1)) v = (v & ~(1 << i)) | (1 << j);
    stages.push(v);
  }
  return stages;
}

const isSorted = (wires, v) => {
  // Sorted means the ones sit on the bottom wires: no 1 above a 0.
  let seenOne = false;
  for (let k = 0; k < wires; k++) {
    const bit = (v >> k) & 1;
    if (bit) seenOne = true;
    else if (seenOne) return false;
  }
  return true;
};

/** The lowest zero-one input this network gets wrong, or null if it sorts.
 *
 *  This is the whole of the 0-1 principle in four lines: 2^n inputs decide a
 *  question about all of them, and the first failure is a witness you can put
 *  on the board.
 */
function witness(wires, comps) {
  for (let v = 0; v < (1 << wires); v++) {
    const out = trace(wires, comps, v).at(-1);
    if (!isSorted(wires, out)) return v;
  }
  return null;
}

const all = (level, play) => [...level.prefix, ...play.added];

function render(level, play, phase) {
  board.replaceChildren();
  const comps = all(level, play);
  const width = LEFT + 34 + Math.max(span(level), comps.length + 1) * STEP;

  for (let k = 0; k < level.wires; k++) {
    board.appendChild(svgEl('line', {
      x1: LEFT, y1: wireY(k), x2: width, y2: wireY(k), class: 'wire',
    }));
  }

  // Values, when a run is showing them. Drawn per wire at the stage reached.
  const show = play.sim && phase !== 'placing' ? play.sim : null;
  if (show) {
    const v = show.stages[show.at];
    for (let k = 0; k < level.wires; k++) {
      const on = (v >> k) & 1;
      board.appendChild(svgEl('circle', {
        cx: LEFT - 26, cy: wireY(k), r: 13,
        class: 'bead' + (on ? ' one' : ' zero'),
      }));
    }
  }

  comps.forEach(([i, j], k) => {
    const given = k < level.prefix.length;
    const x = slotX(k);
    const live = show && show.at === k + 1;
    board.appendChild(svgEl('line', {
      x1: x, y1: wireY(i), x2: x, y2: wireY(j),
      class: 'comp' + (given ? ' given' : '') + (live ? ' firing' : ''),
    }));
    for (const w of [i, j]) {
      board.appendChild(svgEl('circle', {
        cx: x, cy: wireY(w), r: 6,
        class: 'end' + (given ? ' given' : ''),
      }));
    }
  });

  // The wire the player has picked as one half of a new comparator.
  if (play.picked !== null && phase === 'placing') {
    board.appendChild(svgEl('circle', {
      cx: slotX(comps.length), cy: wireY(play.picked), r: 10, class: 'picked',
    }));
  }
}

export default {
  id: 'sorting',
  title: 'Sorting networks',
  blurb: 'Build a network that sorts every input, with as few comparators as you can.',
  credit:
    'A game on the <b>0-1 principle</b>: a comparator network sorts every '
    + 'input exactly when it sorts every input of noughts and ones, because '
    + 'comparators commute with any non-decreasing function. So a network that '
    + 'fails has a witness you can watch. The smallest networks &mdash; 3, 5, 9 '
    + 'and 12 comparators for three to six wires, as in <b>Knuth</b> &mdash; are '
    + 'searched here rather than quoted, so this game carries no third-party '
    + 'data.',

  group: (m) => `${m.wires} wires`,
  chip: (m) => (m.given ? `finish ${m.par}` : `all ${m.par}`),
  par: (m) => m.par,

  start: () => ({ added: [], picked: null, sim: null, showWitness: false }),

  view: (level) => [0, 0, LEFT + 34 + span(level) * STEP,
    TOP + (level.wires - 1) * GAP + TOP],

  runnable: (level, play) => play.added.length > 0,

  describe(level, play) {
    const n = play.added.length;
    return {
      goal: level.prefix.length
        ? `Finish the network. <b>${level.par}</b> more comparators will do it.`
        : `Sort ${level.wires} wires. <b>${level.par}</b> comparators will do it.`,
      status: `${n} added${n === level.par ? ' · that is par' : ''}`,
    };
  },

  click(level, play, p) {
    // Clicking an added comparator takes it out; clicking two wires adds one.
    const comps = all(level, play);
    for (let k = level.prefix.length; k < comps.length; k++) {
      if (Math.abs(p.x - slotX(k)) < STEP * 0.42) {
        const [i, j] = comps[k];
        const lo = Math.min(wireY(i), wireY(j));
        const hi = Math.max(wireY(i), wireY(j));
        if (p.y > lo - 14 && p.y < hi + 14) {
          play.added.splice(k - level.prefix.length, 1);
          play.picked = null;
          return { changed: true };
        }
      }
    }

    let wire = -1;
    let best = Infinity;
    for (let k = 0; k < level.wires; k++) {
      const d = Math.abs(p.y - wireY(k));
      if (d < best) { best = d; wire = k; }
    }
    if (best > GAP * 0.45) {
      return { message: 'Click a wire, then another, to join them.' };
    }
    if (play.picked === null) {
      play.picked = wire;
      return { changed: true };
    }
    if (play.picked === wire) {
      play.picked = null;
      return { changed: true };
    }
    play.added.push([Math.min(play.picked, wire), Math.max(play.picked, wire)]);
    play.picked = null;
    return { changed: true };
  },

  draw: (level, play, phase) => render(level, play, phase),

  sim: {
    // No scrub bar. The run is a handful of steps and the thing worth seeing is
    // where it ends up, not a moment in the middle — and with the failing input
    // named in the verdict there is nothing to hunt for.
    replay: false,

    create(level, play) {
      // The input the run shows is chosen by the theorem, not for effect: if
      // the network is wrong, it is the lowest zero-one input it gets wrong.
      // Otherwise it is the most scrambled input there is, so a network that
      // works is seen doing its hardest case.
      const comps = all(level, play);
      const bad = witness(level.wires, comps);
      const input = bad === null ? (1 << level.wires) - 1 - 0 : bad;
      const scramble = bad === null
        ? parseInt('1'.repeat(Math.floor(level.wires / 2))
          .padEnd(level.wires, '0'), 2)
        : input;
      const sim = {
        level, play, comps, bad,
        stages: trace(level.wires, comps, scramble),
        at: 0, held: 0,
      };
      play.sim = sim;
      return sim;
    },
    step(sim) {
      // A beat on each comparator, so the swap can be seen happening.
      sim.held += 1;
      if (sim.held >= 6) { sim.held = 0; sim.at += 1; }
      return sim.at >= sim.stages.length - 1 && sim.held === 0;
    },
    perFrame: () => 1,
    readout(sim) {
      return sim.bad === null ? 'every input sorted'
        : 'this input comes out unsorted';
    },
    paint(sim) {
      render(sim.level, sim.play, 'running');
    },
  },

  over: () => false,

  undoable: (level, play) => play.added.length > 0,

  undo(level, play) {
    if (!play.added.length) return false;
    play.added.pop();
    play.picked = null;
    play.sim = null;
    return true;
  },

  verdict(level, play) {
    // Decided by testing all 2^n zero-one inputs, which the 0-1 principle says
    // settles every input there is. The animation is illustration.
    const comps = all(level, play);
    const bad = witness(level.wires, comps);
    const n = play.added.length;
    if (bad !== null) {
      const bits = bad.toString(2).padStart(level.wires, '0');
      return {
        won: false,
        readout: 'this input comes out unsorted',
        title: 'It does not sort.',
        detail: `Feed it ${bits} — top wire first — and the ones do not all `
          + 'end up at the bottom. That single input is enough: by the 0-1 '
          + 'principle a network that sorts every string of noughts and ones '
          + 'sorts everything, so one that fails on this one fails outright.',
      };
    }
    if (n === level.par) {
      return {
        won: true, perfect: true, score: n,
        readout: 'every input sorted',
        title: 'The smallest there is.',
        detail: `${n} comparators, and every one of the `
          + `${1 << level.wires} noughts-and-ones inputs comes out sorted — so `
          + 'every input does. Nothing shorter exists.',
      };
    }
    return {
      won: true, perfect: false, score: n,
      readout: 'every input sorted',
      title: 'It sorts.',
      detail: `${n} comparators where ${level.par} would do. Every `
        + `noughts-and-ones input comes out right, which by the 0-1 principle `
        + 'means every input does — there is just a shorter network that also '
        + 'manages it.',
    };
  },

  hint(level, play, tier) {
    const comps = all(level, play);
    const bad = witness(level.wires, comps);
    if (tier === 1) {
      const wrong = [...Array(1 << level.wires).keys()].filter(
        (v) => !isSorted(level.wires, trace(level.wires, comps, v).at(-1)));
      return {
        text: bad === null
          ? `It already sorts. ${play.added.length} comparators, and `
            + `${level.par} is the fewest that can.`
          : `You do not have to try every input — by the 0-1 principle a `
            + `network sorts everything exactly when it sorts every string of `
            + `noughts and ones, so there are only ${1 << level.wires} to `
            + `check. ${wrong.length} of them still come out unsorted.`,
      };
    }
    if (tier === 2) {
      // A specific input it gets wrong. True whatever the eventual answer, so
      // it teaches the method rather than giving away a comparator.
      if (bad === null) {
        return {
          text: `Nothing comes out unsorted. To reach ${level.par} you need a `
            + 'shorter network, not a different one — take one out and see '
            + 'which input breaks.',
        };
      }
      play.showWitness = true;
      const bits = bad.toString(2).padStart(level.wires, '0');
      const out = trace(level.wires, comps, bad).at(-1)
        .toString(2).padStart(level.wires, '0');
      return {
        text: `Try ${bits} — top wire first. It comes out ${out}, with a one `
          + 'still above a nought. Whatever else you add, it has to fix that.',
      };
    }
    play.added = level.answer.map((c) => c.slice());
    play.picked = null;
    play.sim = null;
    return {
      text: `A smallest completion, ${level.par} comparators. Run it and see `
        + 'every input come out sorted.',
    };
  },
};
