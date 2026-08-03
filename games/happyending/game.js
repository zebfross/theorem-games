'use strict';

/* The happy ending problem — place points, dodge the convex polygon.
 *
 * Erdos and Szekeres: any 5 points in general position contain a convex
 * quadrilateral, any 9 contain a convex pentagon, and any 17 contain a convex
 * hexagon. So a set that avoids one can hold at most 4, 8 or 16 points, and
 * those are par.
 *
 * Which makes this the one game here you cannot beat. Everywhere else par is an
 * optimum somebody found; here it is a ceiling the theorem fixed in advance,
 * and one point past it is impossible for anyone. The question is not whether
 * you can find the answer but how close to a wall you can get before it stops
 * you — and it will stop you, on the level after this one if not on this one.
 *
 * The name is Erdos's joke: Esther Klein posed the quadrilateral case, George
 * Szekeres worked on it, and the two of them married.
 *
 * The hexagon bound is the interesting one. It took until 2006 and a computer
 * search by Szekeres and Peters, and nothing past it is known — whether the
 * pattern continues as 2^(k-2) is open. The last level of this game sits on the
 * edge of the subject.
 *
 * Nothing here searches for an answer. Every level is a prefix of a
 * configuration that was found and checked offline against two independent
 * convexity tests; see tools/points.py. What *is* computed here, every time a
 * point goes down, is whether a convex k-gon has appeared — which is the one
 * thing the player cannot reliably see, and is why it is shown rather than
 * merely scored.
 */

import { board, svgEl } from '../../engine/engine.js';

/* How big a point is drawn, and how near another one it may be placed.
 *
 * These are not free choices. A configuration that reaches par has whatever
 * crowding it has — the sixteen-point one puts two points 14 units apart on a
 * 900-unit field — and a rule stricter than that forbids the player from ever
 * reproducing it. Choosing the rule first, and generating the configurations
 * afterwards, shipped eight levels that could not be finished.
 *
 * So the rule is read off the configurations, and the sparser levels get the
 * larger points rather than everything being squeezed to fit the tightest.
 */
const dotFor = (level) => (level.par <= 4 ? 15 : level.par <= 8 ? 11 : 6);
const nearFor = (level) => 2 * dotFor(level) + 1;

/* Twice the least triangle area allowed, so "in a line" has width: a set only
   just in general position is one where convexity comes down to rounding. The
   shipped configurations clear this with room — the tightest triangle in any of
   them is 236. */
const SLACK = 200;

const cross = (o, a, b) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function text(attrs, str) {
  const node = svgEl('text', attrs);
  node.textContent = str;
  return node;
}

/** Every point on the field, given ones first. */
const allPoints = (level, play) => level.given.concat(play.placed);

/** Are these points all corners of their own convex hull?
 *
 *  Walked as an angular sort about the centroid: they are in convex position
 *  exactly when going round them that way always turns the same way. */
function convexPosition(pts) {
  const n = pts.length;
  if (n < 3) return true;
  const cx = pts.reduce((a, p) => a + p[0], 0) / n;
  const cy = pts.reduce((a, p) => a + p[1], 0) / n;
  const order = pts.slice().sort(
    (a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const t = cross(order[i], order[(i + 1) % n], order[(i + 2) % n]);
    if (t === 0) return false;
    const s = t > 0 ? 1 : -1;
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** A convex k-gon among these points, or null.
 *
 *  Brute force over subsets. At par that is 8008 subsets in the worst case,
 *  which is nothing, and it is worth being obviously right rather than clever
 *  — the whole verdict rests on it. */
function findConvex(pts, k) {
  if (pts.length < k) return null;
  const idx = [];
  const pick = [];
  const walk = (start) => {
    if (pick.length === k) {
      return convexPosition(pick.map((i) => pts[i])) ? pick.slice() : null;
    }
    for (let i = start; i < pts.length; i++) {
      pick.push(i);
      const got = walk(i + 1);
      pick.pop();
      if (got) return got;
    }
    return null;
  };
  const got = walk(0);
  return got ? got.map((i) => pts[i]) : null;
}

/** Why this spot will not do, or null if it will. */
function refuse(level, play, p) {
  const DOT = dotFor(level);
  const NEAR = nearFor(level);
  if (p[0] < DOT || p[1] < DOT
      || p[0] > level.field[0] - DOT || p[1] > level.field[1] - DOT) {
    return 'Inside the field, please.';
  }
  const pts = allPoints(level, play);
  for (const q of pts) {
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) < NEAR) {
      return 'Too close to a point already down.';
    }
  }
  // General position is an assumption of the theorem, not a nicety: three
  // points in a line make "convex" a matter of which way the rounding went.
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.abs(cross(pts[i], pts[j], p)) <= SLACK) {
        return 'That would put three points in a line.';
      }
    }
  }
  return null;
}

/* ---------------------------------------------------------------- drawing */

function render(level, play) {
  board.replaceChildren();
  const DOT = dotFor(level);
  board.appendChild(svgEl('rect', {
    x: 0, y: 0, width: level.field[0], height: level.field[1], class: 'field',
  }));

  // The polygon that ended it, drawn under the points so the points stay
  // legible on top of it.
  if (play.caught) {
    const n = play.caught.length;
    const cx = play.caught.reduce((a, q) => a + q[0], 0) / n;
    const cy = play.caught.reduce((a, q) => a + q[1], 0) / n;
    const ring = play.caught.slice().sort(
      (a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    board.appendChild(svgEl('polygon', {
      points: ring.map((q) => `${q[0]},${q[1]}`).join(' '), class: 'caught',
    }));
  }

  if (play.showing) {
    for (const q of play.showing) {
      board.appendChild(svgEl('circle', {
        cx: q[0], cy: q[1], r: DOT + 7, class: 'suggest',
      }));
    }
  }

  level.given.forEach((q) => {
    board.appendChild(svgEl('circle', {
      cx: q[0], cy: q[1], r: DOT, class: 'point given',
    }));
  });
  play.placed.forEach((q, i) => {
    const late = i === play.placed.length - 1;
    board.appendChild(svgEl('circle', {
      cx: q[0], cy: q[1], r: DOT,
      class: 'point mine' + (late && play.caught ? ' fatal' : ''),
    }));
  });

  const need = level.par - allPoints(level, play).length;
  if (need > 0 && !play.caught) {
    board.appendChild(text({
      x: level.field[0] / 2, y: level.field[1] - 16, class: 'prompt',
    }, `${need} more to place`));
  }
}

/* ---------------------------------------------------------------- exports */

export default {
  id: 'happyending',
  title: 'The happy ending problem',
  blurb:
    'Scatter points without ever letting a convex polygon appear among them. '
    + 'You can only get so far — the theorem says exactly how far.',
  credit:
    'A game on the <b>Erdős–Szekeres</b> theorem: any 5 points in general '
    + 'position contain a convex quadrilateral, any 9 a convex pentagon, any 17 '
    + 'a convex hexagon. Par is one less than each of those, so a full board is '
    + 'the most that can possibly avoid the shape. The hexagon case was settled '
    + 'by <b>Szekeres and Peters</b> in 2006 by computer, and nothing beyond it '
    + 'is known. The name is Erdős’s joke: Esther Klein posed the first '
    + 'case, George Szekeres worked on it, and they married. Configurations are '
    + 'generated here, so this game carries no third-party data.',

  group: (m) => `avoiding a convex ${({ 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon' })[m.k]}`,
  chip: (m) => `${m.par - m.seed}·${m.par}`,
  par: (m) => m.par,

  start: () => ({ placed: [], caught: null, showing: null, done: false }),

  view: (level) => [0, 0, level.field[0], level.field[1]],

  describe(level, play) {
    const on = allPoints(level, play).length;
    return {
      goal: `Get <b>${level.par}</b> points down with no convex `
            + `<b>${level.shape}</b> among them`,
      status: `${on} of ${level.par} placed`
        + (play.caught ? ' · a convex ' + level.shape + ' appeared' : ''),
    };
  },

  click(level, play, p) {
    if (play.done) return {};
    const at = [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100];

    // Clicking one of your own points takes it back. The given ones are the
    // level and stay put.
    const mine = play.placed.findIndex(
      (q) => Math.hypot(q[0] - at[0], q[1] - at[1]) < dotFor(level) + 6);
    if (mine >= 0) {
      play.placed.splice(mine, 1);
      play.showing = null;
      return { changed: true };
    }
    const no = refuse(level, play, at);
    if (no) return { message: no };

    play.placed.push(at);
    play.showing = null;
    const pts = allPoints(level, play);
    play.caught = findConvex(pts, level.k);
    if (play.caught || pts.length >= level.par) play.done = true;
    return { changed: true };
  },

  draw: (level, play) => render(level, play),

  // Move by move: each point placed is the move, and the level ends the moment
  // a convex polygon appears or the board is full.
  over: (level, play) => play.done,

  verdict(level, play) {
    const on = allPoints(level, play).length;
    if (play.caught) {
      return {
        won: false,
        title: `A convex ${level.shape}.`,
        detail: `Point ${on} made one, and it was there the instant you put it `
                + `down. ${level.par} points can avoid a convex ${level.shape}; `
                + `${on} sometimes can, and this arrangement could not.`,
        readout: `stopped at ${on}`,
      };
    }
    // Reaching par is the win, and it is checked rather than assumed. `over`
    // only fires on a full board or a caught polygon, so this cannot come up
    // in play — but a verdict that says "won" for any board without a polygon
    // in it would call an empty field a victory, and that is too cheap a thing
    // to leave resting on a caller's good behaviour.
    if (on < level.par) {
      return {
        won: false,
        title: 'Not a full board.',
        detail: `${on} points down, and ${level.par} were asked for.`,
        readout: `${on} of ${level.par}`,
      };
    }
    return {
      won: true,
      perfect: true,
      score: level.par,
      title: `${level.par} points, and not one convex ${level.shape}.`,
      detail: `That is as many as there can be: any ${level.par + 1} points in `
              + `general position contain a convex ${level.shape}, so nothing `
              + 'you could have done would have got one further.'
              + (level.k === 6
                 ? ' That bound took until 2006 and a computer to prove.'
                 : ''),
      readout: `${level.par} placed`,
    };
  },

  /* The hint ladder: what the theorem promises, then where one point can go,
     then the rest of a configuration that works. */
  hint(level, play, tier) {
    const on = allPoints(level, play).length;
    const need = level.par - on;

    if (tier === 1) {
      return {
        text: `Any ${level.par + 1} points in general position contain a convex `
              + `${level.shape} — that is the theorem, and it is why ${level.par} `
              + 'is the most you will ever fit. So there is no clever answer '
              + `waiting: ${level.par} is reachable, ${level.par + 1} is not, `
              + `and you have ${need} left to place. Keep new points tucked `
              + 'inside the hull of what is already down. A point placed '
              + 'outside it is a corner of the hull straight away, and corners '
              + 'are what convex polygons are made of.',
      };
    }

    if (tier === 2) {
      const spot = level.rest[play.placed.length];
      if (!spot) return { text: 'Everything is already placed.' };
      play.showing = [spot];
      return {
        text: 'One spot that works is ringed. It is not the only one — the '
              + 'good positions come in whole regions, not points — but it is '
              + 'on a line that reaches ' + level.par + '.',
      };
    }

    play.showing = level.rest.slice(play.placed.length);
    return {
      text: `The rest of a configuration that reaches ${level.par} is ringed. `
            + 'Place them and the board is as full as it can be.',
    };
  },
};
