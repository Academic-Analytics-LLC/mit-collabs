"""
Unit tests: details_base.csv vs portal_oracle (36 dept pair-count files + 2 full-census
bulk files). Single pass over details_base.csv (it's 1.6GB / 2.8M rows) building
everything needed at once - re-reading it multiple times is too slow for this box.
"""
import csv, sys, os, time
from collections import defaultdict

csv.field_size_limit(10**8)

BASE_DIR = "/sessions/compassionate-zen-cannon/mnt/collab-mit"
DETAILS_CSV = f"{BASE_DIR}/sas/details_base.csv"
ORACLE_DIR = f"{BASE_DIR}/portal_oracle"
BULK_DIR = f"{ORACLE_DIR}/_bulk_institution_wide"
BULK_FILES = {"Department": "collaborations_department_view.csv", "Program": "collaborations_program_view.csv"}

TYPE_MAP = {
    "Article": "Co-Authored Articles", "Book": "Co-Authored Books",
    "Book Chapter": "Co-Authored Chapters", "Conference Proceeding": "Co-Authored Conference Proceedings",
    "Federal Grant": "Co-Authored Grants", "Patent": "Co-Authored Patents", "Clinical Trial": "Co-Authored Trials",
}
TYPE_COLS = list(TYPE_MAP.values())

# column indices (fixed order from the SAS export)
IDX = {"UnitId": 3, "Department": 4, "UnitType": 5, "PersonId": 6, "CollaborationType": 10,
       "Collab_UnitId": 15, "Collab_UnitType": 17, "Collab_PersonID": 20, "Collab_ID": 23,
       "Collab_Dir": 27, "Relationship": 28}

t0 = time.time()
rows_by_unit_scope = defaultdict(lambda: defaultdict(set))
bulk = {"Department": set(), "Program": set()}
n_total = n_kept = 0

with open(DETAILS_CSV, encoding="latin-1", newline="") as f:
    r = csv.reader(f)
    header = next(r)
    assert len(header) == 29, f"unexpected column count: {len(header)}"
    for row in r:
        n_total += 1
        if len(row) < 29:
            continue  # tolerate a truncated final line (partial file sync)
        ut = row[IDX["UnitType"]]
        cut = row[IDX["Collab_UnitType"]]
        ctype = row[IDX["CollaborationType"]]
        unit_id = row[IDX["UnitId"]]
        pA = row[IDX["PersonId"]]
        pB = row[IDX["Collab_PersonID"]]
        wid = row[IDX["Collab_ID"]]
        cdir = row[IDX["Collab_Dir"]]
        scope = row[IDX["Relationship"]]

        if ut in ("Department", "Medical", "Clinical"):
            n_kept += 1
            rows_by_unit_scope[(unit_id, scope)][(pA, pB, ctype)].add(wid)

        if cdir == "Internal" and ctype in ("Article", "Conference Proceeding") and ut == cut and ut in bulk:
            bulk[ut].add((wid, pA, unit_id, pB, row[IDX["Collab_UnitId"]], ctype))

print(f"parsed {n_total:,} rows in {time.time()-t0:.1f}s | dept-mode kept {n_kept:,}")
print(f"bulk Department candidate rows: {len(bulk['Department']):,} | Program: {len(bulk['Program']):,}\n")

# ---- 36-department oracle comparison ----
def load_oracle_pair_file(path):
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        rd = csv.DictReader(f)
        for row in rd:
            key = (row["Unit Scholar ID"], row["Collab Scholar ID"])
            out[key] = {c: (int(row[c]) if row.get(c, "").strip() else 0) for c in TYPE_COLS if c in row}
    return out

depts = sorted(d for d in os.listdir(ORACLE_DIR) if os.path.isdir(f"{ORACLE_DIR}/{d}") and "_" in d and not d.startswith("_"))
summary = []
for d in depts:
    name, unit_id = d.rsplit("_", 1)
    wpath, apath = f"{ORACLE_DIR}/{d}/within_unit.csv", f"{ORACLE_DIR}/{d}/across_units.csv"
    if not (os.path.exists(wpath) and os.path.exists(apath)):
        continue
    for scope_label, fpath, our_scope in [("within", wpath, "Within Unit"), ("across", apath, "Across Units")]:
        oracle_pairs = load_oracle_pair_file(fpath)
        ours = rows_by_unit_scope.get((unit_id, our_scope), {})
        all_wids = set()
        for (pA, pB, ctype), wids in ours.items():
            all_wids |= wids
        mismatches = checked = 0
        for (schid, collid), counts in oracle_pairs.items():
            for ctype_full, col in TYPE_MAP.items():
                oracle_n = counts.get(col, 0)
                our_n = len(ours.get((schid, collid, ctype_full), set()))
                checked += 1
                if oracle_n != our_n:
                    mismatches += 1
        summary.append({"dept": name, "unit_id": unit_id, "scope": scope_label,
                         "oracle_pairs": len(oracle_pairs), "our_distinct_works": len(all_wids),
                         "cells_checked": checked, "cells_mismatched": mismatches})

print(f"{'Dept':35} {'UnitId':>7} {'Scope':8} {'OraclePairs':>11} {'OurWorks':>9} {'CellsChk':>9} {'Mismatch':>9}")
n_bad = 0
for s in summary:
    flag = "  <-- MISMATCH" if s["cells_mismatched"] else ""
    if s["cells_mismatched"]:
        n_bad += 1
    print(f"{s['dept'][:35]:35} {s['unit_id']:>7} {s['scope']:8} {s['oracle_pairs']:>11} "
          f"{s['our_distinct_works']:>9} {s['cells_checked']:>9} {s['cells_mismatched']:>9}{flag}")
print(f"\n{n_bad} / {len(summary)} (dept, scope) combos have >=1 mismatched cell.")

phys = [s for s in summary if s["unit_id"] == "8950"]
print("\nPhysics (8950) spot check: expect within distinct works ~948, across ~231.")
for s in phys:
    print(f"  {s['scope']}: our_distinct_works={s['our_distinct_works']}")

# ---- bulk full-census comparison ----
def load_bulk_oracle(path, yr_lo=2021, yr_hi=2024):
    # bulk downloads are a live/full-history pull (not pre-windowed like the extract),
    # so restrict to the same Article/ConfProc product window (2021-2024) the SAS
    # extract applies - otherwise this looks like a huge false mismatch.
    triples = set()
    with open(path, encoding="utf-8-sig", newline="") as f:
        rd = csv.DictReader(f)
        for row in rd:
            try:
                y = int(row["pubyear"])
            except ValueError:
                continue
            if not (yr_lo <= y <= yr_hi):
                continue
            ctype = "Conference Proceeding" if row.get("isconfproc") == "1" else "Article"
            triples.add((row["doi"].strip(), row["AAUID"].strip(), row["unitid"].strip(),
                         row["collaboratorpersonid"].strip(), row["collaboratorunitid"].strip(), ctype))
    return triples

print("\n=== Bulk institution-wide cross-check (full MIT census, Article+ConfProc, internal-only) ===")
for uk, fname in BULK_FILES.items():
    bulk_path = f"{BULK_DIR}/{fname}"
    if not os.path.exists(bulk_path):
        print(f"  {uk}: bulk file missing - skipped"); continue
    oracle = load_bulk_oracle(bulk_path)
    ours = bulk[uk]
    matched = oracle & ours
    missing_from_ours = oracle - ours
    extra_in_ours = ours - oracle
    print(f"  {uk} view: oracle={len(oracle):,}  ours={len(ours):,}  matched={len(matched):,}  "
          f"missing_from_ours={len(missing_from_ours):,}  extra_in_ours={len(extra_in_ours):,}")
    for label, s in [("missing_from_ours", missing_from_ours), ("extra_in_ours", extra_in_ours)]:
        sample = list(s)[:5]
        if sample:
            print(f"      sample {label}: {sample}")

print(f"\ntotal elapsed: {time.time()-t0:.1f}s")
