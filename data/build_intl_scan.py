"""International Collabs packer, phase 1 (scan) - v3, incremental flush every 50k rows so a
mid-call kill loses at most one flush interval's work, not the whole call. See v2 docstring
for background (buffered delimiter-joined lines, tiny constant-size checkpoint)."""
import csv, json, os, time

csv.field_size_limit(10**8)
SRC = "MitInternationalCollabsLong.csv"
RAW_DIR = "intl/raw2"
STATE = "intl_scan_state.json"
TIME_BUDGET = float(os.environ.get("SCAN_BUDGET", "15"))
FLUSH_EVERY = 50000
UT_CODE = {"Department": 0, "Program": 1, "OAU": 2}
SEP = "\x1f"


def college_key(college):
    return "C" + "".join(c if c.isalnum() else "_" for c in college)[:40]


def flush(buffers, state, byte_off, n_done, header, finished):
    for key, lines in buffers.items():
        if lines:
            with open(f"{RAW_DIR}/{key}.raw", "a", encoding="utf-8") as o:
                o.writelines(lines)
            lines.clear()
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"byte_off": byte_off, "n_done": n_done, "unit_labels": state["unit_labels"],
                   "college_keys": state["college_keys"], "header": header, "finished": finished}, f)
    os.replace(tmp, STATE)


def main():
    t0 = time.time()
    os.makedirs(RAW_DIR, exist_ok=True)

    if os.path.exists(STATE):
        with open(STATE, encoding="utf-8") as f:
            st = json.load(f)
        byte_off, n_done = st["byte_off"], st["n_done"]
        unit_labels, college_keys, header = st["unit_labels"], st["college_keys"], st["header"]
        print(f"resuming: {n_done:,} rows done, byte_off={byte_off}", flush=True)
    else:
        byte_off, n_done, unit_labels, college_keys, header = None, 0, {}, {}, None

    state = {"unit_labels": unit_labels, "college_keys": college_keys}
    buffers = {}
    def buf(key):
        b = buffers.get(key)
        if b is None:
            b = []
            buffers[key] = b
        return b

    finished = False
    with open(SRC, encoding="utf-8-sig", newline="") as f:
        if byte_off is None:
            header = next(csv.reader([f.readline()]))
            byte_off = f.tell()
        else:
            f.seek(byte_off)
        idx = {c: i for i, c in enumerate(header)}

        n_since_flush = 0
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
                ut = row[idx["UnitType"]]
                college = row[idx["CollegeName"]]
                college = "" if college in ("NULL", "") else college
                if uid not in unit_labels:
                    unit_labels[uid] = [unit, ut]
                if college and college not in college_keys:
                    college_keys[college] = college_key(college)

                fields = (
                    row[idx["PersonId"]], row[idx["PersonName"]], college, unit,
                    str(UT_CODE.get(ut, 2)), row[idx["DOI"]], row[idx["ArticleTitle"]][:200].replace(SEP, " "),
                    row[idx["JournalName"]][:150].replace(SEP, " "), row[idx["Year"]], row[idx["Citations"]],
                    row[idx["IsConfProc"]], row[idx["CollabInstId"]], row[idx["CollabInstName"]],
                    row[idx["Country"]], row[idx["NAICS_Name"]],
                )
                line_out = SEP.join(fields) + "\n"
                buf(f"U{uid}").append(line_out)
                if college:
                    buf(college_keys[college]).append(line_out)

            n_done += 1
            n_since_flush += 1
            if n_since_flush >= FLUSH_EVERY:
                flush(buffers, state, byte_off, n_done, header, False)
                print(f"  ...{n_done:,} rows done total ({time.time()-t0:.0f}s this call)", flush=True)
                n_since_flush = 0
            if time.time() - t0 > TIME_BUDGET:
                break

    flush(buffers, state, byte_off, n_done, header, finished)
    print(f"{'FINISHED' if finished else 'time budget hit'} - {n_done:,} rows done total ({time.time()-t0:.1f}s this call).")


if __name__ == "__main__":
    main()
