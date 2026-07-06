"""Chunked anchor extraction to survive slow I/O: process a line-number range
and append matching rows to a persistent output CSV. Call multiple times with
increasing --start until you reach the end of the file (checked via a marker)."""
import csv, sys, time
csv.field_size_limit(10**8)

SRC = "details_base.csv"
OUT = "_physics_rows.csv"
ANCHOR_UNIT_ID = "8950"
CHUNK = 700_000

start = int(sys.argv[1]) if len(sys.argv) > 1 else 0

t0 = time.time()
with open(SRC, encoding="latin-1", newline="") as f:
    r = csv.reader(f)
    header = next(r)
    if start == 0:
        with open(OUT, "w", newline="", encoding="utf-8") as o:
            csv.writer(o).writerow(header)
    # skip to start
    for _ in range(start):
        try:
            next(r)
        except StopIteration:
            print(f"DONE (reached EOF while skipping at {start})")
            sys.exit(0)
    n_seen = 0
    n_matched = 0
    out_rows = []
    reached_end = True
    for row in r:
        n_seen += 1
        if n_seen > CHUNK:
            reached_end = False
            break
        if len(row) >= 29 and row[3] == ANCHOR_UNIT_ID:
            out_rows.append(row)
            n_matched += 1
    with open(OUT, "a", newline="", encoding="utf-8") as o:
        csv.writer(o).writerows(out_rows)
    print(f"start={start} seen={n_seen} matched={n_matched} elapsed={time.time()-t0:.1f}s reached_end={reached_end} next_start={start+n_seen}")
