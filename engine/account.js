'use strict';

/* Signing in, and keeping one number per level across machines.
 *
 * The rule this module exists to keep: **the game never waits for it, and never
 * breaks without it.** Progress has always lived in the browser's own storage
 * and still does — an account is a copy kept somewhere else, so that a record
 * made on a laptop is there on a phone. If the network is down, the backend is
 * unreachable, or nobody has signed in, everything here quietly does nothing
 * and the game is exactly the site it was before any of this existed.
 *
 * Merging is a minimum, never a replacement. Every game here scores lower as
 * better — fewest guards, fewest pins, shortest round — so a record on either
 * side survives meeting the other. Signing in on a fresh machine cannot wipe an
 * account, and signing in on the machine that holds the records cannot be wiped
 * by an empty one.
 */

const API = '/api';
const TIMEOUT = 6000;

let signedIn = null;                 // null until asked, then the user or false
let reachable = false;               // did a backend answer /me at all
const listeners = new Set();

/** A fetch that gives up rather than hanging the page on a slow backend. */
async function brief(url, options = {}) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT);
  try {
    return await fetch(url, { credentials: 'same-origin', ...options,
      signal: stop.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Every local best, as the backend wants them: "<game>.<level>". */
export function localBests() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const m = /^([a-z0-9-]+)\.(best|hinted)\.(.+)$/.exec(k || '');
    if (!m) continue;
    const at = `${m[1]}.${m[3]}`;
    out[at] = out[at] || { score: null, hinted: false };
    if (m[2] === 'best') out[at].score = Number(localStorage.getItem(k));
    else out[at].hinted = localStorage.getItem(k) === '1';
  }
  // A level marked as helped but never scored has nothing to record.
  for (const [k, v] of Object.entries(out)) {
    if (v.score === null || !Number.isFinite(v.score)) delete out[k];
  }
  return out;
}

/** Write a merged set back into the browser, keeping whichever is better. */
function applyLocally(bests) {
  for (const [at, v] of Object.entries(bests || {})) {
    const dot = at.indexOf('.');
    if (dot < 1) continue;
    const game = at.slice(0, dot);
    const level = at.slice(dot + 1);
    const bestKey = `${game}.best.${level}`;
    const cur = localStorage.getItem(bestKey);
    if (cur === null || Number(v.score) < Number(cur)) {
      localStorage.setItem(bestKey, String(v.score));
    }
    if (v.hinted) localStorage.setItem(`${game}.hinted.${level}`, '1');
  }
}

function announce() {
  for (const fn of listeners) {
    try { fn(signedIn || null); } catch { /* a listener must not break sync */ }
  }
}

/** Called with the user (or null) whenever that changes. */
export function onAccount(fn) {
  listeners.add(fn);
  if (signedIn !== null) fn(signedIn || null);
  return () => listeners.delete(fn);
}

export const account = () => (signedIn === null ? null : signedIn || null);

/** Ask who is signed in, then reconcile both sides once. */
export async function begin() {
  try {
    const res = await brief(`${API}/me`);
    if (!res.ok) throw new Error('no');
    const { user } = await res.json();
    reachable = true;
    signedIn = user || false;
  } catch {
    // No backend, no network, or no account. All the same to the game.
    signedIn = false;
  }
  announce();
  if (signedIn) await sync();
  return account();
}

/** Push local bests up, take the merged set back down. */
export async function sync() {
  if (!signedIn) return null;
  try {
    const res = await brief(`${API}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bests: localBests() }),
    });
    if (!res.ok) return null;
    const { bests } = await res.json();
    applyLocally(bests);
    announce();
    return bests;
  } catch {
    return null;                     // try again next time something is scored
  }
}

/** Send the player to GitHub, and back to the page they were on. */
export function signIn() {
  const back = location.pathname + location.search;
  location.href = `${API}/auth/github?return=${encodeURIComponent(back)}`;
}

export async function signOut() {
  try {
    await brief(`${API}/logout`, { method: 'POST' });
  } catch { /* the session will expire on its own */ }
  signedIn = false;
  announce();
}

/* ---------- the control in the header ---------- */

/** Put a sign-in control in `host`, and keep it in step with the account.
 *
 *  Deliberately quiet. Signed out it is a single link, not a call to action —
 *  the site works without an account and should not nag for one. It hides
 *  itself entirely when there is no backend to sign in to, so a clone of this
 *  repository serving static files shows nothing rather than a button that
 *  cannot work.
 */
export function mount(host) {
  if (!host) return;
  const paint = (user) => {
    host.replaceChildren();
    if (signedIn === false && !reachable) return;
    const b = document.createElement('button');
    b.className = 'ghost account-button';
    if (user) {
      b.textContent = `${user.name} · sign out`;
      b.title = 'Your bests are saved to this account';
      b.addEventListener('click', signOut);
    } else {
      b.textContent = 'Sign in';
      b.title = 'Keep your bests across machines. Signs in with GitHub.';
      b.addEventListener('click', signIn);
    }
    host.appendChild(b);
  };
  onAccount(paint);
  if (signedIn !== null) paint(account());
}
