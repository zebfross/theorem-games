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

import { counts, order, newest } from './plays.js';
import { begin, mount } from './account.js';

const grid = document.getElementById('games');
const empty = document.getElementById('games-empty');

/* Data files revalidate rather than trusting whatever the browser stored.
 *
 * The site went out with the host's default headers, which cached assets for a
 * week and left the JSON to heuristics. Fixing the headers fixed new visitors
 * and did nothing for anybody who had already loaded the page: their browser
 * went on serving a registry listing a game that had been removed, and a plain
 * reload did not touch it, because a reload revalidates the document and not
 * what fetch() pulls in behind it.
 *
 * "no-cache" here is not "do not store" — the browser keeps the file and asks
 * whether it changed, which is a 304 and a header exchange when it has not. For
 * a registry read once a page load that is free, and it means the data can
 * never be staler than the last request.
 */
const FRESH = { cache: 'no-cache' };

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
  if (game.added) {
    const when = document.createElement('span');
    when.className = 'game-added';
    when.textContent = `added ${game.added}`;
    body.appendChild(when);
  }
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
    registry = await (await fetch('games/registry.json', FRESH)).json();
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
    for (const g of games) g.plays = tally[g.id] || 0;
    grid.replaceChildren(...order(games, tally).map((g) => card(g)));
  }).catch(() => { /* the gallery stands in registry order */ });

  // The newest games, on a shelf of their own. The ranking above cannot lift a
  // game with no plays above a game with some, and no tie-break could — so a
  // new game needs a place that popularity does not reach into. Shown only
  // when there is more than one shelf's worth to choose between, or it is just
  // the gallery again in a different order.
  const fresh = newest(games, 3);
  if (games.length > fresh.length && fresh.length) {
    document.getElementById('fresh').hidden = false;
    const shelf = document.getElementById('fresh-grid');
    for (const g of fresh) shelf.appendChild(card(g));
  }

  // Explorations are not games: nothing to arrange, no par, no way to lose.
  // They get their own section rather than being dressed up as puzzles with an
  // empty score, and the file is optional so the page works without it.
  try {
    const more = await (await fetch('explorations/registry.json', FRESH)).json();
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

// The account, started alongside rather than before it: the gallery has to draw
// whether or not there is a backend to ask.
//
// Synced bests are not redrawn into the cards. Signing in comes back through a
// full page load, so the numbers are right the moment it matters; the only
// stale case is a homepage left open while the same account plays elsewhere,
// which is a refresh away and not worth a second rendering path.
mount(document.getElementById('account'));
begin();
