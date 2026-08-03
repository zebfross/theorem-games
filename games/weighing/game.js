'use strict';

/* Coin weighing — one coin among n is fake, and you have a balance.
 *
 * Every weighing comes out one of three ways: left pan down, right pan down,
 * or level. So k weighings can tell at most 3^k cases apart, and there are
 * 2n cases to tell — which coin, and whether it is heavy or light. No scheme
 * can beat log_3(2n). That counting argument is the whole theorem, and the
 * board is built to show it: the rack along the bottom holds one slot per
 * outcome, every case drops into its slot, and two in the same slot means you
 * cannot tell them apart.
 *
 * Every weighing is chosen in advance rather than one after another. That is a
 * real restriction — the classic twelve-coin puzzle is usually solved
 * adaptively — but it is what turns this into something you *arrange* and then
 * run, and at these sizes the minimum comes out the same either way.
 *
 * A coin's pattern is one entry per weighing: LEFT, RIGHT, or ASIDE. If it is
 * the heavy one, each weighing tips towards the pan holding it, so the outcome
 * is the pattern itself; if light, the scales tip the other way and the outcome
 * is the pattern reversed. So a scheme works exactly when no two of those 2n
 * outcomes agree — which bars a coin that is set aside every time (it looks the
 * same heavy or light) and bars two coins with mirrored patterns.
 *
 * And the pans have to hold the same number of coins, or a weighing tips for
 * reasons that have nothing to do with the fake.
 *
 * Nothing here searches. Par and one worked answer per level were settled
 * offline; see tools/weighing.py.
 */

import { board, svgEl } from '../../engine/engine.js';

const ASIDE = 0;
const LEFT = 1;
const RIGHT = -1;

/* Board geometry, in the SVG's own units. */
const COL = 46;             // width of one coin's column
const GUTTER = 138;         // room for the row labels on the left
const SCALES = 160;         // room for the balance beam on the right
const COIN_Y = 38;
const COIN_R = 16;
const GRID_TOP = 72;
const ROW_H = 46;
const RACK_GAP = 56;        // room above the rack for its two lines of label
const SLOT_MAX = 40;        // a slot at its most generous
const RACK_DEEP = 3;        // rows of slots; the rack grows sideways, not down

const gridW = (level) => level.n * COL;
const rowY = (j) => GRID_TOP + j * ROW_H;
const colX = (i) => GUTTER + i * COL;

/** A labelled <text>. The engine's svgEl only sets attributes, and this board
 *  is mostly counting, so it says almost everything in words. */
function text(attrs, str) {
  const node = svgEl('text', attrs);
  node.textContent = str;
  return node;
}

/** How many weighings the player is actually using.
 *
 *  An untouched row costs nothing and tells nothing: it leaves every case's
 *  outcome unchanged at "level", so it neither separates anything nor merges
 *  anything. It simply does not count as a weighing. That is what lets a level
 *  hand out a spare row without making par meaningless. */
function usedRows(level, play) {
  const out = [];
  for (let j = 0; j < level.rows; j++) {
    if (play.cells.some((row) => row[j] !== ASIDE)) out.push(j);
  }
  return out;
}

/** The pans in weighing j, as [left count, right count]. */
function pans(level, play, j) {
  let l = 0;
  let r = 0;
  for (const row of play.cells) {
    if (row[j] === LEFT) l++;
    else if (row[j] === RIGHT) r++;
  }
  return [l, r];
}

/** Which slot a case falls into, as an index into the rack.
 *
 *  The outcome of weighing `used[d]` is the coin's entry there, negated when
 *  the coin is light. Read as a base-three numeral so every distinct outcome
 *  gets a distinct slot, which is the whole point of the rack. */
function slotOf(play, used, coin, heavy) {
  let at = 0;
  for (let d = used.length - 1; d >= 0; d--) {
    const tip = (heavy ? 1 : -1) * play.cells[coin][used[d]];
    at = at * 3 + (tip + 1);
  }
  return at;
}

/** The fewest weighings counting alone allows: the least k with 3^k >= 2n.
 *
 *  This is a floor, not always the answer. Twice it is beaten by the pans: with
 *  four coins, and again with thirteen, every arrangement that would fit inside
 *  the outcomes leaves a weighing with an odd number of coins on it, and par is
 *  one higher. Worth saying out loud when it happens, so the first hint does
 *  not claim a proof it does not have. */
function bound(n) {
  let k = 0;
  while (3 ** k < 2 * n) k++;
  return k;
}

/** Every case this arrangement can produce, in the order the run tells them. */
function cases(level, play) {
  const used = usedRows(level, play);
  const out = [];
  for (let i = 0; i < level.n; i++) {
    for (const heavy of [true, false]) {
      out.push({ coin: i, heavy, slot: slotOf(play, used, i, heavy) });
    }
  }
  return { used, list: out, slots: 3 ** used.length };
}

/** Everything wrong with the arrangement, worst first.
 *
 *  This is what the verdict is read from — never the animation, which exists
 *  only to show the player why. */
function faults(level, play) {
  const { used, list } = cases(level, play);
  const bad = [];

  for (const j of used) {
    const [l, r] = pans(level, play, j);
    if (l !== r) bad.push({ kind: 'pans', row: j, left: l, right: r });
  }

  const bySlot = new Map();
  for (const s of list) {
    if (!bySlot.has(s.slot)) bySlot.set(s.slot, []);
    bySlot.get(s.slot).push(s);
  }
  for (const group of bySlot.values()) {
    if (group.length > 1) bad.push({ kind: 'clash', group });
  }
  return bad;
}

/** The slots holding more than one case, for the rack to paint red. */
function clashedSlots(level, play, upto) {
  const { list } = cases(level, play);
  const count = new Map();
  for (const s of list.slice(0, upto)) {
    count.set(s.slot, (count.get(s.slot) || 0) + 1);
  }
  return count;
}

/* ---------------------------------------------------------------- drawing */

/** Where the rack sits and how its slots are laid out.
 *
 *  The rack holds one slot per outcome the weighings can produce, so it triples
 *  every time the player brings in another weighing — which is the theorem
 *  happening in front of them.
 *
 *  It grows sideways rather than downwards, never more than a few slots deep,
 *  so the board stays wide and short like the space it is drawn in, and its
 *  height is the same whatever is on it — nothing below the rack shifts as the
 *  player works. Past the point where that band is full the slots start
 *  shrinking instead, which is the honest picture anyway: the outcomes are
 *  being divided ever finer, not given more room. */
function rackPlan(level, k) {
  const room = gridW(level) + SCALES - 20;
  const down = k <= 2 ? 1 : RACK_DEEP;
  const across = 3 ** k / down;
  return {
    k,
    across,
    down,
    top: rowY(level.rows) + RACK_GAP,
    size: Math.max(7, Math.min(SLOT_MAX, room / across - 3)),
    gap: 3,
    slots: 3 ** k,
  };
}

function drawCoins(level, play, live) {
  for (let i = 0; i < level.n; i++) {
    const x = colX(i) + COL / 2;
    const on = live && live.coin === i;
    // Heavy and light are told apart by size rather than by colour, because
    // colour here already means which pan a coin is in — and a heavy coin
    // drawn in the left pan's colour reads as "this one is on the left".
    board.appendChild(svgEl('circle', {
      cx: x, cy: COIN_Y,
      r: COIN_R + (on ? (live.heavy ? 3 : -3) : 0),
      class: 'coin' + (on ? ' live' : '')
        + (play.hinted && play.hinted.has(i) ? ' hinted' : ''),
    }));
    board.appendChild(text({
      x, y: COIN_Y + 5, class: 'coin-label' + (on ? ' live' : ''),
    }, String(i + 1)));
  }
}

/** One weighing: the label, a cell under every coin, and the balance itself. */
function drawRow(level, play, j, tip) {
  const y = rowY(j);
  const [l, r] = pans(level, play, j);
  const idle = l === 0 && r === 0;

  board.appendChild(text({
    x: GUTTER - 18, y: y + ROW_H / 2 + 5,
    class: 'row-label' + (idle ? ' idle' : ''),
  }, idle ? `spare` : `Weighing ${j + 1}`));

  for (let i = 0; i < level.n; i++) {
    const side = play.cells[i][j];
    const x = colX(i) + 4;
    const w = COL - 8;
    board.appendChild(svgEl('rect', {
      x, y: y + 6, width: w, height: ROW_H - 12, rx: 8,
      class: 'cell'
        + (side === LEFT ? ' left' : side === RIGHT ? ' right' : ''),
    }));
    if (side !== ASIDE) {
      board.appendChild(svgEl('circle', {
        cx: x + w / 2 + (side === LEFT ? -w / 5 : w / 5),
        cy: y + ROW_H / 2, r: 7,
        class: 'pan-mark ' + (side === LEFT ? 'left' : 'right'),
      }));
    }
  }

  drawBalance(level, j, l, r, tip, idle);
}

/** The balance for one weighing, drawn at the end of its row.
 *
 *  While placing, it leans by however far the pans are from matching, so an
 *  uneven weighing is visible as a thing rather than described as a mistake.
 *  During the run it leans the way that weighing actually tips for the case
 *  being told. */
function drawBalance(level, j, l, r, tip, idle) {
  const cx = GUTTER + gridW(level) + SCALES / 2;
  const cy = rowY(j) + ROW_H / 2;
  const arm = 46;
  const lean = tip !== null ? tip * 9 : Math.max(-9, Math.min(9, (r - l) * 5));
  const even = l === r;

  board.appendChild(svgEl('path', {
    d: `M ${cx} ${cy + 16} L ${cx - 11} ${cy + 26} L ${cx + 11} ${cy + 26} Z`,
    class: 'fulcrum',
  }));
  board.appendChild(svgEl('line', {
    x1: cx - arm, y1: cy + lean, x2: cx + arm, y2: cy - lean,
    class: 'beam' + (idle ? ' idle' : even ? '' : ' uneven'),
  }));
  for (const [sx, n, dy] of [[-arm, l, lean], [arm, r, -lean]]) {
    board.appendChild(svgEl('line', {
      x1: cx + sx, y1: cy + dy, x2: cx + sx, y2: cy + dy + 13, class: 'hanger',
    }));
    board.appendChild(svgEl('path', {
      d: `M ${cx + sx - 13} ${cy + dy + 13} q 13 12 26 0`,
      class: 'pan' + (idle ? ' idle' : ''),
    }));
    board.appendChild(text({
      x: cx + sx, y: cy + dy + 11, class: 'pan-count',
    }, idle ? '' : String(n)));
  }
}

/** The rack: one slot per outcome, and whatever has landed in it so far. */
function drawRack(level, play, used, filled) {
  const plan = rackPlan(level, used.length);
  const counts = filled ? clashedSlots(level, play, filled) : new Map();
  const stride = plan.size + plan.gap;
  const left = GUTTER + (gridW(level) + SCALES - plan.across * stride) / 2;

  // The whole theorem, in one line, doing its own arithmetic. Saying "6 cases"
  // means nothing beside three coins; saying where the 6 came from means
  // everything, and it is the number the slot count has to be weighed against.
  board.appendChild(text({
    x: GUTTER, y: plan.top - 30, class: 'rack-label',
  }, `Any of the ${level.n} coins could be the fake, and it could be heavy or `
     + `light: ${2 * level.n} cases to tell apart.`));
  board.appendChild(text({
    x: GUTTER, y: plan.top - 11, class: 'rack-label',
  }, plan.k === 0
    ? 'One slot to sort them into: with nothing on the scales, every case '
      + 'looks exactly the same.'
    : `${plan.slots} slots to sort them into — one for each way your `
      + `${plan.k === 1 ? 'weighing' : `${plan.k} weighings`} can come out.`));

  for (let s = 0; s < plan.slots; s++) {
    const x = left + (s % plan.across) * stride;
    const y = plan.top + Math.floor(s / plan.across) * stride;
    const got = counts.get(s) || 0;
    board.appendChild(svgEl('rect', {
      x, y, width: plan.size, height: plan.size, rx: 3,
      class: 'slot' + (got > 1 ? ' clash' : got ? ' taken' : ''),
    }));
    if (got > 1 && plan.size >= 14) {
      board.appendChild(text({
        x: x + plan.size / 2, y: y + plan.size / 2 + 4, class: 'slot-count',
      }, String(got)));
    }
  }
}

function render(level, play, phase) {
  board.replaceChildren();
  const used = usedRows(level, play);

  // While the run is going, the board follows the case being told: one coin
  // lit as heavy or light, and every balance leaning the way that weighing
  // actually tips for it. Once it is over the board goes back to reporting the
  // arrangement, because the answer is now the whole rack rather than any one
  // case — the last one told is not special.
  const live = phase === 'running' && play.sim ? play.sim.current() : null;
  const filled = phase === 'placing' || !play.sim ? 0
    : phase === 'running' ? play.sim.placed : play.sim.list.length;

  drawCoins(level, play, live);
  for (let j = 0; j < level.rows; j++) {
    // A row nobody is using stays level whatever the case.
    const tip = !live || !used.includes(j) ? (live ? 0 : null)
      : (live.heavy ? 1 : -1) * play.cells[live.coin][j];
    drawRow(level, play, j, tip);
  }
  drawRack(level, play, used, filled);
}

/* ------------------------------------------------------------------ hints */

/** The shipped answer, turned to face whatever the player has already built.
 *
 *  A worked answer is only unique up to relabelling — swap two weighings,
 *  swap the pans in one of them, or hand the patterns to different coins, and
 *  it is the same scheme. So rather than wiping the board and imposing a
 *  stranger's arrangement, try every relabelling and keep the one that agrees
 *  with the player most, which usually leaves most of their work standing.
 */
function nearestAnswer(level, play) {
  const par = level.par;
  const answer = level.solution;

  // Which rows to put it in: the ones the player has leaned on hardest.
  const load = [];
  for (let j = 0; j < level.rows; j++) {
    load.push([j, play.cells.reduce((a, row) => a + (row[j] ? 1 : 0), 0)]);
  }
  load.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const target = load.slice(0, par).map(([j]) => j).sort((a, b) => a - b);

  const orders = [];
  (function perm(left, sofar) {
    if (!left.length) { orders.push(sofar); return; }
    left.forEach((v, i) => perm(left.filter((_, q) => q !== i), sofar.concat(v)));
  })([...Array(par).keys()], []);

  let best = null;
  let bestScore = -1;
  for (const order of orders) {
    for (let flip = 0; flip < 1 << par; flip++) {
      // One relabelling: weighing d of the answer becomes the player's row
      // target[order[d]], with its pans swapped if bit d of `flip` is set.
      const vecs = answer.map((v) => v.map(
        (x, d) => x * ((flip >> d) & 1 ? -1 : 1)));

      const taken = new Array(vecs.length).fill(false);
      const assign = new Array(level.n);
      let score = 0;
      for (let i = 0; i < level.n; i++) {
        let pick = -1;
        let agree = -1;
        for (let t = 0; t < vecs.length; t++) {
          if (taken[t]) continue;
          let a = 0;
          for (let d = 0; d < par; d++) {
            if (play.cells[i][target[order[d]]] === vecs[t][d]) a++;
          }
          if (a > agree) { agree = a; pick = t; }
        }
        taken[pick] = true;
        assign[i] = vecs[pick];
        score += agree;
      }
      if (score > bestScore) { bestScore = score; best = { assign, order }; }
    }
  }

  const cells = play.cells.map(() => new Array(level.rows).fill(ASIDE));
  for (let i = 0; i < level.n; i++) {
    for (let d = 0; d < par; d++) {
      cells[i][target[best.order[d]]] = best.assign[i][d];
    }
  }
  return cells;
}

/* ---------------------------------------------------------------- exports */

export default {
  id: 'weighing',
  title: 'Coin weighing',
  blurb:
    'One coin in the pile is fake, and you do not know whether it is heavy or '
    + 'light. Plan every weighing in advance, using as few as you can.',
  verb: 'Work the scales',
  credit:
    'A game on the counting bound for search with a balance. Each weighing '
    + 'comes out one of three ways, so <b>k</b> weighings can separate at most '
    + '<b>3<sup>k</sup></b> cases — the argument behind the classic '
    + 'twelve-coin puzzle, here in its non-adaptive form, where every weighing '
    + 'is chosen up front. Levels and answers are generated here, so this game '
    + 'carries no third-party data.',

  group: (m) => (m.n <= 6 ? 'up to 6 coins'
    : m.n <= 12 ? '7 to 12 coins'
    : m.n <= 20 ? '13 to 20 coins'
    : '22 to 39 coins'),
  chip: (m) => `${m.n}·${m.par}`,
  par: (m) => m.par,

  start: (level) => ({
    cells: Array.from({ length: level.n },
                      () => new Array(level.rows).fill(ASIDE)),
    hinted: null,
    sim: null,
  }),

  // Fixed for the level: the rack is bounded in both directions, so this is
  // the room it will ever need and nothing moves as the player works.
  view(level) {
    return [0, 0,
            GUTTER + gridW(level) + SCALES + 20,
            rowY(level.rows) + RACK_GAP + RACK_DEEP * (SLOT_MAX + 3) + 24];
  },

  runnable: (level, play) => play.cells.some((row) => row.some((c) => c)),

  describe(level, play) {
    const used = usedRows(level, play).length;
    const slots = 3 ** used;
    return {
      // The task in the words of the puzzle, not in the words of the counting
      // argument. Leading with "tell all 6 cases apart" asked the player to
      // take an unexplained 6 on trust, when there are only three coins in
      // front of them; where the 6 comes from belongs on the rack, next to the
      // slots it is being compared against.
      goal: `Find the fake coin — and say whether it is heavy or light — `
            + `in <b>${level.par}</b> weighings`,
      status: `${used} ${used === 1 ? 'weighing' : 'weighings'} · `
              + `${slots} ${slots === 1 ? 'slot' : 'slots'} for `
              + `${2 * level.n} cases`,
    };
  },

  click(level, play, p) {
    const j = Math.floor((p.y - GRID_TOP) / ROW_H);
    const i = Math.floor((p.x - GUTTER) / COL);
    if (j < 0 || j >= level.rows || i < 0 || i >= level.n) {
      return { message: 'Click a coin’s square in a weighing to put it '
                        + 'on the left pan, then the right, then aside.' };
    }
    const at = play.cells[i][j];
    play.cells[i][j] = at === ASIDE ? LEFT : at === LEFT ? RIGHT : ASIDE;
    play.hinted = null;
    return { changed: true };
  },

  draw: render,

  sim: {
    // No scrub bar. The run does not develop — it reads out an answer the
    // arrangement already fixed, one case at a time — so stopping partway
    // shows a half-filled rack, which says strictly less than the full one.
    replay: false,

    create(level, play) {
      const { list, used } = cases(level, play);
      // Slow enough to watch a case land, quick enough that thirty-nine coins
      // do not outstay their welcome: the whole run is about the same length
      // whatever the size of the level.
      const per = Math.max(2, Math.round(150 / list.length));
      const sim = {
        list, used, per, tick: 0, placed: 0, level, play,
        current: () => (sim.placed > 0 && sim.placed <= sim.list.length
          ? sim.list[sim.placed - 1] : null),
      };
      play.sim = sim;
      return sim;
    },

    step(sim) {
      if (sim.placed >= sim.list.length) return true;
      if (++sim.tick >= sim.per) { sim.tick = 0; sim.placed++; }
      return sim.placed >= sim.list.length;
    },

    perFrame: () => 1,
    paint: (sim) => render(sim.level, sim.play, 'running'),
    readout(sim) {
      const at = sim.current();
      return (at ? `coin ${at.coin + 1} ${at.heavy ? 'heavy' : 'light'} · ` : '')
        + `${sim.placed} of ${sim.list.length} cases tried`;
    },
  },

  verdict(level, play) {
    const used = usedRows(level, play).length;
    const bad = faults(level, play);

    if (!bad.length) {
      const perfect = used === level.par;
      return {
        won: true,
        perfect,
        score: used,
        title: perfect ? 'Every case has its own slot.'
                       : 'It works.',
        detail: perfect
          ? `Told apart in ${used} ${used === 1 ? 'weighing' : 'weighings'}, `
            + 'and nothing does it in fewer.'
          : `Told apart in ${used} weighings, where ${level.par} would do.`,
        readout: `${used} ${used === 1 ? 'weighing' : 'weighings'}`,
      };
    }

    const pans = bad.find((b) => b.kind === 'pans');
    if (pans) {
      return {
        won: false,
        title: 'The scales were rigged.',
        detail: `Weighing ${pans.row + 1} had ${pans.left} `
                + `${pans.left === 1 ? 'coin' : 'coins'} against ${pans.right}, `
                + 'so it tips that way whatever the fake is doing.',
        readout: `weighing ${pans.row + 1} was uneven`,
      };
    }

    const [a, b] = bad.find((f) => f.kind === 'clash').group;
    const name = (s) => `coin ${s.coin + 1} ${s.heavy ? 'heavy' : 'light'}`;
    const detail = a.coin === b.coin
      ? `Coin ${a.coin + 1} never goes on the scales, so nothing it does `
        + 'shows: heavy or light, every weighing comes out level.'
      : `${name(a)[0].toUpperCase()}${name(a).slice(1)} and ${name(b)} tip `
        + 'every weighing exactly alike, so you could not say which it was.';
    return {
      won: false,
      title: 'Two cases, one slot.',
      detail,
      readout: 'two cases landed together',
    };
  },

  /* The hint is the proof, handed over a piece at a time: count the outcomes,
     then count the patterns those outcomes leave you, then an answer. */
  hint(level, play, tier) {
    const n = level.n;
    const used = usedRows(level, play).length;
    const bad = faults(level, play);

    if (tier === 1) {
      const uneven = bad.filter((f) => f.kind === 'pans').length;
      const clashes = bad.filter((f) => f.kind === 'clash').length;
      let where = 'Nothing is on the scales yet.';
      if (used) {
        const parts = [];
        if (uneven) {
          parts.push(`${uneven} of your weighings ${uneven === 1 ? 'is' : 'are'} `
                     + 'uneven');
        }
        if (clashes) {
          parts.push(`${clashes} ${clashes === 1 ? 'slot has' : 'slots have'} `
                     + 'more than one case in it');
        }
        where = parts.length ? `Right now ${parts.join(', and ')}.`
                             : 'Your arrangement already works.';
      }
      // Say what the counting argument actually proves, and no more. On the
      // two levels where par is higher than the bound, that gap is the most
      // interesting thing about them.
      const lo = bound(n);
      const why = lo === level.par
        ? `Anything less than ${level.par} runs out of outcomes, so `
          + `${level.par} is the fewest that can work.`
        : `Counting alone would let you off with ${lo}: `
          + `3^${lo} = ${3 ** lo} outcomes is enough room for ${2 * n} `
          + `cases. But it cannot be done in ${lo} here — every way of `
          + 'sorting the coins leaves some weighing with an odd number of '
          + `them, and odd will not split between two pans. It takes `
          + `${level.par}.`;
      return {
        text: `Each weighing comes out one of three ways — left down, right `
              + `down, or level — so ${level.par} of them can tell at most `
              + `3^${level.par} = ${3 ** level.par} cases apart. You have `
              + `${2 * n} to tell: ${n} coins, and either could be the heavy `
              + `fake or the light one. ${why} ${where}`,
      };
    }

    const patterns = (3 ** level.par - 1) / 2;
    if (tier === 2) {
      const spare = patterns - n;
      return {
        text: 'Think of each coin as the pattern of pans it sits in. Two coins '
              + 'cannot share a pattern, and no coin may take the mirror of '
              + 'another’s — that coin heavy and this one light would tip '
              + 'every weighing the same way. Nor may a coin sit out every '
              + 'weighing, which is its own mirror. That leaves exactly '
              + `${patterns} usable patterns for ${level.par} weighings, and `
              + `you need ${n} of them`
              + (spare === 0
                 ? ' — all of them, which is why the pans are so tight here.'
                 : spare === 1
                   ? ' — all but one.'
                   : `, so ${spare} go unused.`),
      };
    }

    const answer = nearestAnswer(level, play);
    // Mark only the coins it had to move, so the hint shows its own working
    // rather than lighting up the whole board including what was already right.
    play.hinted = new Set();
    answer.forEach((row, i) => {
      if (row.some((v, j) => v !== play.cells[i][j])) play.hinted.add(i);
    });
    play.cells = answer;
    return {
      text: 'Here is an arrangement that works, turned to match yours as '
            + 'closely as it can. Press run and watch every case land in a '
            + 'slot of its own.',
    };
  },
};
