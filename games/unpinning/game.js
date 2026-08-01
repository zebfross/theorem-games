'use strict';

/* Unpinning — pin a loop of rope so that pulling it tight can't untangle it.
 *
 * Levels come from the LooPindex catalog. The catalog pins on the sphere; this
 * game is a rope on a flat table, i.e. the plane, and a homotopy in R^2 minus P
 * is the same as one in S^2 minus (P and the point at infinity). So the outer
 * region is pinned for free and the extractor has already reduced each level's
 * minimal pinning sets accordingly, into `generators`.
 *
 * The verdict is always read off those generators, never off the simulation:
 * a placement holds exactly when it contains some generator. The physics is
 * there to *show* you why, not to decide.
 */

import { board, svgEl } from '../../engine/engine.js';

// Board units; the rope cannot cross inside this. A taut loop round two pins
// settles into a band 2*PIN_RADIUS wide, so this also sets how far apart the
// two sides of such a loop sit. Every pin site has at least 24 units of
// clearance to the rope (see lib/geometry/arrangement.py), so there is room to
// go bigger, but big pins look wrong — this is about as small as it can be
// while the two sides of a taut loop still read as two.
const PIN_RADIUS = 10;
const ROPE_WIDTH = 11;

// Simulation spacing while the rope is still slack. Never coarser than a pin,
// or a single segment can span one and skip straight over it between steps —
// the rope then slips its pins and collapses.
const COARSE = Math.min(15, PIN_RADIUS);
const FINE = 5;      // spacing for the final settle, so it hugs the pins

// The pull is finished when the rope's outline has stopped moving. Length is a
// poor signal, since bowing a long side barely changes it, and per-step motion
// is poor too, since projecting off the pins and resampling leave a jitter that
// never reaches zero.
const SHAPE_CHECK = 150;
const SHAPE_EPS = 0.35;
const SHAPE_SAMPLES = 48;

/* ---------- geometry ---------- */

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    if ((y1 > y) !== (y2 > y)) {
      if (x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside;
    }
  }
  return inside;
}

/** Closed polyline -> path with rounded corners, so it reads as rope. */
function roundedPath(pts, radius) {
  const n = pts.length;
  if (n < 3) return '';
  let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    if (d1 === 0 || d2 === 0) continue;
    const r = Math.min(radius, d1 / 2, d2 / 2);
    const a = [p1[0] + ((p0[0] - p1[0]) / d1) * r, p1[1] + ((p0[1] - p1[1]) / d1) * r];
    const b = [p1[0] + ((p2[0] - p1[0]) / d2) * r, p1[1] + ((p2[1] - p1[1]) / d2) * r];
    d += `${i === 0 ? 'M' : 'L'} ${a[0].toFixed(2)} ${a[1].toFixed(2)} `;
    d += `Q ${p1[0].toFixed(2)} ${p1[1].toFixed(2)} ${b[0].toFixed(2)} ${b[1].toFixed(2)} `;
  }
  return d + 'Z';
}

function polyPath(pts) {
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
  }
  return d + ' Z';
}

function perimeter(pts) {
  let L = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    L += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return L;
}

/** Redistribute points evenly around a closed polyline.
 *  Walks arc length monotonically — emitting a point anywhere behind the
 *  current position would fold the curve back on itself and show up as a
 *  spurious crossing. */
function resample(pts, spacing) {
  const n = pts.length;
  const L = perimeter(pts);
  if (!(L > 1e-9)) return pts.map((p) => ({ x: p.x, y: p.y }));
  const count = Math.max(8, Math.round(L / spacing));
  const step = L / count;

  const out = [];
  let i = 0;
  let segStart = 0;
  let segLen = Math.hypot(pts[1 % n].x - pts[0].x, pts[1 % n].y - pts[0].y);
  for (let k = 0; k < count; k++) {
    const target = k * step;
    while (target > segStart + segLen && i < n - 1) {
      segStart += segLen;
      i++;
      const a = pts[i];
      const b = pts[(i + 1) % n];
      segLen = Math.hypot(b.x - a.x, b.y - a.y);
    }
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const t = segLen < 1e-9 ? 0 : (target - segStart) / segLen;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/** Count transverse crossings among all segments of all strands. */
function countCrossings(strands) {
  const segs = [];
  for (const pts of strands) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      segs.push([a.x, a.y, b.x, b.y]);
    }
  }
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    const [ax, ay, bx, by] = segs[i];
    const dx1 = bx - ax;
    const dy1 = by - ay;
    for (let j = i + 2; j < segs.length; j++) {
      const [cx, cy, dx, dy] = segs[j];
      const dx2 = dx - cx;
      const dy2 = dy - cy;
      const den = dx1 * dy2 - dy1 * dx2;
      if (den === 0) continue;
      const t = ((cx - ax) * dy2 - (cy - ay) * dx2) / den;
      if (t <= 0 || t >= 1) continue;
      const u = ((cx - ax) * dy1 - (cy - ay) * dx1) / den;
      if (u <= 0 || u >= 1) continue;
      n++;
    }
  }
  return n;
}

/** Sample each strand at fixed fractions of its length. */
function outline(strands) {
  const pts = [];
  for (const s of strands) {
    const L = perimeter(s);
    if (!(L > 1e-9)) continue;
    for (const p of resample(s, L / SHAPE_SAMPLES)) pts.push(p);
  }
  return pts;
}

/** How far the outline moved, measured nearest point to nearest point so that
 *  points sliding along a stationary rope do not read as movement. */
function outlineDrift(a, b) {
  let worst = 0;
  for (const p of a) {
    let best = Infinity;
    for (const q of b) {
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (d < best) best = d;
    }
    if (best > worst) worst = best;
  }
  return Math.sqrt(worst);
}

const lo = (a) => a.reduce((x, y) => (y < x ? y : x), Infinity);
const hi = (a) => a.reduce((x, y) => (y > x ? y : x), -Infinity);

/** A square view fitting these strands and pins, with a floor on how far in it
 *  will go so a collapsed loop is not magnified past readability. */
function fitView(strands, pins) {
  const xs = [];
  const ys = [];
  for (const pts of strands) for (const p of pts) { xs.push(p.x); ys.push(p.y); }
  for (const p of pins || []) { xs.push(p.x); ys.push(p.y); }
  if (!xs.length) return null;
  const pad = 40;
  const w = Math.max(Math.max(hi(xs) - lo(xs), hi(ys) - lo(ys)) + 2 * pad, 150);
  return [(lo(xs) + hi(xs)) / 2 - w / 2, (lo(ys) + hi(ys)) / 2 - w / 2, w, w];
}

/* ---------- the pull ---------- */

function makeSim(level, pins) {
  // Start from a curve that still has every crossing the drawing has: at the
  // coarse spacing a tight little feature can be sampled straight through.
  // Refine only if that actually recovers the count, since a finer spacing
  // multiplies the point count for every step that follows.
  const at = (spacing) => level.rope.map(
    (s) => resample(s.map(([x, y]) => ({ x, y })), spacing));
  let strands = at(COARSE);
  let spacing = COARSE;
  if (countCrossings(strands) !== level.crossings) {
    for (const finer of [COARSE / 2, COARSE / 4]) {
      const candidate = at(finer);
      if (countCrossings(candidate) === level.crossings) {
        strands = candidate;
        spacing = finer;
        break;
      }
    }
  }
  return {
    strands, pins, spacing,
    phase: 'shrink',
    steps: 0,
    maxMove: 0,
    lastLength: Infinity,
    seen: level.crossings,
    pending: null,
    lastSig: null,
    lastCount: level.crossings,
  };
}

/** Crossings remaining, as a number we can trust.
 *
 *  Curve shortening cannot create crossings, so the count is reported as a
 *  running minimum. But a coarse polyline can sample a small feature away for
 *  a moment while the rope is moving fast, and a plain minimum would make that
 *  momentary undercount permanent. A drop has to be confirmed twice. */
function crossingsLeft(sim) {
  const count = countCrossings(sim.strands);
  if (count < sim.seen) {
    if (sim.pending !== null) sim.seen = Math.max(count, sim.pending);
    sim.pending = count;
  } else {
    sim.pending = null;
  }
  return sim.seen;
}

/** Keep a segment from lying across a pin. Done per segment, not per point,
 *  because the simulation curve is coarse enough that a whole segment could
 *  otherwise straddle a pin and slip past. */
function pushOffPins(pts, pins, radius) {
  const n = pts.length;
  for (let pass = 0; pass < 4; pass++) {
    for (const pin of pins) {
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const dx = p.x - pin.x;
        const dy = p.y - pin.y;
        const d = Math.hypot(dx, dy);
        if (d >= radius) continue;
        if (d < 1e-6) { p.x = pin.x + radius; continue; }
        p.x = pin.x + (dx / d) * radius;
        p.y = pin.y + (dy / d) * radius;
      }
    }
    for (const pin of pins) {
      for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const L2 = ex * ex + ey * ey;
        let t = L2 < 1e-9 ? 0 : ((pin.x - a.x) * ex + (pin.y - a.y) * ey) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = a.x + ex * t;
        const cy = a.y + ey * t;
        let dx = cx - pin.x;
        let dy = cy - pin.y;
        let d = Math.hypot(dx, dy);
        if (d >= radius) continue;
        if (d < 1e-6) { dx = -ey; dy = ex; d = Math.hypot(dx, dy) || 1; }
        const push = radius - d;
        const ux = (dx / d) * push;
        const uy = (dy / d) * push;
        // deliberately under-correct and let the passes converge; overshooting
        // makes the rope buzz against the pin
        a.x += ux * (1 - t); a.y += uy * (1 - t);
        b.x += ux * t;       b.y += uy * t;
      }
    }
  }
}

/** Curve shortening with the pins as hard obstacles.
 *  The rope may pass through itself — this is homotopy, not isotopy, which is
 *  exactly why crossings can cancel and why pins are the only thing that stops
 *  them. */
function simStep(sim) {
  const alpha = 0.5;
  let length = 0;
  let maxMove = 0;

  for (let s = 0; s < sim.strands.length; s++) {
    // A small per-strand standoff, so several strands collapsing onto the same
    // pin stack around it rather than landing on one shared circle. Kept small:
    // it also widens that strand's taut shape, which reads as slack.
    const radius = PIN_RADIUS + s * 4;
    const floor = 54 + s * 26;
    let pts = sim.strands[s];
    const n = pts.length;

    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      next[i] = {
        x: p.x + alpha * ((a.x + b.x) / 2 - p.x),
        y: p.y + alpha * ((a.y + b.y) / 2 - p.y),
      };
    }

    pushOffPins(next, sim.pins, radius);

    // A loop that got free would shrink to nothing; keep a token size so the
    // player can see that it came loose rather than watching it vanish.
    const L = perimeter(next);
    if (L < floor) {
      let cx = 0;
      let cy = 0;
      for (const q of next) { cx += q.x; cy += q.y; }
      cx /= n; cy /= n;
      const k = floor / Math.max(L, 1e-6);
      for (const q of next) {
        q.x = cx + (q.x - cx) * k;
        q.y = cy + (q.y - cy) * k;
      }
      pushOffPins(next, sim.pins, radius);
    }

    // How far the furthest point actually moved, measured before resampling
    // shuffles the points around.
    for (let i = 0; i < n; i++) {
      const m = Math.hypot(next[i].x - pts[i].x, next[i].y - pts[i].y);
      if (m > maxMove) maxMove = m;
    }

    pts = resample(next, sim.spacing);
    sim.strands[s] = pts;
    length += perimeter(pts);
  }

  sim.steps++;
  sim.maxMove = maxMove;
  sim.lastLength = length;

  if (sim.steps % SHAPE_CHECK) return false;
  const sig = outline(sim.strands);
  const drift = sim.lastSig ? outlineDrift(sig, sim.lastSig) : Infinity;
  sim.lastSig = sig;

  // A crossing about to cancel sits in a bigon that can be far too small to
  // register as drift, and that is exactly the moment that matters on a
  // placement which does not hold. Never stop while the count is still falling.
  const count = crossingsLeft(sim);
  const settling = count !== sim.lastCount;
  sim.lastCount = count;

  if (sim.phase === 'shrink') {
    if ((drift > SHAPE_EPS || settling) && sim.steps < 8000) return false;
    sim.phase = 'polish';                 // sample finer so it hugs the pins
    sim.spacing = Math.min(sim.spacing, FINE);
    sim.lastSig = null;
    return false;
  }
  return (drift < SHAPE_EPS && !settling) || sim.steps > 20000;
}

/* ---------- rules ---------- */

const holds = (level, pinned) =>
  level.generators.some((g) => g.every((r) => pinned.has(r)));

/** Regions that appear in every minimal solution.
 *  These are the ones worth pointing at: naming one gives nothing away about
 *  which solution to go for, and on all but a handful of levels there is at
 *  least one. They are largely the spaces with only one or two corners, which
 *  is the rule the game is really teaching. */
function forcedRegions(level) {
  const [first, ...rest] = level.generators;
  if (!first) return [];
  return first.filter((r) => rest.every((g) => g.includes(r)));
}

/** Fewest further pins that would make it hold, keeping what is placed. */
const stillNeeded = (level, pinned) => Math.min(
  ...level.generators.map((g) => g.filter((r) => !pinned.has(r)).length));

/** The minimal solution closest to what the player has already placed.
 *  Most levels have several, so showing an arbitrary one would often throw
 *  away reasoning that was perfectly sound. */
function nearestSolution(level, pinned, optimalOnly) {
  // Generators are minimal by inclusion, which does not make them all the same
  // size. When the answer is being shown outright it has to be one of the
  // smallest, or it would not be the solution the level is scored against.
  const pool = optimalOnly
    ? level.generators.filter((g) => g.length === level.effectiveMinimum)
    : level.generators;
  let best = null;
  let bestCost = Infinity;
  for (const g of pool) {
    const set = new Set(g);
    const cost = g.filter((r) => !pinned.has(r)).length
               + [...pinned].filter((r) => !set.has(r)).length;
    if (cost < bestCost) { bestCost = cost; best = g; }
  }
  return best;
}

/* ---------- drawing ---------- */

let ropeEls = [];

function paintRope(strands) {
  for (let i = 0; i < ropeEls.length && i < strands.length; i++) {
    const d = polyPath(strands[i]);
    for (const p of ropeEls[i]) p.setAttribute('d', d);
  }
}

/* ---------- the module ---------- */

export default {
  id: 'unpinning',
  title: 'Unpinning',
  blurb: 'Pin a loop of rope so that pulling it tight cannot untangle it.',
  verb: 'Pull it tight',
  credit:
    'Puzzles from the <a href="https://christopherlloyd.github.io/LooPindex/">LooPindex</a> '
    + 'catalog by Christopher-Lloyd Simon and Ben Stucky, accompanying '
    + '<a href="https://arxiv.org/abs/2405.16216"><i>The pinning ideal of a multiloop</i></a>. '
    + 'Catalog and this game are GPL-3.0.',

  group: (m) => `${m.regions - 2} crossings · ${m.strands} ${m.strands === 1 ? 'loop' : 'loops'}`,
  chip: (m) => `${m.index}·${m.effectiveMinimum}`,
  par: (m) => m.effectiveMinimum,

  start: () => ({ pinned: new Set(), pinAt: new Map(), hinted: new Set(), sim: null }),
  runnable: () => true,
  view: (level) => level.viewBox,

  describe(level, play) {
    return {
      goal: `Keep all <b>${level.crossings}</b> crossings when the rope pulls tight`,
      status: `${play.pinned.size} pin${play.pinned.size === 1 ? '' : 's'}`
            + ` · fewest possible ${level.effectiveMinimum}`,
    };
  },

  click(level, play, p) {
    const hit = level.sockets.find(
      (s) => s.polygon && pointInPolygon(p.x, p.y, s.polygon));
    if (!hit) {
      return { message: 'The table runs on forever, so the rope can never slip '
                      + 'off the outside — that part is already held. Pin the '
                      + 'spaces enclosed by the rope.' };
    }
    if (play.pinned.has(hit.n)) {
      play.pinned.delete(hit.n);
      play.pinAt.delete(hit.n);
    } else {
      play.hinted.delete(hit.n);
      play.pinned.add(hit.n);
      play.pinAt.set(hit.n, { x: hit.x, y: hit.y });
    }
    return { changed: true };
  },

  draw(level, play, phase) {
    board.replaceChildren();

    const regions = svgEl('g', {});
    for (const s of level.sockets) {
      if (s.outer || !s.polygon) continue;
      // Once the rope starts moving the shaded region no longer means anything:
      // it marks where a space used to be, not where it is.
      const shade = phase === 'placing' && play.pinned.has(s.n);
      const glow = phase === 'placing' && play.hinted.has(s.n) && !play.pinned.has(s.n);
      const poly = svgEl('polygon', {
        points: s.polygon.map((q) => q.join(',')).join(' '),
        class: 'region' + (shade ? ' pinned' : '') + (glow ? ' hinted' : ''),
      });
      if (phase !== 'placing') poly.style.pointerEvents = 'none';
      regions.appendChild(poly);
    }
    board.appendChild(regions);

    // Only follow the simulation while there is one running. "Try again" keeps
    // the play state on purpose, so a finished sim is still hanging off it —
    // drawing from that would leave the rope pulled tight on a board that is
    // back to accepting pins.
    const strands = phase === 'placing' || !play.sim ? null : play.sim.strands;
    ropeEls = [];
    for (let i = 0; i < level.rope.length; i++) {
      const d = strands ? polyPath(strands[i]) : roundedPath(level.rope[i], 16);
      const trio = [
        svgEl('path', { d, class: 'rope-shadow', 'stroke-width': ROPE_WIDTH + 6, transform: 'translate(2,3)' }),
        svgEl('path', { d, class: 'rope-core', 'stroke-width': ROPE_WIDTH }),
        svgEl('path', { d, class: 'rope-top', 'stroke-width': ROPE_WIDTH - 5 }),
      ];
      for (const p of trio) board.appendChild(p);
      ropeEls.push(trio);
    }

    for (const n of play.pinned) {
      const at = play.pinAt.get(n);
      if (!at) continue;
      board.appendChild(svgEl('circle', { cx: at.x + 1.5, cy: at.y + 2.5, r: PIN_RADIUS, class: 'pin-shadow' }));
      board.appendChild(svgEl('circle', { cx: at.x, cy: at.y, r: PIN_RADIUS, class: 'pin-head', 'stroke-width': 1.5 }));
      board.appendChild(svgEl('circle', { cx: at.x, cy: at.y, r: 2.4, class: 'pin-dot' }));
    }
  },

  sim: {
    create(level, play) {
      const pins = [...play.pinned].map((n) => play.pinAt.get(n));
      play.sim = makeSim(level, pins);
      return play.sim;
    },
    step: simStep,
    perFrame: (sim) => (sim.phase === 'polish' ? 120 : 30),
    motion: (sim) => sim.maxMove,
    paint: (sim) => paintRope(sim.strands),

    scene(sim) {
      const strands = sim.strands.map((s) => s.map((p) => ({ x: p.x, y: p.y })));
      return {
        strands,
        outline: outline(strands),
        view: fitView(strands, sim.pins),
        crossings: crossingsLeft(sim),
      };
    },
    apart: (a, b) => outlineDrift(a.outline, b.outline),
    sceneView: (s) => s.view,
    readout: (sim, scene) => `now <b>${scene ? scene.crossings : sim.seen}</b>`,
    show(sim, scene) {
      // copy, so dragging back and forth cannot disturb the recording
      sim.strands = scene.strands.map((s) => s.map((p) => ({ x: p.x, y: p.y })));
      paintRope(sim.strands);
    },
  },

  verdict(level, play, sim) {
    const won = holds(level, play.pinned);
    // A holding placement cannot lose a crossing, so the catalog's count is the
    // exact truth; only a collapse needs measuring.
    const left = won ? level.crossings : crossingsLeft(sim);
    const readout = `now <b>${left}</b>`;
    const perfect = won && play.pinned.size === level.effectiveMinimum;

    // Earn the encouragement rather than always offering the same one: how far
    // off they actually are is known, and "So close!" to somebody four pins
    // short is worth nothing.
    const need = won ? 0 : stillNeeded(level, play.pinned);
    const cheer = perfect ? 'Great job!'
      : won ? 'Nice work!'
      : need <= 1 ? 'So close!'
      : need <= 2 ? 'Nearly there.'
      : 'Good start.';
    const more = need === 1
      ? 'One more pin in the right place holds it.'
      : `${need} more pins in the right spaces hold it.`;

    if (won) {
      return {
        won: true, perfect, readout, score: play.pinned.size,
        title: perfect ? 'Perfect — it holds.' : 'It holds.',
        detail: perfect
          ? `${cheer} All ${level.crossings} crossings survived, on the fewest pins possible.`
          : `${cheer} All ${level.crossings} crossings survived — though ${level.effectiveMinimum} pins is enough.`,
      };
    }
    if (left >= level.crossings) {
      // Curve shortening found a locally taut configuration and stopped, the
      // way real rope can jam when you haul on it. A jam is luck, not a lock.
      return {
        won: false, readout,
        title: 'It jammed — but it isn\'t locked.',
        detail: `${cheer} It snagged rather than held, so these pins do not `
              + `really secure it. ${more}`,
      };
    }
    return {
      won: false, readout,
      title: 'It came undone.',
      detail: `${cheer} It slipped to ${left} crossing${left === 1 ? '' : 's'}. ${more}`,
    };
  },

  hint(level, play, tier) {
    if (tier === 1) {
      const need = stillNeeded(level, play.pinned);
      return { text: need === 0
        ? 'What you have already holds it — pull it tight and see.'
        : `You need at least ${need} more pin${need === 1 ? '' : 's'} from here. `
          + 'Adding pins can only ever help, so nothing you have placed needs '
          + 'taking out to make it hold.' };
    }

    if (tier === 2) {
      const forced = forcedRegions(level).filter((r) => !play.pinned.has(r));
      const pick = forced.length
        ? forced[0]
        : nearestSolution(level, play.pinned).find((r) => !play.pinned.has(r));
      if (pick === undefined) {
        return { text: 'Every space a solution needs is already pinned.' };
      }
      play.hinted.add(pick);
      return { text: forced.length
        ? 'The glowing space has to be pinned in every solution — look at how '
          + 'few corners it has.'
        : 'Try pinning the glowing space.' };
    }

    const answer = nearestSolution(level, play.pinned, true);
    const kept = answer.filter((r) => play.pinned.has(r)).length;
    const dropped = [...play.pinned].filter((r) => !answer.includes(r)).length;
    play.pinned = new Set(answer);
    play.pinAt = new Map(answer.map((n) => {
      const s = level.sockets.find((k) => k.n === n);
      return [n, { x: s.x, y: s.y }];
    }));
    play.hinted = new Set(answer);
    return { text:
      `Here is a solution with the fewest pins (${answer.length}). `
      + (kept ? `It keeps ${kept} of yours` : 'It uses none of yours')
      + (dropped ? `, and sets ${dropped} aside. ` : '. ')
      + 'Pull it tight to see it hold.' };
  },
};
