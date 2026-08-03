'use strict';

/* Coin weighing — one coin among n is fake, and you have a balance.
 *
 * Every weighing comes out one of three ways: left pan down, right pan down,
 * or level. So k weighings can tell at most 3^k cases apart, and there are 2n
 * cases to tell — which coin, and whether it is heavy or light. No strategy can
 * beat log_3(2n).
 *
 * You weigh, you see which way it tips, and only then choose what to weigh
 * next. Then you name the culprit. You win only if your weighings actually
 * pinned it down: naming while two cases still fit what you saw is a guess, and
 * a guess loses even when it happens to be right.
 *
 * THE SCALES ARE AN ADVERSARY. There is no fake coin hidden at the start.
 * Every answer is consistent with at least one fake — the balance never lies —
 * but among the honest answers it gives whichever leaves you worst off. That is
 * what makes par mean something: you cannot get lucky, and a lazy weighing is
 * punished the moment you make it. It is also the theorem wearing a costume,
 * since the adversary's whole power is that three outcomes cannot separate more
 * than three groups.
 *
 * WHAT THE BOARD WILL NOT DO FOR YOU. It shows every weighing you have made and
 * how it came out, and it counts how many cases still fit. It does not say
 * *which* cases those are. Working that out from the record in front of you is
 * the puzzle — an earlier version of this game computed all of it and asked
 * only for an arrangement, which left the player with bookkeeping rather than
 * deduction. The first hint gives the live cases up to anyone who has lost the
 * thread.
 *
 * Nothing here searches. Every position a level can reach was valued offline
 * and ships with it, so the adversary's choice and the last hint's weighing are
 * both lookups; see tools/adaptive.py.
 */

import { board, svgEl } from '../../engine/engine.js';

const ASIDE = 0;
const LEFT = 1;
const RIGHT = -1;

/* What is known about a coin. These are the only four things there are to
   know, and a coin's whole history is summed up by which one it is in. */
const BOTH = 'both';          // might be the fake, heavy or light
const HEAVY = 'heavy';        // might be the fake, and could only be heavy
const LIGHT = 'light';        // might be the fake, and could only be light
const GENUINE = 'genuine';    // cleared

/* Board geometry, in the SVG's own units. */
const COL = 52;
const COIN_R = 17;
const MARGIN = 26;
const COIN_Y = 74;
const PAN_TOP = 118;
const PAN_H = 112;
const PLATE_Y = 250;
const PLATE_H = 34;
const LOG_TOP = 312;
const LOG_H = 26;

const rowWidth = (level) => Math.max(560, level.n * COL);
const colX = (level, i) => MARGIN + (rowWidth(level) - level.n * COL) / 2
  + i * COL + COL / 2;

function text(attrs, str) {
  const node = svgEl('text', attrs);
  node.textContent = str;
  return node;
}

/* ------------------------------------------------------------ the position */

/** How many cases still fit everything the player has seen. */
function alive(play) {
  let n = 0;
  for (const s of play.status) {
    if (s === BOTH) n += 2;
    else if (s === HEAVY || s === LIGHT) n += 1;
  }
  return n;
}

/** The live cases themselves, as {coin, heavy} — what the first hint reveals
 *  and what the verdict names. */
function liveCases(play) {
  const out = [];
  play.status.forEach((s, i) => {
    if (s === BOTH || s === HEAVY) out.push({ coin: i, heavy: true });
    if (s === BOTH || s === LIGHT) out.push({ coin: i, heavy: false });
  });
  return out;
}

/** The position as counts, which is all its value depends on. */
function shape(play) {
  let b = 0;
  let h = 0;
  let l = 0;
  for (const s of play.status) {
    if (s === BOTH) b++;
    else if (s === HEAVY) h++;
    else if (s === LIGHT) l++;
  }
  return { b, h, l };
}

/** Weighings still needed from here, played perfectly against the adversary.
 *
 *  Read straight out of the level's shipped table. A position either still has
 *  wholly unknown coins in it, or it does not — the two cannot mix, because a
 *  coin stops being unknown only when the scales tip, and a tip settles every
 *  coin at once. */
function cost(level, play) {
  const { b, h, l } = shape(play);
  return b ? level.value.both[b] : level.value.split[h][l];
}

/** What the coins would be known to be, if this weighing came out `tip`.
 *
 *  Tipping left means the fake is a possibly-heavy coin on the left pan or a
 *  possibly-light one on the right; everything else is thereby cleared. Level
 *  means the fake is none of the coins weighed. */
function after(play, pending, tip) {
  return play.status.map((s, i) => {
    const side = pending[i];
    if (tip === 0) return side === ASIDE ? s : GENUINE;
    const heavySide = tip === LEFT ? LEFT : RIGHT;
    const lightSide = tip === LEFT ? RIGHT : LEFT;
    if (side === heavySide) return (s === BOTH || s === HEAVY) ? HEAVY : GENUINE;
    if (side === lightSide) return (s === BOTH || s === LIGHT) ? LIGHT : GENUINE;
    return GENUINE;
  });
}

const casesIn = (status) => status.reduce(
  (a, s) => a + (s === BOTH ? 2 : s === GENUINE ? 0 : 1), 0);

/** The pans of the weighing being built, as [left count, right count]. */
function pans(play) {
  let l = 0;
  let r = 0;
  for (const side of play.pending) {
    if (side === LEFT) l++;
    else if (side === RIGHT) r++;
  }
  return [l, r];
}

/** How the balance answers: honestly, and as unhelpfully as honesty allows.
 *
 *  Every outcome offered here is consistent with at least one fake still in
 *  play, so nothing the player is told is ever false. Among those, the one
 *  chosen is the one that leaves the most work to do — measured in weighings
 *  rather than in cases, so it cannot be fooled by a branch that is large but
 *  easy. Ties go to the branch with more cases alive, and then to a fixed
 *  order, so the same play always produces the same game. */
function answer(level, play) {
  let best = null;
  for (const tip of [LEFT, RIGHT, 0]) {
    const status = after(play, play.pending, tip);
    const cases = casesIn(status);
    if (!cases) continue;              // that outcome cannot happen
    const probe = { status };
    const need = cost(level, probe);
    if (!best || need > best.need
        || (need === best.need && cases > best.cases)) {
      best = { tip, status, cases, need };
    }
  }
  return best;
}

/** A weighing that keeps the player on the fastest line, or null.
 *
 *  Searched over counts rather than over choices of coin, because coins in the
 *  same condition are interchangeable and only the counts change the value of a
 *  weighing. Two observations keep this small enough to run while the player
 *  waits, even at thirty-nine coins:
 *
 *  Ballast is forced. Genuine coins are there only to even the pans up, and
 *  adding one to *each* pan changes nothing at all — so the only amount worth
 *  considering is the least that makes the counts match.
 *
 *  Wholly unknown coins never share a position with half-known ones, so one of
 *  the two loops below always applies and never both.
 */
function bestWeighing(level, play) {
  const byKind = { [BOTH]: [], [HEAVY]: [], [LIGHT]: [], [GENUINE]: [] };
  play.status.forEach((s, i) => byKind[s].push(i));
  const b = byKind[BOTH].length;
  const h = byKind[HEAVY].length;
  const l = byKind[LIGHT].length;
  const g = byKind[GENUINE].length;
  const val = level.value;
  const target = cost(level, play) - 1;      // the best any weighing can leave

  let best = null;
  const offer = (bl, br, hl, hr, ll, lr, worst) => {
    if (!best || worst < best.worst) best = { bl, br, hl, hr, ll, lr, worst };
  };

  if (b) {
    for (let bl = 0; bl <= b; bl++) {
      for (let br = 0; bl + br <= b; br++) {
        if (bl + br === 0) continue;
        // The pans must match, so the shorter one takes genuine coins.
        if (Math.abs(bl - br) > g) continue;
        let worst = Math.max(val.split[bl][br], val.split[br][bl]);
        const rest = b - bl - br;
        if (rest) worst = Math.max(worst, val.both[rest]);
        offer(bl, br, 0, 0, 0, 0, worst);
        if (worst <= target) return materialise(level, byKind, best);
      }
    }
  } else {
    for (let hl = 0; hl <= h; hl++) {
      for (let hr = 0; hl + hr <= h; hr++) {
        for (let ll = 0; ll <= l; ll++) {
          for (let lr = 0; ll + lr <= l; lr++) {
            const nl = hl + ll;
            const nr = hr + lr;
            if (nl + nr === 0) continue;
            if (Math.abs(nl - nr) > g) continue;
            let worst = 0;
            for (const [a, c] of [[hl, lr], [hr, ll],
                                  [h - hl - hr, l - ll - lr]]) {
              if (a + c) worst = Math.max(worst, val.split[a][c]);
            }
            offer(0, 0, hl, hr, ll, lr, worst);
            if (worst <= target) return materialise(level, byKind, best);
          }
        }
      }
    }
  }
  return best && materialise(level, byKind, best);
}

/** Turn a choice of counts into a choice of actual coins. */
function materialise(level, byKind, pick) {
  const pending = new Array(level.n).fill(ASIDE);
  const take = (pool, from, count, side) => {
    for (let i = 0; i < count; i++) pending[pool[from + i]] = side;
    return from + count;
  };
  take(byKind[BOTH], take(byKind[BOTH], 0, pick.bl, LEFT), pick.br, RIGHT);
  take(byKind[HEAVY], take(byKind[HEAVY], 0, pick.hl, LEFT), pick.hr, RIGHT);
  take(byKind[LIGHT], take(byKind[LIGHT], 0, pick.ll, LEFT), pick.lr, RIGHT);
  // Ballast: the least that evens the pans.
  const count = (side) => pending.reduce((a, s) => a + (s === side ? 1 : 0), 0);
  const gap = count(LEFT) - count(RIGHT);
  take(byKind[GENUINE], 0, Math.abs(gap), gap > 0 ? RIGHT : LEFT);
  return pending;
}

/* ---------------------------------------------------------------- drawing */

const label = (s) => (s === HEAVY ? 'could only be heavy'
  : s === LIGHT ? 'could only be light'
  : s === GENUINE ? 'cleared' : 'unknown');

function drawCoins(level, play) {
  for (let i = 0; i < level.n; i++) {
    const x = colX(level, i);
    const side = play.pending[i];
    const shown = play.reveal ? play.status[i] : null;
    const picked = play.naming && play.named && play.named.coin === i;
    board.appendChild(svgEl('circle', {
      cx: x, cy: COIN_Y, r: COIN_R,
      class: 'coin'
        + (side === LEFT ? ' on-left' : side === RIGHT ? ' on-right' : '')
        + (shown ? ` is-${shown}` : '')
        + (picked ? ' picked' : ''),
    }));
    board.appendChild(text({ x, y: COIN_Y + 5, class: 'coin-label' },
                           String(i + 1)));
    if (shown && shown !== BOTH) {
      board.appendChild(text({ x, y: COIN_Y + COIN_R + 13, class: 'coin-note' },
        shown === GENUINE ? 'ok' : shown === HEAVY ? 'H?' : 'L?'));
    }
  }
}

/** The balance, holding whatever is on it right now.
 *
 *  It leans while the pans are uneven, which is the one thing about a weighing
 *  the player never has to work out for themselves — an uneven weighing tips
 *  for reasons that have nothing to do with the fake, so it is a physical fact
 *  rather than a deduction. */
function drawBalance(level, play, tip) {
  const [l, r] = pans(play);
  const w = rowWidth(level);
  const cx = MARGIN + w / 2;
  const cy = PAN_TOP + 30;
  const arm = Math.min(190, w / 2 - 40);
  const lean = tip !== null && tip !== undefined
    ? tip * 16 : Math.max(-16, Math.min(16, (r - l) * 8));
  const even = l === r;

  board.appendChild(svgEl('path', {
    d: `M ${cx} ${cy + 26} L ${cx - 16} ${cy + 44} L ${cx + 16} ${cy + 44} Z`,
    class: 'fulcrum',
  }));
  board.appendChild(svgEl('line', {
    x1: cx - arm, y1: cy + lean, x2: cx + arm, y2: cy - lean,
    class: 'beam' + (l + r === 0 ? ' idle' : even ? '' : ' uneven'),
  }));
  for (const [sx, n, dy] of [[-arm, l, lean], [arm, r, -lean]]) {
    board.appendChild(svgEl('line', {
      x1: cx + sx, y1: cy + dy, x2: cx + sx, y2: cy + dy + 20, class: 'hanger',
    }));
    board.appendChild(svgEl('path', {
      d: `M ${cx + sx - 34} ${cy + dy + 20} q 34 26 68 0`,
      class: 'pan' + (l + r === 0 ? ' idle' : ''),
    }));
    board.appendChild(text({
      x: cx + sx, y: cy + dy + 16, class: 'pan-count',
    }, l + r === 0 ? '' : String(n)));
  }
  if (!even && l + r > 0) {
    board.appendChild(text({
      x: cx, y: cy + 66, class: 'warn',
    }, 'The pans must hold the same number of coins.'));
  }
}

/** A clickable plate drawn into the board, since every move here is a click on
 *  the board rather than a run of a simulation. */
function drawPlate(level, key, x, w, caption, on) {
  board.appendChild(svgEl('rect', {
    x, y: PLATE_Y, width: w, height: PLATE_H, rx: 9,
    class: 'plate' + (on ? '' : ' off') + (key === 'weigh' ? ' go' : ''),
  }));
  board.appendChild(text({
    x: x + w / 2, y: PLATE_Y + 22, class: 'plate-label' + (on ? '' : ' off'),
  }, caption));
}

function plates(level, play) {
  const w = rowWidth(level);
  const left = MARGIN;
  const used = play.history.length;
  const spent = used >= level.rows;
  const [l, r] = pans(play);
  const out = [];
  // Once the naming is in, the board is a record of what happened rather than
  // a thing to act on; leaving the plates up invites a click that does nothing.
  if (play.done) return [];
  if (play.naming) {
    if (play.named === null) {
      out.push({ key: 'cancel', caption: 'Back to weighing', on: true });
    } else {
      out.push({ key: 'heavy', caption: `Coin ${play.named.coin + 1} is heavy`, on: true });
      out.push({ key: 'light', caption: `Coin ${play.named.coin + 1} is light`, on: true });
      out.push({ key: 'cancel', caption: 'Back', on: true });
    }
  } else {
    out.push({
      key: 'weigh',
      caption: spent ? 'No weighings left' : 'Weigh these',
      on: !spent && l > 0 && l === r,
    });
    out.push({ key: 'clearpans', caption: 'Take them off', on: l + r > 0 });
    out.push({ key: 'name', caption: 'Name the fake', on: true });
  }
  const gap = 12;
  const each = (w - gap * (out.length - 1)) / out.length;
  out.forEach((p, i) => {
    p.x = left + i * (each + gap);
    p.w = each;
    drawPlate(level, p.key, p.x, p.w, p.caption, p.on);
  });
  return out;
}

/** The record: every weighing and how it came out. Everything the player needs
 *  in order to work out the live cases is here, which is why the live cases
 *  themselves are not given away. */
function drawLog(level, play) {
  const w = rowWidth(level);
  const names = (list) => (list.length ? list.map((i) => i + 1).join(' ') : '—');
  play.history.forEach((h, i) => {
    const y = LOG_TOP + i * LOG_H;
    board.appendChild(text({ x: MARGIN, y, class: 'log-n' }, `${i + 1}`));
    board.appendChild(text({ x: MARGIN + 22, y, class: 'log' },
      `${names(h.left)}   against   ${names(h.right)}`));
    board.appendChild(text({
      x: MARGIN + w, y, class: `log-tip tip-${h.tip}`,
    }, h.tip === 0 ? 'balanced'
       : h.tip === LEFT ? 'left pan went down' : 'right pan went down'));
  });
  if (!play.history.length) {
    board.appendChild(text({ x: MARGIN, y: LOG_TOP, class: 'log dim' },
      'Nothing weighed yet.'));
  }
}

function render(level, play) {
  board.replaceChildren();
  const last = play.history.length
    ? play.history[play.history.length - 1] : null;
  drawCoins(level, play);
  drawBalance(level, play, play.pending.some((s) => s) ? undefined
    : last ? last.tip : undefined);
  play.plates = plates(level, play);
  drawLog(level, play);
}

/* ---------------------------------------------------------------- exports */

export default {
  id: 'weighing',
  title: 'Coin weighing',
  blurb:
    'One coin in the pile is fake, and you do not know whether it is heavy or '
    + 'light. Find it with as few weighings as you can — and be sure, because '
    + 'a guess does not count.',
  credit:
    'A game on the counting bound for search with a balance. Each weighing '
    + 'comes out one of three ways, so <b>k</b> weighings can separate at most '
    + '<b>3<sup>k</sup></b> cases — the argument behind the classic twelve-coin '
    + 'puzzle. The scales here answer adversarially: never falsely, but always '
    + 'as unhelpfully as honesty allows, so par cannot be reached by luck. '
    + 'Levels and answers are generated here, so this game carries no '
    + 'third-party data.',

  group: (m) => (m.n <= 6 ? 'up to 6 coins'
    : m.n <= 12 ? '7 to 12 coins'
    : m.n <= 20 ? '13 to 20 coins'
    : '22 to 39 coins'),
  chip: (m) => `${m.n}·${m.par}`,
  par: (m) => m.par,

  start: (level) => ({
    status: new Array(level.n).fill(BOTH),
    pending: new Array(level.n).fill(ASIDE),
    history: [],
    naming: false,
    named: null,
    done: null,
    reveal: false,
    plates: [],
  }),

  view: (level) => [0, 0, rowWidth(level) + MARGIN * 2,
                    LOG_TOP + Math.max(2, level.rows) * LOG_H + 18],

  describe(level, play) {
    const cases = alive(play);
    const left = level.rows - play.history.length;
    return {
      goal: `Find the fake coin — and say whether it is heavy or light — `
            + `in <b>${level.par}</b> weighings`,
      status: (cases === 1 ? '1 case still fits' : `${cases} cases still fit`)
              + ` · ${play.history.length} weighed, ${left} left`,
    };
  },

  click(level, play, p) {
    if (play.done) return {};

    // A plate?
    if (p.y >= PLATE_Y && p.y <= PLATE_Y + PLATE_H) {
      const hit = play.plates.find((q) => p.x >= q.x && p.x <= q.x + q.w);
      if (!hit) return {};
      if (!hit.on) {
        return { message: hit.key === 'weigh'
          ? 'Put the same number of coins on each pan first.'
          : 'Not available yet.' };
      }
      return this.plate(level, play, hit.key);
    }

    // A coin?
    if (Math.abs(p.y - COIN_Y) <= COIN_R + 8) {
      for (let i = 0; i < level.n; i++) {
        if (Math.abs(p.x - colX(level, i)) <= COL / 2) {
          if (play.naming) {
            play.named = { coin: i, heavy: null };
            return { changed: true };
          }
          if (play.history.length >= level.rows) {
            return { message: 'No weighings left — name the fake.' };
          }
          const at = play.pending[i];
          play.pending[i] = at === ASIDE ? LEFT : at === LEFT ? RIGHT : ASIDE;
          return { changed: true };
        }
      }
    }
    return { message: play.naming
      ? 'Click the coin you believe is the fake.'
      : 'Click a coin to put it on the left pan, then the right, then off.' };
  },

  /** The moves that are not clicks on a coin. */
  plate(level, play, key) {
    if (key === 'clearpans') {
      play.pending = new Array(level.n).fill(ASIDE);
      return { changed: true };
    }
    if (key === 'name') {
      play.naming = true;
      play.named = null;
      play.pending = new Array(level.n).fill(ASIDE);
      return { changed: true };
    }
    if (key === 'cancel') {
      if (play.named) { play.named = null; return { changed: true }; }
      play.naming = false;
      return { changed: true };
    }
    if (key === 'heavy' || key === 'light') {
      play.named.heavy = key === 'heavy';
      play.done = 'named';
      return { changed: true };
    }
    if (key === 'weigh') {
      const said = answer(level, play);
      play.history.push({
        left: play.pending.reduce((a, s, i) => (s === LEFT ? a.concat(i) : a), []),
        right: play.pending.reduce((a, s, i) => (s === RIGHT ? a.concat(i) : a), []),
        tip: said.tip,
      });
      play.status = said.status;
      play.pending = new Array(level.n).fill(ASIDE);
      return { changed: true };
    }
    return {};
  },

  draw: (level, play) => render(level, play),

  // Move by move: there is no run to watch, because each weighing *is* the
  // run and its answer arrives at once.
  over: (level, play) => play.done !== null,

  verdict(level, play) {
    const cases = alive(play);
    const used = play.history.length;
    const said = play.named;
    const name = (c) => `coin ${c.coin + 1} ${c.heavy ? 'heavy' : 'light'}`;
    const Name = (c) => name(c)[0].toUpperCase() + name(c).slice(1);

    // Was the naming forced by what the player had seen? That, and not whether
    // they happened to be right, is the whole question: with the scales
    // answering adversarially there is no hidden truth to be lucky about, and
    // every case still alive is a fake the balance could still turn out to
    // have meant.
    if (cases > 1) {
      const others = liveCases(play).filter(
        (c) => !(c.coin === said.coin && c.heavy === said.heavy));
      return {
        won: false,
        title: 'You could not have known.',
        detail: `${cases} cases still fit every weighing you made — `
                + `${name(others[0])} just as well as what you said. `
                + (used < level.rows
                   ? `You had ${level.rows - used} `
                     + `${level.rows - used === 1 ? 'weighing' : 'weighings'} `
                     + 'left to tell them apart.'
                   : 'There was no weighing left to tell them apart.'),
        readout: `${cases} cases still fitted`,
      };
    }

    const only = liveCases(play)[0];
    if (!only || only.coin !== said.coin || only.heavy !== said.heavy) {
      return {
        won: false,
        title: 'Not what the scales said.',
        detail: only
          ? `Everything you weighed points at ${name(only)}.`
          : 'Nothing at all fits those weighings.',
        readout: 'named the wrong coin',
      };
    }

    const perfect = used === level.par;
    return {
      won: true,
      perfect,
      score: used,
      title: perfect ? 'Pinned down, and in the fewest weighings there are.'
                     : 'Pinned down.',
      detail: perfect
        ? `${Name(only)}, settled in ${used} `
          + `${used === 1 ? 'weighing' : 'weighings'} — and against scales `
          + 'answering as unhelpfully as they honestly can, nothing does it in '
          + 'fewer.'
        : `${Name(only)}, settled in ${used} weighings, where ${level.par} `
          + 'would have done.',
      readout: `${used} ${used === 1 ? 'weighing' : 'weighings'}`,
    };
  },

  /* The hint is the proof, a piece at a time: how much room is left, then the
     deduction the player has lost the thread of, then a weighing. */
  hint(level, play, tier) {
    const cases = alive(play);
    const left = level.rows - play.history.length;
    const need = cost(level, play);

    if (tier === 1) {
      const room = 3 ** left;
      return {
        text: `${cases} cases still fit what you have seen, and you have `
              + `${left} ${left === 1 ? 'weighing' : 'weighings'} left. Each `
              + `weighing comes out one of three ways, so ${left} of them can `
              + `separate at most ${room} cases. `
              + (need > left
                 ? 'That is not enough: this position cannot be settled in '
                   + `the weighings you have left. It needed ${need}.`
                 : cases <= 1
                   ? 'You already have it — name the coin.'
                   : `You are still on the fastest line: ${need} more `
                     + `${need === 1 ? 'weighing' : 'weighings'} will do it, `
                     + 'if each one splits what is left into three even '
                     + 'groups.'),
      };
    }

    if (tier === 2) {
      play.reveal = true;
      const live = liveCases(play);
      const list = live.length <= 12
        ? live.map((c) => `${c.coin + 1}${c.heavy ? 'H' : 'L'}`).join(', ')
        : `${live.length} of them`;
      return {
        text: 'Here is what your weighings have actually told you, marked on '
              + 'the coins: H means it could only be the heavy fake, L only '
              + 'the light one, ok means it is cleared. Still alive: '
              + `${list}. Any weighing you make now should split those into `
              + 'three groups as near equal as you can manage — that is the '
              + 'whole of the strategy.',
      };
    }

    const pick = bestWeighing(level, play);
    if (!pick) {
      return { text: 'There is no weighing left that helps here.' };
    }
    play.pending = pick;
    const side = (s) => pick.reduce((a, v, i) => (v === s ? a.concat(i + 1) : a), [])
      .join(' ');
    return {
      text: `Weigh ${side(LEFT)} against ${side(RIGHT)}. Whichever way it `
            + 'comes out, what is left is as small as it can be forced to be.',
    };
  },
};
