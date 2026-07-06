"""
Build step (Details page, v2): reads details_base.csv ONCE and writes one compact
JSON payload per anchor (department/program/college), plus an anchors index, into
data/details/. details_table.html fetches these on demand when the user picks an
anchor - too large to embed all anchors in one file the way v1 did (v2's both-sides
exploded, no-pairs grain runs much heavier per row).

Grain preserved: (scholar, work, collaborator, scholar-affiliation, collab-affiliation) -
the true SAS explosion. String columns (Broad_Field/College/Department/Discipline/
Institution) are interned into a small per-anchor lookup table instead of repeating
full text per row - this alone cut a test payload (Physics) from 18.9MB to 3.8MB.

Run from this folder:  py build_details_table.py
Output: data/details/anchors.json, data/details/<key>.json (one per anchor)

Resumable/chunked: a full run over ~2.8M rows takes roughly a minute (parsing + per-
anchor interning + writing ~80 JSON files, some 100MB+ for big colleges/schools) -
too long for one bounded call in constrained environments. Pass PACK_BUDGET (seconds,
env var, default unset = run to completion) to make each invocation stop after that
many seconds, pickle its in-progress state to build_details_table.checkpoint.pkl, and
print how far it got. Re-running the SAME command resumes from the checkpoint via a
byte offset (cheap - no re-parsing of already-done rows) and continues. When it
reaches EOF it checkpoints once more (so a slow/interrupted write phase can also
resume) then writes the JSON outputs; each anchor file is written atomically
(temp file + rename) and skip-if-already-valid on resume, so an interrupted write
never leaves a corrupt file behind and never has to redo a completed one.
"""
import csv, json, os, pickle, time
from collections import defaultdict

csv.field_size_limit(10**8)

SRC = "details_base.csv"
OUT_DIR = "data/details"
CHECKPOINT = "build_details_table.checkpoint.pkl"
TIME_BUDGET = float(os.environ.get("PACK_BUDGET", "999999"))

UT_CODE = {"Department": 0, "Program": 1, "Medical": 2, "Clinical": 3}
REL_CODE = {"Within Unit": 0, "Across Units": 1, "Across Institutions": 2}
DIR_CODE = {"Internal": 0, "External": 1}


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
            self.people[pid] = [row[idx["PersonName"]], row[idx["Rank"]]]
        cpid = row[idx["Collab_PersonID"]]
        if cpid not in self.people:
            self.people[cpid] = [row[idx["Collab_PersonName"]], ""]
        wid = row[idx["Collab_ID"]]
        if wid not in self.works:
            self.works[wid] = [row[idx["Collab_Title"]][:200], row[idx["CollaborationType"]],
                                row[idx["Year"]], row[idx["Collab_Detail"]][:100]]
        entry = [
            pid, self.sidx(row[idx["College"]]), self.sidx(row[idx["Department"]]),
            UT_CODE.get(row[idx["UnitType"]], 0), self.sidx(row[idx["Discipline"]]),
            self.sidx(row[idx["Broad_Field"]]),
            cpid, self.sidx(row[idx["Collab_College"]]), self.sidx(row[idx["Collab_Department"]]),
            UT_CODE.get(row[idx["Collab_UnitType"]], 0), self.sidx(row[idx["Collab_Disc"]]),
            self.sidx(row[idx["Collab_BF"]]),
            self.sidx(row[idx["Collab_Institution"]]),
            REL_CODE.get(row[idx["Relationship"]], 1), DIR_CODE.get(row[idx["Collab_Dir"]], 1),
        ]
        # entry layout (15 elements):
        # [pid, sCollegeIdx, sDeptIdx, sUnitTypeCode, sDiscIdx, sBFIdx,
        #  cpid, cCollegeIdx, cDeptIdx, cUnitTypeCode, cDiscIdx, cBFIdx, cInstIdx,
        #  relCode, dirCode]
        self.rows_by_work[wid].append(entry)

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
        os.replace(tmp, path)  # atomic - a killed mid-write never leaves a corrupt final file


def anchor_key(unit_id):
    return f"U{unit_id}"


def college_key(college):
    return "C" + "".join(c if c.isalnum() else "_" for c in college)[:40]


def _already_written(path):
    """True only if a COMPLETE, valid JSON file is already there - a file that exists
    but was left truncated by an interrupted previous run must be treated as missing,
    or it silently poisons every future run's resume/skip logic."""
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
        dept, ut = unit_labels[uid]
        fname = f"{key}.json"
        path = os.path.join(OUT_DIR, fname)
        if _already_written(path):
            skipped += 1
        else:
            bucket.write(path); wrote += 1
        anchors.append({"key": key, "label": dept, "kind": "unit", "unit_type": ut, "unit_id": uid, "file": fname})
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

    # byte-offset seeking rather than re-skipping N rows on resume - re-skipping via the
    # csv reader re-parses every already-done row every call, which gets slower and
    # slower as n_done grows. Safe here because SAS's own row count for this extract
    # matches the file's line count exactly (verified) - i.e. no field embeds a literal
    # newline, so "one physical line == one record" and readline()+tell() can be used
    # directly (csv.reader's own iteration disables tell(), so each line is parsed
    # individually via csv.reader([line]) instead of csv.reader(f)).
    with open(SRC, encoding="latin-1", newline="") as f:
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

            if len(row) >= len(header):  # tolerate a truncated final line
                uid = row[idx["UnitId"]]
                dept = row[idx["Department"]]
                college = row[idx["College"]]
                ut = row[idx["UnitType"]]

                if uid not in units:
                    units[uid] = AnchorBucket(dept, ut)
                    unit_labels[uid] = (dept, ut)
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
    # keep the checkpoint around until ALL files are actually written, so a slow/interrupted
    # write_outputs pass (some anchors run 100MB+) can resume without re-scanning the CSV.
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
