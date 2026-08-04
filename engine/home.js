'use strict';

/* The front door: one card per game.
 *
 * Everything shown comes out of `games/registry.json` and the browser's own
 * saved progress, so adding a game stays a matter of dropping in a directory
 * and adding a line to the registry — nothing here needs editing, and nothing
 * here imports a game module. That last part matters: a game module expects
 * the playing board to exist, so importing two of them merely to read their
 * titles would break as soon as one of them touched the DOM.
 *
 * Progress is counted straight from localStorage, whose keys the engine
 * namespaces as `<game>.best.<level>`. That avoids fetching every game's level
 * index just to draw a homepage — Pinning's alone is 158KB.
 */

import { counts, order } from './plays.js';

const grid = document.getElementById('games');
const empty = document.getElementById('games-empty');

/** How many levels of this game have a recorded best, and how many are perfect.
 *
 *  Read by prefix rather than by consulting the level list, so the homepage
 *  costs one small fetch no matter how big the packs get.
 */
function progress(id) {
  const best = `${id}.best.`;
  let solved = 0;
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i).startsWith(best)) solved++;
  }
  return solved;
}

function card(game, kind = 'game') {
  const a = document.createElement('a');
  a.className = 'game-card';
  a.href = kind === 'game'
    ? `play.html?game=${encodeURIComponent(game.id)}`
    : `explorations/${encodeURIComponent(game.id)}/`;

  const art = document.createElement('div');
  art.className = 'game-art';
  const img = document.createElement('img');
  img.src = kind === 'game'
    ? `games/${game.id}/poster.svg`
    : `explorations/${game.id}/poster.svg`;
  img.alt = '';
  // A game without a poster still gets a card; the frame just stays empty
  // rather than showing a broken image.
  img.addEventListener('error', () => img.remove());
  art.appendChild(img);
  a.appendChild(art);

  const body = document.createElement('div');
  body.className = 'game-body';

  const h = document.createElement('h2');
  h.textContent = game.title;
  body.appendChild(h);

  const blurb = document.createElement('p');
  blurb.className = 'game-blurb';
  blurb.textContent = game.blurb || '';
  body.appendChild(blurb);

  if (game.theorem) {
    const th = document.createElement('p');
    th.className = 'game-theorem';
    th.textContent = game.theorem;
    body.appendChild(th);
  }

  const meta = document.createElement('p');
  meta.className = 'game-meta';
  const solved = progress(game.id);
  if (game.plays > 0) {
    const plays = document.createElement('span');
    plays.className = 'game-plays';
    plays.textContent = game.plays === 1 ? '1 play' : `${game.plays} plays`;
    body.appendChild(plays);
  }
  const total = game.levels;
  meta.textContent = total
    ? (solved ? `${solved} of ${total} puzzles solved` : `${total} puzzles`)
    : (solved ? `${solved} puzzles solved` : '');
  body.appendChild(meta);

  if (total && solved) {
    const bar = document.createElement('div');
    bar.className = 'game-bar';
    const fill = document.createElement('span');
    fill.style.width = `${Math.min(100, (100 * solved) / total).toFixed(1)}%`;
    bar.appendChild(fill);
    body.appendChild(bar);
  }

  a.appendChild(body);
  return a;
}

async function boot() {
  // An old link straight to a game still works: send it on rather than
  // silently showing the gallery instead of the thing that was asked for.
  const wanted = new URLSearchParams(location.search).get('game');
  if (wanted) {
    location.replace(`play.html?game=${encodeURIComponent(wanted)}`);
    return;
  }

  let registry;
  try {
    registry = await (await fetch('games/registry.json')).json();
  } catch {
    empty.hidden = false;
    empty.textContent = 'The game registry could not be loaded.';
    return;
  }
  const games = registry.games || [];
  if (!games.length) {
    empty.hidden = false;
    return;
  }
  // Most played first. The counts are asked for rather than waited on: a
  // counter that is slow, blocked or absent must not keep the gallery off the
  // screen, so the cards go up in registry order and are reordered if and when
  // an answer arrives.
  for (const g of games) grid.appendChild(card(g));
  counts().then(({ counts: tally, shared }) => {
    if (!shared) return;          // one browser's habits are not a ranking
    const ranked = order(games, tally);
    const same = ranked.every((g, i) => g.id === games[i].id);
    for (const g of ranked) g.plays = tally[g.id] || 0;
    if (!same || ranked.some((g) => g.plays)) {
      grid.replaceChildren(...ranked.map((g) => card(g)));
    }
  }).catch(() => { /* the gallery stands in registry order */ });

  // Explorations are not games: nothing to arrange, no par, no way to lose.
  // They get their own section rather than being dressed up as puzzles with an
  // empty score, and the file is optional so the page works without it.
  try {
    const more = await (await fetch('explorations/registry.json')).json();
    const list = more.explorations || [];
    if (list.length) {
      document.getElementById('explorations').hidden = false;
      const shelf = document.getElementById('exploration-grid');
      for (const e of list) shelf.appendChild(card(e, 'exploration'));
    }
  } catch {
    /* no explorations registered; the games stand on their own */
  }
}

boot();
