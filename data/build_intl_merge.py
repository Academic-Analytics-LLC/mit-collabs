"""
International Collabs packer, phase 2 (merge) - vectorized. Builds final compact per-anchor
JSON payloads from intl_full.parquet (see build_intl_merge.py history / HANDOFF.md 2026-07-08
for why: a plain per-row Python loop proved far too slow for this dataset's 3 giant anchors -
MIT Physics Department (UnitId 8950), Physics Program (1925) and the Laboratory for Nuclear
Science OAU (160347) alone account for ~971k / ~972k / ~802k rows respectively, ~70% of the
whole 3.9M-row dataset, almost certainly large particle-physics collaborations (CMS/ATLAS-style
papers with hundreds of contributing institutions each). Building one such anchor's bucket via
a Python-level per-row loop did not finish inside a single call's time budget - this version
uses pandas/numpy vectorized operations (factorize, groupby.indices) so even the largest anchor
processes in a few seconds.

Run from this folder (data/):  py build_intl_merge.py   (resumable - skip-if-already-valid per anchor)
Output: intl/anchors.json, intl/<key>.json
"""
import json, os, time
import numpy as np
import pandas as pd
import pyarrow.parquet as pq

PARQUET = "intl_full.parquet"
OUT_DIR = "intl"
TIME_BUDGET = float(os.environ.get("MERGE_BUDGET", "30"))
UT_CODE = {"Department": 0, "Program": 1, "OAU": 2}
STR_COLS = ["CollegeName", "UnitName", "CollabInstId", "CollabInstName", "Country", "NAICS_Name"]


def college_key(college):
    return "C" + "".join(c if c.isalnum() else "_" for c in college)[:40]


def _already_written(path):
    if not (os.path.exists(path) and os.path.getsize(path) > 0):
        return False
    try:
        with open(path, encoding="utf-8") as f:
            json.load(f)
        return True
    except Exception:
        return False


def build_payload(g):
    # people: first PersonName seen per PersonId
    people = g.drop_duplicates(subset="PersonId").set_index("PersonId")["PersonName"].to_dict()

    # works: first occurrence per DOI (title/journal truncated, matching the original schema)
    w = g.drop_duplicates(subset="DOI").copy()
    w["ArticleTitle"] = w["ArticleTitle"].str.slice(0, 200)
    w["JournalName"] = w["JournalName"].str.slice(0, 150)
    works = {
        row.DOI: [row.ArticleTitle, row.JournalName, row.Year, row.Citations, row.IsConfProc]
        for row in w.itertuples(index=False)
    }

    # shared string interning across all 6 string-valued fields (vectorized via pd.factorize
    # on the concatenated unique values, so the same content anywhere shares one slot - same
    # memory-saving trick as the original per-row strtab, just computed in bulk instead of
    # incrementally)
    all_vals = pd.concat([g[c] for c in STR_COLS], ignore_index=True)
    codes_all, uniques = pd.factorize(all_vals, sort=False)
    strs = uniques.tolist()
    n = len(g)
    col_codes = {}
    for i, c in enumerate(STR_COLS):
        col_codes[c] = codes_all[i * n:(i + 1) * n]

    ut_codes = g["UnitType"].map(UT_CODE).fillna(2).astype(int).to_numpy()
    pid_arr = g["PersonId"].to_numpy()

    # entry columns, in the documented order:
    # [pid, sCollegeIdx, sUnitIdx, ut, instidIdx, instnameIdx, countryIdx, naicsIdx]
    entries = np.column_stack([
        pid_arr.astype(object),
        col_codes["CollegeName"], col_codes["UnitName"], ut_codes,
        col_codes["CollabInstId"], col_codes["CollabInstName"], col_codes["Country"], col_codes["NAICS_Name"],
    ])

    doi_arr = g["DOI"].to_numpy()
    order = np.argsort(doi_arr, kind="stable")
    doi_sorted = doi_arr[order]
    entries_sorted = entries[order]
    # boundaries between distinct DOIs in the sorted order
    change = np.where(doi_sorted[1:] != doi_sorted[:-1])[0] + 1
    starts = np.concatenate(([0], change))
    ends = np.concatenate((change, [len(doi_sorted)]))
    rows_by_work = {}
    for s, e in zip(starts, ends):
        doi = doi_sorted[s]
        rows_by_work[doi] = entries_sorted[s:e].tolist()

    return {"strs": strs, "people": people, "works": works, "rows_by_work": rows_by_work}


def _json_default(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    return str(o)


def write_payload(payload, path):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as o:
        json.dump(payload, o, ensure_ascii=False, separators=(",", ":"), default=_json_default)
    os.replace(tmp, path)


def main():
    t0 = time.time()
    os.makedirs(OUT_DIR, exist_ok=True)
    df = pq.read_table(PARQUET).to_pandas()
    df["CollegeName"] = df["CollegeName"].replace("NULL", "")
    print(f"loaded parquet: {len(df):,} rows ({time.time()-t0:.1f}s)", flush=True)

    unit_groups = dict(tuple(df.groupby("UnitId", sort=False)))
    unit_labels = {uid: (g["UnitName"].iloc[0], g["UnitType"].iloc[0]) for uid, g in unit_groups.items()}
    college_groups = dict(tuple(df[df["CollegeName"] != ""].groupby("CollegeName", sort=False)))
    # process biggest anchors FIRST (they're the ones most likely to blow a call's budget if
    # left for last with less runway; also makes progress visible early)
    unit_order = sorted(unit_groups.keys(), key=lambda k: -len(unit_groups[k]))
    print(f"grouped: {len(unit_groups)} units, {len(college_groups)} colleges ({time.time()-t0:.1f}s)", flush=True)

    anchors_units, anchors_colleges = [], []
    wrote = skipped = 0
    stopped = False
    for uid in unit_order:
        g = unit_groups[uid]
        label, ut = unit_labels[uid]
        key = f"U{uid}"
        fname = f"{key}.json"
        path = os.path.join(OUT_DIR, fname)
        if _already_written(path):
            skipped += 1
        else:
            write_payload(build_payload(g), path)
            wrote += 1
            print(f"  unit {key} ({label}): {len(g):,} rows ({time.time()-t0:.1f}s)", flush=True)
        anchors_units.append({"key": key, "label": label, "kind": "unit", "unit_type": ut, "unit_id": str(uid), "file": fname})
        if time.time() - t0 > TIME_BUDGET:
            stopped = True
            break

    if not stopped:
        for college, g in college_groups.items():
            key = college_key(college)
            fname = f"{key}.json"
            path = os.path.join(OUT_DIR, fname)
            if _already_written(path):
                skipped += 1
            else:
                write_payload(build_payload(g), path)
                wrote += 1
                print(f"  college {key}: {len(g):,} rows ({time.time()-t0:.1f}s)", flush=True)
            anchors_colleges.append({"key": key, "label": college, "kind": "college", "file": fname})
            if time.time() - t0 > TIME_BUDGET:
                stopped = True
                break

    print(f"wrote {wrote}, skipped {skipped} ({time.time()-t0:.1f}s this call)")
    if stopped:
        print("time budget hit - re-run to continue (already-valid anchors are skipped on resume)")
        return

    with open(os.path.join(OUT_DIR, "anchors.json"), "w", encoding="utf-8") as o:
        json.dump({"anchors": anchors_units + anchors_colleges}, o, ensure_ascii=False, separators=(",", ":"))
    print(f"DONE - anchors.json written with {len(anchors_units)+len(anchors_colleges)} anchors ({time.time()-t0:.1f}s total)")


if __name__ == "__main__":
    main()
