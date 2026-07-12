"""
Mechanical reshape ONLY - no counting/classification logic lives here (that's all in
build_counts_simple_export.sas). Takes the 6 CSVs that SAS script produces and pivots
them into the nested JSON shape counts_simple.html's client JS expects, assigning a
compact 0..N-1 work index (a JS-array-size optimization, not a data decision) along
the way.

Run this AFTER running build_counts_simple_export.sas in a real SAS environment and
placing its 6 output CSVs next to this script (same folder, default names below).

Usage:  python3 reshape_counts_simple_export.py
Output: ../data/counts_simple_v3.json (same target counts_simple.html already reads;
        re-run the patch step / just re-run this then re-patch the HTML same as before)
"""
import csv, json, os
from collections import defaultdict

IN_DIR = "."
OUT = "../data/counts_simple_v3.json"

WORK_META = "counts_export_work_meta.csv"
ENTITY_META = "counts_export_entity_meta.csv"
ENTITY_PAIRS = "counts_export_entity_pairs.csv"
PERSON_META = "counts_export_person_meta.csv"
PERSON_DISC = "counts_export_person_disc.csv"
PERSON_PAIRS = "counts_export_person_pairs.csv"


def read_csv(name):
    path = os.path.join(IN_DIR, name)
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def main():
    work_meta_rows = read_csv(WORK_META)
    work_ids = sorted({r["wid"] for r in work_meta_rows})
    work_index = {wid: i for i, wid in enumerate(work_ids)}
    nW = len(work_ids)

    types_list = sorted({r["work_type"] for r in work_meta_rows if r.get("work_type")})
    type_to_idx = {t: i for i, t in enumerate(types_list)}

    typeIdx = [0] * nW
    nAuthors = [0] * nW
    interdisc = [0] * nW
    for r in work_meta_rows:
        i = work_index[r["wid"]]
        typeIdx[i] = type_to_idx.get(r.get("work_type", ""), 0)
        nAuthors[i] = int(float(r["nAuthors"])) if r.get("nAuthors") not in (None, "") else 0
        interdisc[i] = int(float(r["interdisc"])) if r.get("interdisc") not in (None, "") else 0

    # entity (department/college/institution) metadata: (unit_kind, level, id) -> label
    entity_label = {}
    entity_order = defaultdict(list)  # (unit_kind, level) -> [id, ...] in first-seen order
    for r in read_csv(ENTITY_META):
        key = (r["unit_kind"], r["level"], r["id"])
        entity_label[key] = r["label"]
        entity_order[(r["unit_kind"], r["level"])].append(r["id"])

    # entity pairs: (unit_kind, level, id) -> category -> [[workIdx,pairs], ...]
    entity_pairs = defaultdict(lambda: {"within": [], "across": [], "inter": []})
    for r in read_csv(ENTITY_PAIRS):
        wid = r["wid"]
        if wid not in work_index:
            continue
        key = (r["unit_kind"], r["level"], r["id"])
        entity_pairs[key][r["category"]].append([work_index[wid], int(float(r["pairs"]))])

    def build_rows(unit_kind, level):
        out = []
        for eid in entity_order.get((unit_kind, level), []):
            key = (unit_kind, level, eid)
            cats = entity_pairs.get(key, {"within": [], "across": [], "inter": []})
            out.append({"id": eid, "label": entity_label.get(key, eid), "rank": None, "disc": None,
                        "within": cats["within"], "across": cats["across"], "inter": cats["inter"]})
        return out

    result_department = {"Department": build_rows("Department", "department"),
                          "Program": build_rows("Program", "department")}
    result_college = {"Department": build_rows("Department", "college"),
                       "Program": build_rows("Program", "college")}
    result_institution = {"Department": build_rows("Department", "institution"),
                           "Program": build_rows("Program", "institution")}

    # person metadata + discipline join (" | ") + pairs
    person_label = {}
    person_rank = {}
    person_order = defaultdict(list)
    for r in read_csv(PERSON_META):
        key = (r["unit_kind"], r["id"])
        person_label[key] = r["label"]
        person_rank[key] = r.get("rank") or None
        person_order[r["unit_kind"]].append(r["id"])

    person_disc = defaultdict(set)
    for r in read_csv(PERSON_DISC):
        person_disc[(r["unit_kind"], r["pid"])].add(r["discipline"])

    person_pairs = defaultdict(lambda: {"within": [], "across": [], "inter": []})
    for r in read_csv(PERSON_PAIRS):
        wid = r["wid"]
        if wid not in work_index:
            continue
        key = (r["unit_kind"], r["id"])
        person_pairs[key][r["category"]].append([work_index[wid], int(float(r["pairs"]))])

    def build_person_rows(unit_kind):
        out = []
        for pid in person_order.get(unit_kind, []):
            key = (unit_kind, pid)
            cats = person_pairs.get(key, {"within": [], "across": [], "inter": []})
            disc_set = person_disc.get(key, set())
            out.append({"id": pid, "label": person_label.get(key, pid),
                        "rank": person_rank.get(key), "disc": " | ".join(sorted(disc_set)) or None,
                        "within": cats["within"], "across": cats["across"], "inter": cats["inter"]})
        return out

    result_person = {"Department": build_person_rows("Department"), "Program": build_person_rows("Program")}

    payload = {"types": types_list, "typeIdx": typeIdx, "nAuthors": nAuthors, "interdisc": interdisc,
               "department": result_department, "college": result_college,
               "person": result_person, "institution": result_institution}

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as o:
        json.dump(payload, o, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    print(f"wrote {OUT} - {nW} works, {len(types_list)} types")
    print(f"Department: {len(result_department['Department'])} depts, "
          f"{len(result_college['Department'])} colleges, {len(result_person['Department'])} people")
    print(f"Program: {len(result_department['Program'])} progs, "
          f"{len(result_college['Program'])} colleges, {len(result_person['Program'])} people")

    phys_key = ("Department", "department", "8950")
    if phys_key in entity_pairs:
        c = entity_pairs[phys_key]
        print("Physics (8950) spot-check: within_works", len(c["within"]), "across_works", len(c["across"]),
              "inter_works", len(c["inter"]),
              "within_collabs", sum(x[1] for x in c["within"]), "across_collabs", sum(x[1] for x in c["across"]))


if __name__ == "__main__":
    main()
