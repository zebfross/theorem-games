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
 * ENDPOINT is this site's own backend, which is a path rather than a host: the
 * counter is two routes in api/, so a play is counted by the same origin that
 * served the page. No third party sees it, and there is nothing to configure.
 *
 * This was empty for a long time, on the reasoning that a clone should send
 * nothing anywhere unless somebody decided otherwise. A relative path keeps
 * that promise in the way that actually matters — a clone still contacts
 * nobody but itself, and a clone with no PHP gets a 404, catches it, and falls
 * back to local counts exactly as it did when this was blank.
 * tools/counter-worker.js is still here as the standalone alternative, for a
 * deployment with no server of its own.
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

const ENDPOINT = '/api';       // this site's own backend; see api/
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
 *  The most recent `howMany`, and then as many more as share a date with the
 *  last of them, so a shelf never shows two of the three games added on the
 *  same day and silently drops the third.
 *
 *  This used to be the latest date only, on the reasoning that taking a top few
 *  by date would file something months old under "recently added" — the shelf
 *  lying to fill itself. The reasoning was sound and the outcome was not: one
 *  game a day means a shelf of one card, which reads as an empty shelf rather
 *  than a discreet one. What actually stops it lying is that every card carries
 *  the date it was added, so a stale entry says so itself.
 */
export function newest(games, howMany = 3) {
  const dated = games.filter((g) => g.added)
    .sort((a, b) => String(b.added).localeCompare(String(a.added)));
  if (dated.length <= howMany) return dated;
  let cut = howMany;
  while (cut < dated.length
    && String(dated[cut].added) === String(dated[cut - 1].added)) cut++;
  return dated.slice(0, cut);
}
