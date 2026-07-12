"""
Build step (Counts Simple v3 - work-grain, full parity rebuild): reads details_base.csv
ONCE and reproduces the EXACT data shape counts_simple.html's client JS expects (verified
by reading the live JS: passWork/calcCat/computeRow/render), so the page can be re-pointed
at this SAS-derived output with zero filter loss (Work Type, max-co-authors cap, Interdisc.
toggle, Person-level + Discipline drill all keep working client-side, no server round trip).

Output shape (matches the live <script id="data"> blob exactly):
  {
    "types": [str, ...],                 # distinct CollaborationType values
    "typeIdx": [int, ...],               # per work (index i = work), index into types
    "nAuthors": [int, ...],              # per work, total distinct people (MIT + external)
    "interdisc": [0|1, ...],             # per work, see ASSUMPTION note below
    "department": {"Department": [row,...], "Program": [row,...]},
    "college":    {"Department": [row,...], "Program": [row,...]},
    "person":     {"Department": [row,...], "Program": [row,...]},
    "institution":{"Department": [row], "Program": [row]},
  }
  row = {"id":str, "label":str, "rank":str|None, "disc":str|None,
         "within":[[workIdx,pairs],...], "across":[...], "inter":[...]}

Formulas for department/college/institution (same as counts_simple_sas_check.sas /
build_counts_simple_v2.py, now kept per-work instead of collapsed to a grand total):
  m = distinct MIT people on a work whose unit-set (this unit_kind) includes key k
  mit_total = distinct MIT people on that work with ANY qualifying unit_kind affiliation
  n_ext = distinct external people on that work
  within_pairs=C(m,2) (m>=2) | across_pairs=m*(mit_total-m) (mit_total>m) | inter_pairs=m*n_ext (n_ext>0)
  An (workIdx,pairs) entry is only added to an entity's array when its flag is true - same
  as the live data (a work absent from "across" means it didn't qualify, not that it's 0).

Person-level (NEW - the original counts_simple_sas_check.sas never covered this; the old
prototype's exact per-person formula is unknown since build_counts_simple3.py isn't
available in this sandbox/repo). Implemented using the SAME "MIN(rel) any-overlap-wins"
convention already validated project-wide (see network_viz.html's pair-grain validation,
DECISIONS.md's "MIN(rel) any-overlap-wins collapse everywhere"): per focal person + work,
every OTHER person they co-authored with is deduped to one relationship via the row-level
Relationship/Collab_Dir columns (min(Within Unit=0, Across Units=1, External/Across
Institutions=2) if seen via more than one of the focal person's own affiliation rows), then
within/across/inter "pairs" = count of distinct co-authors landing in that bucket for that
work (not a combinatorial C(m,2) - there's no C(m,2) at person grain, a person just has N
individual co-author relationships per work). FLAG THIS FOR USER SIGN-OFF - it is a
reasoned reconstruction, not verified against the old page's numbers bit-for-bit.

ASSUMPTIONS needing user sign-off (undocumented in the old pipeline, inferred from the
live page's JS + data shape only - not validated against any oracle):
  - nAuthors[wid] = (distinct MIT people on the work, any unit type) + (distinct external
    people on the work) - i.e. total author headcount, unit-kind-independent.
  - interdisc[wid] = 1 if the qualifying MIT people on that work span more than one
    distinct Discipline string value, else 0.
  - person "rank" = the Rank column's first-seen value for that person (their faculty title).

Resumable/chunked (single shell calls capped ~45s here): PACK_BUDGET env var (seconds),
checkpoints to build_counts_simple_v3.checkpoint.pkl, resumes via byte offset.
"""
import csv, json, os, pickle, time
from collections import defaultdict

csv.field_size_limit(10**8)

SRC = "details_base.csv"
OUT = "../data/counts_simple_v3.json"
CHECKPOINT = "build_counts_simple_v3.checkpoint.pkl"
TIME_BUDGET = float(os.environ.get("PACK_BUDGET", "999999"))

DEPT_TYPES = {"Department", "Medical", "Clinical"}
PROG_TYPES = {"Program", "Medical", "Clinical"}
ALL_TYPES = DEPT_TYPES | PROG_TYPES
REL_CODE = {"Within Unit": 0, "Across Units": 1, "Across Institutions": 2}


def _dd_set():
    return defaultdict(set)


def _dd_dd_int():
    return defaultdict(lambda_free_dict_int)


def lambda_free_dict_int():
    return defaultdict(int)


def new_state():
    return {
        "ext_by_work": defaultdict(set),          # wid -> set(ext pid)
        "any_mit_by_work": defaultdict(set),      # wid -> set(focal pid), unconditional
        "disc_by_work": defaultdict(set),         # wid -> set(Discipline str), unconditional
        "type_by_work": {},                       # wid -> CollaborationType (first seen)
        "mit_by_work": {"Department": defaultdict(set), "Program": defaultdict(set)},
        "unit_member": {"Department": defaultdict(_dd_set), "Program": defaultdict(_dd_set)},
        "unit_label": {"Department": {}, "Program": {}},
        "college_member": {"Department": defaultdict(_dd_set), "Program": defaultdict(_dd_set)},
        # person-level accumulators
        "person_name": {},                        # pid -> name
        "person_rank": {},                        # pid -> rank (first non-empty seen)
        "person_kinds": defaultdict(set),         # pid -> set(unit_kind) they qualify under
        "person_disc": {"Department": defaultdict(set), "Program": defaultdict(set)},
        "person_rel": defaultdict(_dd_dd_int),     # pid -> wid -> cpid -> min_rel_code
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
    mit_by_work = state["mit_by_work"]
    unit_member = state["unit_member"]
    unit_label = state["unit_label"]
    college_member = state["college_member"]
    person_name = state["person_name"]
    person_rank = state["person_rank"]
    person_kinds = state["person_kinds"]
    person_disc = state["person_disc"]
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

                any_mit_by_work[wid].add(pid)
                if disc:
                    disc_by_work[wid].add(disc)
                if wid not in type_by_work and ctype:
                    type_by_work[wid] = ctype
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
                    if uid:
                        unit_member["Department"][uid][wid].add(pid)
                        unit_label["Department"][uid] = dept
                    if college:
                        college_member["Department"][college][wid].add(pid)
                if ut in PROG_TYPES:
                    mit_by_work["Program"][wid].add(pid)
                    person_kinds[pid].add("Program")
                    if disc:
                        person_disc["Program"][pid].add(disc)
                    if uid:
                        unit_member["Program"][uid][wid].add(pid)
                        unit_label["Program"][uid] = dept
                    if college:
                        college_member["Program"][college][wid].add(pid)

                # person-level relationship (MIN(rel) any-overlap-wins per (pid,wid,cpid))
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

    # ---- assign stable integer index to every work id ----
    work_ids = sorted(any_mit_by_work.keys())
    work_index = {wid: i for i, wid in enumerate(work_ids)}
    nW = len(work_ids)

    types_list = sorted({t for t in type_by_work.values() if t})
    type_to_idx = {t: i for i, t in enumerate(types_list)}
    typeIdx = [0] * nW
    nAuthors = [0] * nW
    interdisc = [0] * nW
    for wid, i in work_index.items():
        typeIdx[i] = type_to_idx.get(type_by_work.get(wid, ""), 0)
        nAuthors[i] = len(any_mit_by_work.get(wid, ())) + len(ext_by_work.get(wid, ()))
        interdisc[i] = 1 if len(disc_by_work.get(wid, ())) > 1 else 0

    def rollup_group(member_dict, label_dict, mit_total_by_work):
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
            out.append({"id": key, "label": label, "rank": None, "disc": None,
                        "within": within, "across": across, "inter": inter})
        return out

    result = {"department": {"Department": [], "Program": []},
              "college": {"Department": [], "Program": []},
              "person": {"Department": [], "Program": []},
              "institution": {"Department": [], "Program": []}}

    for unit_kind in ("Department", "Program"):
        mit_total_by_work = {wid: len(s) for wid, s in mit_by_work[unit_kind].items()}
        result["department"][unit_kind] = rollup_group(unit_member[unit_kind], unit_label[unit_kind], mit_total_by_work)
        college_label = {k: k for k in college_member[unit_kind]}
        result["college"][unit_kind] = rollup_group(college_member[unit_kind], college_label, mit_total_by_work)

        # person-level: within/across/inter derived from MIN(rel)-deduped person_rel
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
            prows.append({"id": pid, "label": person_name.get(pid, pid),
                          "rank": person_rank.get(pid), "disc": " | ".join(sorted(disc_set)) or None,
                          "within": within, "across": across, "inter": inter})
        result["person"][unit_kind] = prows

    # institution level - unit-kind independent (across always empty), duplicated into both modes
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
              "inter_works", len(r["inter"]),
              "within_collabs", sum(x[1] for x in r["within"]), "across_collabs", sum(x[1] for x in r["across"]))
    inst = result["institution"]["Department"][0]
    print("MIT institution: within_works", len(inst["within"]), "inter_works", len(inst["inter"]),
          "all_works(within|inter union)", len(set(x[0] for x in inst["within"]) | set(x[0] for x in inst["inter"])))

    try:
        if os.path.exists(CHECKPOINT):
            os.remove(CHECKPOINT)
    except Exception as e:
        print(f"(non-fatal: could not remove checkpoint: {e})")
    print(f"done ({time.time()-t0:.1f}s this call).")


if __name__ == "__main__":
    main()
