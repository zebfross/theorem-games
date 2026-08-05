'use strict';

/* Sprague–Grundy — four games that look nothing alike, all of them Nim.
 *
 * Sprague (1935) and Grundy (1939), independently: every impartial game under
 * normal play is equivalent to a single Nim heap. The heap's size is the
 * position's Grundy value, whoever must move from a value of zero loses, and
 * several games played side by side are worth the XOR of their values.
 *
 * So the pack is a disguise and the hint is the theorem lifting it. Coins in
 * rows are Nim outright; the same rows with a cap on how many you may take are
 * worth n mod (k+1); a rack of skittles splits into two independent racks when
 * you knock a pin out of the middle; a Hackenbush twig is worth one more than
 * the XOR of everything growing above it. Four rulebooks, one number.
 *
 * The opponent is not played here. Every level ships the reply to every
 * position it can face, computed in tools/build_pack.py and looked up by mask
 * — so the browser cannot disagree with the theory, which a second
 * implementation of it would eventually do. What is computed here is the
 * *value*, and only to feed the hints; the build checks those same closed forms
 * against a full Grundy search before shipping them.
 */

import { board, svgEl } from '../../engine/engine.js';

const RUNG = 84;      // gap between coins along a row, matching the build
const TIER = 96;      // gap between rows
const COIN = 27;
const PAD = 56;

/* ---- positions ------------------------------------------------------- */

const bits = (mask) => {
  const out = [];
  for (let u = 0; mask >> u; u++) if (mask >> u & 1) out.push(u);
  return out;
};

/** Where every unit sits. Rows are centred on each other so a rack reads as a
 *  rack; Hackenbush comes with its coordinates already, grown upwards from a
 *  ground line at y = 0. */
function layout(level) {
  if (level.kind === 'hack') {
    // Trees grow upwards from a ground line at y = 0, so the tops are the most
    // negative y and the ground is the bottom of the view.
    const xs = level.nodes.map((n) => n[0]);
    const top = Math.min(...level.nodes.map((n) => n[1]));
    return {
      view: [Math.min(...xs) - PAD, top - PAD,
        Math.max(...xs) - Math.min(...xs) + 2 * PAD, -top + 2 * PAD],
    };
  }
  const wide = Math.max(...level.lengths) * RUNG;
  const at = new Map();
  level.rows.forEach((row, r) => {
    const span = row.length * RUNG;
    row.forEach((u, i) => {
      at.set(u, [(wide - span) / 2 + i * RUNG + RUNG / 2, r * TIER + TIER / 2]);
    });
  });
  return {
    at,
    view: [-PAD, -PAD, wide + 2 * PAD, level.rows.length * TIER + 2 * PAD],
  };
}

/** Every legal move, as the position it leaves and the units it takes.
 *
 *  Order does not matter here, unlike in the build: the opponent's move arrives
 *  as a finished position from the shipped table, so nothing on this side has
 *  to agree with anything about how the options were listed. This exists only
 *  to decide whether what the player clicked is allowed.
 */
function moves(level, mask) {
  const out = [];
  if (level.kind === 'hack') {
    for (let u = 0; u < level.units; u++) {
      if (mask >> u & 1) {
        out.push({ mask: mask & ~level.up[u], taken: bits(level.up[u] & mask) });
      }
    }
    return out;
  }
  for (const row of level.rows) {
    const live = row.filter((u) => mask >> u & 1);
    if (level.kind === 'kayles') {
      for (const u of live) out.push({ mask: mask & ~(1 << u), taken: [u] });
      for (let i = 0; i + 1 < live.length; i++) {
        const a = live[i]; const b = live[i + 1];
        // Side by side means next to each other in the rack with nothing
        // knocked out between — which is what splits a rack into two.
        if (row.indexOf(b) === row.indexOf(a) + 1) {
          out.push({ mask: mask & ~((1 << a) | (1 << b)), taken: [a, b] });
        }
      }
    } else {
      const most = level.kind === 'nim' ? live.length
        : Math.min(level.limit, live.length);
      for (let take = 1; take <= most; take++) {
        const taken = live.slice(live.length - take);
        let m = mask;
        for (const u of taken) m &= ~(1 << u);
        out.push({ mask: m, taken });
      }
    }
  }
  return out;
}

/* ---- what the position is worth -------------------------------------- */

function nodeValue(level, mask, node) {
  let v = 0;
  level.edges.forEach(([a, b], i) => {
    // Each live twig is worth one more than whatever grows out of its far end.
    if (a === node && (mask >> i & 1)) v ^= nodeValue(level, mask, b) + 1;
  });
  return v;
}

/** The independent parts of the position and the Nim heap each is worth.
 *
 *  This is what the second hint puts on the board: not an answer, but the
 *  translation. Every one of these formulas is checked against a full Grundy
 *  search at build time.
 */
function parts(level, mask) {
  const out = [];
  if (level.kind === 'hack') {
    level.grounds.forEach((g) => {
      const live = level.edges
        .map(([a], i) => i).filter((i) => mask >> i & 1 && rooted(level, mask, i, g));
      if (live.length) out.push({ value: nodeValue(level, mask, g), units: live });
    });
    return out;
  }
  for (const row of level.rows) {
    if (level.kind === 'kayles') {
      let run = [];
      for (const u of row) {
        if (mask >> u & 1) run.push(u);
        else { if (run.length) out.push({ value: level.runs[run.length], units: run }); run = []; }
      }
      if (run.length) out.push({ value: level.runs[run.length], units: run });
    } else {
      const live = row.filter((u) => mask >> u & 1);
      if (!live.length) continue;
      out.push({
        value: level.kind === 'nim' ? live.length : live.length % (level.limit + 1),
        units: live,
      });
    }
  }
  return out;
}

/** Does twig `i` still reach the ground at `g`? Used only to group the display. */
function rooted(level, mask, i, g) {
  let node = level.edges[i][0];
  const guard = level.units + 2;
  for (let step = 0; step < guard; step++) {
    if (node === g) return true;
    const below = level.edges.findIndex(([, b], j) => b === node && (mask >> j & 1));
    if (below < 0) return false;
    node = level.edges[below][0];
  }
  return false;
}

const worth = (level, mask) => parts(level, mask).reduce((v, p) => v ^ p.value, 0);

/** The winning move that finishes soonest, and how many moves that takes.
 *
 *  Any move leaving a zero wins, and the first one found is what the hint used
 *  to give away. That is sound advice and still misses par: on the long rack it
 *  won in six where five was possible, so a player following the hint to the
 *  letter could not match the level's own par. Since the opponent's every reply
 *  ships with the level, the true shortest line is a small search over it
 *  rather than a guess — and it agrees with the par computed by the build.
 */
function fastest(level, mask, memo = new Map()) {
  const seen = memo.get(mask);
  if (seen !== undefined) return seen;
  memo.set(mask, null);                 // guard against walking in a circle
  let best = null;
  for (const m of moves(level, mask)) {
    if (moves(level, m.mask).length === 0) { best = { moves: 1, move: m }; break; }
    const back = level.policy[String(m.mask)];
    if (back === undefined || moves(level, back).length === 0) continue;
    const on = fastest(level, back, memo);
    if (on && (best === null || on.moves + 1 < best.moves)) {
      best = { moves: on.moves + 1, move: m };
    }
  }
  memo.set(mask, best);
  return best;
}

const winner = (level, mask) => {
  const got = fastest(level, mask);
  return got ? got.move : null;
};

/* ---- drawing --------------------------------------------------------- */

const RULES = {
  nim: 'Take any number of coins from one row.',
  take: 'Take up to <b>LIMIT</b> coins from one row.',
  kayles: 'Knock down one pin, or two standing side by side.',
  hack: 'Cut one twig. Anything no longer joined to the ground falls.',
};

function render(level, play) {
  board.replaceChildren();
  const spot = play.geo.at;

  if (level.kind === 'hack') {
    board.appendChild(svgEl('line', {
      x1: play.geo.view[0], y1: 0, x2: play.geo.view[0] + play.geo.view[2], y2: 0,
      class: 'ground',
    }));
    level.edges.forEach(([a, b], i) => {
      const [x1, y1] = level.nodes[a];
      const [x2, y2] = level.nodes[b];
      const gone = !(play.mask >> i & 1);
      const reply = play.theirs.includes(i);
      if (gone && !reply) return;
      board.appendChild(svgEl('line', {
        x1, y1, x2, y2,
        class: 'twig' + (reply ? ' lastreply' : '')
          + (play.hinted && play.hinted.taken.includes(i) ? ' hinted' : ''),
      }));
    });
    // A knuckle at every junction, so a fork reads as one thing rather than
    // two lines that happen to meet.
    level.nodes.forEach(([x, y], n) => {
      const holds = level.edges.some(([a, b], i) => (a === n || b === n)
        && (play.mask >> i & 1));
      if (holds && y !== 0) board.appendChild(svgEl('circle', { cx: x, cy: y, r: 7, class: 'joint' }));
    });
  } else {
    for (const row of level.rows) {
      if (level.kind !== 'kayles') continue;
      // The links you may click to take two pins at once. Drawn only where the
      // move is legal, which makes the rule visible instead of written down.
      for (let i = 0; i + 1 < row.length; i++) {
        const a = row[i]; const b = row[i + 1];
        if (!(play.mask >> a & 1) || !(play.mask >> b & 1)) continue;
        const [ax, ay] = spot.get(a); const [bx] = spot.get(b);
        board.appendChild(svgEl('rect', {
          x: (ax + bx) / 2 - 13, y: ay - 7, width: 26, height: 14, rx: 7,
          class: 'link' + (play.hinted && play.hinted.taken.length === 2
            && play.hinted.taken.includes(a) && play.hinted.taken.includes(b)
            ? ' hinted' : ''),
        }));
      }
    }
    for (const row of level.rows) {
      for (const u of row) {
        const [x, y] = spot.get(u);
        const gone = !(play.mask >> u & 1);
        const reply = play.theirs.includes(u);
        if (gone && !reply) continue;
        const cls = (reply ? ' lastreply' : '')
          + (play.hinted && play.hinted.taken.includes(u) ? ' hinted' : '');
        if (level.kind === 'kayles') {
          board.appendChild(svgEl('path', {
            d: pin(x, y), class: 'pin' + cls,
          }));
        } else {
          board.appendChild(svgEl('circle', { cx: x, cy: y, r: COIN, class: 'coin' + cls }));
          board.appendChild(svgEl('circle', { cx: x, cy: y, r: COIN - 9, class: 'rim' + cls }));
        }
      }
    }
  }

  if (play.showValues) {
    for (const p of parts(level, play.mask)) {
      const pts = p.units.map((u) => (level.kind === 'hack'
        ? mid(level, u) : spot.get(u)));
      const x = pts.reduce((s, q) => s + q[0], 0) / pts.length;
      const y = Math.min(...pts.map((q) => q[1]));
      const tag = svgEl('text', {
        x, y: y - (level.kind === 'hack' ? 26 : 44), class: 'value',
      });
      tag.textContent = p.value;
      board.appendChild(tag);
    }
  }
}

const mid = (level, i) => {
  const [a, b] = level.edges[i];
  return [(level.nodes[a][0] + level.nodes[b][0]) / 2,
    (level.nodes[a][1] + level.nodes[b][1]) / 2];
};

/** A skittle: a head, a waist, and a base it stands on. */
function pin(x, y) {
  return `M ${x} ${y - 33}`
    + ' c 11 0 13 14 6 22'
    + ' c 9 7 13 22 13 30'
    + ' c 0 6 -8 8 -19 8'
    + ' c -11 0 -19 -2 -19 -8'
    + ' c 0 -8 4 -23 13 -30'
    + ' c -7 -8 -5 -22 6 -22 z';
}

/* ---- clicking -------------------------------------------------------- */

function nearestUnit(level, play, p) {
  let best = Infinity; let pick = -1;
  for (const [u, [x, y]] of play.geo.at) {
    if (!(play.mask >> u & 1)) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < best) { best = d; pick = u; }
  }
  return { pick, d: best };
}

function nearestTwig(level, play, p) {
  let best = Infinity; let pick = -1;
  level.edges.forEach(([a, b], i) => {
    if (!(play.mask >> i & 1)) return;
    const d = toSegment(p, level.nodes[a], level.nodes[b]);
    if (d < best) { best = d; pick = i; }
  });
  return { pick, d: best };
}

function toSegment(p, a, b) {
  const vx = b[0] - a[0]; const vy = b[1] - a[1];
  const len = vx * vx + vy * vy;
  let t = len ? ((p.x - a[0]) * vx + (p.y - a[1]) * vy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a[0] + t * vx), p.y - (a[1] + t * vy));
}

/* ---- the module ------------------------------------------------------ */

export default {
  id: 'grundy',
  title: 'Sprague–Grundy',
  blurb: 'Four games that look nothing alike. Every one of them is Nim.',
  credit:
    'A game on the <b>Sprague&ndash;Grundy</b> theorem &mdash; Sprague (1935) '
    + 'and Grundy (1939), independently: every impartial game under normal play '
    + 'is equivalent to a single Nim heap, and games played side by side are '
    + 'worth the XOR of their heaps. Nim itself is <b>Bouton</b> (1901). The '
    + 'positions, their values and the opponent&rsquo;s every reply are '
    + 'computed here by exhaustive search, so this game carries no third-party '
    + 'data.',

  group: (m) => m.tag,
  chip: (m) => m.chip,
  par: (m) => m.par,

  start(level) {
    return {
      mask: level.start,
      geo: layout(level),
      moves: 0,
      done: null,
      theirs: [],
      hinted: null,
      showValues: false,
      past: [],
    };
  },

  view: (level, play) => play.geo.view,

  describe(level, play) {
    const rule = RULES[level.kind].replace('LIMIT', level.limit);
    const thing = level.kind === 'kayles' ? 'pin'
      : (level.kind === 'hack' ? 'twig' : 'coin');
    return {
      goal: `${rule} Whoever takes the last ${thing} wins.`,
      status: play.done === 'won' ? `won in ${play.moves}`
        : play.done === 'lost' ? 'they took the last one'
          : play.moves === 0 ? 'your move' : `your move · ${play.moves} so far`,
    };
  },

  click(level, play, p) {
    if (play.done) return { message: 'This one is over. Clear to play it again.' };

    let want = null;
    if (level.kind === 'hack') {
      const { pick, d } = nearestTwig(level, play, p);
      if (pick < 0 || d > 34) return { message: 'Click a twig to cut it.' };
      want = moves(level, play.mask).find((m) => m.taken.includes(pick)
        && m.mask === (play.mask & ~level.up[pick]));
    } else {
      const near = nearestUnit(level, play, p);
      if (near.pick < 0) return { message: 'Nothing left to take there.' };
      if (level.kind === 'kayles') {
        // A click between two standing pins takes both; on a pin, just that
        // one. Whichever is nearer wins, with the link kept small so it never
        // steals a click meant for a pin.
        let link = null; let best = Infinity;
        for (const row of level.rows) {
          for (let i = 0; i + 1 < row.length; i++) {
            const a = row[i]; const b = row[i + 1];
            if (!(play.mask >> a & 1) || !(play.mask >> b & 1)) continue;
            const [ax, ay] = play.geo.at.get(a); const [bx] = play.geo.at.get(b);
            const d = Math.hypot(p.x - (ax + bx) / 2, p.y - ay);
            if (d < best) { best = d; link = [a, b]; }
          }
        }
        if (link && best < 22 && best < near.d) {
          want = moves(level, play.mask).find((m) => m.taken.length === 2
            && m.taken.includes(link[0]) && m.taken.includes(link[1]));
        } else if (near.d <= COIN * 1.7) {
          want = moves(level, play.mask).find((m) => m.taken.length === 1
            && m.taken[0] === near.pick);
        }
        if (!want) return { message: 'Click a pin, or the link between two that stand side by side.' };
      } else {
        if (near.d > COIN * 1.8) return { message: 'Click a coin.' };
        want = moves(level, play.mask).find((m) => m.taken[0] === near.pick);
        if (!want) {
          return {
            message: `You may take at most ${level.limit} from a row, so click `
              + `one of the last ${level.limit}.`,
          };
        }
      }
    }
    if (!want) return { message: 'That is not a move here.' };

    // Both halves of the round happen inside this one click, so one snapshot
    // takes back your move and their reply together — which is the only
    // sensible unit, since a move you cannot see the answer to is not a move
    // you would want to reconsider.
    play.past.push({ mask: play.mask, moves: play.moves, theirs: play.theirs });
    play.mask = want.mask;
    play.moves += 1;
    play.hinted = null;
    play.theirs = [];

    if (moves(level, play.mask).length === 0) {
      play.done = 'won';                    // they cannot move
      return { changed: true };
    }
    // The opponent's reply, read off the shipped table rather than worked out.
    const back = level.policy[String(play.mask)];
    if (back === undefined) {
      play.done = 'won';
      return { changed: true };
    }
    play.theirs = bits(play.mask & ~back);
    play.mask = back;
    if (moves(level, play.mask).length === 0) play.done = 'lost';
    return { changed: true };
  },

  draw: (level, play) => render(level, play),

  over: (level, play) => play.done !== null,

  undoable: (level, play) => play.past.length > 0,

  /** Take back your last move and their reply to it.
   *
   *  This costs nothing and is deliberately not treated as help, unlike a hint.
   *  The opponent is a fixed table, so it answers the same way every time: any
   *  position reachable by undoing is equally reachable by pressing Clear and
   *  replaying the same moves. Undo is a shortcut for that, not a source of
   *  anything you could not already have found out — so a best score survives
   *  it, and a par still has to be a par.
   */
  undo(level, play) {
    const back = play.past.pop();
    if (!back) return false;
    play.mask = back.mask;
    play.moves = back.moves;
    play.theirs = back.theirs;
    play.done = null;
    play.hinted = null;
    return true;
  },

  verdict(level, play) {
    const thing = level.kind === 'kayles' ? 'pin'
      : (level.kind === 'hack' ? 'twig' : 'coin');
    if (play.done === 'lost') {
      if (level.wall) {
        return {
          won: false,
          title: 'Nobody could have won that.',
          detail: 'One, two and three XOR to zero, so this position was lost '
            + 'before you touched it. Every move out of a zero hands back '
            + 'something that is not zero, and a perfect opponent hands you a '
            + 'zero straight back. Losing here is the theorem, not a mistake.',
        };
      }
      return {
        won: false,
        title: 'They took the last one.',
        detail: 'Somewhere you left them a position worth something other than '
          + 'zero, and they took it from there. Ask for a hint and it will show '
          + 'you what each part of the position is worth.',
      };
    }
    if (play.moves === level.par) {
      return {
        won: true,
        perfect: true,
        score: play.moves,
        title: 'Perfect.',
        detail: `The last ${thing} in ${play.moves} moves, which is as fast as `
          + 'this position can be won against an opponent who never errs.',
      };
    }
    return {
      won: true,
      perfect: false,
      score: play.moves,
      title: 'You took the last one.',
      detail: `Won in ${play.moves} moves, where ${level.par} would do. Every `
        + 'move that leaves them a zero wins; the quick ones leave them a zero '
        + 'with as little on the board as possible.',
    };
  },

  hint(level, play, tier) {
    const v = worth(level, play.mask);
    if (tier === 1) {
      if (v === 0) {
        return {
          text: 'This position is worth 0. Whatever you do hands them something '
            + 'that is not zero, and they can always hand a zero back — so from '
            + 'here a perfect opponent wins. That is the theorem, not bad luck.',
        };
      }
      return {
        text: `This position is worth ${v}. It is not zero, so a winning move `
          + 'exists: one that leaves them a position worth exactly 0.',
      };
    }
    if (tier === 2) {
      // The disguise coming off. True of the position rather than of any one
      // answer, so it teaches the rule without giving away a move.
      play.showValues = true;
      const list = parts(level, play.mask);
      const how = {
        nim: 'a row of coins is worth its own length',
        take: `a row of n is worth n mod ${level.limit + 1}, because you can `
          + `always bring it back to a multiple of ${level.limit + 1}`,
        kayles: 'an unbroken rack is worth a number from a table that no length '
          + 'predicts — 0, 1, 2, 3, 1, 4, 3, 2, 1, 4, 2, 6 …',
        hack: 'a twig is worth one more than the XOR of everything growing out '
          + 'of its far end',
      }[level.kind];
      return {
        text: `Here ${how}. This position is ${list.map((p) => p.value).join(' XOR ')}`
          + ` = ${v}, now shown on the board. Find the move that makes it 0.`,
      };
    }
    const win = winner(level, play.mask);
    if (!win) {
      return {
        text: 'There is no winning move: the position is worth 0 and a perfect '
          + 'opponent wins from here whatever you play.',
      };
    }
    play.hinted = win;
    play.showValues = true;
    return {
      text: `Take what is lit up. That leaves ${parts(level, win.mask)
        .map((p) => p.value).join(' XOR ') || '0'} = 0, and a zero handed over `
        + 'is a game already won. Make the move yourself.',
    };
  },
};
