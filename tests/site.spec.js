/* What a player can actually do, checked in a real browser.
 *
 * Three regressions in one day prompted these, and every one of them was
 * silent — the page looked fine, nothing threw, and the console stayed clean:
 *
 *   - a removed game went on being listed, from a stale cache
 *   - the explorations shelf was never copied to the server, and the homepage
 *     hides that shelf when its registry will not load, so a 404 looked like
 *     a site with no explorations
 *   - a cache-busting query on engine.js made the game modules import a second
 *     copy of the engine, booting the page twice, which left every button dead
 *
 * None of them would have been caught by checking that files parse. They are
 * caught by opening the page and pressing things, which is all this does.
 *
 * The games come from the registry rather than a list here, so a new game is
 * covered the moment it is registered.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const registry = JSON.parse(readFileSync('games/registry.json', 'utf8'));
const GAMES = registry.games;
// Read defensively: if this file goes missing the suite should fail on the
// assertion below, not collapse before any test is collected.
let SHELF = [];
try {
  SHELF = JSON.parse(readFileSync('explorations/registry.json', 'utf8'))
    .explorations || [];
} catch { SHELF = []; }

// Boards are waited for as *attached*, not visible. Playwright calls an
// element visible only if its bounding box has area, and a horizontal <line>
// has no height — so a game drawing streets rather than shapes would hang here
// forever while rendering perfectly. What is being asked is "did the game draw
// anything", which is attachment.

/** Fail the test on anything the page logs as broken.
 *
 *  Worth attaching everywhere even though none of the three regressions threw:
 *  it costs nothing, and the next one might. */
function watchForErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

test.describe('the homepage', () => {
  test('draws a card for every game and no others', async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto('/index.html');

    // Exactly, not merely "each of these is present". A removed game that goes
    // on being listed is an *extra* card, so a test that only looks for the
    // ones it expects sails straight past it — which is how Taut survived on
    // the live homepage after being deleted.
    const cards = page.locator('#games h2');
    await expect(cards).toHaveCount(GAMES.length);
    expect(await cards.allTextContents())
      .toEqual(expect.arrayContaining(GAMES.map((g) => g.title)));

    // And the registry the *site serves*, which on a live run is a different
    // file from the one on disk. A deploy that copied an older games/ passes
    // every file check and fails here.
    const served = await page.evaluate(async () =>
      (await (await fetch('games/registry.json', { cache: 'no-cache' })).json())
        .games.map((g) => g.id));
    expect(served).toEqual(GAMES.map((g) => g.id));
    expect(errors).toEqual([]);
  });

  test('shows the explorations shelf', async ({ page }) => {
    // home.js hides this section whenever its registry will not load, which is
    // right for a clone that has none and indistinguishable from a deploy that
    // forgot to send them. It forgot for a day. Asserting against the repo's
    // list rather than the served one is the point: if the server has fewer,
    // that is the bug.
    expect(SHELF.length, 'explorations/registry.json should list something')
      .toBeGreaterThan(0);
    await page.goto('/index.html');
    const cards = page.locator('#exploration-grid h2');
    await expect(cards).toHaveCount(SHELF.length);
    for (const e of SHELF) {
      await expect(page.getByRole('heading', { name: e.title, exact: true })
        .first()).toBeVisible();
    }
  });

  test('the Mandelbrot progress hairline clears when a frame lands',
    async ({ page }) => {
      // It exists to say "a sharper picture is coming" while zooming. A bar
      // left showing after the picture arrived would say the opposite forever.
      await page.goto('/explorations/mandelbrot/');
      const bar = page.locator('#working');
      await expect(bar).toHaveCount(1);
      await expect(page.locator('#timing')).not.toContainText('drawing', {
        timeout: 30000,
      });
      await expect.poll(async () => bar.evaluate(
        (e) => e.classList.contains('on')), { timeout: 5000 }).toBe(false);
    });

  test('the Mandelbrot hairline shows during a continuous zoom',
    async ({ page }) => {
      // The case it was written for and the case it first got wrong. Each frame
      // used to cancel the timer the frame before had armed, so holding a zoom
      // — the one time you most want to be told a sharper picture is coming —
      // was the one time nothing appeared.
      await page.goto('/explorations/mandelbrot/');
      await expect(page.locator('#timing')).not.toContainText('drawing',
        { timeout: 30000 });
      // Somewhere deep first. Near the top of the set a frame lands in
      // milliseconds and showing nothing is the right answer, so a test that
      // zoomed there would be asserting the opposite of the intended
      // behaviour and would fail on a fast machine for a good reason.
      await page.locator('[data-goto*="-0.163490122116363"]').click();
      await expect(page.locator('#timing')).not.toContainText('drawing',
        { timeout: 60000 });

      await page.evaluate(() => {
        const view = document.getElementById('view');
        const r = view.getBoundingClientRect();
        window.__stop = setInterval(() => view.dispatchEvent(new WheelEvent(
          'wheel', { deltaY: -120, clientX: r.left + r.width / 2,
            clientY: r.top + r.height / 2, bubbles: true, cancelable: true })),
        60);
      });
      // Showing means visible, not merely flagged: a bar that is "on" with no
      // width is an empty strip, which is how the first fix looked.
      await expect.poll(async () => page.evaluate(() => {
        const b = document.getElementById('working');
        return b.classList.contains('on') && b.getBoundingClientRect().width > 4;
      }), { timeout: 8000 }).toBe(true);
      await page.evaluate(() => clearInterval(window.__stop));
    });

  test('every exploration opens', async ({ page }) => {
    for (const e of SHELF) {
      const res = await page.goto(`/explorations/${e.id}/`);
      expect(res.status(), `${e.id} should serve`).toBe(200);
    }
  });
});

test.describe('the engine', () => {
  test('loads exactly once per page', async ({ page }) => {
    // Every game imports ../../engine/engine.js by a fixed path, and engine.js
    // boots at the end of the file. Anything that makes play.html load it under
    // a different URL — a cache-busting query, say — gives the page two engines
    // and two sets of listeners, and every button stops working without a word.
    await page.goto(`/play.html?game=${GAMES[0].id}`);
    await page.waitForSelector('#board *', { state: 'attached' });
    const loads = await page.evaluate(() =>
      performance.getEntriesByType('resource')
        .filter((r) => /engine\/engine\.js/.test(r.name)).map((r) => r.name));
    expect(loads).toHaveLength(1);
    expect(loads[0]).not.toContain('?');
  });

  test('an unknown game falls back rather than breaking', async ({ page }) => {
    // Links to removed games outlive the games. Taut's did.
    const errors = watchForErrors(page);
    await page.goto('/play.html?game=no-such-game');
    await page.waitForSelector('#board *', { state: 'attached' });
    await expect(page.locator('#title')).not.toBeEmpty();
    expect(errors).toEqual([]);
  });
});

for (const game of GAMES) {
  test.describe(game.title, () => {
    test('opens, draws a board and names itself', async ({ page }) => {
      const errors = watchForErrors(page);
      await page.goto(`/play.html?game=${game.id}`);
      await page.waitForSelector('#board *', { state: 'attached' });
      await expect(page.locator('#title')).toHaveText(game.title);
      expect(await page.locator('#board *').count()).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });

    test('level select opens, and picking a level loads it', async ({ page }) => {
      const errors = watchForErrors(page);
      await page.goto(`/play.html?game=${game.id}`);
      await page.waitForSelector('#board *', { state: 'attached' });

      await expect(page.locator('#picker')).toBeHidden();
      await page.locator('#browse').click();
      await expect(page.locator('#picker')).toBeVisible();

      const chips = page.locator('#picker .chip');
      expect(await chips.count()).toBeGreaterThan(0);

      // Take the last one, so it is not usually the level already loaded.
      const before = await page.locator('#board').innerHTML();
      await chips.last().click();
      await page.waitForSelector('#board *', { state: 'attached' });
      await expect(page.locator('#picker')).toBeHidden();
      await expect
        .poll(async () => (await page.locator('#board').innerHTML()) !== before,
          { message: 'the board should change when another level is chosen' })
        .toBe(true);
      expect(errors).toEqual([]);
    });

    test('Clear leaves a board you can still play', async ({ page }) => {
      const errors = watchForErrors(page);
      await page.goto(`/play.html?game=${game.id}`);
      await page.waitForSelector('#board *', { state: 'attached' });
      await page.locator('#clear').click();
      expect(await page.locator('#board *').count()).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });

    test('Stuck? gives a hint', async ({ page }) => {
      const errors = watchForErrors(page);
      await page.goto(`/play.html?game=${game.id}`);
      await page.waitForSelector('#board *', { state: 'attached' });
      await page.locator('#stuck').click();
      await expect(page.locator('#hint')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  });
}

/* Playing a level all the way through, with real clicks.
 *
 * Every other test here presses a button and checks the page responded. This
 * one walks a whole round and checks the score, which is the only way to
 * exercise the chain the player actually depends on: the level data, the click
 * handling, the running cost, noticing the round is finished, the verdict, and
 * par. A game can pass every other test in this file while scoring wrongly.
 *
 * Route inspection is where this is cheap to do, because each of its levels
 * ships the round the build already verified — so the test does not need to
 * know anything about postmen, only how to follow it.
 */
test.describe('Route inspection, played', () => {
  test('every shipped round walks to par through the board', async ({ page }) => {
    test.slow();
    const errors = watchForErrors(page);
    await page.goto('/play.html?game=postman');
    await page.waitForSelector('#board *', { state: 'attached' });

    const count = await page.evaluate(
      () => window.theoremGames.index.levels.length);

    for (let i = 0; i < count; i++) {
      await page.locator('#browse').click();
      await page.locator('#picker .chip').nth(i).click();
      await page.waitForSelector('#board *', { state: 'attached' });

      const { id, par, answer } = await page.evaluate(() => ({
        id: window.theoremGames.level.id,
        par: window.theoremGames.level.par,
        answer: window.theoremGames.level.answer,
      }));

      for (const corner of answer.slice(1)) {
        // Worked out immediately before each click rather than all at once up
        // front. Finishing a level eases the view, and that animation can still
        // be running when the next level loads — so coordinates taken in one
        // batch go stale as the viewBox slides under them, and the walk lands
        // on the wrong corners. Asking per click costs a round trip and cannot
        // drift.
        const { x, y } = await page.evaluate((n) => {
          const svg = document.getElementById('board');
          const pt = svg.createSVGPoint();
          [pt.x, pt.y] = window.theoremGames.level.nodes[n];
          const p = pt.matrixTransform(svg.getScreenCTM());
          return { x: p.x, y: p.y };
        }, corner);
        await page.mouse.click(x, y);
      }

      await expect(page.locator('#verdict'), `${id} should finish`)
        .toBeVisible();
      await expect(page.locator('#verdict-title'), `${id} should be perfect`)
        .toHaveText('The cheapest round there is.');
      const walked = await page.evaluate(() => window.theoremGames.play.cost);
      expect(walked, `${id} should cost par`).toBe(par);
    }
    expect(errors).toEqual([]);
  });
});
