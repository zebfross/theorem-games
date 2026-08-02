'use strict';

/* Max-flow min-cut — cut pipes until no water reaches the sink, as cheaply as
 * you can.
 *
 * Menger, Ford and Fulkerson: the most water a network can carry from source to
 * sink is exactly the cost of the cheapest set of pipes that separates them. So
 * par is the max flow, and a player who finds the cheapest cut has found the
 * theorem — the number they are trying to beat and the number they are trying
 * to stop are the same number, which is the whole point and is worth saying in
 * the verdict rather than leaving to be noticed.
 *
 * Unlike Unpinning nothing here is looked up: max flow is polynomial, so the
 * levels are generated and the answers computed. The win check is exact and
 * cheap — is the sink still reachable — so the animation is pure illustration
 * and cannot disagree with the verdict, which is the failure mode the engine's
 * notes warn about.
 */

import { board, svgEl } from '../../engine/engine.js';

const NODE_R = 16;
const PIPE_MIN = 4;          // a capacity-1 pipe, in board units
const PIPE_PER_UNIT = 2.2;   // extra width per unit of capacity

function pipeWidth(cap) {
  return PIPE_MIN + PIPE_PER_UNIT * cap;
}

/** Distance from a point to a line segment, for working out what was clicked. */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/* ---------- the network ---------- */

function reachable(level, cut) {
  const seen = new Set([level.source]);
  const stack = [level.source];
  while (stack.length) {
    const u = stack.pop();
    level.edges.forEach(([a, b], i) => {
      if (cut.has(i)) return;
      const v = a === u ? b : b === u ? a : -1;
      if (v >= 0 && !seen.has(v)) { seen.add(v); stack.push(v); }
    });
  }
  return seen;
}

/** Max flow, and how much runs through each pipe and which way.
 *
 *  Edmonds-Karp on the arc expansion: an undirected pipe of capacity c is two
 *  opposed arcs of capacity c, which is what lets water choose its direction.
 *  Networks here have tens of edges, so this is instant and there is no reason
 *  to precompute it.
 */
function maxFlow(level, cut) {
  const n = level.nodes.length;
  const adj = Array.from({ length: n }, () => []);
  const arcs = [];
  level.edges.forEach(([u, v, c], i) => {
    if (cut.has(i)) return;
    const a = arcs.length;
    arcs.push({ to: v, cap: c, edge: i, sign: 1 });
    arcs.push({ to: u, cap: c, edge: i, sign: -1 });
    adj[u].push(a);
    adj[v].push(a + 1);
  });
  const twin = (a) => a ^ 1;

  let total = 0;
  for (;;) {
    const prev = new Array(n).fill(-1);
    prev[level.source] = -2;
    const queue = [level.source];
    for (let qi = 0; qi < queue.length && prev[level.sink] === -1; qi++) {
      for (const a of adj[queue[qi]]) {
        if (arcs[a].cap > 0 && prev[arcs[a].to] === -1) {
          prev[arcs[a].to] = a;
          queue.push(arcs[a].to);
        }
      }
    }
    if (prev[level.sink] === -1) break;
    let push = Infinity;
    for (let v = level.sink; v !== level.source;) {
      const a = prev[v];
      push = Math.min(push, arcs[a].cap);
      v = arcs[twin(a)].to;
    }
    for (let v = level.sink; v !== level.source;) {
      const a = prev[v];
      arcs[a].cap -= push;
      arcs[twin(a)].cap += push;
      v = arcs[twin(a)].to;
    }
    total += push;
  }

  // Net flow per pipe, signed the way the pipe was written down.
  const flow = new Array(level.edges.length).fill(0);
  for (let a = 0; a < arcs.length; a += 2) {
    const [, , cap] = level.edges[arcs[a].edge];
    flow[arcs[a].edge] = cap - arcs[a].cap;   // what left the forward arc
  }
  return { total, flow };
}

function cost(level, cut) {
  let c = 0;
  for (const i of cut) c += level.edges[i][2];
  return c;
}

/* ---------- drawing ---------- */

function drawNetwork(level, play, opts = {}) {
  const { flow = null, wet = null, front = 0 } = opts;
  board.replaceChildren();

  const pos = level.nodes;
  const pipes = svgEl('g', {});
  level.edges.forEach(([u, v, cap], i) => {
    const [ax, ay] = pos[u];
    const [bx, by] = pos[v];
    const w = pipeWidth(cap);
    const isCut = play.cut.has(i);
    const cls = 'pipe' + (isCut ? ' cut' : '')
      + (play.hinted && play.hinted.has(i) ? ' hinted' : '');
    pipes.appendChild(svgEl('line', {
      x1: ax, y1: ay, x2: bx, y2: by, 'stroke-width': w + 5, class: 'pipe-wall',
    }));
    pipes.appendChild(svgEl('line', {
      x1: ax, y1: ay, x2: bx, y2: by, 'stroke-width': w, class: cls,
      'data-edge': i,
    }));
    // Water sits inside the pipe, as wide as the flow actually running
    // through it — so the bottleneck is visible rather than inferred.
    if (flow && !isCut && Math.abs(flow[i]) > 0 && wet) {
      const run = wet(i, ax, ay, bx, by, front);
      if (run) {
        pipes.appendChild(svgEl('line', {
          x1: run[0], y1: run[1], x2: run[2], y2: run[3],
          'stroke-width': Math.max(3, pipeWidth(Math.abs(flow[i])) - 6),
          class: 'water',
        }));
      }
    }
    if (!isCut) {
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      pipes.appendChild(svgEl('circle', { cx: mx, cy: my, r: 12, class: 'cap-disc' }));
      const label = svgEl('text', { x: mx, y: my + 4, class: 'cap' });
      label.textContent = cap;
      pipes.appendChild(label);
    } else {
      // a severed pipe, drawn as a gap with two loose ends
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      for (const s of [-1, 1]) {
        pipes.appendChild(svgEl('line', {
          x1: mx + nx * 11 * s - (bx - ax) / len * 3,
          y1: my + ny * 11 * s - (by - ay) / len * 3,
          x2: mx - nx * 11 * s + (bx - ax) / len * 3,
          y2: my - ny * 11 * s + (by - ay) / len * 3,
          class: 'snip',
        }));
      }
    }
  });
  board.appendChild(pipes);

  for (let i = 0; i < pos.length; i++) {
    const [x, y] = pos[i];
    const end = i === level.source ? ' source' : i === level.sink ? ' sink' : '';
    board.appendChild(svgEl('circle', { cx: x, cy: y, r: NODE_R, class: 'node' + end }));
    if (end) {
      const t = svgEl('text', { x, y: y + 5, class: 'node-label' });
      t.textContent = i === level.source ? 'S' : 'T';
      board.appendChild(t);
    }
  }
}

export default {
  id: 'maxflow',
  title: 'Max-flow min-cut',
  blurb:
    'Cut pipes until no water reaches the sink, spending as little as you can. '
    + 'The cheapest way to stop the flow costs exactly what the network can carry.',
  verb: 'Turn on the water',
  credit:
    'A game on the max-flow min-cut theorem of <b>Menger</b>, and <b>Ford and '
    + 'Fulkerson</b>: the greatest flow from source to sink equals the smallest '
    + 'total capacity of any set of pipes separating them. Networks and answers '
    + 'are generated here, so this game carries no third-party data.',

  group: (m) => `${m.nodes} junctions`,
  chip: (m) => `${m.n}·${m.par}`,
  par: (m) => m.par,

  start: () => ({ cut: new Set(), hinted: null }),

  view: (level) => level.view,

  runnable: () => true,

  describe(level, play) {
    const spent = cost(level, play.cut);
    return {
      goal: `Stop the water for <b>${level.par}</b> or less`,
      status: `${spent} spent · ${play.cut.size} `
        + `${play.cut.size === 1 ? 'pipe' : 'pipes'} cut`,
    };
  },

  click(level, play, p) {
    let best = Infinity;
    let pick = -1;
    level.edges.forEach(([u, v], i) => {
      const [ax, ay] = level.nodes[u];
      const [bx, by] = level.nodes[v];
      const d = distToSegment(p.x, p.y, ax, ay, bx, by);
      if (d < best) { best = d; pick = i; }
    });
    if (pick < 0 || best > 26) return { message: 'Click a pipe to cut it.' };
    if (play.cut.has(pick)) play.cut.delete(pick);
    else play.cut.add(pick);
    play.hinted = null;
    return { changed: true };
  },

  draw(level, play, phase) {
    if (phase === 'placing' || !play.sim) drawNetwork(level, play);
    else drawNetwork(level, play, play.sim.paintArgs());
  },

  sim: {
    create(level, play) {
      const { total, flow } = maxFlow(level, play.cut);
      // How far each junction is from the source along pipes that carry water,
      // so the flood advances outwards rather than everywhere at once.
      const n = level.nodes.length;
      const depth = new Array(n).fill(Infinity);
      depth[level.source] = 0;
      const queue = [level.source];
      for (let qi = 0; qi < queue.length; qi++) {
        const u = queue[qi];
        level.edges.forEach(([a, b], i) => {
          if (play.cut.has(i) || Math.abs(flow[i]) === 0) return;
          const v = a === u ? b : b === u ? a : -1;
          if (v >= 0 && depth[v] === Infinity) {
            depth[v] = depth[u] + 1;
            queue.push(v);
          }
        });
      }
      const deepest = Math.max(1, ...depth.filter((d) => d < Infinity));
      const sim = {
        level, play, flow, total, depth, deepest,
        front: 0,
        // Water that has nowhere to go still fills the pipes it can reach, so
        // a holding cut is not a blank screen: you watch it stop.
        span: deepest + 1,
      };
      sim.paintArgs = () => ({
        flow,
        front: sim.front,
        wet: (i, ax, ay, bx, by, front) => {
          const [u, v] = level.edges[i];
          const from = depth[u] <= depth[v] ? u : v;
          const near = depth[from];
          if (!(near < Infinity)) return null;
          const t = Math.max(0, Math.min(1, front - near));
          if (t <= 0) return null;
          const flip = from === u;
          const x1 = flip ? ax : bx;
          const y1 = flip ? ay : by;
          const x2 = flip ? bx : ax;
          const y2 = flip ? by : ay;
          return [x1, y1, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
        },
      });
      play.sim = sim;
      return sim;
    },
    step(sim) {
      sim.front += 0.06;
      return sim.front >= sim.span;
    },
    perFrame: () => 1,
    motion: () => 0.06,
    scene: (sim) => sim.front,
    apart: (a, b) => Math.abs(a - b),
    show(sim, scene) {
      sim.front = scene;
      drawNetwork(sim.level, sim.play, sim.paintArgs());
    },
    sceneView: () => null,
    readout(sim) {
      return sim.total === 0
        ? 'nothing getting through'
        : `${sim.total} getting through`;
    },
    paint(sim) {
      drawNetwork(sim.level, sim.play, sim.paintArgs());
    },
  },

  verdict(level, play) {
    const spent = cost(level, play.cut);
    const through = maxFlow(level, play.cut).total;
    if (through > 0) {
      return {
        won: false,
        readout: `${through} getting through`,
        title: 'The water still gets through.',
        detail: `${through} still reaches the sink, and you have spent ${spent}. `
          + 'Follow a route the water can still take and cut something on it.',
      };
    }
    if (spent === level.par) {
      return {
        won: true, perfect: true, score: spent,
        readout: 'nothing getting through',
        title: 'Perfect.',
        detail: `Stopped for ${spent}, and nothing cheaper can do it — because `
          + `${spent} is exactly what this network could carry. That is the theorem.`,
      };
    }
    return {
      won: true, perfect: false, score: spent,
      readout: 'nothing getting through',
      title: spent <= level.par + 2 ? 'So close!' : 'Stopped it.',
      detail: `Stopped for ${spent}, against ${level.par} — which is also what the `
        + 'network carried before you touched it. The two are always equal.',
    };
  },

  solutions: {
    count: (level) => level.cuts.length,
    show(level, play, i) {
      if (!play.mine) play.mine = new Set(play.cut);
      play.cut = new Set(level.cuts[i]);
      play.hinted = null;
      return `Cheapest cut ${i + 1} of ${level.cuts.length} — ${cost(level, play.cut)}, same as the rest`;
    },
    restore(level, play) {
      if (play.mine) { play.cut = play.mine; play.mine = null; }
    },
  },

  hint(level, play, tier) {
    const through = maxFlow(level, play.cut).total;
    const spent = cost(level, play.cut);
    if (tier === 1) {
      return {
        text: through === 0
          ? `Already stopped, for ${spent}; the cheapest possible is ${level.par}.`
          : `${through} still gets through, and you have spent ${spent} of a possible `
            + `${level.par}. Whatever you do, stopping it will cost at least ${level.par} — `
            + 'that is what the network carries.',
      };
    }
    if (tier === 2) {
      // A pipe in every cheapest cut gives away no branch at all: any best
      // answer contains it. Failing that, one from the nearest cheapest cut.
      const forced = level.forced.filter((i) => !play.cut.has(i));
      const pick = forced.length ? forced[0] : nearestCut(level, play).find((i) => !play.cut.has(i));
      if (pick === undefined) return { text: 'Every pipe of a cheapest cut is already cut.' };
      play.hinted = new Set([pick]);
      return {
        text: forced.length
          ? 'That pipe is in every cheapest cut — no best answer leaves it uncut.'
          : 'That pipe is in a cheapest cut close to what you have already done.',
      };
    }
    play.cut = new Set(nearestCut(level, play));
    play.hinted = null;
    return { text: `A cheapest cut, for ${cost(level, play.cut)}. Turn the water on and see.` };
  },
};

/** Whichever cheapest cut overlaps most with what the player has already cut. */
function nearestCut(level, play) {
  let best = level.cuts[0];
  let score = -1;
  for (const c of level.cuts) {
    const shared = c.filter((i) => play.cut.has(i)).length - 0.01 * c.length;
    if (shared > score) { score = shared; best = c; }
  }
  return best;
}
