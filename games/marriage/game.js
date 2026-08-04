'use strict';

/* Hall's marriage theorem — give everybody a job they can do.
 *
 * Applicants down the left, jobs down the right, a line where somebody is
 * qualified. Match as many as you can.
 *
 * Hall: everyone can be placed exactly when every group of k applicants has at
 * least k jobs open to them between them. König puts a number on the failures:
 * the fewest people left out is the worst deficiency of any group.
 *
 * WHICH MAKES FAILURE PROVABLE, and that is the game. On a level where somebody
 * must go unplaced, matching the maximum is only half of it — the player also
 * has to point at the group of applicants sharing too few jobs. That group is
 * not an excuse, it is a proof: no arrangement whatsoever could have done
 * better, and you can check it by counting. Saying "I think this is the best"
 * is a guess; naming the bottleneck is knowing.
 *
 * The player builds the matching, which is the thing the happy ending problem
 * turned out to lack — a construction to reason your way to, rather than a
 * phenomenon to trigger. Knowing the theorem does not give it away either:
 * "n minus the worst deficiency" is the count, never the assignment.
 *
 * Nothing here searches. The largest matching and the worst group were settled
 * offline, by two independent methods that have to agree; see tools/hall.py.
 * What is computed here is only what the player can already see — whether a
 * line is theirs, and how many people have a job.
 */

import { board, svgEl } from '../../engine/engine.js';

const ROW = 46;
const TOP = 58;
const R = 17;
const LEFT_X = 150;
const RIGHT_X = 470;
const PLATE_H = 34;

const height = (level) => TOP + Math.max(level.n, level.m) * ROW + 96;
const plateY = (level) => TOP + Math.max(level.n, level.m) * ROW + 22;
const applicantY = (level, i) => TOP + i * ROW + (level.m > level.n
  ? (level.m - level.n) * ROW / 2 : 0);
const jobY = (level, j) => TOP + j * ROW + (level.n > level.m
  ? (level.n - level.m) * ROW / 2 : 0);

function text(attrs, str) {
  const node = svgEl('text', attrs);
  node.textContent = str;
  return node;
}

/** The jobs open to this group of applicants. */
function neighbours(level, group) {
  const out = new Set();
  for (const a of group) for (const j of level.adj[a]) out.add(j);
  return out;
}

const placed = (play) => Object.keys(play.match).length;

/* ---------------------------------------------------------------- drawing */

function render(level, play) {
  board.replaceChildren();
  const chosen = play.naming ? new Set(play.group) : null;

  // Every line somebody is qualified for, faint; the ones taken, bright. A
  // matching is a picture rather than a list, and reading it off the board is
  // most of what the player does.
  level.adj.forEach((jobs, a) => {
    for (const j of jobs) {
      const mine = play.match[a] === j;
      board.appendChild(svgEl('line', {
        x1: LEFT_X + R, y1: applicantY(level, a),
        x2: RIGHT_X - R, y2: jobY(level, j),
        class: 'link' + (mine ? ' taken' : ''),
      }));
    }
  });

  level.adj.forEach((jobs, a) => {
    const y = applicantY(level, a);
    const has = play.match[a] !== undefined;
    board.appendChild(svgEl('circle', {
      cx: LEFT_X, cy: y, r: R,
      class: 'who applicant' + (has ? ' placed' : '')
        + (play.picked === a ? ' picked' : '')
        + (chosen && chosen.has(a) ? ' chosen' : '')
        + (play.blame && play.blame.has(a) ? ' blame' : ''),
    }));
    board.appendChild(text({ x: LEFT_X, y: y + 5, class: 'who-label' },
                           String(a + 1)));
  });

  const taken = new Set(Object.values(play.match));
  const wanted = play.naming || play.blame
    ? neighbours(level, play.naming ? play.group : [...(play.blame || [])])
    : null;
  for (let j = 0; j < level.m; j++) {
    const y = jobY(level, j);
    board.appendChild(svgEl('circle', {
      cx: RIGHT_X, cy: y, r: R,
      class: 'who job' + (taken.has(j) ? ' placed' : '')
        + (wanted && wanted.has(j) ? ' wanted' : ''),
    }));
    board.appendChild(text({ x: RIGHT_X, y: y + 5, class: 'who-label' },
                           String.fromCharCode(65 + j)));
  }

  board.appendChild(text({ x: LEFT_X, y: TOP - 26, class: 'column' },
                         'applicants'));
  board.appendChild(text({ x: RIGHT_X, y: TOP - 26, class: 'column' }, 'jobs'));

  play.plates = plates(level, play);
}

function plates(level, play) {
  if (play.done) return [];
  const out = [];
  if (play.naming) {
    out.push({ key: 'submit', caption: `These ${play.group.length} are the bottleneck`,
               on: play.group.length >= 2 });
    out.push({ key: 'cancel', caption: 'Back to matching', on: true });
  } else {
    if (!level.blocked) {
      out.push({ key: 'done', caption: 'Everyone is placed',
                 on: placed(play) === level.n });
    }
    out.push({ key: 'name',
               caption: level.blocked ? 'Name the bottleneck'
                                      : 'No better is possible', on: true });
  }
  const width = RIGHT_X - LEFT_X + 260;
  const left = LEFT_X - 130;
  const gap = 12;
  const each = (width - gap * (out.length - 1)) / out.length;
  out.forEach((p, i) => {
    p.x = left + i * (each + gap);
    p.w = each;
    board.appendChild(svgEl('rect', {
      x: p.x, y: plateY(level), width: p.w, height: PLATE_H, rx: 9,
      class: 'plate' + (p.on ? '' : ' off') + (p.key === 'submit' ? ' go' : ''),
    }));
    board.appendChild(text({
      x: p.x + p.w / 2, y: plateY(level) + 22,
      class: 'plate-label' + (p.on ? '' : ' off'),
    }, p.caption));
  });
  return out;
}

/* ---------------------------------------------------------------- exports */

export default {
  id: 'marriage',
  title: 'Hall’s marriage theorem',
  blurb:
    'Give every applicant a job they are qualified for. When you cannot, say '
    + 'why — and the theorem says there is always a why.',
  credit:
    'A game on <b>Hall’s marriage theorem</b> and <b>König’s</b> '
    + 'companion to it: everyone can be matched exactly when every group of '
    + '<b>k</b> applicants has <b>k</b> jobs open to them between them, and '
    + 'when that fails, the fewest people left unplaced is the worst deficiency '
    + 'of any group. So a failure always has a proof attached, and finding it '
    + 'is half of this game. Instances and answers are generated here, so this '
    + 'game carries no third-party data.',

  group: (m) => `${m.n} applicants, ${m.m} jobs`,
  chip: (m) => `${m.n}·${m.par}`,
  par: (m) => m.par,

  start: () => ({
    match: {},          // applicant -> job
    picked: null,       // applicant waiting for a job
    naming: false,
    group: [],
    blame: null,
    done: null,
    plates: [],
  }),

  view: (level) => [0, 0, RIGHT_X + LEFT_X, height(level)],

  describe(level, play) {
    const on = placed(play);
    if (play.naming) {
      const seen = neighbours(level, play.group);
      return {
        goal: 'Pick the applicants who <b>share too few jobs</b> between them',
        status: `${play.group.length} chosen · `
          + `${seen.size} ${seen.size === 1 ? 'job' : 'jobs'} between them`,
      };
    }
    return {
      goal: level.blocked
        ? `Somebody must go without. Find the <b>smallest group</b> of `
          + 'applicants that proves it'
        : `Place all <b>${level.n}</b> applicants`,
      // On a blocked level, counting placements would suggest that placing
      // people is the task. It is not — it is a way of hunting for the group,
      // and the player is free to ignore it entirely.
      status: level.blocked
        ? `at most ${level.matched} of ${level.n} can be placed`
          + (on ? ` · ${on} on the board` : '')
        : `${on} of ${level.n} placed`
          + (on < level.n ? ` · ${level.n - on} left out` : ''),
    };
  },

  click(level, play, p) {
    if (play.done) return {};

    if (p.y >= plateY(level) && p.y <= plateY(level) + PLATE_H) {
      const hit = play.plates.find((q) => p.x >= q.x && p.x <= q.x + q.w);
      if (!hit) return {};
      if (!hit.on) {
        return { message: hit.key === 'done'
          ? 'Not everybody has a job yet.'
          : 'Pick at least two applicants.' };
      }
      return this.plate(level, play, hit.key);
    }

    // An applicant?
    for (let a = 0; a < level.n; a++) {
      if (Math.hypot(p.x - LEFT_X, p.y - applicantY(level, a)) <= R + 8) {
        if (play.naming) {
          const at = play.group.indexOf(a);
          if (at >= 0) play.group.splice(at, 1);
          else play.group.push(a);
          return { changed: true };
        }
        if (play.match[a] !== undefined) {
          delete play.match[a];           // take the job back
          play.picked = null;
          return { changed: true };
        }
        play.picked = play.picked === a ? null : a;
        return { changed: true };
      }
    }

    // A job?
    for (let j = 0; j < level.m; j++) {
      if (Math.hypot(p.x - RIGHT_X, p.y - jobY(level, j)) <= R + 8) {
        if (play.naming) return { message: 'Pick applicants, not jobs.' };
        if (play.picked === null) {
          return { message: 'Click an applicant first.' };
        }
        if (!level.adj[play.picked].includes(j)) {
          return { message: `Applicant ${play.picked + 1} is not qualified `
                            + `for job ${String.fromCharCode(65 + j)}.` };
        }
        const holder = Object.keys(play.match).find(
          (a) => play.match[a] === j);
        if (holder !== undefined) delete play.match[holder];
        play.match[play.picked] = j;
        play.picked = null;
        return { changed: true };
      }
    }
    return { message: play.naming
      ? 'Click applicants to add them to the group.'
      : 'Click an applicant, then a job they are qualified for.' };
  },

  plate(level, play, key) {
    if (key === 'name') {
      play.naming = true;
      play.group = [];
      play.picked = null;
      return { changed: true };
    }
    if (key === 'cancel') { play.naming = false; return { changed: true }; }
    if (key === 'done') { play.done = 'placed'; return { changed: true }; }
    if (key === 'submit') { play.done = 'named'; return { changed: true }; }
    return {};
  },

  draw: (level, play) => render(level, play),

  // Move by move: every click is the move, and the level ends when the player
  // says it does — either by declaring everyone placed or by naming a
  // bottleneck. There is nothing to simulate.
  over: (level, play) => play.done !== null,

  verdict(level, play) {
    const on = placed(play);
    const left = level.n - on;

    if (play.done === 'placed') {
      if (level.blocked) {
        // Cannot happen — the plate only lights when everybody has a job, and
        // on a blocked level that is impossible. Kept because a verdict that
        // trusts its caller is a verdict that will one day be wrong.
        return {
          won: false, title: 'That cannot be right.',
          detail: 'This board cannot place everybody.', readout: 'impossible',
        };
      }
      return {
        won: true, perfect: true, score: 0,
        title: 'Everybody placed.',
        detail: `All ${level.n} applicants in work, every one of them in a job `
                + 'they are qualified for.',
        readout: 'nobody left out',
      };
    }

    // Naming a bottleneck. The claim is that this group of applicants shares
    // too few jobs between them, and it is checked by counting — the same
    // counting the player did, which is what makes it a proof rather than an
    // opinion.
    const seen = neighbours(level, play.group);
    const deficiency = play.group.length - seen.size;
    const names = play.group.map((a) => a + 1).sort((x, y) => x - y).join(', ');

    if (deficiency <= 0) {
      play.blame = new Set(play.group);
      return {
        won: false,
        title: 'That group is not a bottleneck.',
        detail: `Applicants ${names} have ${seen.size} jobs open to them `
                + `between them, and there are only ${play.group.length} of `
                + 'them — so they all fit. A bottleneck needs more people than '
                + 'jobs.',
        readout: 'no bottleneck there',
      };
    }

    play.blame = new Set(play.group);

    // A real bottleneck, but a weak one: it proves some people must go without,
    // and not how many. Only a group of the worst deficiency settles the
    // question.
    if (deficiency < level.worst) {
      return {
        won: false,
        title: 'True, but it does not settle it.',
        detail: `Applicants ${names} share only ${seen.size} `
                + `${seen.size === 1 ? 'job' : 'jobs'}, so ${deficiency} of `
                + `them must go without. But ${level.worst} people have to go `
                + 'without on this board, and this group does not show that. '
                + 'There is a tighter squeeze somewhere.',
        readout: `${deficiency} of ${level.worst} explained`,
      };
    }

    // The certificate is the whole answer: it fixes the maximum at
    // n - deficiency whatever is on the board, so there is no need to have
    // built the matching first. Requiring that was the game asking the player
    // to do the busywork *after* they had already seen the answer.
    const perfect = play.group.length === level.par;
    return {
      won: true,
      perfect,
      score: play.group.length,
      title: perfect ? 'Proved, and as tightly as it can be.' : 'Proved.',
      detail: `Applicants ${names} — ${play.group.length} people — have only `
              + `${seen.size} ${seen.size === 1 ? 'job' : 'jobs'} open to them `
              + `between them, so ${deficiency} must go without whatever `
              + `anybody does. That fixes the answer at ${level.matched} `
              + 'placed, no arrangement doing better.'
              + (perfect ? ' No smaller group proves it.'
                 : ` A group of ${level.par} is enough to prove the same thing.`),
      readout: perfect ? 'proved with the smallest group'
                       : `proved with ${play.group.length}`,
    };
  },

  /* The hint is the theorem, a piece at a time: what it promises, then where to
     look, then the answer. */
  hint(level, play, tier) {
    const on = placed(play);
    const left = level.n - on;

    if (tier === 1) {
      return {
        text: 'Hall: everybody can be placed exactly when every group of k '
              + 'applicants has at least k jobs open to them between them. '
              + (level.blocked
                 ? `On this board that fails, so ${level.par} `
                   + `${level.par === 1 ? 'person' : 'people'} must go without `
                   + `— you can place ${level.matched}, and no more. `
                 : 'On this board it holds, so everybody can be placed. ')
              + `You have ${on} placed and ${left} left out. `
              + (left > level.par
                 ? 'Somebody with a job could move to another one they are '
                   + 'qualified for and free theirs up. That chain of swaps is '
                   + 'what you are looking for.'
                 : level.blocked
                   ? 'You do not have to place anybody to answer this — the '
                     + 'group is the answer. Matching is only a way of finding '
                     + 'it: get stuck, and the people you tried are the group.'
                   : 'Everybody is in.'),
      };
    }

    if (tier === 2) {
      if (!level.blocked) {
        return {
          text: 'Take somebody with no job and follow their options. If a job '
                + 'they want is taken, ask whether its holder has somewhere '
                + 'else to go, and keep going. Either the chain ends at a free '
                + 'job — shuffle everyone along it — or it runs out, and the '
                + 'people you visited are exactly a group with too few jobs.',
        };
      }
      const one = level.bottleneck[0];
      return {
        text: `Look at applicant ${one + 1}, and at everybody whose options `
              + 'overlap with theirs. A bottleneck is a group whose jobs, all '
              + 'pooled together, still number fewer than the group does — so '
              + 'start from somebody with few options and gather the people who '
              + 'are competing for the same ones.',
      };
    }

    if (!level.blocked) {
      play.match = {};
      Object.entries(level.answer).forEach(([a, j]) => { play.match[a] = j; });
      return { text: 'A full matching is on the board. Press the button.' };
    }
    play.naming = true;
    play.group = level.bottleneck.slice();
    play.match = {};
    Object.entries(level.answer).forEach(([a, j]) => { play.match[a] = j; });
    return {
      text: `Applicants ${level.bottleneck.map((a) => a + 1).join(', ')} are `
            + 'the bottleneck, and a maximum matching is on the board. Submit '
            + 'the group.',
    };
  },
};
