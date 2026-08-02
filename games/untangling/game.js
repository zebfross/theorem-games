'use strict';

/* Untangling — pull a tangled loop straight in as few moves as you can.
 *
 * Chang and Erickson: a closed curve with n self crossings needs Theta(n^{3/2})
 * homotopy moves to become simple. A move here collapses a bigon, a lens the
 * curve pinches off between two crossings; pulling the two strands apart cancels
 * both crossings at once. Click one and it goes.
 *
 * Nothing is computed here. The level file holds every diagram the player can
 * reach, drawn, with the moves joining them, because the reachable graph turns
 * out to be tiny — under a hundred states even for the worst level. So a move
 * is a lookup, and the geometry that decides what a move does was settled
 * offline and checked against the combinatorics (see tools/surgery.py). Doing
 * it live in the browser is the part most likely to have sunk the idea.
 */

import { board, svgEl } from '../../engine/engine.js';

const ROPE_WIDTH = 11;

/* Curves and lenses arrive as flat [x, y, x, y, ...] runs of whole numbers.
 * They are most of the pack's weight, and pairs cost two brackets and a comma
 * a point. Nothing here needs them as pairs, so nothing unpacks them. */

/** Distance from a point to a closed flat polyline, for clicks that miss. */
function distToPoly(x, y, poly) {
  let best = Infinity;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = poly[2 * i];
    const ay = poly[2 * i + 1];
    const bx = poly[(2 * i + 2) % poly.length];
    const by = poly[(2 * i + 3) % poly.length];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const x1 = poly[2 * i];
    const y1 = poly[2 * i + 1];
    const x2 = poly[(2 * i + 2) % poly.length];
    const y2 = poly[(2 * i + 3) % poly.length];
    if ((y1 > y) !== (y2 > y)) {
      if (x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside;
    }
  }
  return inside;
}

function polyPath(flat) {
  let d = `M ${flat[0]} ${flat[1]}`;
  for (let i = 2; i < flat.length; i += 2) d += ` L ${flat[i]} ${flat[i + 1]}`;
  return d + ' Z';
}

/** Flat run -> the "x,y x,y" an SVG polygon wants. */
function polyPoints(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push(`${flat[i]},${flat[i + 1]}`);
  return out.join(' ');
}

function movesFrom(level, state) {
  return level.moves[state] || level.moves[String(state)] || [];
}

/** Fewest moves from here to the simple curve, over the level's own graph. */
function distanceToSimple(level, from) {
  const seen = new Set([from]);
  let edge = [from];
  let d = 0;
  while (edge.length) {
    if (edge.some((s) => level.counts[s] === 0)) return d;
    const next = [];
    for (const s of edge) {
      for (const m of movesFrom(level, s)) {
        if (!seen.has(m.to)) { seen.add(m.to); next.push(m.to); }
      }
    }
    edge = next;
    d++;
  }
  return null;
}

/** A move from here that keeps a best-possible finish available. */
function bestMove(level, from) {
  const here = distanceToSimple(level, from);
  if (here === null) return null;
  for (const m of movesFrom(level, from)) {
    if (distanceToSimple(level, m.to) === here - 1) return m;
  }
  return null;
}

export default {
  id: 'untangling',
  title: 'Untangling',
  blurb:
    'Untangle a tangled loop by collapsing its lenses. A lens is a space the curve closes off with exactly two crossings — nothing marks them, and every click counts.',
  credit:
    'A game on <a href="https://arxiv.org/abs/1706.06253"><i>Untangling planar '
    + 'curves</i></a> by Hsien-Chih Chang and Jeff Erickson: a closed curve with '
    + '<i>n</i> self crossings needs &Theta;(<i>n</i><sup>3/2</sup>) homotopy '
    + 'moves to become simple.',

  group: (m) => `${m.crossings} crossings`,
  chip: (m) => `${m.n}·${m.par}`,
  par: (m) => m.par,

  start: (level) => ({ at: level.start, moves: 0, misses: 0, hinted: null }),

  view: (level) => level.view,

  describe(level, play) {
    const left = level.counts[play.at];
    // Scored on clicks, not on collapses. Nothing on the board says where a
    // lens is, so hunting for one has to cost something or it is not hunting.
    const clicks = play.moves + play.misses;
    const spent = `${clicks} ${clicks === 1 ? 'click' : 'clicks'}`;
    return {
      goal: `Untangle it in <b>${level.par}</b> ${level.par === 1 ? 'click' : 'clicks'}`,
      status: left === 0
        ? `${spent} · untangled`
        : `${spent} · ${left} ${left === 1 ? 'crossing' : 'crossings'} left`,
    };
  },

  click(level, play, p) {
    const available = movesFrom(level, play.at);
    if (!available.length) return {};

    // The click has to land on a lens. It used to snap to the nearest one
    // anywhere on the board, which was fine while every lens was outlined and
    // wrong once they are not: it turns finding them into clicking vaguely.
    // The only latitude is for slivers, which are genuinely hard to hit, and
    // for the few moves that have no outline to hit at all.
    const grip = 0.02 * Math.max(level.view[2], level.view[3]);
    let pick = available.find((m) => m.lens && pointInPolygon(p.x, p.y, m.lens));
    if (!pick) pick = available.find((m) => m.lens && distToPoly(p.x, p.y, m.lens) < grip);
    if (!pick) pick = available.find((m) => !m.lens && Math.hypot(p.x - m.at[0], p.y - m.at[1]) < 2 * grip);
    // A wrong click costs the same as a right one. Without that the search is
    // free, and clicking everywhere in turn finds the lenses for you — which is
    // exactly what the marked version let you do, only slower.
    if (!pick) {
      play.misses++;
      return {
        changed: true,
        message: 'Not a lens — a lens is closed off by exactly two crossings.',
      };
    }

    play.at = pick.to;
    play.moves++;
    play.hinted = null;
    return { changed: true };
  },

  // Move by move, so the engine asks after every click rather than running a
  // simulation. Over when the curve is straight, and over when it is not but
  // nothing can be collapsed either — a dead end is still the end.
  over: (level, play) =>
    level.counts[play.at] === 0 || movesFrom(level, play.at).length === 0,

  draw(level, play, phase) {
    board.replaceChildren();
    const pts = level.states[play.at];

    // Nothing marks a collapsible lens, and nothing is put on the board that
    // could be probed for one. Drawing them invisibly and lighting them on
    // hover was no better than colouring them in — you sweep the pointer and
    // they announce themselves one by one — and a shape under the cursor gives
    // itself away through the cursor too. So clicks are tested against the
    // stored geometry instead, and the board holds only the curve.
    //
    // The single exception is a lens the hint has pointed at, which is the
    // whole purpose of the hint.
    if (phase === 'placing' && play.hinted !== null) {
      const m = movesFrom(level, play.at).find((x) => x.to === play.hinted);
      if (m) {
        board.appendChild(m.lens
          ? svgEl('polygon', { points: polyPoints(m.lens), class: 'lens hinted' })
          : svgEl('circle', { cx: m.at[0], cy: m.at[1], r: 14, class: 'lens hinted' }));
      }
    }

    const d = polyPath(pts);
    board.appendChild(svgEl('path', { d, class: 'rope-shadow', 'stroke-width': ROPE_WIDTH + 6, transform: 'translate(2,3)' }));
    board.appendChild(svgEl('path', { d, class: 'rope-core', 'stroke-width': ROPE_WIDTH }));
    board.appendChild(svgEl('path', { d, class: 'rope-top', 'stroke-width': ROPE_WIDTH - 5 }));
  },

  verdict(level, play) {
    const left = level.counts[play.at];
    const clicks = play.moves + play.misses;
    if (left > 0) {
      return {
        won: false,
        title: 'Nothing left to collapse.',
        detail: `Stuck at ${left} ${left === 1 ? 'crossing' : 'crossings'} after `
          + `${play.moves} ${play.moves === 1 ? 'move' : 'moves'}. Every route from `
          + 'here is closed; start again and collapse a different lens first.',
      };
    }
    const over = clicks - level.par;
    if (over === 0) {
      return {
        won: true, perfect: true, score: clicks,
        title: 'Perfect.',
        detail: `${clicks} clicks, every one a lens, and the shortest way through. `
          + 'It cannot be done in fewer.',
      };
    }
    const wasted = play.misses
      ? `${play.misses} click${play.misses === 1 ? '' : 's'} went somewhere that was not a lens`
      : null;
    const detour = play.moves > level.par
      ? `${play.moves} collapses where ${level.par} would do`
      : null;
    return {
      won: true, perfect: false, score: clicks,
      title: over === 1 ? 'So close!' : 'Untangled.',
      detail: `${clicks} clicks against a best of ${level.par}`
        + (wasted || detour ? ` — ${[wasted, detour].filter(Boolean).join(', and ')}.` : '.'),
    };
  },

  hint(level, play, tier) {
    const here = distanceToSimple(level, play.at);
    if (tier === 1) {
      if (here === null) {
        return { text: 'This position is a dead end — nothing here can be collapsed to the finish.' };
      }
      const spent = play.moves + play.misses;
      return {
        text: here + spent === level.par
          ? `Still on track: ${here} more ${here === 1 ? 'collapse' : 'collapses'} does it.`
          : `${here} more from here, which would make ${here + spent} clicks `
            + `against a best of ${level.par}.`,
      };
    }
    const m = bestMove(level, play.at);
    if (!m) return { text: 'There is no move from here that reaches the finish.' };
    if (tier === 2) {
      play.hinted = m.to;
      return { text: 'That lens is on a shortest route. Collapsing it keeps a perfect finish available.' };
    }
    play.at = m.to;
    play.moves++;
    play.hinted = null;
    return { text: 'Played it for you. Carry on from here.' };
  },
};
