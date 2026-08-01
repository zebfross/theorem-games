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
 * there to *show* you why, not to decide. */

const SVG_NS = 'http://www.w3.org/2000/svg';
// Board units; the rope cannot cross inside this. A taut loop round two pins
// settles into a stadium only 2*PIN_RADIUS wide, so if the pin is not clearly
// wider than the rope the two sides merge and a perfectly tight loop reads as
// a fat blob. Every pin site has at least 24 units of clearance to the rope
// (see arrangement.interior_point), which is what makes this size safe.
const PIN_RADIUS = 16;
const ROPE_WIDTH = 11;

const el = (id) => document.getElementById(id);
const board = el('board');

const state = {
  index: null,
  level: null,
  pinned: new Set(),      // region numbers, never including the outer region
  pinAt: new Map(),       // region -> {x, y} where the pin is drawn
  phase: 'placing',       // 'placing' | 'pulling' | 'result'
  sim: null,
  raf: 0,
};

/* ---------- geometry helpers ---------- */

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

/* ---------- the pull-tight simulation ---------- */

const COARSE = 15;   // simulation spacing while the rope is still slack
const FINE = 5;      // spacing for the final settle, so it hugs the pins

function makeSim(level, pins) {
  // Start from a curve that still has every crossing the drawing has. At the
  // coarse spacing a tight little feature can be sampled straight through,
  // silently losing a crossing before the pull even begins — and since the
  // readout is clamped to a running minimum, that wrong low count would then
  // stick for the whole run.
  // Refine only as far as it helps: a level whose count cannot be matched at
  // all (a crossing landing exactly on a sample point, say) must not drag the
  // spacing down to something that makes the simulation crawl.
  let best = null;
  for (const spacing of [COARSE, COARSE / 2, COARSE / 4]) {
    const strands = level.rope.map(
      (s) => resample(s.map(([x, y]) => ({ x, y })), spacing));
    const count = countCrossings(strands);
    if (count === level.crossings) { best = { strands, spacing, count }; break; }
    if (!best || count > best.count) best = { strands, spacing, count };
  }
  const { strands, spacing } = best;
  return {
    strands,
    pins,
    spacing,
    phase: 'shrink',
    settled: 0,
    steps: 0,
    lastLength: Infinity,
    seen: level.crossings,
    history: [],
    tick: 0,
    recordEvery: RECORD_EVERY,
  };
}

const RECORD_EVERY = 10;   // simulation steps between recorded frames
const MAX_FRAMES = 180;    // thinned out beyond this, so memory stays bounded

/** Keep a frame so the pull can be scrubbed through afterwards. */
function record(sim) {
  const strands = sim.strands.map((s) => s.map((p) => ({ x: p.x, y: p.y })));
  sim.history.push({
    strands,
    view: fitView(strands, sim.pins),
    crossings: crossingsLeft(sim),
  });
  if (sim.history.length > MAX_FRAMES) {
    sim.history = sim.history.filter((_f, i) => i % 2 === 0);
    sim.recordEvery *= 2;
  }
}

/** Run the simulation on, recording as it goes. Returns true when settled. */
function advance(sim, maxSteps) {
  let done = false;
  for (let k = 0; k < maxSteps && !done; k++) {
    done = simStep(sim);
    sim.tick++;
    if (done || sim.tick % sim.recordEvery === 0) record(sim);
  }
  return done;
}

/** Crossings remaining, as a number we can actually trust.
 *
 *  Under curve shortening the number of self-intersections is non-increasing,
 *  so a rise is always numerical: once the rope is taut, strands running
 *  between the same two pins lie on top of each other, and the discretised
 *  polylines jitter across each other over and over. Clamping to the running
 *  minimum throws that noise away without ever hiding a real cancellation. */
function crossingsLeft(sim) {
  sim.seen = Math.min(sim.seen, countCrossings(sim.strands));
  return sim.seen;
}

/** Keep a segment from lying across a pin.
 *  Done per segment, not per point, because the simulation curve is coarse
 *  enough that a whole segment could otherwise straddle a pin and slip past. */
function pushOffPins(pts, pins, radius) {
  const n = pts.length;
  for (let pass = 0; pass < 4; pass++) {
    // exact projection for points that ended up inside a pin
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
        // weight toward whichever endpoint is nearer the contact point;
        // deliberately under-correct and rely on the passes to converge,
        // since overshooting here makes the rope buzz against the pin
        a.x += ux * (1 - t); a.y += uy * (1 - t);
        b.x += ux * t;       b.y += uy * t;
      }
    }
  }
}

/** Curve shortening with the pins as hard obstacles.
 *  The rope may pass through itself — this is homotopy, not isotopy, which is
 *  exactly why crossings can cancel and why pins are the only thing that
 *  stops them. */
function simStep(sim) {
  const alpha = 0.5;
  let length = 0;

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

    pts = resample(next, sim.spacing);
    sim.strands[s] = pts;
    length += perimeter(pts);
  }

  sim.steps++;
  const delta = Math.abs(sim.lastLength - length);
  sim.settled = delta < 0.08 ? sim.settled + 1 : 0;
  sim.lastLength = length;

  if (sim.phase === 'shrink' && (sim.settled > 20 || sim.steps > 6000)) {
    // tighten the sampling so the rope wraps the pins cleanly
    sim.phase = 'polish';
    sim.spacing = Math.min(sim.spacing, FINE);
    sim.settled = 0;
    sim.lastLength = Infinity;
    return false;
  }
  return sim.phase === 'polish' && (sim.settled > 20 || sim.steps > 9000);
}

/* ---------- rules ---------- */

const holds = (level, pinned) =>
  level.generators.some((g) => g.every((r) => pinned.has(r)));

/* ---------- rendering ---------- */

function svgEl(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

/** Ease the view onto the finished knot.
 *  Pulling tight can leave the rope small in the middle of a big table; the
 *  point of the last frame is to let you count the crossings, so close in. */
/** A square view fitting these strands and pins, with a floor on how far in it
 *  will go so a collapsed loop is not magnified past readability. */
function fitView(strands, pins) {
  const xs = [];
  const ys = [];
  for (const pts of strands) for (const p of pts) { xs.push(p.x); ys.push(p.y); }
  for (const p of pins || []) { xs.push(p.x); ys.push(p.y); }
  if (!xs.length) return null;
  const pad = 40;
  const w = Math.max(
    Math.max(max(xs) - min(xs), max(ys) - min(ys)) + 2 * pad, 150);
  const cx = (min(xs) + max(xs)) / 2;
  const cy = (min(ys) + max(ys)) / 2;
  return [cx - w / 2, cy - w / 2, w, w];
}

function zoomToResult() {
  const lv = state.level;
  const to = fitView(state.sim.strands,
                     [...state.pinned].map((n) => state.pinAt.get(n)).filter(Boolean));
  if (!to) return;
  const from = state.viewBox || lv.viewBox;
  const t0 = performance.now();
  const ease = () => {
    const k = Math.min(1, (performance.now() - t0) / 450);
    const e = 1 - Math.pow(1 - k, 3);
    state.viewBox = from.map((v, i) => v + (to[i] - v) * e);
    board.setAttribute('viewBox', state.viewBox.join(' '));
    if (k < 1) requestAnimationFrame(ease);
  };
  ease();
}

const min = (a) => a.reduce((x, y) => (y < x ? y : x), Infinity);
const max = (a) => a.reduce((x, y) => (y > x ? y : x), -Infinity);

function renderBoard() {
  const lv = state.level;
  board.setAttribute('viewBox', (state.viewBox || lv.viewBox).join(' '));
  board.replaceChildren();

  // clickable regions, behind the rope
  const regions = svgEl('g', {});
  for (const s of lv.sockets) {
    if (s.outer || !s.polygon) continue;
    // Once the rope starts moving the shaded region no longer means anything —
    // it marks where a space used to be, not where it is.
    const shade = state.phase === 'placing' && state.pinned.has(s.n);
    const poly = svgEl('polygon', {
      points: s.polygon.map((p) => p.join(',')).join(' '),
      class: 'region' + (shade ? ' pinned' : ''),
    });
    if (state.phase === 'placing') {
      poly.addEventListener('click', () => togglePin(s.n));
    } else {
      poly.style.pointerEvents = 'none';
    }
    regions.appendChild(poly);
  }
  board.appendChild(regions);

  // rope — keep the elements so the animation only rewrites path data
  const strands = state.sim ? state.sim.strands : null;
  state.ropeEls = [];
  for (let i = 0; i < lv.rope.length; i++) {
    const d = strands ? polyPath(strands[i]) : roundedPath(lv.rope[i], 16);
    const trio = [
      svgEl('path', { d, class: 'rope-shadow', 'stroke-width': ROPE_WIDTH + 6, transform: 'translate(2,3)' }),
      svgEl('path', { d, class: 'rope-core', 'stroke-width': ROPE_WIDTH }),
      svgEl('path', { d, class: 'rope-top', 'stroke-width': ROPE_WIDTH - 5 }),
    ];
    for (const p of trio) board.appendChild(p);
    state.ropeEls.push(trio);
  }

  // pins on top
  for (const n of state.pinned) {
    const at = state.pinAt.get(n);
    if (!at) continue;
    board.appendChild(svgEl('circle', { cx: at.x + 1.5, cy: at.y + 2.5, r: PIN_RADIUS, class: 'pin-shadow' }));
    board.appendChild(svgEl('circle', { cx: at.x, cy: at.y, r: PIN_RADIUS, class: 'pin-head', 'stroke-width': 1.5 }));
    board.appendChild(svgEl('circle', { cx: at.x, cy: at.y, r: 2.4, class: 'pin-dot' }));
  }
}

function updateRope() {
  if (!state.ropeEls || !state.sim) return;
  for (let i = 0; i < state.ropeEls.length; i++) {
    const d = polyPath(state.sim.strands[i]);
    for (const p of state.ropeEls[i]) p.setAttribute('d', d);
  }
}

function renderStatus(liveCrossings) {
  const lv = state.level;
  const crossings = liveCrossings === undefined ? lv.crossings : liveCrossings;
  el('goal-text').innerHTML =
    `Keep all <b>${lv.crossings}</b> crossings when the rope pulls tight` +
    (liveCrossings === undefined ? '' : ` &nbsp;·&nbsp; now <b>${crossings}</b>`);

  const best = bestFor(lv.id);
  el('pins-used').textContent =
    `${state.pinned.size} pin${state.pinned.size === 1 ? '' : 's'}` +
    ` · fewest possible ${lv.effectiveMinimum}` +
    (best ? ` · your best ${best}` : '');

  el('pull').disabled = state.phase !== 'placing';
  el('clear').disabled = state.phase !== 'placing' || state.pinned.size === 0;
}

/* ---------- interaction ---------- */

function togglePin(n) {
  if (state.phase !== 'placing') return;
  if (state.pinned.has(n)) {
    state.pinned.delete(n);
    state.pinAt.delete(n);
  } else {
    const s = state.level.sockets.find((k) => k.n === n);
    state.pinned.add(n);
    state.pinAt.set(n, { x: s.x, y: s.y });
  }
  el('hint').textContent = '';
  renderBoard();
  renderStatus();
}

board.addEventListener('click', (ev) => {
  if (state.phase !== 'placing') return;
  if (ev.target.classList.contains('region')) return;
  const pt = board.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  const p = pt.matrixTransform(board.getScreenCTM().inverse());
  const inside = state.level.sockets.some(
    (s) => s.polygon && pointInPolygon(p.x, p.y, s.polygon));
  if (!inside) {
    el('hint').textContent =
      'The table runs on forever, so the rope can never slip off the outside — ' +
      'that part is already held. Pin the spaces enclosed by the rope.';
  }
});

function pullTight() {
  if (state.phase !== 'placing') return;
  state.phase = 'pulling';
  const pins = [...state.pinned].map((n) => state.pinAt.get(n));
  state.sim = makeSim(state.level, pins);
  renderStatus(state.level.crossings);
  renderBoard();

  record(state.sim);                    // frame 0: the rope as you laid it out
  let frame = 0;
  const started = performance.now();
  const tick = () => {
    // Curve shortening is slow per step, so take many steps per frame; the
    // rope should visibly pull tight in a couple of seconds, not a minute.
    let done = advance(state.sim, 30);
    // A backgrounded tab throttles animation frames hard, which would leave the
    // rope frozen mid-pull. If we have been at it too long, just finish.
    if (!done && performance.now() - started > 8000) {
      advance(state.sim, 20000);
      done = true;
    }
    frame++;
    updateRope();
    if (frame % 3 === 0 || done) renderStatus(state.sim.seen);
    if (done) { finish(); return; }
    state.raf = requestAnimationFrame(tick);
  };
  state.raf = requestAnimationFrame(tick);
}

function finish() {
  const lv = state.level;
  const won = holds(lv, state.pinned);
  // A holding placement cannot lose a crossing, so the catalog's count is
  // the exact truth; only a collapse needs measuring.
  const left = won ? lv.crossings : crossingsLeft(state.sim);
  state.phase = 'result';
  renderStatus(left);
  renderBoard();

  const box = el('verdict');
  box.hidden = false;
  box.className = won ? 'win' : 'lose';

  if (won) {
    const perfect = state.pinned.size === lv.effectiveMinimum;
    el('verdict-title').textContent = perfect ? 'Perfect — it holds.' : 'It holds.';
    el('verdict-detail').textContent = perfect
      ? `All ${lv.crossings} crossings survived, and you used the fewest pins possible (${lv.effectiveMinimum}).`
      : `All ${lv.crossings} crossings survived with ${state.pinned.size} pins. It can be done with ${lv.effectiveMinimum}.`;
    recordBest(lv.id, state.pinned.size);
  } else if (left >= lv.crossings) {
    // Curve shortening found a locally taut configuration and stopped, the way
    // real rope can jam when you haul on it. A jam is luck, not a lock: these
    // pins provably do not hold, so say so rather than let the picture argue
    // with the verdict.
    el('verdict-title').textContent = 'It jammed — but it isn\'t locked.';
    el('verdict-detail').textContent =
      'The rope snagged on its way tight and happened to keep its crossings. ' +
      'These pins do not actually hold it: worked loose more carefully, it comes ' +
      `apart. ${lv.effectiveMinimum} pins in the right spaces would make it secure.`;
  } else {
    el('verdict-title').textContent = 'It came undone.';
    el('verdict-detail').textContent =
      `The rope pulled through and slipped down to ${left} crossing${left === 1 ? '' : 's'}. ` +
      `Pins in the right spaces would have stopped that — ${lv.effectiveMinimum} is enough.`;
  }
  renderPicker();
  zoomToResult();

  // The last frame is the answer, so label it with the count we trust rather
  // than whatever the simulation happened to measure there.
  const hist = state.sim.history;
  if (hist.length) hist[hist.length - 1].crossings = left;
  const range = el('scrub-range');
  range.max = String(Math.max(0, hist.length - 1));
  range.value = range.max;
  el('scrub').hidden = hist.length < 2;
  el('controls').hidden = true;
}

function scrubTo(i) {
  const frame = state.sim && state.sim.history[i];
  if (!frame) return;
  // copy, so dragging back and forth cannot disturb the recording
  state.sim.strands = frame.strands.map((s) => s.map((p) => ({ x: p.x, y: p.y })));
  state.viewBox = frame.view;
  board.setAttribute('viewBox', frame.view.join(' '));
  updateRope();
  renderStatus(frame.crossings);
}

function resetLevel(keepPins) {
  cancelAnimationFrame(state.raf);
  state.sim = null;
  state.viewBox = null;
  state.phase = 'placing';
  if (!keepPins) { state.pinned.clear(); state.pinAt.clear(); }
  el('verdict').hidden = true;
  el('scrub').hidden = true;
  el('controls').hidden = false;
  el('hint').textContent = '';
  renderBoard();
  renderStatus();
}

/* ---------- progress ---------- */

const bestFor = (id) => {
  const v = localStorage.getItem('unpinning.best.' + id);
  return v ? Number(v) : 0;
};

function recordBest(id, pins) {
  const cur = bestFor(id);
  if (!cur || pins < cur) localStorage.setItem('unpinning.best.' + id, String(pins));
}

/* ---------- level picker ---------- */

function renderPicker() {
  const list = el('picker-list');
  list.replaceChildren();
  const groups = new Map();
  for (const l of state.index.levels) {
    const key = `${l.regions - 2} crossings · ${l.strands} ${l.strands === 1 ? 'loop' : 'loops'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  for (const [title, items] of groups) {
    const h = document.createElement('div');
    h.className = 'group-title';
    h.textContent = `${title} (${items.length})`;
    list.appendChild(h);
    const g = document.createElement('div');
    g.className = 'group';
    for (const l of items) {
      const b = document.createElement('button');
      b.className = 'chip';
      const best = bestFor(l.id);
      if (best) b.classList.add(best === l.effectiveMinimum ? 'perfect' : 'solved');
      if (state.level && l.id === state.level.id) b.classList.add('current');
      b.textContent = `${l.index}·${l.effectiveMinimum}`;
      b.title = `${l.id} — ${l.effectiveMinimum} pins minimum` + (best ? `, your best ${best}` : '');
      b.addEventListener('click', () => { loadLevel(l.id); el('picker').hidden = true; });
      g.appendChild(b);
    }
    list.appendChild(g);
  }
}

/* ---------- boot ---------- */

async function loadLevel(id) {
  const res = await fetch(`data/levels/${encodeURIComponent(id)}.json`);
  state.level = await res.json();
  state.viewBox = null;
  localStorage.setItem('unpinning.last', id);
  resetLevel(false);
  renderPicker();
}

function nextLevel() {
  const all = state.index.levels;
  const i = all.findIndex((l) => l.id === state.level.id);
  loadLevel(all[Math.min(i + 1, all.length - 1)].id);
}

async function boot() {
  state.index = await (await fetch('data/index.json')).json();
  el('coverage').textContent =
    `${state.index.count} of 1097 catalogued multiloops are playable here; ` +
    `23 are omitted (22 whose region labels could not be matched to the drawing ` +
    `unambiguously, and 5^1_1, whose catalog page is empty upstream).`;

  el('pull').addEventListener('click', pullTight);
  el('clear').addEventListener('click', () => resetLevel(false));
  el('again').addEventListener('click', () => resetLevel(true));
  el('scrub-range').addEventListener('input', (ev) => scrubTo(Number(ev.target.value)));
  el('next').addEventListener('click', nextLevel);
  el('browse').addEventListener('click', () => {
    const p = el('picker');
    p.hidden = !p.hidden;
    if (!p.hidden) renderPicker();
  });
  el('close-picker').addEventListener('click', () => { el('picker').hidden = true; });

  const last = localStorage.getItem('unpinning.last');
  const known = state.index.levels.some((l) => l.id === last);
  await loadLevel(known ? last : state.index.levels[0].id);
}

boot();
