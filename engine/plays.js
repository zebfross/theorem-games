'use strict';

/* How often each game gets played, and the ordering that follows from it.
 *
 * This is the one piece of the site that wants a server. Everything else is
 * static files and localStorage, so it is built to degrade rather than to
 * depend: with no endpoint configured, or an endpoint that is down, or a
 * browser that blocks it, the counts fall back to this browser's own and the
 * homepage still renders in the registry's order. Nothing here is ever allowed
 * to throw into the page.
 *
 * ENDPOINT is deliberately empty in the repo. A clone runs with local counts
 * and no network traffic at all; publishing a shared counter is a decision the
 * person deploying makes, not one that ships turned on. tools/counter-worker.js
 * is a counter small enough to read in one sitting if you want one.
 *
 * WHAT COUNTS AS A PLAY: one per game per browser session, recorded when a
 * level is opened. Not per level — a player working through thirty pinning
 * puzzles is one person enjoying pinning, and counting them thirty times would
 * rank the games with short levels above the games people like. Not per page
 * load either, or a refresh would inflate it.
 *
 * ON RANKING BY THIS: it feeds back. The game at the top gets played most
 * because it is at the top, which keeps it at the top. `order()` therefore
 * ranks on counts but never lets a game with no plays yet sink out of sight —
 * see the comment there.
 */

const ENDPOINT = '';           // e.g. 'https://plays.example.workers.dev'
const LOCAL = 'plays.local';
const SEEN = 'plays.session';
const TIMEOUT = 2500;

/** This browser's own tally, which is also the fallback when there is no
 *  shared counter to ask. */
function local() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL) || '{}');
  } catch {
    return {};
  }
}

function bumpLocal(id) {
  try {
    const all = local();
    all[id] = (all[id] || 0) + 1;
    localStorage.setItem(LOCAL, JSON.stringify(all));
  } catch {
    /* storage disabled or full; the count is not worth failing a page over */
  }
}

/** Has this game already been counted in this session? */
function firstThisSession(id) {
  try {
    const seen = JSON.parse(sessionStorage.getItem(SEEN) || '[]');
    if (seen.includes(id)) return false;
    seen.push(id);
    sessionStorage.setItem(SEEN, JSON.stringify(seen));
    return true;
  } catch {
    return true;      // no session storage: count it and move on
  }
}

/** A fetch that gives up rather than hanging a page on a slow counter. */
async function brief(url, options) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: stop.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Record that somebody played this game. Never throws, never blocks. */
export function record(id) {
  if (!firstThisSession(id)) return;
  bumpLocal(id);
  if (!ENDPOINT) return;
  // Fire and forget: nothing on the page is waiting for this, and a counter
  // that is down should cost the player nothing at all.
  brief(`${ENDPOINT}/play/${encodeURIComponent(id)}`, { method: 'POST' })
    .catch(() => { /* blocked, offline, or gone; the local tally stands */ });
}

/** Play counts per game id, from the shared counter if there is one.
 *
 *  Returns `{counts, shared}` so a caller can tell "nobody has played this"
 *  from "there is nothing to ask", and say so honestly rather than presenting
 *  one browser's habits as the world's.
 */
export async function counts() {
  if (ENDPOINT) {
    try {
      const res = await brief(`${ENDPOINT}/counts`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          return { counts: data, shared: true };
        }
      }
    } catch {
      /* fall through to this browser's own */
    }
  }
  return { counts: local(), shared: false };
}

/** Games most played first — but not so firmly that nothing else is seen.
 *
 *  Ranking by popularity feeds back on itself: whatever is on top is played
 *  because it is on top. Two things keep that from closing:
 *
 *  A game nobody has played yet is not sorted to the bottom, where it would
 *  stay forever with no way to earn a play. It keeps the position the registry
 *  gave it, among the played ones, so a new game arrives somewhere visible and
 *  either earns its place or drifts down.
 *
 *  And ties keep registry order, so the ordering is stable and an author who
 *  wants a particular game first can still say so.
 */
export function order(games, counts) {
  const rank = new Map(games.map((g, i) => [g.id, i]));
  const played = games.filter((g) => counts[g.id] > 0);
  if (!played.length) return games.slice();

  const sorted = played.slice().sort((a, b) => {
    const d = (counts[b.id] || 0) - (counts[a.id] || 0);
    return d !== 0 ? d : rank.get(a.id) - rank.get(b.id);
  });

  // Put the played games, in their new order, into the slots the played games
  // used to occupy. Everything unplayed stays exactly where it was.
  const slots = games
    .map((g, i) => (counts[g.id] > 0 ? i : -1))
    .filter((i) => i >= 0);
  const out = games.slice();
  slots.forEach((slot, k) => { out[slot] = sorted[k]; });
  return out;
}
