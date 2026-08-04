'use strict';

/* Taut — the same game as Pinning, on levels generated here.
 *
 * Pinning's 1074 levels are derived from the LooPindex catalogue, which is why
 * that game is GPL-3.0 and, through it, so is this repository. These levels are
 * made and answered here, so this one is MIT.
 *
 * The board, the rope physics, the hints and the verdict are all Pinning's, and
 * are imported rather than copied: two divergent copies of a rope simulation is
 * how a bug gets fixed in one game and not the other. Only the identity and the
 * credit differ, and the level data they point at.
 *
 * It exists alongside Pinning rather than replacing it so the two can be
 * compared — whether generated drawings are as good to play as catalogued ones
 * is a question about taste, and the honest way to settle it is side by side.
 */

import pinning from '../pinning/game.js';

export default {
  ...pinning,
  id: 'taut',
  title: 'Taut',
  blurb:
    'Pin a loop of rope so that pulling it tight cannot untangle it — on '
    + 'drawings generated here rather than taken from a catalogue.',
  credit:
    'The same theorem as <b>Pinning</b>: the pinning ideal of a multiloop, '
    + '<b>Simon &amp; Stucky</b> (<a href="https://arxiv.org/abs/2405.16216">'
    + 'arXiv:2405.16216</a>), with tautness decided by Hass–Scott via '
    + '<b>Arettines</b>’ algorithm. Everything here is generated: the drawings '
    + 'are random multiloops and the pinning sets are computed, so this game '
    + 'carries no third-party data. The solver declines any position it cannot '
    + 'settle and those drawings are thrown away, which is why 60 levels took '
    + '8144 attempts.',
};
