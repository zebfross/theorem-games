'use strict';

/* The engine: everything a theorem game needs that is not about the theorem.
 *
 * It owns the page, the level pack, saved progress, the level picker, the
 * placing -> running -> result flow, the replay scrubber and the staged hint
 * button. A game supplies the board and the meaning; see docs/GAME-API.md.
 *
 * The one piece of real machinery here is how the run is recorded. Frames are
 * kept when the scene has actually moved rather than every so many steps,
 * because these simulations are front-loaded: most of the visible change
 * happens early and the rest is settling too small to see. Spacing frames on a
 * step timer gives a scrub bar whose back half shows nothing.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const el = (id) => document.getElementById(id);
export const board = el('board');

export function svgEl(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

const MAX_FRAMES = 180;    // thinned beyond this, so memory stays bounded
const RECORD_DRIFT = 1.6;  // scene units of change between recorded frames
const STALL_MS = 8000;     // taking too long: stop animating and just finish

/** Animation frames, but never only animation frames.
 *
 *  A hidden tab does not merely throttle requestAnimationFrame, it can suspend
 *  it completely — measured here at zero frames in 45 seconds — so a run driven
 *  by it alone stalls forever and the player returns to a frozen board. Timers
 *  keep firing, slowly, so whichever arrives first wins and the run always
 *  reaches its end. */
function schedule(step) {
  let fired = false;
  const once = () => {
    if (fired) return;
    fired = true;
    cancelAnimationFrame(app.raf);
    clearTimeout(app.timer);
    step();
  };
  app.raf = requestAnimationFrame(once);
  app.timer = setTimeout(once, 250);
}

function unschedule() {
  cancelAnimationFrame(app.raf);
  cancelAnimationFrame(app.zoom);
  clearTimeout(app.timer);
}

const app = {
  game: null,
  index: null,
  level: null,
  play: null,
  phase: 'placing',        // placing | running | result
  sim: null,
  raf: 0,
  frames: [],
  viewBox: null,
  zoom: 0,
  browsing: null,
  hintTier: 0,
  usedHint: false,
};

/* ---------- saved progress, namespaced per game ---------- */

const key = (kind, id) => `${app.game.id}.${kind}.${id}`;
const bestFor = (id) => Number(localStorage.getItem(key('best', id))) || 0;
const assisted = (id) => localStorage.getItem(key('hinted', id)) === '1';

function recordBest(id, score) {
  const cur = bestFor(id);
  if (!cur || score < cur) localStorage.setItem(key('best', id), String(score));
}

/* ---------- board ---------- */

function setView(box) {
  if (!box) return;
  app.viewBox = box;
  board.setAttribute('viewBox', box.join(' '));
}

/** Ease the view onto a final scene, which is often much smaller than the
 *  board it started on.
 *
 *  Its handle is kept so a reset can stop it. An ease left running will go on
 *  stamping the zoomed-in result view over a board that has already gone back
 *  to accepting input, which looks exactly like the reset failing. */
function easeView(to) {
  cancelAnimationFrame(app.zoom);
  if (!to) return;
  const from = app.viewBox || to;
  const t0 = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 450);
    const e = 1 - (1 - k) ** 3;
    setView(from.map((v, i) => v + (to[i] - v) * e));
    if (k < 1) app.zoom = requestAnimationFrame(tick);
  };
  tick();
}

function draw() {
  app.game.draw(app.level, app.play, app.phase);
}

function status(readout) {
  const d = app.game.describe(app.level, app.play);
  el('goal-text').innerHTML = readout === undefined ? d.goal : `${d.goal} &nbsp;·&nbsp; ${readout}`;
  const best = bestFor(app.level.id);
  el('score').textContent = d.status + (best ? ` · your best ${best}` : '');
  el('run').disabled = app.phase !== 'placing' || !app.game.runnable(app.level, app.play);
  el('clear').disabled = app.phase !== 'placing';
  el('stuck').disabled = app.phase === 'running';
}

board.addEventListener('click', (ev) => {
  if (app.phase !== 'placing' || app.browsing !== null) return;
  const pt = board.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  const p = pt.matrixTransform(board.getScreenCTM().inverse());
  const r = app.game.click(app.level, app.play, p) || {};
  if (r.message) { say(r.message, false); return; }
  if (r.changed) { say(''); draw(); status(); }
});

function say(text, isTip = true) {
  const hint = el('hint');
  hint.textContent = text;
  hint.className = text && isTip ? 'tip' : '';
}

/* ---------- the run ---------- */

function record(scene) {
  const g = app.game.sim;
  const s = scene || g.scene(app.sim);
  app.frames.push({
    scene: s,
    view: g.sceneView(s),
    readout: g.readout(app.sim, s),
  });
  app.lastScene = s;
  app.travel = 0;
  if (app.frames.length > MAX_FRAMES) {
    app.frames = app.frames.filter((_f, i) => i % 2 === 0);
    app.recordDrift *= 2;
  }
}

function advance(maxSteps) {
  const g = app.game.sim;
  let done = false;
  for (let k = 0; k < maxSteps && !done; k++) {
    done = g.step(app.sim);
    if (done) { record(); break; }
    // Comparing scenes every step is far too costly, so gate it on a cheap
    // upper bound: while the most anything could have moved is under a frame's
    // worth, no frame can be due and the real comparison is skipped.
    app.travel += g.motion(app.sim);
    if (app.travel < app.recordDrift) continue;
    app.travel = 0;
    const scene = g.scene(app.sim);
    if (!app.lastScene || g.apart(scene, app.lastScene) > app.recordDrift) record(scene);
  }
  return done;
}

function startRun() {
  if (app.phase !== 'placing') return;
  app.phase = 'running';
  app.sim = app.game.sim.create(app.level, app.play);
  app.frames = [];
  app.lastScene = null;
  app.travel = 0;
  app.recordDrift = RECORD_DRIFT;
  say('');
  draw();
  status();
  record();

  const started = performance.now();
  let n = 0;
  const tick = () => {
    let done = advance(app.game.sim.perFrame(app.sim));
    if (!done && performance.now() - started > STALL_MS) {
      advance(1e6);
      done = true;
    }
    app.game.sim.paint(app.sim);
    if (++n % 3 === 0 || done) status(app.game.sim.readout(app.sim, null));
    if (done) { finishRun(); return; }
    schedule(tick);
  };
  schedule(tick);
}

function finishRun() {
  const v = app.game.verdict(app.level, app.play, app.sim);
  app.phase = 'result';
  status(v.readout);
  draw();

  const box = el('verdict');
  box.hidden = false;
  box.className = v.won ? 'win' : 'lose';
  el('verdict-title').textContent = v.title;
  el('verdict-detail').textContent = v.detail;

  if (v.won) {
    if (app.usedHint) localStorage.setItem(key('hinted', app.level.id), '1');
    else if (v.score !== undefined) recordBest(app.level.id, v.score);
  }
  renderPicker();
  easeView(app.frames.length ? app.frames[app.frames.length - 1].view : null);

  // The last frame is the answer, so label it with what the game vouches for
  // rather than whatever the simulation happened to measure there.
  if (app.frames.length && v.readout !== undefined) {
    app.frames[app.frames.length - 1].readout = v.readout;
  }
  const alts = v.won && app.game.solutions
    ? app.game.solutions.count(app.level) : 0;
  el('alts').hidden = alts < 2;

  const range = el('scrub-range');
  range.max = String(Math.max(0, app.frames.length - 1));
  range.value = range.max;
  el('scrub').hidden = app.frames.length < 2;
  el('controls').hidden = true;
}

/* ---------- browsing other answers ---------- */

/** Step through the other ways a solved level could have been solved.
 *
 *  Optional: a game that offers `solutions` gets a button after a win. Worth
 *  having generically, since any puzzle with a minimum in it tends to have ties
 *  for it, and seeing the alternatives is where the structure of the answer
 *  shows itself. Display only — the player's own arrangement is put back the
 *  moment they leave. */
function browseSolutions() {
  const s = app.game.solutions;
  const total = s.count(app.level);
  const next = app.browsing === null ? 0 : app.browsing + 1;

  app.phase = 'placing';           // show the board as laid out, not pulled tight
  cancelAnimationFrame(app.zoom);  // and drop the zoom onto the finished knot
  setView(app.game.view(app.level, app.play));

  if (next >= total) {             // round the loop and hand it back
    stopBrowsing();
    say('Back to your own solution.', false);
  } else {
    app.browsing = next;
    say(s.show(app.level, app.play, next), false);
    el('alts').textContent = `Next solution (${next + 1}/${total})`;
  }
  draw();
  status();
}

function stopBrowsing() {
  if (app.browsing === null) return;
  app.game.solutions.restore(app.level, app.play);
  app.browsing = null;
  el('alts').textContent = 'Other solutions';
}

function scrubTo(i) {
  const frame = app.frames[i];
  if (!frame) return;
  app.game.sim.show(app.sim, frame.scene);
  setView(frame.view);
  status(frame.readout);
}

/* ---------- hints ---------- */

function nudge() {
  if (app.phase !== 'placing') resetLevel(true);
  app.usedHint = true;
  app.hintTier += 1;
  const r = app.game.hint(app.level, app.play, app.hintTier) || {};
  say(r.text || '');
  draw();
  status();
}

/* ---------- level lifecycle ---------- */

function resetLevel(keep) {
  unschedule();
  stopBrowsing();
  el('alts').hidden = true;
  app.sim = null;
  app.frames = [];
  app.viewBox = null;
  app.phase = 'placing';
  if (!keep) app.play = app.game.start(app.level);
  el('verdict').hidden = true;
  el('scrub').hidden = true;
  el('controls').hidden = false;
  say('');
  setView(app.game.view(app.level, app.play));
  draw();
  status();
}

async function loadLevel(id) {
  const url = `../games/${app.game.id}/data/levels/${encodeURIComponent(id)}.json`;
  app.level = await (await fetch(url)).json();
  app.play = app.game.start(app.level);
  app.hintTier = 0;
  app.usedHint = false;
  localStorage.setItem(key('last', 'level'), id);
  resetLevel(true);
  renderPicker();
}

function nextLevel() {
  const all = app.index.levels;
  const i = all.findIndex((l) => l.id === app.level.id);
  loadLevel(all[Math.min(i + 1, all.length - 1)].id);
}

/* ---------- level picker ---------- */

function renderPicker() {
  const list = el('picker-list');
  list.replaceChildren();
  const groups = new Map();
  for (const meta of app.index.levels) {
    const g = app.game.group(meta);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(meta);
  }
  for (const [title, items] of groups) {
    const h = document.createElement('div');
    h.className = 'group-title';
    h.textContent = `${title} (${items.length})`;
    list.appendChild(h);
    const row = document.createElement('div');
    row.className = 'group';
    for (const meta of items) {
      const b = document.createElement('button');
      b.className = 'chip';
      const best = bestFor(meta.id);
      if (best) b.classList.add(best === app.game.par(meta) ? 'perfect' : 'solved');
      else if (assisted(meta.id)) b.classList.add('assisted');
      if (app.level && meta.id === app.level.id) b.classList.add('current');
      b.textContent = app.game.chip(meta);
      b.title = `${meta.id} — best possible ${app.game.par(meta)}`
              + (best ? `, your best ${best}` : '');
      b.addEventListener('click', () => { loadLevel(meta.id); el('picker').hidden = true; });
      row.appendChild(b);
    }
    list.appendChild(row);
  }
}

/* ---------- boot ---------- */

async function boot() {
  const registry = await (await fetch('../games/registry.json')).json();
  const wanted = new URLSearchParams(location.search).get('game');
  const entry = registry.games.find((g) => g.id === wanted) || registry.games[0];

  const mod = await import(`../games/${entry.id}/game.js`);
  app.game = mod.default;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = `../games/${app.game.id}/style.css`;
  document.head.appendChild(css);

  document.title = app.game.title;
  el('title').textContent = app.game.title;
  el('blurb').textContent = app.game.blurb || '';
  el('credit').innerHTML = app.game.credit || '';
  el('run').textContent = app.game.verb || 'Run';

  if (registry.games.length > 1) {
    const picker = el('game-switch');
    picker.hidden = false;
    for (const g of registry.games) {
      const o = document.createElement('option');
      o.value = g.id;
      o.textContent = g.title;
      o.selected = g.id === app.game.id;
      picker.appendChild(o);
    }
    picker.addEventListener('change', () => {
      location.search = `?game=${picker.value}`;
    });
  }

  app.index = await (await fetch(`../games/${app.game.id}/data/index.json`)).json();
  el('coverage').textContent = app.index.note || '';

  el('run').addEventListener('click', startRun);
  el('clear').addEventListener('click', () => { app.hintTier = 0; resetLevel(false); });
  el('again').addEventListener('click', () => resetLevel(true));
  el('stuck').addEventListener('click', nudge);
  el('stuck-result').addEventListener('click', nudge);
  el('alts').addEventListener('click', browseSolutions);
  el('next').addEventListener('click', nextLevel);
  el('scrub-range').addEventListener('input', (ev) => scrubTo(Number(ev.target.value)));
  el('browse').addEventListener('click', () => {
    const p = el('picker');
    p.hidden = !p.hidden;
    if (!p.hidden) renderPicker();
  });
  el('close-picker').addEventListener('click', () => { el('picker').hidden = true; });

  const last = localStorage.getItem(key('last', 'level'));
  const known = app.index.levels.some((l) => l.id === last);
  await loadLevel(known ? last : app.index.levels[0].id);
}

boot();
