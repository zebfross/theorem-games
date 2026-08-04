/* A play counter, small enough to read in one sitting.
 *
 * The site does not need this. With no endpoint configured it keeps its own
 * counts in localStorage and sends nothing anywhere, which is how a clone runs
 * by default. This exists for the one deployment that wants a shared tally to
 * rank the homepage by.
 *
 * Deploy to Cloudflare Workers with a KV namespace bound as PLAYS, then set
 * ENDPOINT in engine/plays.js to the worker's URL.
 *
 *   wrangler kv namespace create PLAYS
 *   wrangler deploy
 *
 * What it stores: one integer per game id. No visitor identifier, no address,
 * no timestamp, nothing that could be tied back to a person — the site has
 * never had a way to know who you are and this does not give it one. The
 * counts are public, because they are shown on the homepage anyway.
 *
 * What it does not do: stop somebody determined to inflate a number. Per-IP
 * rate limiting below turns away the casual case; a real effort would need
 * something that can tell people apart, which is exactly what this is built
 * not to do. Ranking a handful of games is not worth that trade, so the
 * numbers here are a weathervane and should not be read as more.
 */

const ALLOW = /^[a-z0-9-]{1,32}$/;      // game ids, and nothing else
const WINDOW = 60;                       // seconds
const PER_WINDOW = 20;                   // requests per address per window

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  },
});

async function limited(env, request) {
  const who = request.headers.get('cf-connecting-ip') || 'unknown';
  const slot = `rate:${who}:${Math.floor(Date.now() / 1000 / WINDOW)}`;
  const n = Number(await env.PLAYS.get(slot)) || 0;
  if (n >= PER_WINDOW) return true;
  await env.PLAYS.put(slot, String(n + 1), { expirationTtl: WINDOW * 2 });
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
        },
      });
    }

    if (url.pathname === '/counts' && request.method === 'GET') {
      const out = {};
      const list = await env.PLAYS.list({ prefix: 'game:' });
      for (const k of list.keys) {
        out[k.name.slice(5)] = Number(await env.PLAYS.get(k.name)) || 0;
      }
      return json(out);
    }

    const play = url.pathname.match(/^\/play\/([^/]+)$/);
    if (play && request.method === 'POST') {
      const id = decodeURIComponent(play[1]);
      if (!ALLOW.test(id)) return json({ error: 'bad id' }, 400);
      if (await limited(env, request)) return json({ ok: true, throttled: true });
      const key = `game:${id}`;
      const n = Number(await env.PLAYS.get(key)) || 0;
      await env.PLAYS.put(key, String(n + 1));
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  },
};
