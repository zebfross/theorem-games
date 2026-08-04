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
 * WHAT COUNTS AS A PLAY: one per level played through to a verdict. Somebody
 * who works through thirty pinning puzzles counts thirty times, because they
 * plainly enjoyed it more than somebody who tried one and left — which is the
 * whole thing the number is for.
 *
 * A verdict rather than a level being opened, so that clicking down the level
 * picker looking for something does not read as playing. Retrying a level you
 * already beat counts again, which is right: going back to improve a score is
 * as good a sign as any.
 *
 * ON RANKING BY THIS: it feeds back. Whatever is on top is played most because
 * it is on top, which keeps it on top. A newly added game starts on zero and
 * has no way to climb, so `order()` breaks ties by date added and the homepage
 * carries a separate recently-added shelf. Neither fixes the feedback loop —
 * nothing short of ranking by a rate would — and the shelf is the honest
 * answer: a place a new game is seen that popularity cannot push it out of.
 */

const ENDPOINT = '';           // e.g. 'https://plays.example.workers.dev'
const LOCAL = 'plays.local';
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

/** Most played first; among equals, most recently added first.
 *
 *  The date only decides ties, which in practice means it decides the order of
 *  the games nobody has played yet — so a new game arrives at the top of the
 *  unplayed ones rather than the bottom of everything. It does not lift a new
 *  game above a played one, and no secondary sort could: that would want
 *  ranking by plays per day rather than by plays, which is a different and much
 *  noisier thing at these numbers. The recently-added shelf is what actually
 *  gives a new game somewhere to be seen.
 *
 *  Registry order is the last word, so the ordering is stable and an author can
 *  still break a tie by hand.
 */
export function order(games, counts) {
  const rank = new Map(games.map((g, i) => [g.id, i]));
  return games.slice().sort((a, b) => {
    const byPlays = (counts[b.id] || 0) - (counts[a.id] || 0);
    if (byPlays !== 0) return byPlays;
    const byDate = String(b.added || '').localeCompare(String(a.added || ''));
    if (byDate !== 0) return byDate;
    return rank.get(a.id) - rank.get(b.id);
  });
}

/** The newest games, for the shelf that popularity cannot push anything off.
 *
 *  The most recent batch only — the games sharing the latest date — rather than
 *  the top few by date. Taking the top three of five put a game from the first
 *  day of the project under a heading saying "recently added", which is the
 *  shelf lying to fill itself. One card that is genuinely new beats three that
 *  are not.
 */
export function newest(games, howMany = 4) {
  const dated = games.filter((g) => g.added);
  if (!dated.length) return [];
  const latest = dated.reduce(
    (a, g) => (String(g.added) > a ? String(g.added) : a), '');
  return dated.filter((g) => String(g.added) === latest).slice(0, howMany);
}
