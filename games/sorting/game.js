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
const wiresEnd = (level) => LEFT + 34 + span(level) * STEP;
const OUT = 52;           // room past the wires for the outgoing values

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

/** The input to show on the board.
 *
 *  Not decoration. While a network is still wrong this is the input it gets
 *  wrong, so what sits on the board is the thing that has to be fixed; once it
 *  is right this is the most scrambled input there is, so what sits on the
 *  board is the network doing its hardest case.
 *
 *  The board used to show nothing at all until Run was pressed, which left the
 *  placing phase as a row of identical grey lines with no hint of what was
 *  being sorted or why. Zeb: "it isn't clear how the wires are different or
 *  even need to be sorted at all."
 */
function probe(level, comps) {
  const bad = witness(level.wires, comps);
  // Ones on the top wires is as unsorted as an input can be, since sorted
  // means the ones have all reached the bottom.
  return bad === null ? (1 << Math.ceil(level.wires / 2)) - 1 : bad;
}

/** Wires holding a one that still has a nought below it — the inversion. */
function offending(wires, v) {
  const out = [];
  for (let a = 0; a < wires; a++) {
    if (!((v >> a) & 1)) continue;
    for (let b = a + 1; b < wires; b++) {
      if (!((v >> b) & 1)) { out.push(a, b); return out; }
    }
  }
  return out;
}

function bead(x, y, on, extra = '') {
  const g = svgEl('g', { class: 'beadgroup' });
  g.appendChild(svgEl('circle', {
    cx: x, cy: y, r: 13, class: `bead ${on ? 'one' : 'zero'}${extra}`,
  }));
  const t = svgEl('text', { x, y: y + 5, class: 'beadlabel' });
  t.textContent = on ? '1' : '0';
  g.appendChild(t);
  return g;
}

function render(level, play, phase) {
  board.replaceChildren();
  const comps = all(level, play);
  const width = Math.max(wiresEnd(level), LEFT + 34 + (comps.length + 1) * STEP);

  for (let k = 0; k < level.wires; k++) {
    board.appendChild(svgEl('line', {
      x1: LEFT, y1: wireY(k), x2: width, y2: wireY(k), class: 'wire',
    }));
  }

  const show = play.sim && phase !== 'placing' ? play.sim : null;
  const input = show ? show.input : probe(level, comps);
  const stages = trace(level.wires, comps, input);
  const result = stages[stages.length - 1];

  // What goes in, always. Left of the wires, so the board says what is being
  // sorted before a single comparator has been placed.
  const inLabel = svgEl('text', { x: LEFT - 26, y: TOP - 24, class: 'endlabel' });
  inLabel.textContent = 'in';
  board.appendChild(inLabel);
  for (let k = 0; k < level.wires; k++) {
    board.appendChild(bead(LEFT - 26, wireY(k), (input >> k) & 1));
  }

  // And what comes out. The pair still in the wrong order is ringed, which is
  // the whole of what the player is trying to get rid of.
  const wrong = offending(level.wires, result);
  const outLabel = svgEl('text', { x: width + OUT / 2, y: TOP - 24,
    class: 'endlabel' });
  outLabel.textContent = wrong.length ? 'out — not sorted' : 'out — sorted';
  board.appendChild(outLabel);
  for (let k = 0; k < level.wires; k++) {
    board.appendChild(bead(width + OUT / 2, wireY(k), (result >> k) & 1,
      wrong.includes(k) ? ' wrong' : ''));
  }

  // While the run is going, the values travel: drawn at the comparator they
  // have just passed rather than parked at the left.
  if (show) {
    const v = stages[show.at];
    const x = show.at === 0 ? LEFT + 6 : slotX(show.at - 1) + STEP * 0.5;
    for (let k = 0; k < level.wires; k++) {
      board.appendChild(bead(x, wireY(k), (v >> k) & 1, ' moving'));
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

  view: (level) => [0, 0, wiresEnd(level) + OUT + 26,
    TOP + (level.wires - 1) * GAP + TOP],

  runnable: (level, play) => play.added.length > 0,

  describe(level, play) {
    const n = play.added.length;
    const comps = all(level, play);
    const total = 1 << level.wires;
    // How many inputs are still coming out wrong. This is the number that
    // actually moves as you work, and watching it fall is the game — "5 added"
    // said nothing about whether any of them helped.
    let wrong = 0;
    for (let v = 0; v < total; v++) {
      if (!isSorted(level.wires, trace(level.wires, comps, v).at(-1))) wrong++;
    }
    const verb = level.prefix.length ? 'Finish it' : 'Build it';
    return {
      goal: `${verb} so every input comes out in order — <b>0</b>s above `
        + `<b>1</b>s. <b>${level.par}</b> comparators will do it.`,
      status: wrong
        ? `${wrong} of ${total} inputs still come out wrong · ${n} added`
        : `every one of the ${total} inputs sorted · ${n} added`
          + (n === level.par ? ' · that is par' : ''),
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
      // The same input the board has been showing all along, so pressing Run
      // animates the thing already on screen rather than swapping in another.
      // Chosen by the theorem rather than for effect: the input the network
      // gets wrong while it is wrong, the most scrambled one once it is right.
      const comps = all(level, play);
      const input = probe(level, comps);
      const sim = {
        level, play, comps, input,
        bad: witness(level.wires, comps),
        stages: trace(level.wires, comps, input),
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
