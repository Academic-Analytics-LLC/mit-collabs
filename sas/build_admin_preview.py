"""
Admin Preview precompute — builds data/admin/admin_data.json for admin_preview.html
(the administrator-lens evaluation page, NOT in the shared nav — see HANDOFF.md).

Two phases so each fits the sandbox's ~45s shell cap:
  py build_admin_preview.py phase1   # AAD2024-2904 side (counts + matrix + roster + retention + whitespace)
  py build_admin_preview.py phase2   # International side (intl_full.parquet rollups), merges into same JSON

Data sources & conventions:
- data/counts_simple_v3.json — SAS-validated (16,747-work universe). Person rows carry
  rank/disc/college/units; within/across/inter are [workIdx, n] pairs; DISTINCT WORKS = list length.
  Person-level lists are person-centric any-overlap (by design — see DECISIONS.md).
- data/mit_faculty_roster.csv — 2026-07-15 FULL FACULTY ROSTER (MIT-only extract of the
  all-institution data/faculty_roster_base.csv, which is gitignored at 173MB). 1,482 distinct
  faculty incl. 212 with zero collaborations. This is the authoritative DENOMINATOR for all
  per-faculty rates and percentages; the collab set (1,270) is the numerator ("active
  collaborators"). All 1,270 collab persons verified present in the roster. Dept labels match
  counts labels except: roster adds "Global Studies and Languages Section" (zero collabs —
  included as a real row) and lacks the Koch Institute (not a roster Department; its per-faculty
  rates fall back to active-collaborator counts, flagged via faculty=None).
- matrix_viz.html embedded <script id="data"> — SAS-exact unit×unit cells (Department mode, 'all' cap).
- data/network/index.json — only for anchor-key lookup (deep links into network_viz.html).
- data/intl_full.parquet — international dataset (2018–2025). Partner Type rule copied from
  intl_details_table.html: NAICS == "Colleges, Universities, and Professional Schools" → Academic.

Department mode only (the admin preview's MVP scope). No counting logic here changes any
validated convention — everything is set-arithmetic over the already-validated work-index lists.
"""
import csv, json, math, sys, os
from collections import defaultdict, Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data", "admin")
OUT = os.path.join(OUT_DIR, "admin_data.json")
ACADEMIC_NAICS = "Colleges, Universities, and Professional Schools"
RANKS = ["Professor", "Associate Professor", "Assistant Professor", "Other ranks"]


def load_existing():
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save(obj):
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    print("wrote", OUT, os.path.getsize(OUT), "bytes")


def split_pipe(s):
    return [x.strip() for x in (s or "").split("|") if x.strip()]


def rank_bucket(r):
    r = (r or "").strip()
    if r == "Professor":
        return "Professor"
    if r.startswith("Associate"):
        return "Associate Professor"
    if r.startswith("Assistant"):
        return "Assistant Professor"
    return "Other ranks"


def load_roster():
    """Department-mode roster: dept label -> {pid: rankBucket}; also pid -> rankBucket and
    dept label -> college (from the roster's own College field)."""
    dept_pids = defaultdict(dict)
    pid_rank = {}
    dept_college = {}
    path = os.path.join(ROOT, "data", "mit_faculty_roster.csv")
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row["UnitType"] != "Department":
                continue
            rk = rank_bucket(row["Rank"])
            dept = row["Department"]
            pid = row["PersonId"]
            dept_pids[dept][pid] = rk
            pid_rank[pid] = rk
            if row.get("College"):
                dept_college.setdefault(dept, row["College"])
    return dept_pids, pid_rank, dept_college


def phase1():
    with open(os.path.join(ROOT, "data", "counts_simple_v3.json"), encoding="utf-8") as f:
        d = json.load(f)
    types, type_idx = d["types"], d["typeIdx"]
    interdisc = d["interdisc"]
    universe = len(type_idx)
    assert universe == 16747, f"unexpected universe {universe}"

    persons = d["person"]["Department"]
    depts = d["department"]["Department"]
    inst = d["institution"]["Department"][0]

    roster, pid_rank, roster_college = load_roster()
    faculty_total = len({pid for pids in roster.values() for pid in pids})

    # matrix embedded data (SAS-exact unit×unit, Department mode, all works)
    with open(os.path.join(ROOT, "matrix_viz.html"), encoding="utf-8") as f:
        h = f.read()
    i = h.find('<script id="data"')
    j = h.find(">", i)
    k = h.find("</script>", j)
    md = json.loads(h[j + 1:k])
    mdd = md["Department"]["all"]["department"]
    mlabels, mcells = mdd["labels"], mdd["cells"]
    pair_works = {}
    for a, b, arr in mcells:
        if a == b:
            continue
        key = (min(a, b), max(a, b))
        pair_works[key] = sum(arr)
    mlab_of = {i: lab for i, lab in enumerate(mlabels)}
    midx_of = {lab: i for i, lab in enumerate(mlabels)}

    # network anchor keys for deep links
    with open(os.path.join(ROOT, "data", "network", "index.json"), encoding="utf-8") as f:
        nidx = json.load(f)
    net_key = {}
    for a in nidx["anchors"]:
        if a.get("unit_kind") == "Department":
            net_key[a["label"]] = a["key"]

    # dept membership from person rows (Department mode) — the ACTIVE collaborators
    members = defaultdict(list)
    for p in persons:
        for u in split_pipe(p.get("units")):
            members[u].append(p)

    # collab-side dept labels + roster-only depts (zero-collab, e.g. Global Studies)
    all_dept_labels = [row["label"] for row in depts]
    roster_only = [lab for lab in roster if lab not in set(all_dept_labels)]

    def rank_engagement(lab, active_ps):
        """Per-rank engagement for a dept: roster headcount, % with any collab, % with cross-dept.
        Denominators from the roster (includes zero-collab faculty); rank from the roster."""
        pids_ranks = roster.get(lab, {})
        active_by_pid = {p["id"]: p for p in active_ps}
        out = []
        for rk in RANKS:
            fac = [pid for pid, r in pids_ranks.items() if r == rk]
            if not fac:
                continue
            n_any = sum(1 for pid in fac if pid in active_by_pid)
            n_acr = sum(1 for pid in fac if pid in active_by_pid and len(active_by_pid[pid]["across"]) > 0)
            out.append({
                "rank": rk, "faculty": len(fac),
                "pctAny": round(100 * n_any / len(fac), 1),
                "pctAcross": round(100 * n_acr / len(fac), 1),
            })
        return out

    dept_rows = []
    retention = {}
    disc_vec = {}
    for row in depts:
        lab = row["label"]
        mem = members.get(lab, [])
        fac_n = len(roster[lab]) if lab in roster else None  # None => not a roster Department (Koch)
        denom = fac_n or len(mem)  # per-faculty rates fall back to active count when no roster row
        w, a, x = set(t[0] for t in row["within"]), set(t[0] for t in row["across"]), set(t[0] for t in row["inter"])
        allw = w | a | x
        inter_pct = (sum(interdisc[wi] for wi in allw) / len(allw) * 100) if allw else 0.0
        partners = []
        mi = midx_of.get(lab)
        if mi is not None:
            for (p1, p2), n in pair_works.items():
                if mi in (p1, p2):
                    other = mlab_of[p2 if p1 == mi else p1]
                    partners.append([other, n])
            partners.sort(key=lambda t: -t[1])
        # retention: person-centric across sets; unique contribution = works only this member covers
        acr_sets = {p["id"]: set(t[0] for t in p["across"]) for p in mem}
        cover = Counter()
        for s in acr_sets.values():
            cover.update(s)
        ret = []
        for p in mem:
            s = acr_sets[p["id"]]
            uniq = sum(1 for wi in s if cover[wi] == 1)
            ret.append({
                "name": p["label"], "pid": p["id"], "rank": pid_rank.get(p["id"], rank_bucket(p.get("rank"))),
                "across": len(s), "inter": len(p["inter"]), "unique": uniq,
            })
        ret.sort(key=lambda r: (-r["unique"], -r["across"]))
        retention[lab] = ret[:8]
        dv = Counter()
        for p in mem:
            for disc in split_pipe(p.get("disc")):
                dv[disc] += 1
        disc_vec[lab] = dv

        dept_rows.append({
            "id": row["id"], "label": lab, "college": row.get("college"),
            "faculty": fac_n, "active": len(mem),
            "pctActive": round(100 * len(mem) / fac_n, 1) if fac_n else None,
            "within": len(w), "across": len(a), "inter": len(x),
            "acrossPerFaculty": round(len(a) / denom, 2) if denom else None,
            "interPerFaculty": round(len(x) / denom, 2) if denom else None,
            "interdiscPct": round(inter_pct, 1),
            "partners": partners[:8],
            "rankEngage": rank_engagement(lab, mem),
            "netKey": net_key.get(lab),
        })

    # roster-only departments (zero recorded collaborations) — real rows, that's the point
    for lab in sorted(roster_only):
        dept_rows.append({
            "id": None, "label": lab, "college": roster_college.get(lab),
            "faculty": len(roster[lab]), "active": 0, "pctActive": 0.0,
            "within": 0, "across": 0, "inter": 0,
            "acrossPerFaculty": 0.0, "interPerFaculty": 0.0, "interdiscPct": 0.0,
            "partners": [], "rankEngage": rank_engagement(lab, []),
            "netKey": None, "zeroCollab": True,
        })
        retention[lab] = []
        disc_vec[lab] = Counter()

    # rank lens (institution-wide) — ROSTER denominators; zero-collab faculty count as zeros
    def median(v):
        v = sorted(v)
        n = len(v)
        return None if not n else (v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2)
    all_pids_by_rank = defaultdict(set)
    for pids in roster.values():
        for pid, rk in pids.items():
            all_pids_by_rank[rk].add(pid)
    person_by_id = {p["id"]: p for p in persons}
    rank_lens = []
    for rk in RANKS:
        pids = all_pids_by_rank.get(rk, set())
        if not pids:
            continue
        acr = [len(person_by_id[pid]["across"]) if pid in person_by_id else 0 for pid in pids]
        itr = [len(person_by_id[pid]["inter"]) if pid in person_by_id else 0 for pid in pids]
        n_active = sum(1 for pid in pids if pid in person_by_id)
        rank_lens.append({
            "rank": rk, "n": len(pids),
            "pctActive": round(100 * n_active / len(pids), 1),
            "pctAcross": round(100 * sum(1 for v in acr if v > 0) / len(pids), 1),
            "medAcross": median(acr),
            "pctInter": round(100 * sum(1 for v in itr if v > 0) / len(pids), 1),
            "medInter": median(itr),
        })

    # white space: high discipline similarity, low actual collaboration (roster-size normalized)
    def cos(c1, c2):
        if not c1 or not c2:
            return 0.0
        dot = sum(v * c2.get(k, 0) for k, v in c1.items())
        n1 = math.sqrt(sum(v * v for v in c1.values()))
        n2 = math.sqrt(sum(v * v for v in c2.values()))
        return dot / (n1 * n2) if n1 and n2 else 0.0
    size_of = {r["label"]: (r["faculty"] or r["active"]) for r in dept_rows}
    labs = [r["label"] for r in dept_rows if size_of[r["label"]] >= 8 and disc_vec.get(r["label"])]
    row_of = {r["label"]: r for r in dept_rows}
    ws = []
    for ii in range(len(labs)):
        for jj in range(ii + 1, len(labs)):
            a_, b_ = labs[ii], labs[jj]
            sim = cos(disc_vec[a_], disc_vec[b_])
            if sim < 0.04:
                continue
            ma, mb = midx_of.get(a_), midx_of.get(b_)
            actual = pair_works.get((min(ma, mb), max(ma, mb)), 0) if ma is not None and mb is not None else 0
            sa, sb = size_of[a_], size_of[b_]
            norm = actual / math.sqrt(sa * sb)
            score = sim / (1.0 + norm)
            shared = [k for k, _ in sorted(
                ((k, min(disc_vec[a_][k], disc_vec[b_].get(k, 0))) for k in disc_vec[a_] if k in disc_vec[b_]),
                key=lambda t: -t[1]) if disc_vec[b_].get(k)][:5]
            ra, rb = row_of[a_], row_of[b_]
            ws.append({
                "a": a_, "b": b_, "collegeA": ra["college"], "collegeB": rb["college"],
                "facultyA": sa, "facultyB": sb,
                "sim": round(sim, 3), "actual": actual, "score": round(score, 4),
                "sharedDisc": shared,
                "keyA": ra["netKey"], "keyB": rb["netKey"],
            })
    ws.sort(key=lambda r: -r["score"])
    ws = ws[:30]

    # exec summary numbers — roster-aware
    cross_unit = set()
    for row in depts:
        cross_unit.update(t[0] for t in row["across"])
    inst_w = set(t[0] for t in inst["within"])
    inst_x = set(t[0] for t in inst["inter"])
    eligible = [r for r in dept_rows if (r["faculty"] or 0) >= 10]
    top_conn = sorted(eligible, key=lambda r: -(r["acrossPerFaculty"] or 0))[:5]
    low_conn = sorted(eligible, key=lambda r: (r["acrossPerFaculty"] or 0))[:5]
    summary = {
        "universe": universe,
        "scholars": len(persons),
        "facultyTotal": faculty_total,
        "pctFacultyActive": round(100 * len(persons) / faculty_total, 1),
        "internalWorks": len(inst_w),
        "externalWorks": len(inst_x),
        "crossUnitWorks": len(cross_unit),
        "interdiscPct": round(100 * sum(interdisc) / universe, 1),
        "typeMix": dict(Counter(types[t] for t in type_idx).most_common()),
        "topConnected": [[r["label"], r["acrossPerFaculty"], r["faculty"]] for r in top_conn],
        "leastConnected": [[r["label"], r["acrossPerFaculty"], r["faculty"]] for r in low_conn],
        "deptCount": len(dept_rows),
    }

    out = load_existing()
    out["generated"] = "phase1+roster"
    out["summary"] = summary
    out["departments"] = sorted(dept_rows, key=lambda r: r["label"])
    out["rankLens"] = rank_lens
    out["whitespace"] = ws
    out["retention"] = retention
    save(out)
    # sanity oracles
    phys = next(r for r in out["departments"] if r["label"] == "Physics, Department of")
    print("ORACLE Physics within/across:", phys["within"], phys["across"], "(expect 948 192)")
    print("ROSTER Physics faculty/active:", phys["faculty"], phys["active"], "(expect 115 / <=115)")
    print("ROSTER total faculty:", faculty_total, "(expect 1482) | pct active:", summary["pctFacultyActive"])
    gs = next((r for r in out["departments"] if "Global Studies" in r["label"]), None)
    print("ZERO-COLLAB dept row:", gs["label"] if gs else "MISSING", "| faculty:", gs and gs["faculty"])


def phase2():
    import pandas as pd
    cols = ["DOI", "PersonId", "UnitName", "UnitType", "CollabInstName", "Country", "NAICS_Name", "Year"]
    df = pd.read_parquet(os.path.join(ROOT, "data", "intl_full.parquet"), columns=cols)
    df["Year"] = df["Year"].astype(str)

    total_works = df["DOI"].nunique()
    total_scholars = df["PersonId"].nunique()
    total_partners = df["CollabInstName"].nunique()
    years = sorted(y for y in df["Year"].unique() if y.isdigit())

    cw = df.drop_duplicates(["Country", "DOI"]).groupby("Country").size()
    cs = df.drop_duplicates(["Country", "PersonId"]).groupby("Country").size()
    cy = df.drop_duplicates(["Country", "Year", "DOI"]).groupby(["Country", "Year"]).size()
    countries = []
    for country, works in cw.sort_values(ascending=False).items():
        by_year = {y: int(cy.get((country, y), 0)) for y in years}
        countries.append({
            "country": country, "works": int(works),
            "scholars": int(cs.get(country, 0)), "byYear": by_year,
        })

    df["ptype"] = (df["NAICS_Name"] == ACADEMIC_NAICS).map({True: "Academic", False: "Non-Academic"})
    pt = df.drop_duplicates(["ptype", "DOI"]).groupby("ptype").size()
    pt_inst = df.groupby("ptype")["CollabInstName"].nunique()
    na = df[df["ptype"] == "Non-Academic"]
    top_naics = na.drop_duplicates(["NAICS_Name", "DOI"]).groupby("NAICS_Name").size().sort_values(ascending=False)[:12]
    top_na_inst = na.drop_duplicates(["CollabInstName", "DOI"]).groupby("CollabInstName").size().sort_values(ascending=False)[:15]
    na_inst_country = na.drop_duplicates("CollabInstName").set_index("CollabInstName")["Country"].to_dict()

    dd = df[df["UnitType"] == "Department"]
    per_dept = {}
    for unit, g in dd.groupby("UnitName"):
        cu = g.drop_duplicates(["Country", "DOI"]).groupby("Country").size().sort_values(ascending=False)
        per_dept[unit] = {
            "works": int(g["DOI"].nunique()),
            "partners": int(g["CollabInstName"].nunique()),
            "countries": int(g["Country"].nunique()),
            "topCountries": [[c, int(n)] for c, n in cu[:6].items()],
        }

    yw = df.drop_duplicates(["Year", "DOI"]).groupby("Year").size()
    by_year_total = {y: int(yw.get(y, 0)) for y in years}

    out = load_existing()
    out["generated"] = (out.get("generated") or "") + "+phase2"
    out["intl"] = {
        "totalWorks": int(total_works), "totalScholars": int(total_scholars),
        "totalPartners": int(total_partners), "years": years, "byYearTotal": by_year_total,
        "countries": countries,
        "partnerType": {
            "worksAcademic": int(pt.get("Academic", 0)), "worksNonAcademic": int(pt.get("Non-Academic", 0)),
            "instAcademic": int(pt_inst.get("Academic", 0)), "instNonAcademic": int(pt_inst.get("Non-Academic", 0)),
            "topNaics": [[k, int(v)] for k, v in top_naics.items()],
            "topNonAcademic": [[k, int(v), na_inst_country.get(k, "")] for k, v in top_na_inst.items()],
        },
        "perDept": per_dept,
    }
    save(out)
    print("intl countries:", len(countries), "| total intl works:", total_works)


if __name__ == "__main__":
    phase = sys.argv[1] if len(sys.argv) > 1 else "phase1"
    {"phase1": phase1, "phase2": phase2}[phase]()
