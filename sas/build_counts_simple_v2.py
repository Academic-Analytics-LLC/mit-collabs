"""
Build step (Counts Simple v2): reads details_base.csv ONCE and computes the same
Works/Collaborations rollups as sas/counts_simple_sas_check.sas (SAS not available in
this sandbox, so this is a Python re-implementation of the identical formulas), per
(unit_kind, level, id) for all 5 scopes (within/across/inter/intra/all).

Formulas (mirrors counts_simple_sas_check.sas exactly):
  m         = distinct MIT people on a work whose unit-set (for this unit_kind) includes key k
  mit_total = distinct MIT people on that work with ANY qualifying unit_kind affiliation
              (computed once per work, shared across every group k for that unit_kind -
              NOT restricted to k; this is what makes "across" work)
  n_ext     = distinct external (Collab_Dir='External') people on that work (unit_kind-independent)
  within pairs = C(m,2)              works: m>=2
  across pairs = m*(mit_total-m)     works: mit_total>m
  inter  pairs = m*n_ext             works: n_ext>0
  intra = within OR across; all = intra OR inter

Department mode filters UnitType in (Department,Medical,Clinical); Program mode filters
(Program,Medical,Clinical) - Medical/Clinical always included in both, matching the
project's "3 unit types, Clinical is a data value not UI text" rule. Institution level is
unit-kind-independent (across always 0) and is duplicated into both mode's output, same
as the SAS script.

Resumable/chunked (single shell calls are capped ~45s here, this is a ~2.8M row / 1.6GB
file): pass PACK_BUDGET (seconds, env var) to stop after that long, pickling state to
build_counts_simple_v2.checkpoint.pkl; re-run the same command to resume via byte offset
(same pattern as build_details_table.py).
"""
import csv, json, os, pickle, time
from collections import defaultdict


def _dd_set():
    return defaultdict(set)

csv.field_size_limit(10**8)

SRC = "details_base.csv"
OUT = "../data/counts_simple_v2.json"
CHECKPOINT = "build_counts_simple_v2.checkpoint.pkl"
TIME_BUDGET = float(os.environ.get("PACK_BUDGET", "999999"))

DEPT_TYPES = {"Department", "Medical", "Clinical"}
PROG_TYPES = {"Program", "Medical", "Clinical"}
ALL_TYPES = DEPT_TYPES | PROG_TYPES


def new_state():
    return {
        "ext_by_work": defaultdict(set),
        "mit_by_work": {"Department": defaultdict(set), "Program": defaultdict(set)},
        "unit_member": {"Department": defaultdict(_dd_set),
                         "Program": defaultdict(_dd_set)},
        "unit_label": {"Department": {}, "Program": {}},
        "college_member": {"Department": defaultdict(_dd_set),
                            "Program": defaultdict(_dd_set)},
        "inst_by_work": defaultdict(set),
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
    mit_by_work = state["mit_by_work"]
    unit_member = state["unit_member"]
    unit_label = state["unit_label"]
    college_member = state["college_member"]
    inst_by_work = state["inst_by_work"]
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
                ut = row[idx["UnitType"]]
                uid = row[idx["UnitId"]]
                dept = row[idx["Department"]]
                college = row[idx["College"]]
                cdir = row[idx["Collab_Dir"]]
                cpid = row[idx["Collab_PersonID"]]

                if cdir == "External":
                    ext_by_work[wid].add(cpid)

                if ut in DEPT_TYPES:
                    mit_by_work["Department"][wid].add(pid)
                    if uid:
                        unit_member["Department"][uid][wid].add(pid)
                        unit_label["Department"][uid] = dept
                    if college:
                        college_member["Department"][college][wid].add(pid)
                if ut in PROG_TYPES:
                    mit_by_work["Program"][wid].add(pid)
                    if uid:
                        unit_member["Program"][uid][wid].add(pid)
                        unit_label["Program"][uid] = dept
                    if college:
                        college_member["Program"][college][wid].add(pid)
                if ut in ALL_TYPES:
                    inst_by_work[wid].add(pid)

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

    print(f"scanned {n_done:,} rows total ({time.time()-t0:.1f}s this call) - computing rollups...")

    def rollup_group(member_dict, label_dict, mit_total_by_work, level):
        out = []
        for key, per_work in member_dict.items():
            label = label_dict.get(key, key)
            ww = aw = iw = intraw = allw = 0
            wc = ac = ic = 0
            for wid, pidset in per_work.items():
                m = len(pidset)
                mit_total = mit_total_by_work.get(wid, m)
                n_ext = len(ext_by_work.get(wid, ()))
                wpairs = m * (m - 1) // 2
                apairs = m * (mit_total - m)
                ipairs = m * n_ext
                fw = m >= 2
                fa = mit_total > m
                fi = n_ext > 0
                fintra = fw or fa
                fall = fintra or fi
                ww += fw; aw += fa; iw += fi; intraw += fintra; allw += fall
                wc += wpairs; ac += apairs; ic += ipairs
            out.append({
                "id": key, "label": label, "level": level,
                "within_works": ww, "across_works": aw, "inter_works": iw,
                "intra_works": intraw, "all_works": allw,
                "within_collabs": wc, "across_collabs": ac, "inter_collabs": ic,
            })
        return out

    result = {"Department": [], "Program": []}
    for unit_kind in ("Department", "Program"):
        mit_total_by_work = {wid: len(s) for wid, s in mit_by_work[unit_kind].items()}
        result[unit_kind].extend(rollup_group(unit_member[unit_kind], unit_label[unit_kind], mit_total_by_work, "department"))
        college_label = {k: k for k in college_member[unit_kind]}
        result[unit_kind].extend(rollup_group(college_member[unit_kind], college_label, mit_total_by_work, "college"))

    # institution level - unit-kind independent, across always 0, duplicated into both modes
    inst_mit_total = {wid: len(s) for wid, s in inst_by_work.items()}
    ww = iw = 0
    wc = ic = 0
    for wid, pidset in inst_by_work.items():
        m = len(pidset)
        n_ext = len(ext_by_work.get(wid, ()))
        wpairs = m * (m - 1) // 2
        ipairs = m * n_ext
        fw = m >= 2
        fi = n_ext > 0
        ww += fw; iw += fi
        wc += wpairs; ic += ipairs
    inst_row_template = {
        "id": "123", "label": "Massachusetts Institute of Technology", "level": "institution",
        "within_works": ww, "across_works": 0, "inter_works": iw,
        "intra_works": ww, "all_works": len({wid for wid, s in inst_by_work.items() if len(s) >= 2 or len(ext_by_work.get(wid, ())) > 0}),
        "within_collabs": wc, "across_collabs": 0, "inter_collabs": ic,
    }
    result["Department"].append(dict(inst_row_template))
    result["Program"].append(dict(inst_row_template))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as o:
        json.dump({"generated_from": "details_base.csv", "n_rows": n_done, "rollups": result}, o,
                   ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)

    print(f"wrote {OUT} - Department groups: {len(result['Department'])}, Program groups: {len(result['Program'])}")
    phys = [r for r in result["Department"] if r["level"] == "department" and r["id"] == "8950"]
    if phys:
        print("Physics (8950) spot-check:", phys[0])
    inst = [r for r in result["Department"] if r["level"] == "institution"]
    if inst:
        print("MIT institution row:", inst[0])

    if os.path.exists(CHECKPOINT):
        os.remove(CHECKPOINT)
    print(f"done ({time.time()-t0:.1f}s this call).")


if __name__ == "__main__":
    main()
