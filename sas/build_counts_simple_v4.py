"""
Build step (Counts Simple v4 - adds College/Unit(s)/Year/Title/Detail so counts_simple.html
can offer full Details-page filter parity). Extends v3 (see build_counts_simple_v3.py's
docstring for the base within/across/inter/intra/all formulas and the two flagged
ASSUMPTIONS about nAuthors/interdisc, both still true here unchanged) with:

  - Top-level per-work arrays (parallel to the existing typeIdx/nAuthors/interdisc, same
    index space): "years" (str|None), "titles" (str), "details" (str) - first-seen value
    per Collab_ID, same convention as type_by_work in v3.
  - Department/college rows: new "college" field (str|None) - the College this UnitId (or,
    for the college level itself, this college name) belongs to. Institution rows: no
    college (there's nothing above institution).
  - Person rows: new "college" field (str|None, " | "-joined if a person spans colleges -
    same convention as the existing "disc" field) and new "units" field (str|None,
    " | "-joined unit LABELS this person is affiliated with, for that unit_kind) - lets
    counts_simple.html filter Person-level rows by Select Unit(s), which v3 couldn't do
    (only Department-level rows were already keyed by unit).

Output shape: identical to v3 plus the additions above - existing fields/values are
byte-for-byte the same computation, just re-run end to end (a full rebuild, not a patch),
so this file replaces v3 as the sole build script going forward. data/counts_simple_v3.json
(filename kept as-is - it's already the live site's embedded blob name, no reason to churn
docs/handoff references over an internal version bump) is the output target either way.

Resumable/chunked (single shell calls capped ~45s here): PACK_BUDGET env var (seconds),
checkpoints to build_counts_simple_v4.checkpoint.pkl (a NEW filename, deliberately - v3's
old checkpoint has an incompatible state shape and would KeyError if resumed here).
"""
import csv, json, os, pickle, time
from collections import defaultdict

csv.field_size_limit(10**8)

SRC = "details_base.csv"
OUT = "../data/counts_simple_v3.json"
CHECKPOINT = "build_counts_simple_v4.checkpoint.pkl"
TIME_BUDGET = float(os.environ.get("PACK_BUDGET", "999999"))

DEPT_TYPES = {"Department", "Medical", "Clinical"}
PROG_TYPES = {"Program", "Medical", "Clinical"}
REL_CODE = {"Within Unit": 0, "Across Units": 1, "Across Institutions": 2}


def _dd_set():
    return defaultdict(set)


def _dd_dd_int():
    return defaultdict(_dict_int)


def _dict_int():
    return defaultdict(int)


def new_state():
    return {
        "ext_by_work": defaultdict(set),
        "any_mit_by_work": defaultdict(set),
        "disc_by_work": defaultdict(set),
        "type_by_work": {},
        "year_by_work": {},
        "title_by_work": {},
        "detail_by_work": {},
        "mit_by_work": {"Department": defaultdict(set), "Program": defaultdict(set)},
        "unit_member": {"Department": defaultdict(_dd_set), "Program": defaultdict(_dd_set)},
        "unit_label": {"Department": {}, "Program": {}},
        "unit_college": {"Department": {}, "Program": {}},
        "college_member": {"Department": defaultdict(_dd_set), "Program": defaultdict(_dd_set)},
        "person_name": {},
        "person_rank": {},
        "person_kinds": defaultdict(set),
        "person_disc": {"Department": defaultdict(set), "Program": defaultdict(set)},
        "person_college": {"Department": defaultdict(set), "Program": defaultdict(set)},
        "person_units": {"Department": defaultdict(set), "Program": defaultdict(set)},
        "person_rel": defaultdict(_dd_dd_int),
        "n_done": 0,
        "byte_off": None,
        "header": None,
    }


def main():
    t0 = time.time()
    if os.path.exists(CHECKPOINT):
        with open(CHECKPOINT, "rb") as f:
            state = pickle.load(f)
        print(f"resuming from checkpoint: {state['n_done']:,} rows already processed, byte_off={state['byte_off']}")
    else:
        state = new_state()

    ext_by_work = state["ext_by_work"]
    any_mit_by_work = state["any_mit_by_work"]
    disc_by_work = state["disc_by_work"]
    type_by_work = state["type_by_work"]
    year_by_work = state["year_by_work"]
    title_by_work = state["title_by_work"]
    detail_by_work = state["detail_by_work"]
    mit_by_work = state["mit_by_work"]
    unit_member = state["unit_member"]
    unit_label = state["unit_label"]
    unit_college = state["unit_college"]
    college_member = state["college_member"]
    person_name = state["person_name"]
    person_rank = state["person_rank"]
    person_kinds = state["person_kinds"]
    person_disc = state["person_disc"]
    person_college = state["person_college"]
    person_units = state["person_units"]
    person_rel = state["person_rel"]
    n_done = state["n_done"]
    byte_off = state["byte_off"]
    header = state["header"]

    with open(SRC, encoding="latin-1", newline="") as f:
        if byte_off is None:
            header_line = f.readline()
            header = next(csv.reader([header_line]))
            byte_off = f.tell()
        else:
            f.seek(byte_off)
        idx = {c: i for i, c in enumerate(header)}

        finished = False
        n_this_call = 0
        while True:
            line = f.readline()
            if not line:
                finished = True
                break
            row = next(csv.reader([line]))
            byte_off = f.tell()

            if len(row) >= len(header):
                wid = row[idx["Collab_ID"]]
                pid = row[idx["PersonId"]]
                pname = row[idx["PersonName"]]
                ut = row[idx["UnitType"]]
                uid = row[idx["UnitId"]]
                dept = row[idx["Department"]]
                college = row[idx["College"]]
                disc = row[idx["Discipline"]]
                cdir = row[idx["Collab_Dir"]]
                cpid = row[idx["Collab_PersonID"]]
                rel = row[idx["Relationship"]]
                rank = row[idx["Rank"]]
                ctype = row[idx["CollaborationType"]]
                year = row[idx["Year"]]
                title = row[idx["Collab_Title"]]
                detail = row[idx["Collab_Detail"]]

                any_mit_by_work[wid].add(pid)
                if disc:
                    disc_by_work[wid].add(disc)
                if wid not in type_by_work and ctype:
                    type_by_work[wid] = ctype
                if wid not in year_by_work and year:
                    year_by_work[wid] = year
                if wid not in title_by_work and title:
                    title_by_work[wid] = title
                if wid not in detail_by_work and detail:
                    detail_by_work[wid] = detail
                if pid not in person_name:
                    person_name[pid] = pname
                if rank and pid not in person_rank:
                    person_rank[pid] = rank

                if cdir == "External":
                    ext_by_work[wid].add(cpid)

                if ut in DEPT_TYPES:
                    mit_by_work["Department"][wid].add(pid)
                    person_kinds[pid].add("Department")
                    if disc:
                        person_disc["Department"][pid].add(disc)
                    if college:
                        person_college["Department"][pid].add(college)
                    if dept:
                        person_units["Department"][pid].add(dept)
                    if uid:
                        unit_member["Department"][uid][wid].add(pid)
                        unit_label["Department"][uid] = dept
                        if college and uid not in unit_college["Department"]:
                            unit_college["Department"][uid] = college
                    if college:
                        college_member["Department"][college][wid].add(pid)
                if ut in PROG_TYPES:
                    mit_by_work["Program"][wid].add(pid)
                    person_kinds[pid].add("Program")
                    if disc:
                        person_disc["Program"][pid].add(disc)
                    if college:
                        person_college["Program"][pid].add(college)
                    if dept:
                        person_units["Program"][pid].add(dept)
                    if uid:
                        unit_member["Program"][uid][wid].add(pid)
                        unit_label["Program"][uid] = dept
                        if college and uid not in unit_college["Program"]:
                            unit_college["Program"][uid] = college
                    if college:
                        college_member["Program"][college][wid].add(pid)

                rc = REL_CODE.get(rel, 2)
                bucket = person_rel[pid][wid]
                prev = bucket.get(cpid)
                if prev is None or rc < prev:
                    bucket[cpid] = rc

            n_done += 1
            n_this_call += 1
            if n_this_call % 250000 == 0:
                print(f"  ...{n_done:,} rows done total ({time.time()-t0:.0f}s this call)", flush=True)
            if time.time() - t0 > TIME_BUDGET:
                break

    if not finished:
        state.update({"n_done": n_done, "byte_off": byte_off, "header": header})
        tmp = CHECKPOINT + ".tmp"
        with open(tmp, "wb") as fh:
            pickle.dump(state, fh, protocol=4)
        os.replace(tmp, CHECKPOINT)
        print(f"time budget hit - checkpointed at {n_done:,} rows ({time.time()-t0:.1f}s this call). Re-run to continue.")
        return

    print(f"scanned {n_done:,} rows total ({time.time()-t0:.1f}s this call) - computing work index + rollups...")

    work_ids = sorted(any_mit_by_work.keys())
    work_index = {wid: i for i, wid in enumerate(work_ids)}
    nW = len(work_ids)

    types_list = sorted({t for t in type_by_work.values() if t})
    type_to_idx = {t: i for i, t in enumerate(types_list)}
    typeIdx = [0] * nW
    nAuthors = [0] * nW
    interdisc = [0] * nW
    years = [None] * nW
    titles = [""] * nW
    details = [""] * nW
    for wid, i in work_index.items():
        typeIdx[i] = type_to_idx.get(type_by_work.get(wid, ""), 0)
        nAuthors[i] = len(any_mit_by_work.get(wid, ())) + len(ext_by_work.get(wid, ()))
        interdisc[i] = 1 if len(disc_by_work.get(wid, ())) > 1 else 0
        years[i] = year_by_work.get(wid)
        titles[i] = title_by_work.get(wid, "")
        details[i] = detail_by_work.get(wid, "")

    def rollup_group(member_dict, label_dict, mit_total_by_work, college_dict=None):
        out = []
        for key, per_work in member_dict.items():
            label = label_dict.get(key, key)
            within, across, inter = [], [], []
            for wid, pidset in per_work.items():
                if wid not in work_index:
                    continue
                wi = work_index[wid]
                m = len(pidset)
                mit_total = mit_total_by_work.get(wid, m)
                n_ext = len(ext_by_work.get(wid, ()))
                if m >= 2:
                    within.append([wi, m * (m - 1) // 2])
                if mit_total > m:
                    across.append([wi, m * (mit_total - m)])
                if n_ext > 0:
                    inter.append([wi, m * n_ext])
            row = {"id": key, "label": label, "rank": None, "disc": None,
                   "within": within, "across": across, "inter": inter}
            if college_dict is not None:
                row["college"] = college_dict.get(key)
            out.append(row)
        return out

    result = {"department": {"Department": [], "Program": []},
              "college": {"Department": [], "Program": []},
              "person": {"Department": [], "Program": []},
              "institution": {"Department": [], "Program": []}}

    for unit_kind in ("Department", "Program"):
        mit_total_by_work = {wid: len(s) for wid, s in mit_by_work[unit_kind].items()}
        result["department"][unit_kind] = rollup_group(
            unit_member[unit_kind], unit_label[unit_kind], mit_total_by_work,
            college_dict=unit_college[unit_kind])
        college_label = {k: k for k in college_member[unit_kind]}
        college_self = {k: k for k in college_member[unit_kind]}  # college rows' own "college" = themselves
        result["college"][unit_kind] = rollup_group(
            college_member[unit_kind], college_label, mit_total_by_work, college_dict=college_self)

        prows = []
        for pid, kinds in person_kinds.items():
            if unit_kind not in kinds:
                continue
            within, across, inter = [], [], []
            for wid, cpid_map in person_rel.get(pid, {}).items():
                if wid not in work_index:
                    continue
                wi = work_index[wid]
                cw = ca = ci = 0
                for cpid, rc in cpid_map.items():
                    if rc == 0:
                        cw += 1
                    elif rc == 1:
                        ca += 1
                    else:
                        ci += 1
                if cw:
                    within.append([wi, cw])
                if ca:
                    across.append([wi, ca])
                if ci:
                    inter.append([wi, ci])
            disc_set = person_disc[unit_kind].get(pid, set())
            college_set = person_college[unit_kind].get(pid, set())
            units_set = person_units[unit_kind].get(pid, set())
            prows.append({"id": pid, "label": person_name.get(pid, pid),
                          "rank": person_rank.get(pid), "disc": " | ".join(sorted(disc_set)) or None,
                          "college": " | ".join(sorted(college_set)) or None,
                          "units": " | ".join(sorted(units_set)) or None,
                          "within": within, "across": across, "inter": inter})
        result["person"][unit_kind] = prows

    inst_within, inst_inter = [], []
    for wid, pidset in any_mit_by_work.items():
        if wid not in work_index:
            continue
        wi = work_index[wid]
        m = len(pidset)
        n_ext = len(ext_by_work.get(wid, ()))
        if m >= 2:
            inst_within.append([wi, m * (m - 1) // 2])
        if n_ext > 0:
            inst_inter.append([wi, m * n_ext])
    inst_row = {"id": "123", "label": "Massachusetts Institute of Technology", "rank": None, "disc": None,
                "within": inst_within, "across": [], "inter": inst_inter}
    result["institution"]["Department"] = [inst_row]
    result["institution"]["Program"] = [dict(inst_row)]

    payload = {"types": types_list, "typeIdx": typeIdx, "nAuthors": nAuthors, "interdisc": interdisc,
               "years": years, "titles": titles, "details": details,
               "department": result["department"], "college": result["college"],
               "person": result["person"], "institution": result["institution"]}

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as o:
        json.dump(payload, o, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)

    print(f"wrote {OUT} - {nW} works, {len(types_list)} types")
    print(f"Department: {len(result['department']['Department'])} depts, {len(result['college']['Department'])} colleges, {len(result['person']['Department'])} people")
    print(f"Program: {len(result['department']['Program'])} progs, {len(result['college']['Program'])} colleges, {len(result['person']['Program'])} people")

    phys = [r for r in result["department"]["Department"] if r["id"] == "8950"]
    if phys:
        r = phys[0]
        print("Physics (8950) spot-check: within_works", len(r["within"]), "across_works", len(r["across"]),
              "inter_works", len(r["inter"]), "college", r.get("college"),
              "within_collabs", sum(x[1] for x in r["within"]), "across_collabs", sum(x[1] for x in r["across"]))
    inst = result["institution"]["Department"][0]
    print("MIT institution: within_works", len(inst["within"]), "inter_works", len(inst["inter"]),
          "all_works(within|inter union)", len(set(x[0] for x in inst["within"]) | set(x[0] for x in inst["inter"])))
    n_years = sum(1 for y in years if y)
    print(f"years populated for {n_years}/{nW} works; sample titles non-empty: {sum(1 for t in titles if t)}/{nW}")

    try:
        if os.path.exists(CHECKPOINT):
            os.remove(CHECKPOINT)
    except Exception as e:
        print(f"(non-fatal: could not remove checkpoint: {e})")
    print(f"done ({time.time()-t0:.1f}s this call).")


if __name__ == "__main__":
    main()
