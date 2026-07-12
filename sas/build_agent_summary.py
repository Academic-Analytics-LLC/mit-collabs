"""Build a compact grounding dataset for the natural-language agent widget.

Produces data/agent/summary.json: per (department/college/institution) x (Department/Program
unit_kind), the same within/across/inter/intra/all WORKS counts as counts_simple (distinct-works,
honest, non-portal-matching for "across"), PLUS total co-authorship instances ("collaborations",
with multiplicity), PLUS each unit's top partner units (from matrix() Option-B overlap, off-
diagonal), PLUS a glossary of terms/caveats so the LLM answers using the site's own definitions
instead of guessing. Deliberately small (~hundreds of KB) so it can be sent whole as grounding
context to the Worker's Claude call -- no need for a live query backend.

Run from MITCollabs: py build_agent_summary.py
"""
import json, collab
from collections import defaultdict

db = collab.load(".")
_keys = collab._keys
TYPES_ALL = collab.TYPES_ALL


def unit_rows(level, unit_kind):
    """within/across/inter/intra/all as DISTINCT WORKS (sets) + total co-authorship instances
    ("collabs", pair-count with multiplicity) for every entity at this level."""
    W_in = defaultdict(set); W_ac = defaultdict(set); W_it = defaultdict(set)
    C_in = defaultdict(int); C_ac = defaultdict(int); C_it = defaultdict(int)
    lab = {}
    for wid, w in db["works"].items():
        mem = db["bywork"].get(wid, [])
        keyed = defaultdict(set)
        pkeys = {}
        n_ext = 0
        for m in mem:
            if m["is_mit"] != "1":
                n_ext += 1
                continue
            pid = m["person_id"]
            ks = _keys(db, pid, level, unit_kind)
            pkeys[pid] = ks
            for k in ks:
                keyed[k].add(pid)
                if level == "department":
                    lab[k] = db["uname"].get(k, k)
                elif level == "institution":
                    lab[k] = m["institution"]
                else:
                    lab[k] = k
        mit_total = len(pkeys)
        for k, members in keyed.items():
            m = len(members)
            if m >= 2:
                W_in[k].add(wid); C_in[k] += m * (m - 1) // 2
            other = mit_total - m
            if other > 0:
                W_ac[k].add(wid); C_ac[k] += m * other
            if n_ext > 0:
                W_it[k].add(wid); C_it[k] += m * n_ext
    allkeys = set(W_in) | set(W_ac) | set(W_it)
    rows = []
    for k in allkeys:
        wi, ac, it = W_in[k], W_ac[k], W_it[k]
        rows.append({
            "id": str(k), "label": lab.get(k, k),
            "works": {"within": len(wi), "across": len(ac), "inter": len(it),
                      "intra": len(wi | ac), "all": len(wi | ac | it)},
            "collabs": {"within": C_in[k], "across": C_ac[k], "inter": C_it[k]},
        })
    rows.sort(key=lambda r: -r["works"]["all"])
    return rows


def top_partners(level, unit_kind, n=8):
    """Off-diagonal Option-B overlap counts from matrix(), top N per unit by shared works."""
    M = collab.matrix(db, level=level, unit_kind=unit_kind, internal_only=True)
    lab = {u: l for u, l, _ in M["order"]}
    by_unit = defaultdict(list)
    for c in M["cells"]:
        if c["self"]:
            continue
        by_unit[c["a"]].append({"label": c["b_label"], "works": c["works"]})
        by_unit[c["b"]].append({"label": c["a_label"], "works": c["works"]})
    out = {}
    for u, lst in by_unit.items():
        lst.sort(key=lambda x: -x["works"])
        out[u] = lst[:n]
    return out


GLOSSARY = {
    "within": "Works with 2+ authors from the SAME unit (e.g. two Physics faculty on one paper). This is the anchored 'within-unit' number that matches the portal exactly.",
    "across": "Works with an author from this unit AND an author from a DIFFERENT MIT unit. NOTE: this site's 'across' is a true DISTINCT-WORKS count. The portal's own across_units.csv download sums a shared work once per partner department, so it is typically higher than this number (e.g. Physics: portal partner-summed=231 vs distinct=192 here) -- both are correct at their own grain, just don't compare them directly without noting this.",
    "inter": "Works with an author from this unit AND at least one author from OUTSIDE MIT entirely (a different institution).",
    "intra": "within + across combined (any MIT-internal collaboration), de-duplicated to distinct works.",
    "all": "within + across + inter combined (every collaborative work touching this unit), de-duplicated to distinct works. This is NOT a simple sum of within+across+inter since a work can appear in multiple categories.",
    "works_vs_collabs": "'works' = distinct papers/grants/etc (never double-count a shared paper). 'collabs' (collaborations) = total co-authorship PAIR instances with multiplicity -- e.g. a single paper with 3 MIT co-authors from the same unit contributes 3 'within' collaboration instances (3 choose 2) but only 1 'within' work.",
    "unit_kind": "Department vs Program are two parallel, NEVER-mixed ways of grouping MIT people (most faculty belong to both a department and a program in the source data) -- Medical units are always included regardless of which is picked.",
    "scope_caveat": "Institution-level 'across' is always 0 by definition (there is no unit 'above' the whole institution to be 'across' from) -- this is expected, not a bug.",
    "work_universe": "There are two slightly different total work counts in play across this project's data pipelines: 16,738 (prototype extract) vs 16,747 (SAS extract). A small number of departments (mainly EECS, IMES) show tiny (1-2 work) variances traceable to this, not to a real data bug.",
    "medical_naming": "The word 'Clinical' is intentionally never used in this site's UI; the correct unit-type label is 'Medical'. 'Clinical Trial' is a valid work TYPE (a kind of collaborative output), which is different and does appear.",
    "institution": "MIT institutionid is 123 internally but should never be printed in UI text or answers -- just call it MIT or 'the institution'.",
    "project_code": "This dataset's release is AAD2024-2904 (call it exactly that, no 'project' prefix, if asked).",
}

payload = {"glossary": GLOSSARY, "levels": {}}
for level in ("department", "college", "institution"):
    payload["levels"][level] = {}
    for uk in ("Department", "Program"):
        rows = unit_rows(level, uk)
        if level in ("department", "college"):
            tp = top_partners(level, uk)
            for r in rows:
                r["top_partners"] = tp.get(r["id"], [])
        payload["levels"][level][uk] = rows

blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
print(f"JSON size: {len(blob)/1e3:.1f} KB")

ph = next((r for r in payload["levels"]["department"]["Department"] if "Physics, Department" in r["label"]), None)
if ph:
    print("Physics ->", ph["works"], ph["collabs"], "top partner:", ph["top_partners"][0] if ph["top_partners"] else None)

with open("summary.json", "w", encoding="utf-8") as f:
    f.write(blob)
print("wrote summary.json")
