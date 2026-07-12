"""
Build step (International Collabs Details page): reads MitInternationalCollabsLong.csv
ONCE and writes one compact JSON payload per MIT-unit anchor (+ college anchors) into
data/intl/, mirroring sas/build_details_table.py's pattern for the AAD2024 pipeline.

Source is genuinely different in shape from details_base.csv:
  - Every row is an MIT-scholar x external-institution collaboration (verified: CollabInstId
    is never MIT's own id) - there is no Within/Across/Inter relationship axis here, it's all
    "external" by construction. No collaborator PERSON either - the collaborator "identity" is
    an INSTITUTION (name + country + industry classification), not a person.
  - Genuinely longitudinal: Year spans 2018-2025 (unlike AAD2024's single database-year
    snapshot), so a Year filter is meaningful here (opposite of the "do not slice by year"
    rule in MITCollabs/CLAUDE.md, which is about the AAD2024 database-year extract only).
  - 3 MIT unit types: Department, Program, OAU ("Other Academic Unit" - MIT's labs/centers/
    institutes, e.g. CSAIL, Media Lab, Koch Institute - confirmed via inspection, no "Medical"
    bucket in this file). UT_CODE below: Department=0, Program=1, OAU=2.
  - No Discipline/Broad Field columns at all in this extract - dropped entirely (not a design
    choice, just absent from the source data).
  - ~29% of collaborator institutions are non-academic (companies/hospitals/government) per
    NAICS classification - exposed as a derived Partner Type (Academic/Non-Academic) plus the
    raw NAICS_Name for detail, rather than filtered out.

Grain preserved: (scholar, work, collaborator-institution, scholar-affiliation) - same
"keep ALL affiliations" duplication pattern as details_base.csv (verified: a single
(PersonId,DOI,CollabInstId) triple repeats once per MIT-side affiliation, avg ~2.6x, max 11x
in a 60k-group sample - NOT a Year or per-row citation-snapshot artifact, confirmed Year is
constant per triple). String columns are interned per-anchor exactly like the AAD2024 packer.

Run from this folder (data/):  py build_intl_table.py
Output: intl/anchors.json, intl/<key>.json (one per anchor)

Resumable/chunked: same checkpoint/byte-offset-seek pattern as build_details_table.py, since
this source is larger (3.9M rows / 1.69GB vs ~2.8M rows / 1.6GB) and a single call is likely
to hit the environment's time cap. Pass PACK_BUDGET (seconds, env var) to bound each call;
re-running the same command resumes from data/build_intl_table.checkpoint.pkl.
"""
import csv, json, os, pickle, time
from collections import defaultdict

csv.field_size_limit(10**8)

SRC = "MitInternationalCollabsLong.csv"
OUT_DIR = "intl"
CHECKPOINT = "build_intl_table.checkpoint.pkl"
TIME_BUDGET = float(os.environ.get("PACK_BUDGET", "999999"))

UT_CODE = {"Department": 0, "Program": 1, "OAU": 2}
ACADEMIC_NAICS = {"Colleges, Universities, and Professional Schools"}


class AnchorBucket:
    """Accumulates one anchor's data with its own compact string table."""
    __slots__ = ("strtab", "people", "works", "rows_by_work", "label", "unit_kind")

    def __init__(self, label, unit_kind):
        self.strtab = {}
        self.people = {}
        self.works = {}
        self.rows_by_work = defaultdict(list)
        self.label = label
        self.unit_kind = unit_kind

    def sidx(self, s):
        i = self.strtab.get(s)
        if i is None:
            i = len(self.strtab)
            self.strtab[s] = i
        return i

    def add_row(self, row, idx):
        pid = row[idx["PersonId"]]
        if pid not in self.people:
            self.people[pid] = row[idx["PersonName"]]
        doi = row[idx["DOI"]]
        if doi not in self.works:
            naics = row[idx["NAICS_Name"]]
            self.works[doi] = [
                row[idx["ArticleTitle"]][:200], row[idx["JournalName"]][:150],
                row[idx["Year"]], row[idx["Citations"]], row[idx["IsConfProc"]],
            ]
        college = row[idx["CollegeName"]]
        college = "" if college in ("NULL", "") else college
        unit = row[idx["UnitName"]]
        entry = [
            pid, self.sidx(college), self.sidx(unit), UT_CODE.get(row[idx["UnitType"]], 2),
            self.sidx(row[idx["CollabInstId"]]), self.sidx(row[idx["CollabInstName"]]),
            self.sidx(row[idx["Country"]]),
            self.sidx(row[idx["NAICS_Name"]]),
        ]
        # entry layout (8 elements):
        # [pid, sCollegeIdx, sUnitIdx, unitTypeCode, instIdIdx, instNameIdx, countryIdx, naicsIdx]
        self.rows_by_work[doi].append(entry)

    def payload(self):
        strs = [None] * len(self.strtab)
        for s, i in self.strtab.items():
            strs[i] = s
        return {"strs": strs, "people": self.people, "works": self.works,
                "rows_by_work": self.rows_by_work}

    def write(self, path):
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as o:
            json.dump(self.payload(), o, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, path)


def anchor_key(unit_id):
    return f"U{unit_id}"


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


def write_outputs(units, colleges, unit_labels, t0, time_budget):
    os.makedirs(OUT_DIR, exist_ok=True)
    anchors = []
    wrote = skipped = 0
    for uid, bucket in units.items():
        key = anchor_key(uid)
        label, ut = unit_labels[uid]
        fname = f"{key}.json"
        path = os.path.join(OUT_DIR, fname)
        if _already_written(path):
            skipped += 1
        else:
            bucket.write(path); wrote += 1
        anchors.append({"key": key, "label": label, "kind": "unit", "unit_type": ut, "unit_id": uid, "file": fname})
        if time.time() - t0 > time_budget:
            print(f"write_outputs: time budget hit after units (wrote {wrote}, skipped {skipped}) - re-run to continue")
            return False

    for college, bucket in colleges.items():
        key = college_key(college)
        fname = f"{key}.json"
        path = os.path.join(OUT_DIR, fname)
        if _already_written(path):
            skipped += 1
        else:
            bucket.write(path); wrote += 1
        anchors.append({"key": key, "label": college, "kind": "college", "file": fname})
        if time.time() - t0 > time_budget:
            print(f"write_outputs: time budget hit after colleges (wrote {wrote}, skipped {skipped}) - re-run to continue")
            return False

    with open(os.path.join(OUT_DIR, "anchors.json"), "w", encoding="utf-8") as o:
        json.dump({"anchors": anchors}, o, ensure_ascii=False, separators=(",", ":"))

    print(f"wrote {wrote} new anchor files (skipped {skipped} already-valid) + anchors.json to {OUT_DIR}/")
    return True


def main():
    t0 = time.time()

    if os.path.exists(CHECKPOINT):
        with open(CHECKPOINT, "rb") as f:
            state = pickle.load(f)
        units, colleges, unit_labels = state["units"], state["colleges"], state["unit_labels"]
        n_done, byte_off, header = state["n_done"], state["byte_off"], state["header"]
        print(f"resuming from checkpoint: {n_done:,} rows already processed, byte_off={byte_off}")
    else:
        units, colleges, unit_labels, n_done, byte_off, header = {}, {}, {}, 0, None, None

    # byte-offset seeking - verified for this file: wc -l == profiled row count + 1 header,
    # so no field embeds a literal newline and "one physical line == one record" holds.
    with open(SRC, encoding="utf-8-sig", newline="") as f:
        if byte_off is None:
            header_line = f.readline()
            header = next(csv.reader([header_line]))
            byte_off = f.tell()
        else:
            f.seek(byte_off)
        idx = {c: i for i, c in enumerate(header)}

        n_this_call = 0
        finished = False
        while True:
            line = f.readline()
            if not line:
                finished = True
                break
            row = next(csv.reader([line]))
            byte_off = f.tell()

            if len(row) >= len(header):
                uid = row[idx["UnitId"]]
                unit = row[idx["UnitName"]]
                college = row[idx["CollegeName"]]
                college = "" if college in ("NULL", "") else college
                ut = row[idx["UnitType"]]

                if uid not in units:
                    units[uid] = AnchorBucket(unit, ut)
                    unit_labels[uid] = (unit, ut)
                units[uid].add_row(row, idx)

                if college:
                    if college not in colleges:
                        colleges[college] = AnchorBucket(college, ut)
                    colleges[college].add_row(row, idx)

            n_done += 1
            n_this_call += 1
            if n_this_call % 250000 == 0:
                print(f"  ...{n_done:,} rows done total ({time.time()-t0:.0f}s this call)", flush=True)
            if time.time() - t0 > TIME_BUDGET:
                break

    if not finished:
        tmp = CHECKPOINT + ".tmp"
        with open(tmp, "wb") as f:
            pickle.dump({"units": units, "colleges": colleges, "unit_labels": unit_labels,
                         "n_done": n_done, "byte_off": byte_off, "header": header}, f, protocol=4)
        os.replace(tmp, CHECKPOINT)
        print(f"time budget hit - checkpointed at {n_done:,} rows ({time.time()-t0:.1f}s this call). Re-run to continue.")
        return

    print(f"scanned {n_done:,} rows total -> {len(units)} units, {len(colleges)} colleges ({time.time()-t0:.1f}s this call)")
    tmp = CHECKPOINT + ".tmp"
    with open(tmp, "wb") as f:
        pickle.dump({"units": units, "colleges": colleges, "unit_labels": unit_labels,
                     "n_done": n_done, "byte_off": byte_off, "header": header}, f, protocol=4)
    os.replace(tmp, CHECKPOINT)
    ok = write_outputs(units, colleges, unit_labels, t0, TIME_BUDGET)
    if ok and os.path.exists(CHECKPOINT):
        os.remove(CHECKPOINT)
    print(f"{'done' if ok else 'partial - re-run to finish writing'} ({time.time()-t0:.1f}s this call).")


if __name__ == "__main__":
    main()
