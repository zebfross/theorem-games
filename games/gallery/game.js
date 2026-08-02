'use strict';

/* The art gallery theorem — station guards on the corners of a room until
 * every part of it is watched, using as few as you can.
 *
 * Chvatal: ⌊n/3⌋ guards always suffice for a room with n corners. Fisk's proof
 * is why this is worth playing rather than reading: triangulate the room,
 * colour the corners so every triangle gets all three colours, and take
 * whichever colour was used least. Every triangle then has a guard on one of
 * its corners, and a triangle is convex, so the whole room is watched. The hint
 * hands that argument over a step at a time — the help you get is the proof.
 *
 * Guards stand on corners, which is Chvatal's own setting and leaves finitely
 * many answers, so par is exact rather than a guess. Nothing is computed here:
 * what each corner can see, which sets of corners suffice, and the fewest that
 * do were all settled offline (see tools/room.py).
 */

import { board, svgEl } from '../../engine/engine.js';

const CORNER_R = 13;

function polyPoints(pts) {
  return pts.map((p) => `${p[0]},${p[1]}`).join(' ');
}

/** Is every part of the room watched?
 *
 *  The level ships one bitmask per distinct patch of room, holding the corners
 *  that can watch that patch. A guard set works exactly when it meets every
 *  mask, which makes the check a handful of bitwise ands — and exact, because
 *  the patches were cut so that no sight line crosses one.
 */
function covered(level, guards) {
  let bits = 0;
  for (const g of guards) bits |= 1 << g;
  return level.masks.every((m) => (m & bits) !== 0);
}

/** The corners still watching nothing that anybody else is not already watching. */
function darkMasks(level, guards) {
  let bits = 0;
  for (const g of guards) bits |= 1 << g;
  return level.masks.filter((m) => (m & bits) === 0);
}

/** Paint the room. Shared by the engine's redraws and by the run's own frames,
 *  which differ only in how much of the light has been switched on so far. */
function render(level, play, phase) {
  board.replaceChildren();
  const lit = phase !== 'placing' && play.sim;

  // The room, dark. Everything a guard can see is painted back over it, so what
  // is left dark is exactly what nobody is watching — the failure is a picture
  // of itself rather than a message about one.
  board.appendChild(svgEl('polygon', {
    points: polyPoints(level.corners), class: 'room',
  }));

  if (lit) {
    for (const g of play.sim.order) {
      if (play.sim.reveal < g.at) continue;
      const sight = level.sight[g.i];
      if (sight.length >= 3) {
        board.appendChild(svgEl('polygon', { points: polyPoints(sight), class: 'light' }));
      }
    }
  }

  // Fisk's triangulation and three-colouring, when the hint has asked for it.
  if (play.showProof && phase === 'placing') {
    for (const t of level.triangles) {
      board.appendChild(svgEl('polygon', {
        points: polyPoints(t.map((i) => level.corners[i])), class: 'tri',
      }));
    }
  }

  board.appendChild(svgEl('polygon', {
    points: polyPoints(level.corners), class: 'wall',
  }));

  level.corners.forEach(([x, y], i) => {
    const on = play.guards.has(i);
    const tint = play.showProof && phase === 'placing' ? ` c${level.colours[i]}` : '';
    board.appendChild(svgEl('circle', {
      cx: x, cy: y, r: CORNER_R,
      class: 'corner' + (on ? ' on' : '') + (play.hinted === i ? ' hinted' : '') + tint,
    }));
    if (on) board.appendChild(svgEl('circle', { cx: x, cy: y, r: 4.5, class: 'eye' }));
  });
}

export default {
  id: 'gallery',
  title: 'Art gallery',
  blurb:
    'Station guards on the corners of a room until every part of it is watched, '
    + 'using as few as you can.',
  verb: 'Turn on the lights',
  credit:
    'A game on the art gallery theorem of <b>Chv&aacute;tal</b>, with '
    + '<b>Fisk&rsquo;s</b> proof: &lfloor;n/3&rfloor; guards always suffice for a '
    + 'room with <i>n</i> corners. Rooms are generated here and the fewest guards '
    + 'found by exhaustive search, so this game carries no third-party data.',

  group: (m) => `${m.corners} corners`,
  chip: (m) => `${m.n}·${m.par}`,
  par: (m) => m.par,

  start: () => ({ guards: new Set(), hinted: null, showProof: false }),

  view: (level) => level.view,

  runnable: (level, play) => play.guards.size > 0,

  describe(level, play) {
    const n = play.guards.size;
    return {
      goal: `Watch the whole room with <b>${level.par}</b> guards`,
      status: `${n} ${n === 1 ? 'guard' : 'guards'} placed`,
    };
  },

  click(level, play, p) {
    let best = Infinity;
    let pick = -1;
    level.corners.forEach(([x, y], i) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best) { best = d; pick = i; }
    });
    if (pick < 0 || best > CORNER_R * 2.4) {
      return { message: 'Guards stand on the corners of the room.' };
    }
    if (play.guards.has(pick)) play.guards.delete(pick);
    else play.guards.add(pick);
    play.hinted = null;
    return { changed: true };
  },

  draw: (level, play, phase) => render(level, play, phase),

  sim: {
    // No scrub bar: the run only turns the lights on. There is no middle worth
    // stopping on, and the finished picture says everything the half-lit one
    // would.
    replay: false,

    create(level, play) {
      // Guards light up one after another rather than all at once, so you can
      // see which part of the room each of them is responsible for.
      const order = [...play.guards].map((i, k) => ({ i, at: k * 0.85 }));
      const sim = {
        level, play, order, reveal: 0,
        span: order.length * 0.85 + 0.6,
        dark: darkMasks(level, play.guards).length,
      };
      play.sim = sim;
      return sim;
    },
    step(sim) {
      sim.reveal += 0.05;
      return sim.reveal >= sim.span;
    },
    perFrame: () => 1,
    readout(sim) {
      return sim.dark === 0 ? 'every corner watched' : 'somewhere is still dark';
    },
    paint(sim) {
      render(sim.level, sim.play, 'running');
    },
  },

  verdict(level, play) {
    const n = play.guards.size;
    if (!covered(level, play.guards)) {
      return {
        won: false,
        readout: 'somewhere is still dark',
        title: 'Part of the room is unwatched.',
        detail: `${n} ${n === 1 ? 'guard' : 'guards'} leaves the dark patches `
          + 'nobody can see. Move one so it looks round the corner that is hiding them.',
      };
    }
    if (n === level.par) {
      return {
        won: true, perfect: true, score: n,
        readout: 'every corner watched',
        title: 'Perfect.',
        detail: `The whole room watched by ${n}, and it cannot be done with fewer.`,
      };
    }
    return {
      won: true, perfect: false, score: n,
      readout: 'every corner watched',
      title: n <= level.par + 1 ? 'So close!' : 'Every corner watched.',
      detail: `Watched with ${n}, when it could have been done with ${level.par}.`,
    };
  },

  solutions: {
    count: (level) => level.answers.length,
    show(level, play, i) {
      if (!play.mine) play.mine = new Set(play.guards);
      play.guards = new Set(level.answers[i]);
      play.hinted = null;
      return `Best answer ${i + 1} of ${level.answers.length} — ${level.par} guards, like the rest`;
    },
    restore(level, play) {
      if (play.mine) { play.guards = play.mine; play.mine = null; }
    },
  },

  hint(level, play, tier) {
    if (tier === 1) {
      const dark = darkMasks(level, play.guards).length;
      const bound = Math.floor(level.corners.length / 3);
      return {
        text: dark === 0
          ? `Already watched, with ${play.guards.size}; it can be done with ${level.par}.`
          : `Still somewhere dark. However awkward the room, ${bound} guards `
            + `always suffice for ${level.corners.length} corners — and here `
            + `${level.par} is enough.`,
      };
    }
    if (tier === 2) {
      // Fisk's argument itself: triangulate, three-colour, and take the colour
      // used least. Showing the construction gives away no particular answer —
      // it is the reason an answer exists at all.
      play.showProof = true;
      const counts = [0, 0, 0];
      for (const c of level.colours) counts[c]++;
      const least = counts.indexOf(Math.min(...counts));
      return {
        text: 'Fisk’s proof: cut the room into triangles, colour the corners '
          + 'so every triangle gets all three, and take the colour used least — '
          + `here that is ${Math.min(...counts)} corners, and a guard on each `
          + 'watches everything, because every triangle then has one on it.',
      };
    }
    const want = level.answers.reduce((best, a) => {
      const shared = a.filter((i) => play.guards.has(i)).length;
      return shared > best.shared ? { shared, a } : best;
    }, { shared: -1, a: level.answers[0] }).a;
    play.guards = new Set(want);
    play.showProof = false;
    play.hinted = null;
    return { text: `A best answer, with ${level.par}. Turn the lights on and see.` };
  },
};
