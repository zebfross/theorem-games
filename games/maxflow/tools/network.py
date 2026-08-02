"""Flow networks: the max flow, the cheapest cut, and the ties between them.

Pipes are undirected — water goes either way, which is what a player expects of
a pipe and costs nothing to model, since an undirected pipe of capacity c is
just two opposed arcs of capacity c each.

The whole game rests on one equality. The most water the network can carry from
source to sink is exactly the cost of the cheapest set of pipes that separates
them (Menger, Ford and Fulkerson). So the par for "stop the flow as cheaply as
you can" is the max flow, and the player is discovering the theorem by playing
it rather than being told it.

Everything here is polynomial, so unlike Unpinning nothing has to be looked up
from a catalogue: levels can be generated at any size and the answers computed.
"""

import collections

INF = float('inf')


class Network:
    """An undirected capacitated graph with a source and a sink."""

    def __init__(self, n, edges, source, sink):
        self.n = n
        self.edges = [tuple(e) for e in edges]      # (u, v, capacity)
        self.source = source
        self.sink = sink

    # --- flow --------------------------------------------------------------

    def _residual(self, skip=()):
        """Adjacency of arcs as [to, capacity, index of the reverse arc].

        Each pipe becomes two arcs facing opposite ways, both at full capacity.
        That is the standard reading of an undirected pipe and it does not
        double anything: flow one way cancels flow the other.
        """
        adj = [[] for _ in range(self.n)]
        gone = set(skip)
        for i, (u, v, c) in enumerate(self.edges):
            if i in gone:
                continue
            adj[u].append([v, c, len(adj[v])])
            adj[v].append([u, c, len(adj[u]) - 1])
        return adj

    def max_flow(self, skip=()):
        """Most water the network carries with those pipes cut.

        Edmonds-Karp: shortest augmenting path each round, which is plenty for
        graphs of this size and, unlike plain Ford-Fulkerson, cannot be talked
        into taking exponentially many rounds.
        """
        adj = self._residual(skip)
        s, t = self.source, self.sink
        if s == t:
            return 0
        total = 0
        while True:
            prev = [None] * self.n
            prev[s] = (-1, -1)
            q = collections.deque([s])
            while q and prev[t] is None:
                u = q.popleft()
                for k, arc in enumerate(adj[u]):
                    v, cap, _rev = arc
                    if cap > 0 and prev[v] is None:
                        prev[v] = (u, k)
                        q.append(v)
            if prev[t] is None:
                return total
            # smallest capacity along the path found
            push = INF
            v = t
            while v != s:
                u, k = prev[v]
                push = min(push, adj[u][k][1])
                v = u
            v = t
            while v != s:
                u, k = prev[v]
                adj[u][k][1] -= push
                adj[v][adj[u][k][2]][1] += push
                v = u
            total += push

    # --- cuts --------------------------------------------------------------

    def reaches(self, skip=()):
        """Nodes the water can still get to with those pipes cut."""
        adj = [[] for _ in range(self.n)]
        gone = set(skip)
        for i, (u, v, _c) in enumerate(self.edges):
            if i in gone:
                continue
            adj[u].append(v)
            adj[v].append(u)
        seen = {self.source}
        q = collections.deque([self.source])
        while q:
            u = q.popleft()
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    q.append(v)
        return seen

    def separates(self, cut):
        """Does cutting these pipes stop the water reaching the sink?"""
        return self.sink not in self.reaches(cut)

    def cost(self, cut):
        return sum(self.edges[i][2] for i in cut)

    def _cut_from_side(self, side):
        return sorted(i for i, (u, v, _c) in enumerate(self.edges)
                      if (u in side) != (v in side))

    def min_cuts(self):
        """The two canonical cheapest cuts, as sorted lists of pipe indices.

        A minimum cut is a way of splitting the nodes so that source and sink
        fall apart; the pipes crossing the split are the ones paid for. There
        can be many, but two are always well defined: the one hugging the
        source, and the one hugging the sink. They coincide when the cheapest
        cut is unique, which is why the caller deduplicates.
        """
        adj = self._residual()
        s, t = self.source, self.sink
        # saturate the network first; what is left unreachable in the residual
        # is exactly the source side of a cheapest cut
        while True:
            prev = [None] * self.n
            prev[s] = (-1, -1)
            q = collections.deque([s])
            while q and prev[t] is None:
                u = q.popleft()
                for k, (v, cap, _r) in enumerate(adj[u]):
                    if cap > 0 and prev[v] is None:
                        prev[v] = (u, k)
                        q.append(v)
            if prev[t] is None:
                break
            push = INF
            v = t
            while v != s:
                u, k = prev[v]
                push = min(push, adj[u][k][1])
                v = u
            v = t
            while v != s:
                u, k = prev[v]
                adj[u][k][1] -= push
                adj[v][adj[u][k][2]][1] += push
                v = u

        near_source = set()
        q = collections.deque([s])
        near_source.add(s)
        while q:
            u = q.popleft()
            for v, cap, _r in adj[u]:
                if cap > 0 and v not in near_source:
                    near_source.add(v)
                    q.append(v)

        # and the sink side: nodes that can still reach t through residual arcs
        back = [[] for _ in range(self.n)]
        for u in range(self.n):
            for v, cap, _r in adj[u]:
                if cap > 0:
                    back[v].append(u)
        near_sink = {t}
        q = collections.deque([t])
        while q:
            u = q.popleft()
            for v in back[u]:
                if v not in near_sink:
                    near_sink.add(v)
                    q.append(v)

        cuts = [self._cut_from_side(near_source),
                self._cut_from_side(set(range(self.n)) - near_sink)]
        out = []
        for c in cuts:
            if c not in out:
                out.append(c)
        return out

    def all_min_cuts(self, limit=12):
        """Every cheapest cut, up to a limit, so the player can be shown ties.

        Brute force over closed sets would be exponential; this walks the
        subsets of the nodes that are undecided — the ones lying strictly
        between the source-hugging and sink-hugging cuts — which is where all
        the freedom is and is usually tiny.
        """
        value = self.max_flow()
        canon = self.min_cuts()
        # nodes fixed to the source side by the tightest cut, and to the sink
        # side by the loosest; anything else may go either way
        fixed_s = self._side_of(canon[0])
        fixed_t = set(range(self.n)) - self._side_of(canon[-1])
        loose = [x for x in range(self.n) if x not in fixed_s and x not in fixed_t]
        if len(loose) > 16:
            return canon
        found = []
        for mask in range(1 << len(loose)):
            side = set(fixed_s)
            for b, node in enumerate(loose):
                if mask >> b & 1:
                    side.add(node)
            cut = self._cut_from_side(side)
            if self.cost(cut) == value and cut not in found:
                found.append(cut)
                if len(found) >= limit:
                    break
        return found or canon

    def _side_of(self, cut):
        """The nodes still reachable from the source once this cut is made."""
        return self.reaches(cut)
