#!/usr/bin/env python3
"""Extract playable level data from the LooPindex catalog.

Reads reference/LooPindex/docs/multiloops/ and emits:
    web/data/index.json        level list + metadata, for the level picker
    web/data/levels/<id>.json  per-level geometry + answers, loaded on demand

Each level's rope comes from clean.svg (polyline corners + segments, one colour
per strand). Pin sockets come from labels_numeric.svg (a region number at a
point). The answer sets come from the level's .html page; buildWebCatalog.py
builds both the SVG labels and the table's region sets from the same
numericRegionLabels dict, so the numbering agrees.

LooPindex is GPL-3.0 (Christopher-Lloyd Simon and Ben Stucky); output derived
from it inherits that licence.
"""

import html
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import arrangement

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "reference" / "LooPindex" / "docs" / "multiloops"
OUT = ROOT / "web" / "data"

# --- SVG parsing -----------------------------------------------------------

RE_CIRCLE = re.compile(
    r'<circle cx="([-\d.eE]+)" cy="([-\d.eE]+)" r="[-\d.eE]+" '
    r'stroke="(#[0-9a-fA-F]{6})"'
)
RE_LINE = re.compile(
    r'<line x1="([-\d.eE]+)" y1="([-\d.eE]+)" x2="([-\d.eE]+)" y2="([-\d.eE]+)" '
    r'stroke="(#[0-9a-fA-F]{6})"'
)
RE_TEXT = re.compile(r'<text x="([-\d.eE]+)" y="([-\d.eE]+)"[^>]*>(\d+)</text>')
RE_VIEWBOX = re.compile(
    r'viewBox="([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+)"'
)


def key(x, y):
    """Coordinate key. The catalog emits floats with rounding noise, so snap."""
    return (round(x, 3), round(y, 3))


def parse_clean_svg(path):
    """Return (viewBox, strands) where each strand is a closed list of points.

    Segments are grouped by stroke colour (one colour per strand), then walked
    into a cycle. Crossings are mid-segment intersections, not shared corners,
    so within a colour every corner has degree 2.
    """
    text = path.read_text()

    vb = RE_VIEWBOX.search(text)
    if not vb:
        raise ValueError(f"{path}: no viewBox")
    view_box = [float(g) for g in vb.groups()]

    by_colour = defaultdict(list)
    for x1, y1, x2, y2, colour in RE_LINE.findall(text):
        by_colour[colour].append((key(float(x1), float(y1)),
                                  key(float(x2), float(y2))))

    strands = []
    for colour in sorted(by_colour):
        segments = by_colour[colour]
        adj = defaultdict(list)
        for a, b in segments:
            adj[a].append(b)
            adj[b].append(a)

        bad = [p for p, nbrs in adj.items() if len(nbrs) != 2]
        if bad:
            raise ValueError(
                f"{path}: colour {colour} has {len(bad)} corner(s) of degree "
                f"!= 2 — not a simple closed polyline"
            )

        start = min(adj)
        cycle = [start]
        prev, cur = None, start
        while True:
            nxt = next(p for p in adj[cur] if p != prev)
            if nxt == start:
                break
            cycle.append(nxt)
            prev, cur = cur, nxt

        if len(cycle) != len(adj):
            raise ValueError(
                f"{path}: colour {colour} walks {len(cycle)} of {len(adj)} "
                f"corners — disconnected"
            )
        strands.append([[x, y] for x, y in cycle])

    return view_box, strands


def parse_labels_svg(path):
    """Return [{n, x, y}] — the region number and its raw label anchor."""
    text = path.read_text()
    labels = [
        {"n": int(n), "x": float(x), "y": float(y)}
        for x, y, n in RE_TEXT.findall(text)
    ]
    labels.sort(key=lambda s: s["n"])
    return labels


def face_anchor(polygon, outer):
    """The vertex the catalog anchors this region's label to.

    saveLoop.py:522-546 picks the leftmost boundary vertex, breaking ties by
    topmost — except for the infinite region, which breaks ties by bottommost.
    """
    if outer:
        return min(polygon, key=lambda p: (round(p[0], 3), -round(p[1], 3)))
    return min(polygon, key=lambda p: (round(p[0], 3), round(p[1], 3)))


def match_labels_to_faces(labels, faces, tol_x=0.3, tol_y=1.5):
    """Map each region number to a face index.

    Every label sits at its face's anchor plus one constant offset (a buffer
    plus the font ascent, both fixed per drawing), so recover that offset by
    fitting rather than assuming it. The x offset is exact; the SVG rounds
    label y to whole pixels, so fit y by median and allow a pixel of slack.
    """
    anchors = [face_anchor(f["polygon"], f["outer"]) for f in faces]

    pairs = [
        (lab["x"] - ax, lab["y"] - ay)
        for lab in labels for ax, ay in anchors
        if 0 < lab["x"] - ax < 60 and 0 < lab["y"] - ay < 90
    ]
    if not pairs:
        raise ValueError("no plausible label offset found")

    votes = defaultdict(list)
    for dx, dy in pairs:
        votes[round(dx, 2)].append(dy)
    odx = max(votes, key=lambda k: len(votes[k]))
    if len(votes[odx]) < len(labels):
        raise ValueError(
            f"x offset {odx} explains only {len(votes[odx])} of {len(labels)} labels"
        )
    ys = sorted(votes[odx])
    ody = ys[len(ys) // 2]

    mapping = {}
    used = set()
    for lab in labels:
        cands = [
            i for i, (ax, ay) in enumerate(anchors)
            if i not in used
            and abs(lab["x"] - ax - odx) < tol_x
            and abs(lab["y"] - ay - ody) < tol_y
        ]
        if len(cands) != 1:
            raise ValueError(
                f"region {lab['n']} matched {len(cands)} unused faces at the "
                f"fitted offset ({odx:.2f}, {ody:.2f})"
            )
        mapping[lab["n"]] = cands[0]
        used.add(cands[0])
    return mapping


def build_sockets(labels, strands, regions):
    """Match each region number to a face of the arrangement.

    Returns (sockets, view_box). Interior regions get a polygon for hit-testing
    and highlighting plus a centred pin position; the outer region gets no
    polygon — the app treats "inside no polygon" as the outer region — and a
    pin position parked in the margin.
    """
    faces, crossings = arrangement.build(strands)
    if len(faces) != regions:
        raise ValueError(f"arrangement has {len(faces)} faces, expected {regions}")
    if crossings != regions - 2:
        raise ValueError(
            f"{crossings} crossings, expected {regions - 2} for {regions} regions"
        )

    mapping = match_labels_to_faces(labels, faces)
    outer_face = next(f for f in faces if f["outer"])

    xs = [p[0] for p in outer_face["polygon"]]
    ys = [p[1] for p in outer_face["polygon"]]
    pad = 46.0
    view_box = [
        min(xs) - pad, min(ys) - pad,
        (max(xs) - min(xs)) + 2 * pad, (max(ys) - min(ys)) + 2 * pad,
    ]

    sockets = []
    for lab in labels:
        face = faces[mapping[lab["n"]]]
        if face["outer"]:
            # No polygon: the app treats "inside none of the others" as this
            # region. Park its pin marker in the margin.
            sockets.append({
                "n": lab["n"], "outer": True, "polygon": None,
                "x": round(min(xs) - pad / 2, 2),
                "y": round(min(ys) - pad / 2, 2),
            })
        else:
            px, py = arrangement.interior_point(face["polygon"])
            sockets.append({
                "n": lab["n"], "outer": False, "polygon": face["polygon"],
                "x": round(px, 2), "y": round(py, 2),
            })

    sockets.sort(key=lambda s: s["n"])
    degrees = {lab["n"]: faces[mapping[lab["n"]]]["degree"] for lab in labels}
    return sockets, view_box, crossings, degrees


# --- HTML parsing ----------------------------------------------------------

# Single-strand pages say "loop", multi-strand pages say "multiloop".
RE_PIN_NUMBER = re.compile(r"Pinning number of this (?:multi)?loop:\s*(\d+)")
RE_TOTAL = re.compile(r"Total number of pinning sets:\s*(\d+)")
RE_OPTIMAL = re.compile(r"of which optimal:\s*(\d+)")
RE_MINIMAL = re.compile(r"of which minimal:\s*(\d+)")
RE_PD = re.compile(
    r"PD code \(use to draw this (?:multi)?loop with SnapPy\):\s*(\[\[.*?\]\])"
)
RE_PLANTRI = re.compile(r"Plantri embedding:\s*(\[\[.*?\]\])")
RE_DEGSEQ = re.compile(r"Region degree sequence:\s*(\[[\d,\s]*\])")
RE_MULTISIMPLE = re.compile(r'Is multisimple:.*?>(Yes|No)<', re.S)
RE_ROW = re.compile(r"<tr>(.*?)</tr>", re.S)
RE_CELL = re.compile(r'<td[^>]*>(.*?)</td>', re.S)


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def parse_level_html(path):
    text = path.read_text()

    def need(rx, what):
        m = rx.search(text)
        if not m:
            raise ValueError(f"{path}: could not find {what}")
        return m.group(1)

    pinning_number = int(need(RE_PIN_NUMBER, "pinning number"))

    # The refined table lists every minimal pinning set: label, colour,
    # regions, cardinality, degree sequence, mean degree.
    optimal, minimal, set_degrees = [], [], []
    for row in RE_ROW.findall(text):
        cells = [strip_tags(c) for c in RE_CELL.findall(row)]
        if len(cells) != 6:
            continue
        label, _colour, regions, _card, degrees, _mean = cells
        m = re.fullmatch(r"\{([\d,\s]*)\}", regions)
        if not m:
            continue
        rs = sorted(int(v) for v in m.group(1).split(",") if v.strip())
        set_degrees.append((rs, json.loads(degrees)))
        if "(optimal)" in label:
            optimal.append(rs)
        elif "(minimal)" in label:
            minimal.append(rs)

    if not optimal:
        raise ValueError(f"{path}: no optimal pinning sets parsed")
    for rs in optimal:
        if len(rs) != pinning_number:
            raise ValueError(
                f"{path}: optimal set {rs} has {len(rs)} pins but pinning "
                f"number is {pinning_number}"
            )

    ms = RE_MULTISIMPLE.search(text)
    return {
        "_setDegrees": set_degrees,
        "pinningNumber": pinning_number,
        "totalPinningSets": int(need(RE_TOTAL, "total pinning sets")),
        "optimalSets": sorted(optimal),
        "minimalSets": sorted(minimal),
        "pdCode": json.loads(need(RE_PD, "PD code")),
        "plantri": json.loads(need(RE_PLANTRI, "plantri embedding")),
        "regionDegrees": json.loads(need(RE_DEGSEQ, "region degree sequence")),
        "multisimple": (ms.group(1) == "Yes") if ms else None,
    }


# --- driver ----------------------------------------------------------------

RE_ID = re.compile(r"^(\d+)\^(\d+)_(\d+)$")


def main():
    if not CATALOG.is_dir():
        sys.exit(f"catalog not found at {CATALOG} — clone LooPindex first")

    pages = sorted(p for p in CATALOG.glob("*.html") if RE_ID.match(p.stem))
    if not pages:
        sys.exit(f"no level pages matched in {CATALOG}")

    levels, failures = [], []
    (OUT / "levels").mkdir(parents=True, exist_ok=True)

    for page in pages:
        lid = page.stem
        regions, strands_count, index = (int(g) for g in RE_ID.match(lid).groups())
        assets = CATALOG / lid
        try:
            _svg_box, strands = parse_clean_svg(assets / "clean.svg")
            labels = parse_labels_svg(assets / "labels_numeric.svg")
            answers = parse_level_html(page)

            if len(labels) != regions:
                raise ValueError(
                    f"{lid}: {len(labels)} labels but id claims {regions} regions"
                )
            sockets, view_box, crossings, degrees = build_sockets(
                labels, strands, regions
            )

            # Independent check on the region numbering: compare the geometry's
            # own region degrees against the ones the catalog published, both
            # overall and per pinning set. This validates the label matching
            # without relying on it.
            if sorted(degrees.values()) != sorted(answers["regionDegrees"]):
                raise ValueError(
                    f"region degrees {sorted(degrees.values())} != published "
                    f"{sorted(answers['regionDegrees'])}"
                )
            for rs, published in answers["_setDegrees"]:
                mine = sorted(degrees[r] for r in rs)
                if mine != sorted(published):
                    raise ValueError(
                        f"degrees for pinning set {rs}: computed {mine} != "
                        f"published {sorted(published)}"
                    )
            answers.pop("_setDegrees")

            if len(strands) != strands_count:
                raise ValueError(
                    f"{lid}: {len(strands)} strands but id claims {strands_count}"
                )
            socket_ids = {s["n"] for s in sockets}
            for rs in answers["optimalSets"] + answers["minimalSets"]:
                missing = set(rs) - socket_ids
                if missing:
                    raise ValueError(f"{lid}: answer references unknown regions {missing}")

            # The catalog pins on the sphere. The game is a rope on a flat
            # table, i.e. the plane, and a homotopy in R^2 minus P is the same
            # as one in S^2 minus (P and the point at infinity). So the outer
            # region comes pre-pinned, and the real generators are the
            # catalog's with that region dropped, re-reduced to the minimal
            # ones.
            outer_n = next(s["n"] for s in sockets if s["outer"])
            reduced = {
                frozenset(g) - {outer_n}
                for g in answers["optimalSets"] + answers["minimalSets"]
            }
            generators = sorted(
                (sorted(g) for g in reduced
                 if not any(h < g for h in reduced)),
                key=lambda g: (len(g), g),
            )
            effective_min = min(len(g) for g in generators)

            level = {
                "id": lid,
                "outerRegion": outer_n,
                "generators": generators,
                "effectiveMinimum": effective_min,
                "regions": regions,
                "strands": strands_count,
                "index": index,
                "viewBox": view_box,
                "crossings": crossings,
                "rope": strands,
                "sockets": sockets,
                **answers,
            }
            (OUT / "levels" / f"{lid}.json").write_text(
                json.dumps(level, separators=(",", ":"))
            )
            levels.append({
                "id": lid,
                "regions": regions,
                "strands": strands_count,
                "index": index,
                "pinningNumber": answers["pinningNumber"],
                "effectiveMinimum": effective_min,
                "generatorCount": len(generators),
                "optimalCount": len(answers["optimalSets"]),
                "minimalCount": len(answers["minimalSets"]),
                "totalPinningSets": answers["totalPinningSets"],
                "multisimple": answers["multisimple"],
            })
        except Exception as exc:  # noqa: BLE001 — report and keep going
            failures.append(f"{lid}: {exc}")

    levels.sort(key=lambda l: (l["regions"], l["strands"], l["index"]))
    (OUT / "index.json").write_text(json.dumps({
        "source": "LooPindex by Christopher-Lloyd Simon and Ben Stucky (GPL-3.0)",
        "sourceUrl": "https://github.com/ChristopherLloyd/LooPindex",
        "count": len(levels),
        "levels": levels,
    }, separators=(",", ":")))

    print(f"extracted {len(levels)} levels -> {OUT}")
    if failures:
        print(f"\n{len(failures)} failed:")
        for f in failures[:25]:
            print("  " + f)
        if len(failures) > 25:
            print(f"  ... and {len(failures) - 25} more")


if __name__ == "__main__":
    main()
