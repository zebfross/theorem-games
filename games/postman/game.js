'use strict';

/* Route inspection — walk every street and come home, as cheaply as you can.
 *
 * Euler settles half of it: a round that repeats nothing exists exactly when
 * every corner has an even number of streets, because walking in and out again
 * uses two of them each visit and an odd corner can never balance.
 *
 * Guan asked what to do about the rest, and Edmonds and Johnson answered. Odd
 * corners always come in an even number — the degrees add up to twice the
 * number of streets — and walking a street twice flips the parity at both ends.
 * So the repeats are a set of paths pairing the odd corners off, and
 *
 *     cheapest round = every street once + the cheapest pairing of odd corners
 *
 * which is a minimum weight perfect matching. That is the whole game, and it is
 * what the hints hand over: first how many odd corners there are, then which
 * they are and what the rule is, and last which streets the cheapest round
 * doubles — the repeats rather than the route, because the repeats are the
 * theorem and the route is only bookkeeping.
 *
 * Nothing is decided here. Par, the pairing and the repeats are computed in
 * tools/build_pack.py, where a round achieving par is also built and walked
 * before the level may ship.
 */

import { board, svgEl } from '../../engine/engine.js';

const CORNER = 13;

const key = (a, b) => `${Math.min(a, b)},${Math.max(a, b)}`;

/** Streets by their two ends, so a click can find one quickly. */
function index(level) {
  const at = new Map();
  level.edges.forEach(([a, b], i) => at.set(key(a, b), i));
  return at;
}

/** Which corners you can walk to from here. */
function neighbours(level, from) {
  const out = [];
  level.edges.forEach(([a, b], i) => {
    if (a === from) out.push([b, i]);
    else if (b === from) out.push([a, i]);
  });
  return out;
}

const covered = (play, level) => play.times.every((t) => t > 0);
const home = (play, level) => play.at === level.depot && play.walk.length > 1;

function render(level, play) {
  board.replaceChildren();

  // Streets first, coloured by how often they have been walked. Twice is the
  // thing worth seeing: it is exactly what a round costs above the total.
  level.edges.forEach(([a, b], i) => {
    const [x1, y1] = level.nodes[a];
    const [x2, y2] = level.nodes[b];
    const walked = play.times[i];
    const cls = walked === 0 ? 'street' : walked === 1 ? 'street once' : 'street twice';
    board.appendChild(svgEl('line', {
      x1, y1, x2, y2, class: cls
        + (play.showRepeats && level.repeats.includes(i) ? ' doubled' : ''),
    }));
  });

  // The streets you could take next, so the move is visible rather than
  // guessed at.
  if (!play.done) {
    for (const [to, i] of neighbours(level, play.at)) {
      const [x1, y1] = level.nodes[play.at];
      const [x2, y2] = level.nodes[to];
      board.appendChild(svgEl('line', { x1, y1, x2, y2, class: 'onward' }));
    }
  }

  level.nodes.forEach(([x, y], i) => {
    const odd = play.showOdds && level.odds.includes(i);
    board.appendChild(svgEl('circle', {
      cx: x, cy: y, r: CORNER,
      class: 'corner' + (odd ? ' odd' : '') + (i === level.depot ? ' depot' : ''),
    }));
  });

  // Where the postman is standing.
  const [px, py] = level.nodes[play.at];
  board.appendChild(svgEl('circle', { cx: px, cy: py, r: CORNER - 4, class: 'here' }));
}

export default {
  id: 'postman',
  title: 'Route inspection',
  blurb: 'Walk every street and come home, repeating as little as you can.',
  credit:
    'A game on the route inspection problem &mdash; <b>Guan</b> (1962), solved '
    + 'by <b>Edmonds &amp; Johnson</b> (1973): the cheapest round is every '
    + 'street once plus the cheapest way to pair up the corners where an odd '
    + 'number of streets meet, which is a minimum weight perfect matching. The '
    + 'half with no odd corners at all is <b>Euler</b> (1736). Maps are '
    + 'generated here and every par is checked by building a round that '
    + 'achieves it, so this game carries no third-party data.',

  group: (m) => (m.odd === 0 ? 'nothing repeated' : `${m.odd} odd corners`),
  chip: (m) => `${m.streets} streets`,
  par: (m) => m.par,

  start(level) {
    return {
      at: level.depot,
      walk: [level.depot],
      times: level.edges.map(() => 0),
      cost: 0,
      done: false,
      showOdds: false,
      showRepeats: false,
      past: [],
    };
  },

  view: (level) => level.viewBox,

  describe(level, play) {
    const left = play.times.filter((t) => t === 0).length;
    return {
      goal: `Walk every street and come home. The cheapest round is `
        + `<b>${level.par}</b> m.`,
      status: play.done
        ? `home in ${play.cost} m`
        : `${play.cost} m walked · ${left} street${left === 1 ? '' : 's'} left`,
    };
  },

  click(level, play, p) {
    if (play.done) return { message: 'You are home. Clear to walk it again.' };

    let pick = -1;
    let best = Infinity;
    level.nodes.forEach(([x, y], i) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best) { best = d; pick = i; }
    });
    if (pick < 0 || best > CORNER * 2.6) {
      return { message: 'Click a corner along a street from where you are.' };
    }
    if (pick === play.at) return { message: 'You are already standing there.' };

    const street = index(level).get(key(play.at, pick));
    if (street === undefined) {
      return { message: 'No street runs straight there from where you stand.' };
    }

    play.past.push({ at: play.at, cost: play.cost, times: play.times.slice() });
    play.times[street] += 1;
    play.cost += level.length[street];
    play.at = pick;
    play.walk.push(pick);
    if (covered(play, level) && home(play, level)) play.done = true;
    return { changed: true };
  },

  draw: (level, play) => render(level, play),

  over: (level, play) => play.done,

  undoable: (level, play) => play.past.length > 0,

  undo(level, play) {
    const back = play.past.pop();
    if (!back) return false;
    play.at = back.at;
    play.cost = back.cost;
    play.times = back.times;
    play.walk.pop();
    play.done = false;
    return true;
  },

  verdict(level, play) {
    const over = play.cost - level.par;
    if (play.cost === level.par) {
      return {
        won: true,
        perfect: true,
        score: play.cost,
        title: 'The cheapest round there is.',
        detail: level.odds.length === 0
          ? `${play.cost} m, and not a step of it walked twice — every corner `
            + 'has an even number of streets, which is exactly when Euler says '
            + 'that is possible.'
          : `${play.cost} m: ${level.total} m of street, plus ${level.extra} m `
            + `walked twice. With ${level.odds.length} odd corners some `
            + 'doubling is forced, and no pairing of them is cheaper than the '
            + 'one you found.',
      };
    }
    return {
      won: true,
      perfect: false,
      score: play.cost,
      title: 'Home, with every street walked.',
      detail: `${play.cost} m, which is ${over} m more than the ${level.par} m `
        + 'a best round costs. The streets you walk twice are the whole of the '
        + 'difference — ask for a hint and it will show you which ones a '
        + 'cheapest round doubles.',
    };
  },

  hint(level, play, tier) {
    const n = level.odds.length;
    if (tier === 1) {
      if (n === 0) {
        return {
          text: 'Every corner here has an even number of streets meeting it. '
            + 'Euler: that is exactly when a round exists that walks every '
            + `street once and no street twice. So ${level.total} m is the `
            + 'whole cost — the only way to do worse is to double something.',
        };
      }
      return {
        text: `${n} corners have an odd number of streets. Walking into a `
          + 'corner and out again uses two streets, so an odd corner cannot be '
          + 'balanced — you must pass through each of them an extra time, and '
          + `some streets have to be walked twice. The cheapest round is `
          + `${level.par} m: ${level.total} m of street plus ${level.extra} m `
          + 'of doubling.',
      };
    }
    if (tier === 2) {
      // The odd corners themselves, and the rule. True of the map rather than
      // of any one round, so it teaches without giving an answer away.
      play.showOdds = true;
      if (n === 0) {
        return {
          text: 'Nothing is marked, because nothing is odd. Start anywhere and '
            + 'never take a street that would strand one you have not walked.',
        };
      }
      return {
        text: 'The odd corners are lit. Repeated streets flip the parity at '
          + 'both ends, so the streets you double form paths pairing these off '
          + `— and the cheapest round takes the cheapest pairing, here `
          + `${level.pairs.map((q) => `${q[0]}–${q[1]}`).join(' and ')}, `
          + `costing ${level.extra} m.`,
      };
    }
    play.showOdds = true;
    play.showRepeats = true;
    if (n === 0) {
      return {
        text: 'There is nothing to double. Walk every street once and come '
          + 'home.',
      };
    }
    return {
      text: 'The streets a cheapest round walks twice are marked. Walk the map '
        + 'so that those, and only those, are doubled, and you will come home '
        + `on ${level.par} m.`,
    };
  },
};
