# Accounts — the whole backend

Six endpoints and two tables. It exists so that a best score made on a laptop is
there on a phone, and for nothing else.

## The rule it is built around

**The game never waits for this, and never breaks without it.** Progress has
always lived in the browser's own storage and still does; an account is a copy
kept somewhere else. With no config file, no database, or no OAuth app
registered, every endpoint answers and the answer is "nobody is signed in" —
which is the state the site was in for its entire life before this existed.

That is not a nice-to-have. It is why the sign-in control hides itself when
there is no backend, why every network call has a timeout and a silent
`catch`, and why the verdict you are reading never blocks on a sync.

## What is stored

| | |
| --- | --- |
| `users` | a GitHub account id, a display name, two timestamps |
| `bests` | one row per level you have finished: a score and a "was helped" flag |

**No passwords, ever** — GitHub does that part, and the OAuth scope requested is
`read:user`, the narrowest there is. No email, no repositories, no write access.
No addresses, no play history, no timestamps beyond "account made" and "last
seen".

## Merging, not replacing

Signing in **merges**. Every game here scores lower as better — fewest guards,
fewest pins, shortest round — so the merge is a minimum and a record on either
side survives meeting the other:

- signing in on a fresh machine cannot wipe an account
- signing in on the machine holding your records cannot be wiped by an empty
  account

The "was helped" flag merges the other way, sticky, because that is what the
browser has always done: the engine sets it and never clears it. Merging it as
a minimum would let anyone launder the mark away by signing in from a browser
that had never seen the level.

## Endpoints

```
GET  /api/me                    who is signed in, if anybody
GET  /api/auth/github           begin signing in
GET  /api/auth/github/callback  finish, and come back to the game
POST /api/logout                forget the session
GET  /api/progress              every best this account has
POST /api/progress              merge in bests made in the browser
```

## Setting it up

The database, the tables and the config file are already made. **One step is
left, and it needs your GitHub account**, so it is not something this repository
can do for you.

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Fill in:
   - **Application name**: `theorem.games`
   - **Homepage URL**: `https://theorem.games`
   - **Authorization callback URL**:
     `https://theorem.games/api/auth/github/callback` — this must match exactly
3. Register it, then **Generate a new client secret**
4. On the server, put both values into the config that is already there:

   ```
   ssh redify
   nano ~/theorem-config.php      # fill in client_id and client_secret
   ```

That file lives **outside the document root**: it is never served, and the
deploy that mirrors the site with `--delete` cannot reach it. It is not in this
repository and must not be put there.

Until step 4 is done, `/api/auth/github` answers `503 sign-in is not
configured` and the site runs exactly as it always has.

## Applying the schema

```
ssh redify
cd ~/theorem.games && php api/migrate.php
```

Safe to run repeatedly. It refuses to run over the web — a migration endpoint
anybody can reach is a migration anybody can run.

## What is checked

`tests/site.spec.js` asserts the contract against both the real PHP and the
dev server's stand-in: that `/api/me` reports nobody signed in, that
`/api/progress` is an object rather than a list, that writing without an account
is refused with a 401, and that the site is entirely usable without touching any
of it. Two implementations of one contract is exactly where a shape drifts.

Also verified by hand after deploying: `api/lib/`, `schema.sql` and
`migrate.php` are not reachable over the web, and the config file is not served
under any name.
